/**
 * TrafficEngine — The core state machine for a junction.
 *
 * Pure domain logic:
 * - Deterministic state machine
 * - Zero I/O, database, or HTTP dependencies
 * - Full emergency arbitration with FCFS queue
 * - Strict controller ACK validation against pending commands and safety rules
 * - Centralized automatic scheduling with minimum green duration enforcement
 */

import {
  JUNCTION_MODES,
  SIGNAL_STATES,
  EVENT_TYPES,
  VEHICLE_TYPES,
  DIRECTIONS,
  VALID_VEHICLE_TYPES,
  CONTROLLER_STATUS,
} from './constants.js';
import SignalPhase from './SignalPhase.js';
import QueueManager from './QueueManager.js';
import Scheduler from './Scheduler.js';

class TrafficEngine {
  // ─── SENSOR EVENT PROCESSING ───────────────────────────────────────

  /**
   * Process a sensor event and return the resulting actions.
   *
   * @param {object} junctionState
   * @param {object} event
   * @param {object} config
   * @returns {object} - { actions: Array, updatedState: object }
   */
  static processSensorEvent(junctionState, event, config) {
    const actions = [];

    // Step 1: Validate event structure
    const validationError = this.validateEvent(event);
    if (validationError) {
      actions.push({
        type: 'REJECT_EVENT',
        reason: validationError,
        event,
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'INVALID_EVENT_REJECTED',
        direction: event.direction || null,
        details: { reason: validationError, event_id: event.event_id },
      });
      return { actions, updatedState: junctionState };
    }

    // Step 2: Check for unknown junction
    if (event.junction_id !== junctionState.id) {
      actions.push({
        type: 'REJECT_EVENT',
        reason: 'UNKNOWN_JUNCTION',
        event,
      });
      return { actions, updatedState: junctionState };
    }

    // Step 3: Check for duplicate event (idempotent processing)
    if (junctionState.processedEventIds &&
        junctionState.processedEventIds.has(event.event_id)) {
      actions.push({
        type: 'REJECT_EVENT',
        reason: 'DUPLICATE_EVENT',
        event,
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'DUPLICATE_EVENT_REJECTED',
        direction: event.direction,
        details: { event_id: event.event_id },
      });
      return { actions, updatedState: junctionState };
    }

    // Step 4: Process based on event type
    if (event.event_type === EVENT_TYPES.VEHICLE_ARRIVED) {
      return this._processVehicleArrived(junctionState, event, config, actions);
    } else if (event.event_type === EVENT_TYPES.VEHICLE_CLEARED) {
      return this._processVehicleCleared(junctionState, event, config, actions);
    }

    actions.push({
      type: 'REJECT_EVENT',
      reason: 'UNKNOWN_EVENT_TYPE',
      event,
    });
    return { actions, updatedState: junctionState };
  }

  /**
   * @private Process a VEHICLE_ARRIVED event.
   */
  static _processVehicleArrived(junctionState, event, config, actions) {
    const queue = junctionState.queues[event.direction];
    if (!queue) {
      actions.push({ type: 'REJECT_EVENT', reason: 'INVALID_DIRECTION', event });
      return { actions, updatedState: junctionState };
    }

    // Use authoritative server receipt time if provided
    const receiptTime = event.server_received_at || new Date().toISOString();
    const normalizedEvent = {
      ...event,
      timestamp: receiptTime,
      sensor_timestamp: event.timestamp || receiptTime,
    };

    const result = QueueManager.addVehicle(queue, normalizedEvent);

    if (!result.updated) {
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'DUPLICATE_EVENT_REJECTED',
        direction: event.direction,
        details: { reason: result.reason, vehicle_id: event.vehicle_id },
      });
      actions.push({ type: 'MARK_EVENT_PROCESSED', eventId: event.event_id });
      return { actions, updatedState: junctionState };
    }

    const updatedQueues = {
      ...junctionState.queues,
      [event.direction]: result.queue,
    };

    actions.push({
      type: 'UPDATE_QUEUE',
      direction: event.direction,
      queue: result.queue,
    });

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'VEHICLE_DETECTED',
      direction: event.direction,
      details: {
        vehicle_id: event.vehicle_id,
        vehicle_type: event.vehicle_type,
        event_id: event.event_id,
        sequence_no: event.sequence_no !== undefined ? event.sequence_no : null,
        sensor_timestamp: event.timestamp || null,
        server_received_at: receiptTime,
      },
    });

    actions.push({ type: 'MARK_EVENT_PROCESSED', eventId: event.event_id });

    let updatedEmergencyQueue = [...(junctionState.emergency_queue || [])];
    let updatedMode = junctionState.mode;
    let updatedEmergencyDir = junctionState.emergency_direction;

    // Check for emergency vehicle arrival
    if (event.vehicle_type === VEHICLE_TYPES.EMERGENCY) {
      const isAlreadyQueued = updatedEmergencyQueue.some(e => e.vehicle_id === event.vehicle_id);

      if (!isAlreadyQueued) {
        const emergencyPhase = SignalPhase.getPhaseForDirection(event.direction);
        const activeEmergencyPhase = junctionState.emergency_direction
          ? SignalPhase.getPhaseForDirection(junctionState.emergency_direction)
          : null;

        if (junctionState.mode === JUNCTION_MODES.EMERGENCY && junctionState.emergency_direction) {
          if (emergencyPhase === activeEmergencyPhase) {
            // Same phase: can be served alongside current active emergency
            actions.push({
              type: 'LOG_HISTORY',
              eventType: 'EMERGENCY_DETECTED',
              direction: event.direction,
              details: {
                vehicle_id: event.vehicle_id,
                note: 'Concurrent emergency in same active phase',
              },
            });
          } else {
            // Conflicting phase: enqueue in FCFS waiting emergency queue
            const queueEntry = {
              vehicle_id: event.vehicle_id,
              direction: event.direction,
              phase: emergencyPhase,
              arrived_at: receiptTime,
            };
            updatedEmergencyQueue.push(queueEntry);

            actions.push({
              type: 'QUEUE_EMERGENCY',
              emergencyQueue: updatedEmergencyQueue,
              vehicle_id: event.vehicle_id,
              direction: event.direction,
            });

            actions.push({
              type: 'LOG_HISTORY',
              eventType: 'EMERGENCY_QUEUED',
              direction: event.direction,
              details: {
                vehicle_id: event.vehicle_id,
                position: updatedEmergencyQueue.length,
                active_direction: junctionState.emergency_direction,
                policy: 'FCFS_QUEUED_CONFLICTING_EMERGENCY',
              },
            });
          }
        } else {
          // No active emergency: activate immediately
          updatedMode = JUNCTION_MODES.EMERGENCY;
          updatedEmergencyDir = event.direction;

          actions.push({
            type: 'TRIGGER_EMERGENCY',
            direction: event.direction,
            vehicle_id: event.vehicle_id,
          });

          actions.push({
            type: 'LOG_HISTORY',
            eventType: 'EMERGENCY_DETECTED',
            direction: event.direction,
            details: { vehicle_id: event.vehicle_id },
          });

          if (junctionState.mode !== JUNCTION_MODES.EMERGENCY) {
            actions.push({
              type: 'LOG_HISTORY',
              eventType: 'MODE_CHANGED',
              details: {
                from: junctionState.mode,
                to: JUNCTION_MODES.EMERGENCY,
                reason: 'EMERGENCY_PREEMPTION',
              },
            });
          }
        }
      }
    }

    const updatedState = {
      ...junctionState,
      mode: updatedMode,
      emergency_direction: updatedEmergencyDir,
      emergency_queue: updatedEmergencyQueue,
      queues: updatedQueues,
    };

    return { actions, updatedState };
  }

  /**
   * @private Process a VEHICLE_CLEARED event.
   */
  static _processVehicleCleared(junctionState, event, config, actions) {
    const queue = junctionState.queues[event.direction];
    if (!queue) {
      actions.push({ type: 'REJECT_EVENT', reason: 'INVALID_DIRECTION', event });
      return { actions, updatedState: junctionState };
    }

    const result = QueueManager.removeVehicle(queue, event);

    actions.push({ type: 'MARK_EVENT_PROCESSED', eventId: event.event_id });

    if (!result.updated) {
      // Vehicle not found in queue — safely clamp to 0 and record warning
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'VEHICLE_CLEARED',
        direction: event.direction,
        details: {
          vehicle_id: event.vehicle_id,
          warning: 'Vehicle not found in queue — cleared event without matching arrival',
        },
      });
      return { actions, updatedState: junctionState };
    }

    const updatedQueues = {
      ...junctionState.queues,
      [event.direction]: result.queue,
    };

    actions.push({
      type: 'UPDATE_QUEUE',
      direction: event.direction,
      queue: result.queue,
    });

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'VEHICLE_CLEARED',
      direction: event.direction,
      details: {
        vehicle_id: event.vehicle_id,
        event_id: event.event_id,
      },
    });

    let updatedEmergencyQueue = [...(junctionState.emergency_queue || [])];
    let updatedMode = junctionState.mode;
    let updatedEmergencyDir = junctionState.emergency_direction;

    // Check emergency state
    if (junctionState.mode === JUNCTION_MODES.EMERGENCY) {
      // Check if the cleared vehicle was in the emergency queue
      updatedEmergencyQueue = updatedEmergencyQueue.filter(e => e.vehicle_id !== event.vehicle_id);

      // Check if any emergency vehicle remains in active emergency direction
      const activeDirHasEmergency = (updatedQueues[junctionState.emergency_direction]?.vehicles || [])
        .some(v => v.vehicle_type === VEHICLE_TYPES.EMERGENCY);

      if (!activeDirHasEmergency) {
        // Active emergency direction is now clear. Do we have waiting emergencies in queue?
        if (updatedEmergencyQueue.length > 0) {
          const nextEmergency = updatedEmergencyQueue.shift();
          updatedEmergencyDir = nextEmergency.direction;

          actions.push({
            type: 'PROMOTE_EMERGENCY',
            nextEmergency,
            remainingQueue: updatedEmergencyQueue,
          });

          actions.push({
            type: 'LOG_HISTORY',
            eventType: 'EMERGENCY_PROMOTED',
            direction: nextEmergency.direction,
            details: {
              vehicle_id: nextEmergency.vehicle_id,
              remaining_in_queue: updatedEmergencyQueue.length,
            },
          });
        } else {
          // No more emergencies anywhere
          updatedMode = JUNCTION_MODES.AUTOMATIC;
          updatedEmergencyDir = null;

          actions.push({
            type: 'CLEAR_EMERGENCY',
            direction: event.direction,
            details: { vehicle_id: event.vehicle_id },
          });

          actions.push({
            type: 'LOG_HISTORY',
            eventType: 'EMERGENCY_CLEARED',
            direction: event.direction,
            details: { vehicle_id: event.vehicle_id },
          });

          actions.push({
            type: 'LOG_HISTORY',
            eventType: 'MODE_CHANGED',
            details: {
              from: JUNCTION_MODES.EMERGENCY,
              to: JUNCTION_MODES.AUTOMATIC,
            },
          });
        }
      }
    }

    const updatedState = {
      ...junctionState,
      mode: updatedMode,
      emergency_direction: updatedEmergencyDir,
      emergency_queue: updatedEmergencyQueue,
      queues: updatedQueues,
    };

    return { actions, updatedState };
  }

  // ─── MANUAL COMMAND PROCESSING ─────────────────────────────────────

  /**
   * Process a manual control command.
   *
   * @param {object} junctionState
   * @param {object} command
   * @param {object} config
   * @returns {object} - { actions: Array, valid: boolean, reason: string }
   */
  static processCommand(junctionState, command, config) {
    const actions = [];

    if (command.command === 'MANUAL_GREEN_REQUEST') {
      return this._processManualGreenRequest(junctionState, command, config, actions);
    }

    if (command.command === 'RETURN_TO_AUTOMATIC') {
      return this._processReturnToAutomatic(junctionState, command, config, actions);
    }

    return {
      actions,
      valid: false,
      reason: `Unknown command: ${command.command}`,
    };
  }

  /**
   * @private Handle MANUAL_GREEN_REQUEST command.
   */
  static _processManualGreenRequest(junctionState, command, config, actions) {
    // Safety check: Emergency mode cannot be overridden by manual control
    if (junctionState.mode === JUNCTION_MODES.EMERGENCY) {
      return {
        actions,
        valid: false,
        reason: 'Cannot override emergency mode with manual control. Wait for emergency to clear.',
      };
    }

    // Validate direction
    if (!command.direction || !SignalPhase.isValidDirection(command.direction)) {
      return {
        actions,
        valid: false,
        reason: `Invalid direction: ${command.direction}`,
      };
    }

    const targetPhase = SignalPhase.getPhaseForDirection(command.direction);
    if (!targetPhase) {
      return {
        actions,
        valid: false,
        reason: `Could not determine phase for direction: ${command.direction}`,
      };
    }

    actions.push({
      type: 'SET_MODE',
      mode: JUNCTION_MODES.MANUAL,
      override_by: command.admin || 'admin',
    });

    actions.push({
      type: 'START_TRANSITION',
      targetPhase,
      reason: 'MANUAL_OVERRIDE',
    });

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'MANUAL_OVERRIDE_ACTIVATED',
      direction: command.direction,
      details: {
        command: command.command,
        target_phase: targetPhase,
        admin: command.admin || 'admin',
      },
    });

    if (junctionState.mode !== JUNCTION_MODES.MANUAL) {
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'MODE_CHANGED',
        details: {
          from: junctionState.mode,
          to: JUNCTION_MODES.MANUAL,
        },
      });
    }

    return {
      actions,
      valid: true,
      reason: 'Manual override accepted',
      targetPhase,
    };
  }

  /**
   * @private Handle RETURN_TO_AUTOMATIC command.
   */
  static _processReturnToAutomatic(junctionState, command, config, actions) {
    if (junctionState.mode === JUNCTION_MODES.AUTOMATIC) {
      return {
        actions,
        valid: false,
        reason: 'Junction is already in automatic mode',
      };
    }

    if (junctionState.mode === JUNCTION_MODES.EMERGENCY) {
      return {
        actions,
        valid: false,
        reason: 'Cannot return to automatic while emergency is active. Wait for emergency vehicle to clear.',
      };
    }

    actions.push({
      type: 'SET_MODE',
      mode: JUNCTION_MODES.AUTOMATIC,
    });

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'RETURN_TO_AUTOMATIC',
      details: {
        from: junctionState.mode,
      },
    });

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'MODE_CHANGED',
      details: {
        from: junctionState.mode,
        to: JUNCTION_MODES.AUTOMATIC,
      },
    });

    return { actions, valid: true, reason: 'Returned to automatic mode' };
  }

  // ─── CONTROLLER EVENT PROCESSING ──────────────────────────────────

  /**
   * Process a controller acknowledgement or status event with strict validation.
   *
   * @param {object} junctionState
   * @param {object} controllerEvent - { command_id, junction_id, status, actual_state, direction }
   * @param {object|null} pendingCommand - command looked up from CommandRepository
   * @returns {object} - { actions: Array, valid: boolean, reason?: string }
   */
  static processControllerEvent(junctionState, controllerEvent, pendingCommand) {
    const actions = [];
    let command = pendingCommand;
    if (command === undefined && controllerEvent && controllerEvent.command_id) {
      command = {
        command_id: controllerEvent.command_id,
        junction_id: controllerEvent.junction_id,
        direction: controllerEvent.direction,
        requested_state: controllerEvent.actual_state,
        status: 'PENDING',
      };
    }

    if (controllerEvent.status === 'ACK') {
      // 1. Require valid command_id
      if (!controllerEvent.command_id) {
        return {
          actions: [],
          valid: false,
          statusCode: 400,
          reason: 'Missing required command_id for ACK',
        };
      }

      // 2. Verify command exists
      if (!command) {
        return {
          actions: [],
          valid: false,
          statusCode: 404,
          reason: `Command '${controllerEvent.command_id}' not found`,
        };
      }

      // 3. Verify junction matches
      if (command.junction_id !== controllerEvent.junction_id) {
        return {
          actions: [],
          valid: false,
          statusCode: 400,
          reason: `Command belongs to junction '${command.junction_id}', not '${controllerEvent.junction_id}'`,
        };
      }

      // 4. Verify direction matches
      if (controllerEvent.direction && command.direction !== controllerEvent.direction) {
        return {
          actions: [],
          valid: false,
          statusCode: 400,
          reason: `Command direction '${command.direction}' does not match ACK direction '${controllerEvent.direction}'`,
        };
      }

      // 5. Verify command is currently pending / sent
      if (command.status !== 'PENDING' && command.status !== 'SENT') {
        return {
          actions: [],
          valid: false,
          statusCode: 409,
          reason: `Command '${controllerEvent.command_id}' is not pending (status: ${command.status})`,
        };
      }

      // 6. Verify acknowledged state matches requested state
      if (controllerEvent.actual_state !== command.requested_state) {
        return {
          actions: [],
          valid: false,
          statusCode: 400,
          reason: `ACK state '${controllerEvent.actual_state}' does not match requested state '${command.requested_state}'`,
        };
      }

      // 7. Prevent conflicting GREEN states from being accepted as valid physical state
      const targetDir = controllerEvent.direction || command.direction;
      const proposedActual = {};
      for (const [dir, sig] of Object.entries(junctionState.signals || {})) {
        proposedActual[dir] = dir === targetDir ? controllerEvent.actual_state : sig.actual_state;
      }

      if (controllerEvent.actual_state === SIGNAL_STATES.GREEN && !SignalPhase.validateSafety(proposedActual)) {
        actions.push({
          type: 'SET_CONTROLLER_STATUS',
          status: CONTROLLER_STATUS.DEGRADED,
        });
        actions.push({
          type: 'SET_MODE',
          mode: JUNCTION_MODES.DEGRADED,
        });
        actions.push({
          type: 'LOG_HISTORY',
          eventType: 'SAFETY_VIOLATION_PREVENTED',
          direction: targetDir,
          details: {
            reason: 'Controller ACK rejected: would produce conflicting GREEN signals',
            proposed_signals: proposedActual,
          },
        });
        return {
          actions,
          valid: false,
          statusCode: 409,
          reason: 'Conflicting GREEN states rejected by safety validator',
        };
      }

      // All checks passed! Update actual state and command status
      actions.push({
        type: 'UPDATE_ACTUAL_STATE',
        command_id: controllerEvent.command_id,
        direction: targetDir,
        actual_state: controllerEvent.actual_state,
      });

      actions.push({
        type: 'UPDATE_COMMAND_STATUS',
        command_id: controllerEvent.command_id,
        status: 'ACK',
      });

      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'CONTROLLER_ACK',
        direction: targetDir,
        details: {
          command_id: controllerEvent.command_id,
          actual_state: controllerEvent.actual_state,
        },
      });

      if (junctionState.controller_status === CONTROLLER_STATUS.OFFLINE ||
          junctionState.controller_status === CONTROLLER_STATUS.UNKNOWN ||
          junctionState.controller_status === CONTROLLER_STATUS.DEGRADED) {
        actions.push({
          type: 'SET_CONTROLLER_STATUS',
          status: CONTROLLER_STATUS.ONLINE,
        });
        actions.push({
          type: 'LOG_HISTORY',
          eventType: 'CONTROLLER_RECONNECTED',
          details: { previous_status: junctionState.controller_status },
        });
      }

      return { actions, valid: true, statusCode: 200 };
    }

    if (controllerEvent.status === 'OFFLINE') {
      actions.push({
        type: 'SET_CONTROLLER_STATUS',
        status: CONTROLLER_STATUS.OFFLINE,
      });
      actions.push({
        type: 'SET_MODE',
        mode: JUNCTION_MODES.DEGRADED,
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'CONTROLLER_FAILURE',
        details: {
          status: 'OFFLINE',
          junction_id: controllerEvent.junction_id,
        },
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'MODE_CHANGED',
        details: {
          from: junctionState.mode,
          to: JUNCTION_MODES.DEGRADED,
        },
      });
      return { actions, valid: true, statusCode: 200 };
    }

    if (controllerEvent.status === 'ONLINE') {
      actions.push({
        type: 'SET_CONTROLLER_STATUS',
        status: CONTROLLER_STATUS.ONLINE,
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'CONTROLLER_RECONNECTED',
        details: { previous_status: junctionState.controller_status },
      });
      return { actions, valid: true, statusCode: 200 };
    }

    if (controllerEvent.status === 'NACK' || controllerEvent.status === 'FAILED') {
      if (controllerEvent.command_id) {
        actions.push({
          type: 'UPDATE_COMMAND_STATUS',
          command_id: controllerEvent.command_id,
          status: 'FAILED',
        });
      }
      actions.push({
        type: 'SET_CONTROLLER_STATUS',
        status: CONTROLLER_STATUS.DEGRADED,
      });
      actions.push({
        type: 'SET_MODE',
        mode: JUNCTION_MODES.DEGRADED,
      });
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'CONTROLLER_FAILURE',
        details: {
          command_id: controllerEvent.command_id || null,
          status: controllerEvent.status,
        },
      });
      return { actions, valid: true, statusCode: 200 };
    }

    return {
      actions: [],
      valid: false,
      statusCode: 400,
      reason: `Unknown controller status: ${controllerEvent.status}`,
    };
  }

  // ─── AUTOMATIC SCHEDULING ─────────────────────────────────────────

  /**
   * Determine the next scheduling action in automatic mode.
   * Centralized: enforces minimum green duration, checks controller health,
   * and prevents phase switching when transitioning or degraded.
   *
   * @param {object} junctionState
   * @param {object} config
   * @param {number} now - timestamp ms
   * @returns {object|null} - { type: 'START_TRANSITION', targetPhase, reason } or null
   */
  static evaluateAutomaticScheduling(junctionState, config, now = Date.now()) {
    // Only schedule in AUTOMATIC mode
    if (junctionState.mode !== JUNCTION_MODES.AUTOMATIC) return null;

    // Must be online
    if (junctionState.controller_status !== CONTROLLER_STATUS.ONLINE) return null;

    // Don't interrupt an active transition
    if (junctionState.transitioning) return null;

    // Enforce minimum green duration for current phase
    const minGreen = config.MIN_GREEN_DURATION || config.GREEN_DURATION || 30000;
    if (junctionState.phase_started_at) {
      let startedMs = 0;
      const ts = String(junctionState.phase_started_at);
      if (ts.endsWith('Z')) {
        startedMs = new Date(ts).getTime();
      } else if (ts.includes(' ') && !ts.includes('T')) {
        startedMs = new Date(ts.replace(' ', 'T') + 'Z').getTime();
      } else {
        startedMs = new Date(ts).getTime();
      }
      const elapsed = now - startedMs;
      if (elapsed >= 0 && elapsed < minGreen) {
        return null;
      }
    }

    const nextPhase = Scheduler.selectNextPhase(
      junctionState.queues,
      junctionState.current_phase,
      config,
      now
    );

    if (nextPhase && nextPhase !== junctionState.current_phase) {
      return {
        type: 'START_TRANSITION',
        targetPhase: nextPhase,
        reason: 'AUTOMATIC_SCHEDULING',
      };
    }

    return null;
  }

  // ─── VALIDATION ───────────────────────────────────────────────────

  static validateEvent(event) {
    if (!event) return 'Event is null or undefined';
    if (!event.event_id) return 'Missing event_id';
    if (!event.junction_id) return 'Missing junction_id';
    if (!event.direction) return 'Missing direction';
    if (!DIRECTIONS.includes(event.direction)) {
      return `Invalid direction: ${event.direction}. Must be one of: ${DIRECTIONS.join(', ')}`;
    }
    if (!event.event_type) return 'Missing event_type';
    if (!Object.values(EVENT_TYPES).includes(event.event_type)) {
      return `Invalid event_type: ${event.event_type}`;
    }
    if (!event.vehicle_id) return 'Missing vehicle_id';
    if (event.event_type === EVENT_TYPES.VEHICLE_ARRIVED) {
      if (!event.vehicle_type) return 'Missing vehicle_type for VEHICLE_ARRIVED event';
      if (!VALID_VEHICLE_TYPES.includes(event.vehicle_type)) {
        return `Invalid vehicle_type: ${event.vehicle_type}. Must be one of: ${VALID_VEHICLE_TYPES.join(', ')}`;
      }
    }
    return null;
  }

  static validateCommand(command) {
    if (!command) return 'Command is null or undefined';
    if (!command.command) return 'Missing command field';

    const validCommands = ['MANUAL_GREEN_REQUEST', 'RETURN_TO_AUTOMATIC'];
    if (!validCommands.includes(command.command)) {
      return `Invalid command: ${command.command}. Must be one of: ${validCommands.join(', ')}`;
    }

    if (command.command === 'MANUAL_GREEN_REQUEST') {
      if (!command.direction) return 'Missing direction for MANUAL_GREEN_REQUEST';
      if (!DIRECTIONS.includes(command.direction)) {
        return `Invalid direction: ${command.direction}`;
      }
    }

    return null;
  }
}

export default TrafficEngine;

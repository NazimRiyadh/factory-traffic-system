/**
 * TrafficEngine — The core state machine for a junction.
 *
 * This is the heart of the system. It processes sensor events, manual commands,
 * controller acknowledgements, and automatic scheduling decisions. It outputs
 * "actions" (plain objects) that the services layer executes against the database.
 *
 * PURE LOGIC — zero dependencies on HTTP, databases, or any I/O.
 * All inputs are plain objects, all outputs are action arrays.
 */

const { JUNCTION_MODES, SIGNAL_STATES, EVENT_TYPES, VEHICLE_TYPES, DIRECTIONS, VALID_VEHICLE_TYPES } = require('./constants');
const SignalPhase = require('./SignalPhase');
const { SignalTransition } = require('./SignalTransition');
const QueueManager = require('./QueueManager');
const Scheduler = require('./Scheduler');

class TrafficEngine {
  // ─── SENSOR EVENT PROCESSING ───────────────────────────────────────

  /**
   * Process a sensor event and return the resulting actions.
   *
   * @param {object} junctionState - current state loaded from DB:
   *   { id, mode, current_phase, controller_status, queues: { NORTH: {...}, ... },
   *     processedEventIds: Set, emergency_direction, transitioning }
   * @param {object} event - the sensor event
   * @param {object} config - app configuration
   * @returns {object} - { actions: Array, updatedState: object }
   *   Action types: UPDATE_QUEUE, LOG_HISTORY, TRIGGER_EMERGENCY,
   *                 CLEAR_EMERGENCY, MARK_EVENT_PROCESSED, REJECT_EVENT
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

    // Unknown event type (should be caught by validation, but safety net)
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

    const result = QueueManager.addVehicle(queue, event);

    if (!result.updated) {
      // Vehicle already in queue — treat as duplicate vehicle, not event
      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'DUPLICATE_EVENT_REJECTED',
        direction: event.direction,
        details: { reason: result.reason, vehicle_id: event.vehicle_id },
      });
      actions.push({ type: 'MARK_EVENT_PROCESSED', eventId: event.event_id });
      return { actions, updatedState: junctionState };
    }

    // Update queue state
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
      },
    });

    actions.push({ type: 'MARK_EVENT_PROCESSED', eventId: event.event_id });

    // Check for emergency vehicle
    if (event.vehicle_type === VEHICLE_TYPES.EMERGENCY) {
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
    }

    const updatedState = {
      ...junctionState,
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
      // Vehicle not found in queue — log warning but don't error
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

    // Check if cleared vehicle was part of an active emergency
    if (junctionState.mode === JUNCTION_MODES.EMERGENCY &&
        junctionState.emergency_direction === event.direction) {
      // Check if any emergency vehicles remain in any queue
      const remainingEmergency = QueueManager.hasEmergencyVehicle(updatedQueues);
      if (!remainingEmergency.hasEmergency) {
        actions.push({ type: 'CLEAR_EMERGENCY' });
        actions.push({
          type: 'LOG_HISTORY',
          eventType: 'EMERGENCY_CLEARED',
          direction: event.direction,
          details: { vehicle_id: event.vehicle_id },
        });
      }
    }

    return {
      actions,
      updatedState: { ...junctionState, queues: updatedQueues },
    };
  }

  // ─── MANUAL COMMAND PROCESSING ─────────────────────────────────────

  /**
   * Process a manual control command.
   *
   * @param {object} junctionState - current junction state
   * @param {object} command - { command: string, direction?: string, admin?: string }
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
    // Emergency mode cannot be overridden by manual control
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

    actions.push({
      type: 'LOG_HISTORY',
      eventType: 'MODE_CHANGED',
      details: {
        from: junctionState.mode,
        to: JUNCTION_MODES.MANUAL,
      },
    });

    return { actions, valid: true, reason: 'Manual override accepted' };
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

    // Allow returning to automatic from MANUAL or DEGRADED
    // Emergency should be cleared first via VEHICLE_CLEARED
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
   * Process a controller acknowledgement or status event.
   *
   * @param {object} junctionState
   * @param {object} controllerEvent - { command_id, junction_id, status, actual_state, direction }
   * @returns {object} - { actions: Array }
   */
  static processControllerEvent(junctionState, controllerEvent) {
    const actions = [];

    if (controllerEvent.status === 'ACK') {
      actions.push({
        type: 'UPDATE_ACTUAL_STATE',
        command_id: controllerEvent.command_id,
        direction: controllerEvent.direction,
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
        direction: controllerEvent.direction,
        details: {
          command_id: controllerEvent.command_id,
          actual_state: controllerEvent.actual_state,
        },
      });

      // If controller was previously offline, mark as reconnected
      if (junctionState.controller_status === 'OFFLINE' ||
          junctionState.controller_status === 'UNKNOWN') {
        actions.push({
          type: 'SET_CONTROLLER_STATUS',
          status: 'ONLINE',
        });
        actions.push({
          type: 'LOG_HISTORY',
          eventType: 'CONTROLLER_RECONNECTED',
          details: { previous_status: junctionState.controller_status },
        });
      }
    } else if (controllerEvent.status === 'OFFLINE') {
      actions.push({
        type: 'SET_CONTROLLER_STATUS',
        status: 'OFFLINE',
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
    } else if (controllerEvent.status === 'NACK' || controllerEvent.status === 'FAILED') {
      actions.push({
        type: 'UPDATE_COMMAND_STATUS',
        command_id: controllerEvent.command_id,
        status: 'FAILED',
      });

      actions.push({
        type: 'LOG_HISTORY',
        eventType: 'CONTROLLER_FAILURE',
        details: {
          command_id: controllerEvent.command_id,
          status: controllerEvent.status,
        },
      });
    }

    return { actions };
  }

  // ─── AUTOMATIC SCHEDULING ─────────────────────────────────────────

  /**
   * Determine the next scheduling action in automatic mode.
   * Returns null if no action needed (wrong mode, mid-transition, or no phase change).
   *
   * @param {object} junctionState
   * @param {object} config
   * @returns {object|null} - { type: 'START_TRANSITION', targetPhase, reason } or null
   */
  static evaluateAutomaticScheduling(junctionState, config) {
    // Only schedule in AUTOMATIC mode
    if (junctionState.mode !== JUNCTION_MODES.AUTOMATIC) return null;

    // Don't interrupt an active transition
    if (junctionState.transitioning) return null;

    const nextPhase = Scheduler.selectNextPhase(
      junctionState.queues,
      junctionState.current_phase,
      config,
    );

    if (nextPhase) {
      return {
        type: 'START_TRANSITION',
        targetPhase: nextPhase,
        reason: 'AUTOMATIC_SCHEDULING',
      };
    }

    return null;
  }

  // ─── VALIDATION ───────────────────────────────────────────────────

  /**
   * Validate a sensor event has all required fields and valid values.
   * @param {object} event
   * @returns {string|null} - error message or null if valid
   */
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

  /**
   * Validate a command has required fields.
   * @param {object} command
   * @returns {string|null}
   */
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

module.exports = TrafficEngine;

/**
 * ControllerService — Handles hardware controller acknowledgements, retries, and timeouts.
 *
 * All state mutations are serialized via junctionLock.
 * ACKs are strictly validated against pending commands and safety rules.
 */

import TrafficEngine from '../domain/TrafficEngine.js';
import { JUNCTION_MODES, CONTROLLER_STATUS } from '../domain/constants.js';
import logger from '../utils/logger.js';
import junctionLock from '../utils/junctionLock.js';

class ControllerService {
  constructor(junctionRepo, commandRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;

    // Start background timeout checker
    this.timeoutInterval = setInterval(() => {
      this.checkTimeouts();
    }, 1000);
    if (this.timeoutInterval.unref) {
      this.timeoutInterval.unref();
    }
  }

  async processControllerEvent(controllerEvent) {
    const junctionId = controllerEvent.junction_id;

    return junctionLock.runExclusive(junctionId, async () => {
      const junction = this.junctionRepo.findById(junctionId);
      if (!junction) {
        return {
          success: false,
          statusCode: 404,
          message: `Junction '${junctionId}' not found`,
        };
      }

      // Look up command if command_id is provided
      let pendingCommand = null;
      if (controllerEvent.command_id) {
        pendingCommand = this.commandRepo.findById(controllerEvent.command_id) || null;
      }

      const result = TrafficEngine.processControllerEvent(junction, controllerEvent, pendingCommand);

      // Execute actions regardless of valid flag (e.g. degradation on conflicting green)
      for (const action of result.actions) {
        switch (action.type) {
          case 'UPDATE_ACTUAL_STATE':
            if (action.direction && action.actual_state) {
              this.junctionRepo.updateActualSignal(junctionId, action.direction, action.actual_state);
            }
            break;

          case 'UPDATE_COMMAND_STATUS':
            if (action.command_id && action.status) {
              this.commandRepo.updateStatus(action.command_id, action.status);
            }
            break;

          case 'SET_CONTROLLER_STATUS':
            this.junctionRepo.updateControllerStatus(junctionId, action.status);
            break;

          case 'SET_MODE':
            this.junctionRepo.updateMode(junctionId, action.mode);
            if (action.mode === JUNCTION_MODES.DEGRADED && this.timerManager) {
              this.timerManager.cancelTimers(junctionId);
            }
            break;

          case 'LOG_HISTORY':
            this.historyRepo.log(junctionId, action.eventType, action.direction || null, action.details);
            break;

          default:
            logger.warn(`Unknown controller action type: ${action.type}`);
        }
      }

      if (!result.valid) {
        return {
          success: false,
          statusCode: result.statusCode || 400,
          message: result.reason,
        };
      }

      return {
        success: true,
        statusCode: 200,
        message: `Controller event processed: ${controllerEvent.status}`,
      };
    });
  }

  async checkTimeouts() {
    const timeoutSeconds = Math.max(2, Math.floor((this.config.CONTROLLER_ACK_TIMEOUT || 5000) / 1000));
    const timedOutCommands = this.commandRepo.findTimedOut(timeoutSeconds);

    for (const cmd of timedOutCommands) {
      await junctionLock.runExclusive(cmd.junction_id, async () => {
        // Re-read command to verify it wasn't acknowledged while waiting for lock
        const freshCmd = this.commandRepo.findById(cmd.command_id);
        if (!freshCmd || (freshCmd.status !== 'PENDING' && freshCmd.status !== 'SENT')) {
          return;
        }

        const maxRetries = this.config.CONTROLLER_MAX_RETRIES !== undefined
          ? this.config.CONTROLLER_MAX_RETRIES
          : 1;

        if (freshCmd.retries < maxRetries) {
          this.commandRepo.incrementRetries(freshCmd.command_id);
          logger.warn(`[${freshCmd.junction_id}] Retrying command ${freshCmd.command_id} for ${freshCmd.direction} -> ${freshCmd.requested_state} (attempt ${freshCmd.retries + 1}/${maxRetries})`);
          this.historyRepo.log(freshCmd.junction_id, 'CONTROLLER_COMMAND_RETRY', freshCmd.direction, {
            command_id: freshCmd.command_id,
            attempt: freshCmd.retries + 1,
            requested_state: freshCmd.requested_state,
          });

          // Re-dispatch command to simulated controller or listeners
          if (this.timerManager && this.timerManager.onCommandsDispatched) {
            this.timerManager.onCommandsDispatched(freshCmd.junction_id, [freshCmd]);
          }
        } else {
          // Retry limit reached — mark as TIMEOUT and degrade junction
          this.commandRepo.updateStatus(freshCmd.command_id, 'TIMEOUT');
          this.junctionRepo.updateControllerStatus(freshCmd.junction_id, CONTROLLER_STATUS.DEGRADED);
          this.junctionRepo.updateMode(freshCmd.junction_id, JUNCTION_MODES.DEGRADED);

          if (this.timerManager) {
            this.timerManager.cancelTimers(freshCmd.junction_id);
          }

          logger.error(`[${freshCmd.junction_id}] Controller command ${freshCmd.command_id} timed out. Junction set to DEGRADED.`);

          this.historyRepo.log(freshCmd.junction_id, 'CONTROLLER_TIMEOUT', freshCmd.direction, {
            command_id: freshCmd.command_id,
            requested_state: freshCmd.requested_state,
          });

          this.historyRepo.log(freshCmd.junction_id, 'CONTROLLER_FAILURE', freshCmd.direction, {
            reason: 'Command ACK timeout exceeded all retry attempts',
            command_id: freshCmd.command_id,
          });
        }
      });
    }
  }

  /**
   * Safe restart recovery: reconciles state without fabricating ACKs.
   * Interrupted transitions and pending commands are marked FAILED,
   * unconfirmed signals are marked UNKNOWN, and degraded mode is applied
   * until controller connection is confirmed.
   */
  recoverJunctionAfterRestart(junctionId) {
    const junction = this.junctionRepo.findById(junctionId);
    if (!junction) return;

    const pending = this.commandRepo.findPending(junctionId);
    const wasTransitioning = junction.transitioning === 1;

    if (pending.length > 0 || wasTransitioning) {
      logger.warn(`[${junctionId}] Restart recovery: Found ${pending.length} pending commands or interrupted transition.`);

      // Mark all pending commands as FAILED
      this.commandRepo.markAllPendingFailed(junctionId, 'RESTART_RECOVERY');

      // Represent unconfirmed physical states as UNKNOWN
      for (const cmd of pending) {
        if (cmd.direction) {
          this.junctionRepo.updateActualSignal(junctionId, cmd.direction, 'UNKNOWN');
        }
      }

      // Reset transitioning flag in DB
      this.junctionRepo.updateTransitioning(junctionId, 0, null);

      // Set controller status to UNKNOWN and junction mode to DEGRADED
      this.junctionRepo.updateControllerStatus(junctionId, CONTROLLER_STATUS.UNKNOWN);
      this.junctionRepo.updateMode(junctionId, JUNCTION_MODES.DEGRADED);

      this.historyRepo.log(junctionId, 'JUNCTION_RECOVERED', null, {
        note: 'System recovered from restart with unconfirmed commands/transitions; signals marked UNKNOWN, junction set to DEGRADED until controller confirmation',
        interrupted_commands: pending.map(p => p.command_id),
      });
    }
  }

  /**
   * Helper for simulation bench: explicitly invoked by user/evaluator only,
   * never automatically during normal startup.
   */
  simulateAcknowledgeAll(junctionId) {
    const pending = this.commandRepo.findPending(junctionId);
    let ackCount = 0;

    for (const cmd of pending) {
      this.processControllerEvent({
        command_id: cmd.command_id,
        junction_id: junctionId,
        direction: cmd.direction,
        status: 'ACK',
        actual_state: cmd.requested_state,
      });
      ackCount++;
    }

    const junction = this.junctionRepo.findById(junctionId);
    if (junction && junction.signals) {
      for (const [dir, sig] of Object.entries(junction.signals)) {
        if (sig.actual_state !== sig.desired_state) {
          this.junctionRepo.updateActualSignal(junctionId, dir, sig.desired_state);
        }
      }
    }

    if (junction) {
      if (junction.controller_status === 'DEGRADED' || junction.controller_status === 'OFFLINE' || junction.controller_status === 'UNKNOWN') {
        this.junctionRepo.updateControllerStatus(junctionId, 'ONLINE');
      }
      if (junction.mode === 'DEGRADED') {
        this.junctionRepo.updateMode(junctionId, 'AUTOMATIC');
      }
    }

    return ackCount;
  }

  destroy() {
    if (this.timeoutInterval) {
      clearInterval(this.timeoutInterval);
    }
  }
}

export default ControllerService;

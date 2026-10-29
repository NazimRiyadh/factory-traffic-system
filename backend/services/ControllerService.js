/**
 * ControllerService — Handles hardware controller acknowledgements, retries, and timeouts.
 */

const TrafficEngine = require('../domain/TrafficEngine');
const { JUNCTION_MODES, CONTROLLER_STATUS } = require('../domain/constants');
const logger = require('../utils/logger');

class ControllerService {
  constructor(junctionRepo, commandRepo, historyRepo, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.config = config;

    // Start background timeout checker
    this.timeoutInterval = setInterval(() => {
      this.checkTimeouts();
    }, 2000);
    if (this.timeoutInterval.unref) {
      this.timeoutInterval.unref();
    }
  }

  processControllerEvent(controllerEvent) {
    const junctionId = controllerEvent.junction_id;
    const junction = this.junctionRepo.findById(junctionId);

    if (!junction) {
      return {
        success: false,
        statusCode: 404,
        message: `Junction '${junctionId}' not found`
      };
    }

    const { actions } = TrafficEngine.processControllerEvent(junction, controllerEvent);

    for (const action of actions) {
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
          break;

        case 'LOG_HISTORY':
          this.historyRepo.log(junctionId, action.eventType, action.direction || null, action.details);
          break;

        default:
          logger.warn(`Unknown controller action type: ${action.type}`);
      }
    }

    return {
      success: true,
      statusCode: 200,
      message: `Controller event processed: ${controllerEvent.status}`
    };
  }

  checkTimeouts() {
    const timeoutSeconds = Math.max(2, Math.floor((this.config.CONTROLLER_ACK_TIMEOUT || 5000) / 1000));
    const timedOutCommands = this.commandRepo.findTimedOut(timeoutSeconds);

    for (const cmd of timedOutCommands) {
      if (cmd.retries < (this.config.CONTROLLER_MAX_RETRIES || 1)) {
        this.commandRepo.incrementRetries(cmd.command_id);
        logger.warn(`[${cmd.junction_id}] Retrying command ${cmd.command_id} for ${cmd.direction} -> ${cmd.requested_state}`);
        this.historyRepo.log(cmd.junction_id, 'CONTROLLER_COMMAND_RETRY', cmd.direction, {
          command_id: cmd.command_id,
          attempt: cmd.retries + 1
        });
      } else {
        // Mark as TIMEOUT and degrade junction
        this.commandRepo.updateStatus(cmd.command_id, 'TIMEOUT');
        this.junctionRepo.updateControllerStatus(cmd.junction_id, CONTROLLER_STATUS.DEGRADED);
        this.junctionRepo.updateMode(cmd.junction_id, JUNCTION_MODES.DEGRADED);

        logger.error(`[${cmd.junction_id}] Controller command ${cmd.command_id} timed out. Junction set to DEGRADED.`);

        this.historyRepo.log(cmd.junction_id, 'CONTROLLER_TIMEOUT', cmd.direction, {
          command_id: cmd.command_id,
          requested_state: cmd.requested_state
        });

        this.historyRepo.log(cmd.junction_id, 'CONTROLLER_FAILURE', cmd.direction, {
          reason: 'Command ACK timeout exceeded'
        });
      }
    }
  }

  /**
   * Helper for simulation: instantly or smoothly ACK all pending commands for a junction
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
        actual_state: cmd.requested_state
      });
      ackCount++;
    }

    // Sync all signals where actual_state != desired_state
    const junction = this.junctionRepo.findById(junctionId);
    if (junction && junction.signals) {
      for (const [dir, sig] of Object.entries(junction.signals)) {
        if (sig.actual_state !== sig.desired_state) {
          this.junctionRepo.updateActualSignal(junctionId, dir, sig.desired_state);
        }
      }
    }

    // Restore controller status to ONLINE and mode to AUTOMATIC if degraded
    if (junction) {
      if (junction.controller_status === 'DEGRADED' || junction.controller_status === 'OFFLINE') {
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

module.exports = ControllerService;

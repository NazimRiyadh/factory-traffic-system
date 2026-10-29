/**
 * CommandService — Handles manual override commands and transitions to automatic.
 */

const TrafficEngine = require('../domain/TrafficEngine');
const logger = require('../utils/logger');

class CommandService {
  constructor(junctionRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;

    this.junctionLocks = new Map();
  }

  async withJunctionLock(junctionId, fn) {
    if (!this.junctionLocks.has(junctionId)) {
      this.junctionLocks.set(junctionId, Promise.resolve());
    }

    const prevLock = this.junctionLocks.get(junctionId);
    let releaseLock;
    const newLock = new Promise(resolve => { releaseLock = resolve; });
    this.junctionLocks.set(junctionId, newLock);

    await prevLock;
    try {
      return await fn();
    } finally {
      releaseLock();
    }
  }

  async processCommand(junctionId, command) {
    return this.withJunctionLock(junctionId, async () => {
      const junction = this.junctionRepo.findById(junctionId);
      if (!junction) {
        return {
          success: false,
          statusCode: 404,
          message: `Junction '${junctionId}' not found`
        };
      }

      const junctionState = {
        ...junction,
        transitioning: this.timerManager ? this.timerManager.isTransitioning(junctionId) : false
      };

      const result = TrafficEngine.processCommand(junctionState, command, this.config);

      if (!result.valid) {
        const isConflict = result.reason.includes('emergency') || result.reason.includes('override');
        return {
          success: false,
          statusCode: isConflict ? 409 : 400,
          message: result.reason
        };
      }

      for (const action of result.actions) {
        switch (action.type) {
          case 'SET_MODE':
            this.junctionRepo.updateMode(junctionId, action.mode, {
              by: action.override_by,
              at: new Date().toISOString()
            });
            break;

          case 'START_TRANSITION':
            if (this.timerManager) {
              this.timerManager.startTransition(
                junctionId,
                junction.current_phase,
                action.targetPhase,
                action.reason
              );
            }
            break;

          case 'LOG_HISTORY':
            this.historyRepo.log(junctionId, action.eventType, action.direction, action.details);
            break;

          default:
            logger.warn(`Unknown action type: ${action.type}`);
        }
      }

      return {
        success: true,
        statusCode: 200,
        message: result.reason,
        mode: junctionState.mode
      };
    });
  }
}

module.exports = CommandService;

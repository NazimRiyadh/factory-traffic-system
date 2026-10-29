/**
 * CommandService — Handles manual override commands and transitions to automatic.
 *
 * Uses shared junctionLock to serialize with events and controller callbacks.
 * Returns up-to-date persisted mode and transition status.
 */

import TrafficEngine from '../domain/TrafficEngine.js';
import logger from '../utils/logger.js';
import junctionLock from '../utils/junctionLock.js';

class CommandService {
  constructor(junctionRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;
  }

  async processCommand(junctionId, command) {
    return junctionLock.runExclusive(junctionId, async () => {
      const junction = this.junctionRepo.findById(junctionId);
      if (!junction) {
        return {
          success: false,
          statusCode: 404,
          message: `Junction '${junctionId}' not found`,
        };
      }

      const junctionState = {
        ...junction,
        transitioning: this.timerManager ? this.timerManager.isTransitioning(junctionId) : false,
      };

      const result = TrafficEngine.processCommand(junctionState, command, this.config);

      if (!result.valid) {
        const isConflict = result.reason.includes('emergency') || result.reason.includes('override');
        return {
          success: false,
          statusCode: isConflict ? 409 : 400,
          message: result.reason,
        };
      }

      let transitionOutcome = null;

      for (const action of result.actions) {
        switch (action.type) {
          case 'SET_MODE':
            this.junctionRepo.updateMode(junctionId, action.mode, {
              by: action.override_by,
              at: new Date().toISOString(),
            });
            break;

          case 'START_TRANSITION':
            if (this.timerManager) {
              transitionOutcome = this.timerManager.startTransition(
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

      // Fetch fresh persisted state after command actions
      const freshJunction = this.junctionRepo.findById(junctionId);
      const isTransitioning = this.timerManager ? this.timerManager.isTransitioning(junctionId) : false;

      return {
        success: true,
        statusCode: 200,
        message: result.reason,
        mode: freshJunction.mode,
        transition: {
          in_progress: isTransitioning,
          status: isTransitioning ? 'IN_PROGRESS' : 'COMPLETED',
          current_phase: freshJunction.current_phase,
          target_phase: result.targetPhase || freshJunction.current_phase,
        },
      };
    });
  }
}

export default CommandService;

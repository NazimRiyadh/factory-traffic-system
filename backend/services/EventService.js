/**
 * EventService — Ingests and processes sensor events with per-junction locking.
 *
 * Prevents race conditions and guarantees sequential processing per junction.
 */

const TrafficEngine = require('../domain/TrafficEngine');
const SignalPhase = require('../domain/SignalPhase');
const { JUNCTION_MODES } = require('../domain/constants');
const logger = require('../utils/logger');

class EventService {
  constructor(junctionRepo, eventRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.eventRepo = eventRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;

    // Mutex map: junctionId -> Promise
    this.junctionLocks = new Map();
  }

  /**
   * Acquire sequential execution lock for a given junction.
   */
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

  async processEvent(event) {
    const junctionId = event.junction_id;

    return this.withJunctionLock(junctionId, async () => {
      // 1. Fetch current junction state
      const junction = this.junctionRepo.findById(junctionId);
      if (!junction) {
        return {
          status: 'ERROR',
          statusCode: 404,
          message: `Junction '${junctionId}' not found`
        };
      }

      // 2. Fetch processed event ids for deduplication
      const processedEventIds = this.eventRepo.getProcessedEventIds(junctionId, 500);

      // 3. Build state object for domain engine
      const junctionState = {
        ...junction,
        processedEventIds,
        transitioning: this.timerManager ? this.timerManager.isTransitioning(junctionId) : false
      };

      // 4. Process event via pure domain engine
      const { actions, updatedState } = TrafficEngine.processSensorEvent(
        junctionState,
        event,
        this.config
      );

      let isDuplicate = false;
      let isRejected = false;
      let rejectReason = null;

      // 5. Execute actions returned by domain engine
      for (const action of actions) {
        switch (action.type) {
          case 'REJECT_EVENT':
            isRejected = true;
            rejectReason = action.reason;
            if (action.reason === 'DUPLICATE_EVENT') {
              isDuplicate = true;
            }
            break;

          case 'MARK_EVENT_PROCESSED':
            this.eventRepo.markProcessed(action.eventId, junctionId);
            break;

          case 'UPDATE_QUEUE':
            this.junctionRepo.updateQueueAndVehicles(junctionId, action.direction, action.queue);
            break;

          case 'LOG_HISTORY':
            this.historyRepo.log(junctionId, action.eventType, action.direction, action.details);
            break;

          case 'TRIGGER_EMERGENCY': {
            const now = new Date().toISOString();
            this.junctionRepo.updateEmergency(junctionId, JUNCTION_MODES.EMERGENCY, action.direction, now);

            // Transition directly to the emergency phase
            const emergencyPhase = SignalPhase.getPhaseForDirection(action.direction);
            if (emergencyPhase && this.timerManager) {
              this.timerManager.startTransition(
                junctionId,
                junction.current_phase,
                emergencyPhase,
                'EMERGENCY'
              );
            }
            break;
          }

          case 'CLEAR_EMERGENCY': {
            this.junctionRepo.updateEmergency(junctionId, JUNCTION_MODES.AUTOMATIC, null, null);
            this.historyRepo.log(junctionId, 'MODE_CHANGED', null, {
              from: JUNCTION_MODES.EMERGENCY,
              to: JUNCTION_MODES.AUTOMATIC
            });

            // Trigger scheduler to resume normal operations
            setTimeout(() => {
              const freshJunction = this.junctionRepo.findById(junctionId);
              if (freshJunction && freshJunction.mode === JUNCTION_MODES.AUTOMATIC) {
                const Scheduler = require('../domain/Scheduler');
                const nextPhase = Scheduler.selectNextPhase(freshJunction.queues, freshJunction.current_phase, this.config);
                if (nextPhase && nextPhase !== freshJunction.current_phase && this.timerManager) {
                  this.timerManager.startTransition(junctionId, freshJunction.current_phase, nextPhase, 'AUTOMATIC_SCHEDULING');
                }
              }
            }, 100);
            break;
          }

          default:
            logger.warn(`Unknown action type: ${action.type}`);
        }
      }

      if (isDuplicate) {
        return {
          status: 'IGNORED',
          statusCode: 200,
          message: 'Duplicate event already processed (idempotent)',
          event_id: event.event_id
        };
      }

      if (isRejected && !isDuplicate) {
        return {
          status: 'REJECTED',
          statusCode: 400,
          message: rejectReason,
          event_id: event.event_id
        };
      }

      // If in AUTOMATIC mode, check if we need an automatic scheduling transition
      const currentMode = updatedState.mode || junction.mode;
      const isTransitioning = this.timerManager ? this.timerManager.isTransitioning(junctionId) : false;

      if (currentMode === JUNCTION_MODES.AUTOMATIC && !isTransitioning) {
        const nextPhase = TrafficEngine.evaluateAutomaticScheduling(
          { ...updatedState, transitioning: isTransitioning },
          this.config
        );
        if (nextPhase && nextPhase.targetPhase && nextPhase.targetPhase !== junction.current_phase && this.timerManager) {
          this.timerManager.startTransition(
            junctionId,
            junction.current_phase,
            nextPhase.targetPhase,
            'AUTOMATIC_SCHEDULING'
          );
        }
      }

      return {
        status: 'PROCESSED',
        statusCode: 200,
        message: 'Event processed successfully',
        event_id: event.event_id,
        direction: event.direction
      };
    });
  }
}

module.exports = EventService;

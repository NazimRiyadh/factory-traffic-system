/**
 * EventService — Ingests and processes sensor events with per-junction serialization.
 *
 * Guarantees:
 * - Persistent, database-level event deduplication (idempotent)
 * - Atomic state mutations (queue, event record, history) inside SQLite transactions
 * - Deterministic emergency arbitration (FCFS queue for conflicting emergencies)
 * - Centralized scheduling respecting minimum green durations
 */

import TrafficEngine from '../domain/TrafficEngine.js';
import SignalPhase from '../domain/SignalPhase.js';
import { JUNCTION_MODES } from '../domain/constants.js';
import logger from '../utils/logger.js';
import junctionLock from '../utils/junctionLock.js';

class EventService {
  constructor(junctionRepo, eventRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.eventRepo = eventRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;
  }

  async processEvent(event) {
    const junctionId = event.junction_id;

    return junctionLock.runExclusive(junctionId, async () => {
      // 1. Authoritative server receipt timestamp
      const serverReceiptTime = new Date().toISOString();
      const enrichedEvent = {
        ...event,
        server_received_at: serverReceiptTime,
      };

      // 2. Fetch current junction state
      const junction = this.junctionRepo.findById(junctionId);
      if (!junction) {
        return {
          status: 'ERROR',
          statusCode: 404,
          message: `Junction '${junctionId}' not found`,
        };
      }

      // 3. Persistent deduplication check
      if (this.eventRepo.isProcessed(enrichedEvent.event_id)) {
        return {
          status: 'IGNORED',
          statusCode: 200,
          message: 'Duplicate event already processed (idempotent)',
          event_id: enrichedEvent.event_id,
        };
      }

      // 4. Build state object for domain engine
      const junctionState = {
        ...junction,
        transitioning: this.timerManager ? this.timerManager.isTransitioning(junctionId) : false,
      };

      // 5. Process event via pure domain engine
      const { actions, updatedState } = TrafficEngine.processSensorEvent(
        junctionState,
        enrichedEvent,
        this.config
      );

      let isDuplicate = false;
      let isRejected = false;
      let rejectReason = null;
      let transitionToStart = null;

      // 6. Execute state mutations atomically inside SQLite transaction
      const db = this.junctionRepo.db;
      const applyActionsTx = db.transaction(() => {
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
              this.eventRepo.insertProcessed(action.eventId, junctionId);
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
              const emergencyPhase = SignalPhase.getPhaseForDirection(action.direction);
              if (emergencyPhase) {
                transitionToStart = {
                  phase: emergencyPhase,
                  reason: 'EMERGENCY',
                };
              }
              break;
            }

            case 'QUEUE_EMERGENCY':
              this.junctionRepo.updateEmergencyQueue(junctionId, action.emergencyQueue);
              break;

            case 'PROMOTE_EMERGENCY': {
              const now = new Date().toISOString();
              this.junctionRepo.updateEmergency(
                junctionId,
                JUNCTION_MODES.EMERGENCY,
                action.nextEmergency.direction,
                now,
                action.remainingQueue
              );
              const emergencyPhase = SignalPhase.getPhaseForDirection(action.nextEmergency.direction);
              if (emergencyPhase) {
                transitionToStart = {
                  phase: emergencyPhase,
                  reason: 'EMERGENCY',
                };
              }
              break;
            }

            case 'CLEAR_EMERGENCY': {
              this.junctionRepo.updateEmergency(junctionId, JUNCTION_MODES.AUTOMATIC, null, null, []);
              break;
            }

            default:
              logger.warn(`Unknown action type: ${action.type}`);
          }
        }
      });

      applyActionsTx();

      // 7. If transition was triggered by emergency preemption or promotion, start it safely
      if (transitionToStart && this.timerManager) {
        this.timerManager.startTransition(
          junctionId,
          junction.current_phase,
          transitionToStart.phase,
          transitionToStart.reason
        );
      }

      if (isDuplicate) {
        return {
          status: 'IGNORED',
          statusCode: 200,
          message: 'Duplicate event already processed (idempotent)',
          event_id: event.event_id,
        };
      }

      if (isRejected && !isDuplicate) {
        return {
          status: 'REJECTED',
          statusCode: 400,
          message: rejectReason,
          event_id: event.event_id,
        };
      }

      // 8. Automatic scheduling check: Centralized, respecting minimum green duration
      const currentMode = updatedState.mode || junction.mode;
      const isTransitioning = this.timerManager ? this.timerManager.isTransitioning(junctionId) : false;

      if (currentMode === JUNCTION_MODES.AUTOMATIC && !isTransitioning) {
        const nextSchedule = TrafficEngine.evaluateAutomaticScheduling(
          { ...updatedState, transitioning: isTransitioning },
          this.config,
          Date.now()
        );
        if (nextSchedule && nextSchedule.targetPhase && nextSchedule.targetPhase !== junction.current_phase && this.timerManager) {
          this.timerManager.startTransition(
            junctionId,
            junction.current_phase,
            nextSchedule.targetPhase,
            'AUTOMATIC_SCHEDULING'
          );
        }
      }

      return {
        status: 'PROCESSED',
        statusCode: 200,
        message: 'Event processed successfully',
        event_id: event.event_id,
        direction: event.direction,
      };
    });
  }
}

export default EventService;

/**
 * JunctionService — Orchestrates junction state, status queries, and automatic scheduling.
 */

import { JUNCTION_MODES, CONTROLLER_STATUS } from '../domain/constants.js';
import TrafficEngine from '../domain/TrafficEngine.js';
import logger from '../utils/logger.js';
import junctionLock from '../utils/junctionLock.js';

class JunctionService {
  constructor(junctionRepo, commandRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;

    this.scheduleTimers = new Map();

    // Connect timer manager complete hook to auto-evaluate after green duration
    if (this.timerManager) {
      this.timerManager.onTransitionComplete = (junctionId, newPhase) => {
        const minGreen = this.config.MIN_GREEN_DURATION || this.config.GREEN_DURATION || 30000;
        logger.info(`[${junctionId}] Transition completed to ${newPhase}. Scheduling next evaluation in ${minGreen}ms`);
        if (this.scheduleTimers.has(junctionId)) {
          clearTimeout(this.scheduleTimers.get(junctionId));
        }
        const timer = setTimeout(() => {
          this.scheduleTimers.delete(junctionId);
          this.evaluateAndSchedule(junctionId);
        }, minGreen);
        this.scheduleTimers.set(junctionId, timer);
      };
    }
  }

  destroy() {
    for (const [id, timer] of this.scheduleTimers.entries()) {
      clearTimeout(timer);
    }
    this.scheduleTimers.clear();
  }

  getAll() {
    return this.junctionRepo.findAll();
  }

  getById(id) {
    return this.junctionRepo.findById(id);
  }

  getStatus(id) {
    const junction = this.junctionRepo.findById(id);
    if (!junction) return null;

    const transitionState = this.timerManager ? this.timerManager.getCurrentTransition(id) : null;

    // Check for mismatch between desired and actual signals
    let hasSignalMismatch = false;
    for (const [dir, sig] of Object.entries(junction.signals || {})) {
      if (sig.actual_state && sig.actual_state !== sig.desired_state) {
        hasSignalMismatch = true;
        break;
      }
    }

    return {
      ...junction,
      transition: transitionState ? {
        isTransitioning: transitionState.isTransitioning,
        currentPhase: transitionState.currentPhase,
        targetPhase: transitionState.targetPhase,
        reason: transitionState.reason,
        stepIndex: transitionState.stepIndex,
      } : { isTransitioning: false },
      hasSignalMismatch,
      serverTime: new Date().toISOString(),
    };
  }

  create(data) {
    const existing = this.junctionRepo.findById(data.id);
    if (existing) {
      throw new Error(`Junction with ID '${data.id}' already exists.`);
    }

    const created = this.junctionRepo.create(data);
    this.historyRepo.log(data.id, 'JUNCTION_CREATED', null, { name: data.name });
    return created;
  }

  updateSignals(id, signals) {
    return this.junctionRepo.updateSignals(id, signals);
  }

  updatePhase(id, phase) {
    return this.junctionRepo.updatePhase(id, phase);
  }

  updateControllerStatus(id, status) {
    return this.junctionRepo.updateControllerStatus(id, status);
  }

  async evaluateAndSchedule(id) {
    if (!this.junctionRepo.db || !this.junctionRepo.db.open) return null;
    return junctionLock.runExclusive(id, async () => {
      if (!this.junctionRepo.db || !this.junctionRepo.db.open) return null;
      const junction = this.junctionRepo.findById(id);
      if (!junction) return null;

      if (junction.mode !== JUNCTION_MODES.AUTOMATIC) {
        logger.debug(`[${id}] Skipping automatic scheduling — junction is in ${junction.mode} mode`);
        return null;
      }

      if (junction.controller_status !== CONTROLLER_STATUS.ONLINE) {
        logger.debug(`[${id}] Skipping automatic scheduling — controller status is ${junction.controller_status}`);
        return null;
      }

      const isTransitioning = this.timerManager ? this.timerManager.isTransitioning(id) : false;
      if (isTransitioning) {
        logger.debug(`[${id}] Skipping automatic scheduling — currently transitioning`);
        return null;
      }

      const scheduleDecision = TrafficEngine.evaluateAutomaticScheduling(
        { ...junction, transitioning: false },
        this.config,
        Date.now()
      );

      if (scheduleDecision && scheduleDecision.targetPhase && scheduleDecision.targetPhase !== junction.current_phase && this.timerManager) {
        logger.info(`[${id}] Automatic scheduler selected new phase: ${scheduleDecision.targetPhase} (current: ${junction.current_phase})`);
        this.timerManager.startTransition(id, junction.current_phase, scheduleDecision.targetPhase, 'AUTOMATIC_SCHEDULING');
        return scheduleDecision.targetPhase;
      }

      return null;
    });
  }
}

export default JunctionService;

/**
 * JunctionService — Orchestrates junction state, status queries, and automatic scheduling.
 */

const { JUNCTION_MODES } = require('../domain/constants');
const Scheduler = require('../domain/Scheduler');
const logger = require('../utils/logger');

class JunctionService {
  constructor(junctionRepo, commandRepo, historyRepo, timerManager, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.timerManager = timerManager;
    this.config = config;

    // Connect timer manager complete hook to auto-evaluate after green duration
    if (this.timerManager) {
      this.timerManager.onTransitionComplete = (junctionId, newPhase) => {
        logger.info(`[${junctionId}] Transition completed to ${newPhase}. Scheduling next evaluation in ${this.config.GREEN_DURATION}ms`);
        // Schedule next automatic evaluation after minimum green duration
        setTimeout(() => {
          this.evaluateAndSchedule(junctionId);
        }, this.config.GREEN_DURATION);
      };
    }
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
    for (const [dir, sig] of Object.entries(junction.signals)) {
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
        stepIndex: transitionState.stepIndex
      } : { isTransitioning: false },
      hasSignalMismatch,
      serverTime: new Date().toISOString()
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

  evaluateAndSchedule(id) {
    const junction = this.junctionRepo.findById(id);
    if (!junction) return null;

    // Only run automatic scheduling in AUTOMATIC mode
    if (junction.mode !== JUNCTION_MODES.AUTOMATIC) {
      logger.debug(`[${id}] Skipping automatic scheduling — junction is in ${junction.mode} mode`);
      return null;
    }

    // Don't interrupt active transition
    if (this.timerManager && this.timerManager.isTransitioning(id)) {
      logger.debug(`[${id}] Skipping automatic scheduling — currently transitioning`);
      return null;
    }

    const nextPhase = Scheduler.selectNextPhase(
      junction.queues,
      junction.current_phase,
      this.config
    );

    if (nextPhase && nextPhase !== junction.current_phase) {
      logger.info(`[${id}] Automatic scheduler selected new phase: ${nextPhase} (current: ${junction.current_phase})`);
      this.timerManager.startTransition(id, junction.current_phase, nextPhase, 'AUTOMATIC_SCHEDULING');
      return nextPhase;
    }

    return null;
  }
}

module.exports = JunctionService;

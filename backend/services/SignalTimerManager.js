/**
 * SignalTimerManager — Coordinates safe, timed traffic signal transitions.
 *
 * Enforces non-blocking timeouts for state transitions:
 * GREEN -> YELLOW -> ALL_RED -> GREEN
 *
 * Keeps track of transition status to avoid concurrent or overlapping transitions.
 */

const { SignalTransition, TRANSITION_STEPS } = require('../domain/SignalTransition');
const SignalPhase = require('../domain/SignalPhase');
const logger = require('../utils/logger');

class SignalTimerManager {
  constructor(junctionRepo, commandRepo, historyRepo, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.config = config;

    // Map: junctionId -> { activeTimer, targetPhase, currentStep, isTransitioning, autoScheduleTimer }
    this.transitions = new Map();

    // Callback invoked when transition completes to green
    this.onTransitionComplete = null;
  }

  isTransitioning(junctionId) {
    const state = this.transitions.get(junctionId);
    return !!(state && state.isTransitioning);
  }

  getCurrentTransition(junctionId) {
    return this.transitions.get(junctionId) || null;
  }

  /**
   * Start a safe transition sequence for a junction.
   *
   * @param {string} junctionId
   * @param {string} currentPhase - e.g. 'NORTH_SOUTH'
   * @param {string} targetPhase - e.g. 'EAST_WEST'
   * @param {string} reason - e.g. 'AUTOMATIC_SCHEDULING', 'EMERGENCY', 'MANUAL_OVERRIDE'
   * @param {function} onComplete - optional callback on finish
   */
  startTransition(junctionId, currentPhase, targetPhase, reason = 'SCHEDULING', onComplete = null) {
    // If target is same as current phase and already in GREEN, no transition needed
    if (currentPhase === targetPhase) {
      logger.info(`[${junctionId}] Target phase same as current (${targetPhase}), skipping transition`);
      if (onComplete) onComplete(null, targetPhase);
      return;
    }

    // Cancel existing timers for this junction
    this.cancelTimers(junctionId);

    const steps = SignalTransition.calculateTransition(currentPhase, targetPhase, this.config);

    logger.info(`[${junctionId}] Starting transition ${currentPhase} -> ${targetPhase} (reason: ${reason})`);

    this.historyRepo.log(junctionId, 'SIGNAL_TRANSITION_STARTED', null, {
      from_phase: currentPhase,
      to_phase: targetPhase,
      reason
    });

    const transitionState = {
      isTransitioning: true,
      currentPhase,
      targetPhase,
      reason,
      stepIndex: 0,
      activeTimer: null,
      onComplete
    };

    this.transitions.set(junctionId, transitionState);
    this._executeStep(junctionId, steps, 0);
  }

  _executeStep(junctionId, steps, stepIndex) {
    const state = this.transitions.get(junctionId);
    if (!state || !state.isTransitioning) return;

    if (stepIndex >= steps.length) {
      // Completed all steps
      state.isTransitioning = false;
      this.transitions.set(junctionId, state);
      if (state.onComplete) state.onComplete(null, state.targetPhase);
      if (this.onTransitionComplete) this.onTransitionComplete(junctionId, state.targetPhase);
      return;
    }

    const currentStep = steps[stepIndex];
    if (currentStep.step === TRANSITION_STEPS.NONE) {
      state.isTransitioning = false;
      return;
    }

    // Safety validation before applying
    if (currentStep.signals && !SignalPhase.validateSafety(currentStep.signals)) {
      logger.error(`[${junctionId}] CRITICAL SAFETY VIOLATION PREVENTED! Signals:`, currentStep.signals);
      this.historyRepo.log(junctionId, 'SAFETY_VIOLATION_PREVENTED', null, { signals: currentStep.signals });
      this.cancelTimers(junctionId);
      return;
    }

    // Apply signals to junction desired_state
    if (currentStep.signals) {
      this.junctionRepo.updateSignals(junctionId, currentStep.signals);

      // Create pending command records for hardware/simulator
      const createdCommands = [];
      for (const [dir, sigState] of Object.entries(currentStep.signals)) {
        const cmdId = `cmd_${Date.now()}_${junctionId}_${dir}_${sigState}`;
        this.commandRepo.create({
          command_id: cmdId,
          junction_id: junctionId,
          direction: dir,
          requested_state: sigState,
          status: 'SENT'
        });
        createdCommands.push({ command_id: cmdId, junction_id: junctionId, direction: dir, requested_state: sigState });
      }

      if (this.onCommandsDispatched) {
        this.onCommandsDispatched(junctionId, createdCommands);
      }

      this.historyRepo.log(junctionId, 'SIGNAL_STATE_REQUESTED', null, {
        step: currentStep.step,
        signals: currentStep.signals
      });
    }

    // If final step (GREEN), update junction's current_phase
    if (currentStep.step === TRANSITION_STEPS.GREEN) {
      this.junctionRepo.updatePhase(junctionId, state.targetPhase);
      this.historyRepo.log(junctionId, 'PHASE_CHANGED', null, {
        new_phase: state.targetPhase
      });
      state.isTransitioning = false;
      this.transitions.set(junctionId, state);

      if (state.onComplete) state.onComplete(null, state.targetPhase);
      if (this.onTransitionComplete) this.onTransitionComplete(junctionId, state.targetPhase);
      return;
    }

    // Schedule next step
    state.stepIndex = stepIndex + 1;
    state.activeTimer = setTimeout(() => {
      this._executeStep(junctionId, steps, stepIndex + 1);
    }, currentStep.duration);

    this.transitions.set(junctionId, state);
  }

  cancelTimers(junctionId) {
    const state = this.transitions.get(junctionId);
    if (state) {
      if (state.activeTimer) {
        clearTimeout(state.activeTimer);
      }
      if (state.autoScheduleTimer) {
        clearTimeout(state.autoScheduleTimer);
      }
      this.transitions.delete(junctionId);
    }
  }

  destroy() {
    for (const [junctionId] of this.transitions) {
      this.cancelTimers(junctionId);
    }
  }
}

module.exports = SignalTimerManager;

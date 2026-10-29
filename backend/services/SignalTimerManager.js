/**
 * SignalTimerManager — Coordinates safe, timed traffic signal transitions.
 *
 * Enforces non-blocking timeouts for state transitions:
 * GREEN -> YELLOW -> ALL_RED -> GREEN
 *
 * Fully supports superseding active transitions safely when higher-priority
 * emergency or manual override requests arrive while a transition is underway.
 */

import { SignalTransition, TRANSITION_STEPS } from '../domain/SignalTransition.js';
import SignalPhase from '../domain/SignalPhase.js';
import logger from '../utils/logger.js';
import junctionLock from '../utils/junctionLock.js';

class SignalTimerManager {
  constructor(junctionRepo, commandRepo, historyRepo, config) {
    this.junctionRepo = junctionRepo;
    this.commandRepo = commandRepo;
    this.historyRepo = historyRepo;
    this.config = config;

    // Map: junctionId -> transitionState
    this.transitions = new Map();

    // Callback invoked when transition completes to green
    this.onTransitionComplete = null;
    this.onCommandsDispatched = null;
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
   * If an active transition is already in progress:
   *   - If targeting the same phase, updates metadata without restarting.
   *   - If targeting a conflicting phase, safely cancels the old transition
   *     and advances from current physical step through ALL_RED to new target GREEN.
   *
   * @param {string} junctionId
   * @param {string} currentPhase - e.g. 'NORTH_SOUTH'
   * @param {string} targetPhase - e.g. 'EAST_WEST'
   * @param {string} reason - e.g. 'AUTOMATIC_SCHEDULING', 'EMERGENCY', 'MANUAL_OVERRIDE'
   * @param {function} onComplete - optional callback on finish
   * @returns {{ started: boolean, inProgress: boolean, targetPhase: string, reason: string }}
   */
  startTransition(junctionId, currentPhase, targetPhase, reason = 'SCHEDULING', onComplete = null) {
    const active = this.transitions.get(junctionId);

    // 1. Check if there is an active transition already running
    if (active && active.isTransitioning) {
      if (active.targetPhase === targetPhase) {
        logger.info(`[${junctionId}] Already transitioning to target phase (${targetPhase}). Preserving active transition.`);
        active.reason = reason;
        if (onComplete) {
          const prev = active.onComplete;
          active.onComplete = (err, res) => {
            if (prev) prev(err, res);
            onComplete(err, res);
          };
        }
        return {
          started: false,
          inProgress: true,
          targetPhase,
          reason: 'ALREADY_TRANSITIONING_TO_TARGET'
        };
      }

      // Conflicting transition is underway — MUST supersede safely!
      logger.warn(`[${junctionId}] Superseding active transition (${active.targetPhase}) with requested target (${targetPhase}) [reason: ${reason}]`);
      const oldStep = active.currentStep;

      // Cancel old transition timers and invalidate its token
      this.cancelTimers(junctionId);

      // Determine safe transition sequence from current intermediate step
      let steps;
      if (oldStep === TRANSITION_STEPS.YELLOW) {
        // Was in YELLOW: must clear through ALL_RED before target GREEN
        steps = SignalTransition.calculateTransition(currentPhase, targetPhase, this.config, TRANSITION_STEPS.YELLOW);
      } else if (oldStep === TRANSITION_STEPS.ALL_RED) {
        // Was in ALL_RED: safe to advance directly to target GREEN
        steps = SignalTransition.calculateTransition(currentPhase, targetPhase, this.config, TRANSITION_STEPS.ALL_RED);
      } else {
        steps = SignalTransition.calculateTransition(currentPhase, targetPhase, this.config);
      }

      this.historyRepo.log(junctionId, 'SIGNAL_TRANSITION_STARTED', null, {
        from_phase: currentPhase,
        to_phase: targetPhase,
        superseded_previous_target: active.targetPhase,
        from_step: oldStep,
        reason
      });

      const transitionId = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const transitionState = {
        transitionId,
        isTransitioning: true,
        currentPhase,
        targetPhase,
        currentStep: steps[0]?.step || null,
        reason,
        stepIndex: 0,
        activeTimer: null,
        onComplete
      };

      this.transitions.set(junctionId, transitionState);
      this.junctionRepo.updateTransitioning(junctionId, 1, steps[0]?.step || null);
      this._executeStep(junctionId, steps, 0, transitionId);

      return {
        started: true,
        inProgress: true,
        targetPhase,
        reason
      };
    }

    // 2. No active transition: check if target is same as current phase
    if (currentPhase === targetPhase) {
      logger.info(`[${junctionId}] Target phase same as current (${targetPhase}), skipping transition`);
      if (onComplete) onComplete(null, targetPhase);
      return {
        started: false,
        inProgress: false,
        targetPhase,
        reason: 'ALREADY_IN_TARGET_PHASE'
      };
    }

    // 3. Normal transition from steady phase
    this.cancelTimers(junctionId);

    const steps = SignalTransition.calculateTransition(currentPhase, targetPhase, this.config);

    logger.info(`[${junctionId}] Starting transition ${currentPhase} -> ${targetPhase} (reason: ${reason})`);

    this.historyRepo.log(junctionId, 'SIGNAL_TRANSITION_STARTED', null, {
      from_phase: currentPhase,
      to_phase: targetPhase,
      reason
    });

    const transitionId = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const transitionState = {
      transitionId,
      isTransitioning: true,
      currentPhase,
      targetPhase,
      currentStep: steps[0]?.step || null,
      reason,
      stepIndex: 0,
      activeTimer: null,
      onComplete
    };

    this.transitions.set(junctionId, transitionState);
    this.junctionRepo.updateTransitioning(junctionId, 1, steps[0]?.step || null);
    this._executeStep(junctionId, steps, 0, transitionId);

    return {
      started: true,
      inProgress: true,
      targetPhase,
      reason
    };
  }

  _executeStep(junctionId, steps, stepIndex, transitionId) {
    const state = this.transitions.get(junctionId);
    if (!state || !state.isTransitioning || state.transitionId !== transitionId) {
      return; // Transition was superseded or cancelled
    }

    if (stepIndex >= steps.length) {
      // Completed all steps
      state.isTransitioning = false;
      this.junctionRepo.updateTransitioning(junctionId, 0, null);
      this.transitions.set(junctionId, state);
      if (state.onComplete) state.onComplete(null, state.targetPhase);
      if (this.onTransitionComplete) this.onTransitionComplete(junctionId, state.targetPhase);
      return;
    }

    const currentStep = steps[stepIndex];
    if (currentStep.step === TRANSITION_STEPS.NONE) {
      state.isTransitioning = false;
      this.junctionRepo.updateTransitioning(junctionId, 0, null);
      return;
    }

    // Safety validation before applying
    if (currentStep.signals && !SignalPhase.validateSafety(currentStep.signals)) {
      logger.error(`[${junctionId}] CRITICAL SAFETY VIOLATION PREVENTED! Signals:`, currentStep.signals);
      this.historyRepo.log(junctionId, 'SAFETY_VIOLATION_PREVENTED', null, { signals: currentStep.signals });
      this.cancelTimers(junctionId);
      return;
    }

    state.currentStep = currentStep.step;
    this.junctionRepo.updateTransitioning(junctionId, 1, currentStep.step);

    // Apply signals to junction desired_state
    if (currentStep.signals) {
      this.junctionRepo.updateSignals(junctionId, currentStep.signals);

      // Create pending command records for hardware/simulator
      const createdCommands = [];
      const timestamp = Date.now();
      for (const [dir, sigState] of Object.entries(currentStep.signals)) {
        const cmdId = `cmd_${timestamp}_${junctionId}_${dir}_${sigState}`;
        this.commandRepo.create({
          command_id: cmdId,
          junction_id: junctionId,
          direction: dir,
          requested_state: sigState,
          status: 'SENT'
        });
        createdCommands.push({
          command_id: cmdId,
          junction_id: junctionId,
          direction: dir,
          requested_state: sigState
        });
      }

      if (this.onCommandsDispatched) {
        this.onCommandsDispatched(junctionId, createdCommands);
      }

      this.historyRepo.log(junctionId, 'SIGNAL_STATE_REQUESTED', null, {
        step: currentStep.step,
        signals: currentStep.signals
      });
    }

    // If final step (GREEN), update junction's current_phase and phase_started_at
    if (currentStep.step === TRANSITION_STEPS.GREEN) {
      const nowIso = new Date().toISOString();
      this.junctionRepo.updatePhase(junctionId, state.targetPhase, nowIso);
      this.historyRepo.log(junctionId, 'PHASE_CHANGED', null, {
        new_phase: state.targetPhase
      });
      state.isTransitioning = false;
      this.junctionRepo.updateTransitioning(junctionId, 0, null);
      this.transitions.set(junctionId, state);

      if (state.onComplete) state.onComplete(null, state.targetPhase);
      if (this.onTransitionComplete) this.onTransitionComplete(junctionId, state.targetPhase);
      return;
    }

    // Schedule next step inside the junction lock
    state.stepIndex = stepIndex + 1;
    state.activeTimer = setTimeout(() => {
      junctionLock.runExclusive(junctionId, async () => {
        this._executeStep(junctionId, steps, stepIndex + 1, transitionId);
      });
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
    // Also reset database transitioning flag
    try {
      this.junctionRepo.updateTransitioning(junctionId, 0, null);
    } catch (_) {}
  }

  destroy() {
    for (const [junctionId] of this.transitions) {
      this.cancelTimers(junctionId);
    }
  }
}

export default SignalTimerManager;

/**
 * SignalTransition — Generates the sequence of safe signal state changes
 * needed to transition from one phase to another.
 *
 * A phase switch MUST always follow this sequence:
 *   1. Current phase → YELLOW  (5 seconds)
 *   2. ALL directions → RED    (2 seconds clearance)
 *   3. New phase → GREEN       (30 seconds)
 *
 * A GREEN → conflicting GREEN transition is NEVER allowed.
 * This module is pure logic with zero I/O dependencies.
 */

const SignalPhase = require('./SignalPhase');

const TRANSITION_STEPS = {
  YELLOW: 'YELLOW',
  ALL_RED: 'ALL_RED',
  GREEN: 'GREEN',
  NONE: 'NONE',
};

class SignalTransition {
  /**
   * Calculate the full sequence of transition steps needed to go from
   * currentPhase to targetPhase.
   *
   * @param {string} currentPhase - e.g., 'NORTH_SOUTH'
   * @param {string} targetPhase  - e.g., 'EAST_WEST'
   * @param {object} config       - must have YELLOW_DURATION, ALL_RED_DURATION, GREEN_DURATION
   * @returns {Array<{step: string, signals: object, duration: number}>}
   */
  static calculateTransition(currentPhase, targetPhase, config) {
    // If already in the target phase, no transition needed
    if (currentPhase === targetPhase) {
      return [{ step: TRANSITION_STEPS.NONE, signals: null, duration: 0 }];
    }

    return [
      {
        step: TRANSITION_STEPS.YELLOW,
        signals: SignalPhase.getYellowTransition(currentPhase),
        duration: config.YELLOW_DURATION || 5000,
      },
      {
        step: TRANSITION_STEPS.ALL_RED,
        signals: SignalPhase.getAllRed(),
        duration: config.ALL_RED_DURATION || 2000,
      },
      {
        step: TRANSITION_STEPS.GREEN,
        signals: SignalPhase.getSignalStatesForPhase(targetPhase),
        duration: config.GREEN_DURATION || 30000,
      },
    ];
  }

  /**
   * Validate that a transition from current signals to next signals is safe.
   * A transition is unsafe if any conflicting direction would go from GREEN
   * to GREEN without an intermediate YELLOW/RED step.
   *
   * @param {object} currentSignals - { NORTH: 'GREEN', ... }
   * @param {object} nextSignals    - { NORTH: 'YELLOW', ... }
   * @returns {boolean} true if the transition is safe
   */
  static isTransitionSafe(currentSignals, nextSignals) {
    // Next signals must not have conflicting GREENs
    if (!SignalPhase.validateSafety(nextSignals)) {
      return false;
    }

    const current = currentSignals || {};
    // Check no direction jumps from GREEN to a state where a
    // conflicting direction is also GREEN (direct conflict)
    for (const [dir, currentState] of Object.entries(current)) {
      if (currentState === 'GREEN') {
        const currentPhase = SignalPhase.getPhaseForDirection(dir);
        // Check if any direction in a conflicting phase is going GREEN
        for (const [otherDir, nextState] of Object.entries(nextSignals)) {
          if (nextState === 'GREEN') {
            const otherPhase = SignalPhase.getPhaseForDirection(otherDir);
            if (SignalPhase.areConflicting(currentPhase, otherPhase)) {
              return false; // Unsafe: conflicting direction going GREEN
            }
          }
        }
      }
    }

    return true;
  }
}

module.exports = { SignalTransition, TRANSITION_STEPS };

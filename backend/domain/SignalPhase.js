/**
 * SignalPhase — Defines traffic phases, conflict rules, and signal state generation.
 *
 * A "phase" is a group of non-conflicting directions that may simultaneously be GREEN.
 * For this simplified junction:
 *   - NORTH_SOUTH phase: NORTH + SOUTH get GREEN
 *   - EAST_WEST phase:   EAST  + WEST  get GREEN
 *
 * These two phases conflict — they must NEVER be GREEN at the same time.
 * Pure logic with zero I/O dependencies.
 */

import { PHASES, SIGNAL_STATES, DIRECTIONS } from './constants.js';

class SignalPhase {
  /**
   * Get the phase name that contains a given direction.
   * @param {string} direction - e.g., 'NORTH'
   * @returns {string|null} - e.g., 'NORTH_SOUTH' or null if invalid
   */
  static getPhaseForDirection(direction) {
    for (const [phaseName, directions] of Object.entries(PHASES)) {
      if (directions.includes(direction)) return phaseName;
    }
    return null;
  }

  /**
   * Check if two phases conflict with each other.
   * Two different phases always conflict in this simple model.
   * @param {string} phase1
   * @param {string} phase2
   * @returns {boolean}
   */
  static areConflicting(phase1, phase2) {
    return phase1 !== phase2;
  }

  /**
   * Get the opposing phase.
   * @param {string} phaseName
   * @returns {string|null}
   */
  static getOpposingPhase(phaseName) {
    const phaseNames = Object.keys(PHASES);
    return phaseNames.find(p => p !== phaseName) || null;
  }

  /**
   * Get the signal states for when a given phase is active (GREEN).
   * Active phase directions get GREEN, all others get RED.
   * @param {string} activePhase - e.g., 'NORTH_SOUTH'
   * @returns {object} - e.g., { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' }
   */
  static getSignalStatesForPhase(activePhase) {
    const signals = {};
    for (const [phaseName, directions] of Object.entries(PHASES)) {
      const state = phaseName === activePhase
        ? SIGNAL_STATES.GREEN
        : SIGNAL_STATES.RED;
      directions.forEach(dir => { signals[dir] = state; });
    }
    return signals;
  }

  /**
   * Get ALL_RED signal states — used as safe clearance between phase switches.
   * @returns {object} - { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' }
   */
  static getAllRed() {
    const signals = {};
    DIRECTIONS.forEach(dir => {
      signals[dir] = SIGNAL_STATES.RED;
    });
    return signals;
  }

  /**
   * Get YELLOW transition states — active phase gets YELLOW, others stay RED.
   * Used during the first step of a safe phase switch.
   * @param {string} currentPhase - the phase that is currently GREEN
   * @returns {object}
   */
  static getYellowTransition(currentPhase) {
    const signals = {};
    for (const [phaseName, directions] of Object.entries(PHASES)) {
      const state = phaseName === currentPhase
        ? SIGNAL_STATES.YELLOW
        : SIGNAL_STATES.RED;
      directions.forEach(dir => { signals[dir] = state; });
    }
    return signals;
  }

  /**
   * Validate that a set of signals does not have conflicting GREENs.
   * This is the #1 safety invariant — conflicting directions must never both be GREEN.
   * @param {object} signals - { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' }
   * @returns {boolean} - true if safe, false if unsafe
   */
  static validateSafety(signals) {
    const greenDirections = Object.entries(signals)
      .filter(([_, state]) => state === SIGNAL_STATES.GREEN)
      .map(([dir]) => dir);

    // ALL_RED or no GREEN is always safe
    if (greenDirections.length === 0) return true;

    // All green directions must belong to the same phase
    const phase = this.getPhaseForDirection(greenDirections[0]);
    if (!phase) return false;

    return greenDirections.every(
      dir => this.getPhaseForDirection(dir) === phase
    );
  }

  /**
   * Check if a direction is valid.
   * @param {string} direction
   * @returns {boolean}
   */
  static isValidDirection(direction) {
    return DIRECTIONS.includes(direction);
  }

  /**
   * Get all phase names.
   * @returns {string[]}
   */
  static getAllPhaseNames() {
    return Object.keys(PHASES);
  }
}

export default SignalPhase;

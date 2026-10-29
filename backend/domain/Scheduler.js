/**
 * Scheduler — Determines which traffic phase should be served next.
 *
 * Uses a scoring formula combining:
 *   - Queue size (more vehicles = higher score)
 *   - Vehicle priority (EMERGENCY >> TRUCK >> FORKLIFT >> EMPLOYEE_VEHICLE)
 *   - Waiting time (longer wait = higher score)
 *   - Starvation protection (bonus after threshold exceeded)
 *
 * The exact weights are configurable via config. This module is pure logic
 * with zero I/O dependencies.
 */

const { PHASES } = require('./constants');

class Scheduler {
  /**
   * Score a traffic phase based on its constituent direction queues.
   *
   * @param {string} phaseName - e.g., 'NORTH_SOUTH'
   * @param {object} queues    - { NORTH: { vehicle_count, vehicles, first_vehicle_at }, ... }
   * @param {object} config    - scheduling weights and priority values
   * @param {number} now       - current timestamp in ms (Date.now())
   * @returns {number} - total priority score for this phase
   */
  static scorePhase(phaseName, queues, config, now) {
    const directions = PHASES[phaseName];
    if (!directions) return 0;

    let totalScore = 0;

    for (const dir of directions) {
      const queue = queues[dir];
      if (!queue) continue;

      // Factor 1: Queue size — more vehicles means higher urgency
      const queueScore = (queue.vehicle_count || 0) * (config.SCHEDULING_WEIGHTS.QUEUE_SIZE || 1);

      // Factor 2: Vehicle priority — sum of priority weights for all vehicles
      let priorityScore = 0;
      if (queue.vehicles && queue.vehicles.length > 0) {
        for (const v of queue.vehicles) {
          priorityScore += (config.VEHICLE_PRIORITY[v.vehicle_type] || 10);
        }
      }
      priorityScore *= (config.SCHEDULING_WEIGHTS.VEHICLE_PRIORITY || 1);

      // Factor 3: Waiting time — how long has this direction been waiting?
      let waitingScore = 0;
      if (queue.first_vehicle_at) {
        const waitMs = now - new Date(queue.first_vehicle_at).getTime();
        if (waitMs > 0) {
          waitingScore = (waitMs / 1000) * (config.SCHEDULING_WEIGHTS.WAITING_TIME || 1);
        }
      }

      // Factor 4: Starvation protection — big bonus if waiting too long
      let starvationScore = 0;
      if (queue.first_vehicle_at) {
        const waitMs = now - new Date(queue.first_vehicle_at).getTime();
        if (waitMs > (config.STARVATION_THRESHOLD || 60000)) {
          starvationScore = config.SCHEDULING_WEIGHTS.STARVATION_BONUS || 100;
        }
      }

      totalScore += queueScore + priorityScore + waitingScore + starvationScore;
    }

    return totalScore;
  }

  /**
   * Determine which phase should be served next.
   *
   * Returns null if:
   *   - No vehicles waiting anywhere
   *   - Current phase still has the highest score (avoid unnecessary switching)
   *
   * @param {object} queues        - all direction queues
   * @param {string} currentPhase  - currently active phase
   * @param {object} config        - configuration with weights/priorities
   * @returns {string|null} - phase name to switch to, or null if no change needed
   */
  static selectNextPhase(queues, currentPhase, config) {
    const now = Date.now();
    const scores = {};

    for (const phaseName of Object.keys(PHASES)) {
      scores[phaseName] = this.scorePhase(phaseName, queues, config, now);
    }

    // Find the highest-scoring phase
    let bestPhase = null;
    let bestScore = -1;

    for (const [phase, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestPhase = phase;
      }
    }

    // If best phase has score 0 or less (no vehicles anywhere), don't switch
    if (bestScore <= 0) return null;

    // If current phase still has the highest score, don't switch
    // (avoids unnecessary phase changes when traffic is balanced)
    if (bestPhase === currentPhase) return null;

    return bestPhase;
  }

  /**
   * Get scores for all phases (useful for debugging / dashboard display).
   *
   * @param {object} queues
   * @param {object} config
   * @returns {object} - { NORTH_SOUTH: 42, EAST_WEST: 85 }
   */
  static getAllScores(queues, config) {
    const now = Date.now();
    const scores = {};

    for (const phaseName of Object.keys(PHASES)) {
      scores[phaseName] = this.scorePhase(phaseName, queues, config, now);
    }

    return scores;
  }
}

module.exports = Scheduler;

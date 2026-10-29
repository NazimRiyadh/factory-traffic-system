/**
 * QueueManager — Pure logic for managing vehicle queues.
 *
 * Handles adding/removing vehicles, tracking queue counts,
 * and detecting emergency vehicles. Works with plain data objects only.
 * Zero I/O dependencies.
 */

import { VEHICLE_TYPES } from './constants.js';

class QueueManager {
  /**
   * Process a VEHICLE_ARRIVED event against a direction queue.
   *
   * @param {object} queue - { direction, vehicle_count, vehicles: [{vehicle_id, vehicle_type, arrived_at}] }
   * @param {object} event - sensor event with vehicle_id, vehicle_type, timestamp
   * @returns {object} - { updated: boolean, queue: object, reason: string }
   */
  static addVehicle(queue, event) {
    const vehicles = queue.vehicles || [];

    // Check if vehicle already in queue (prevent double-add)
    if (vehicles.find(v => v.vehicle_id === event.vehicle_id)) {
      return {
        updated: false,
        queue,
        reason: 'VEHICLE_ALREADY_IN_QUEUE',
      };
    }

    const updatedVehicles = [
      ...vehicles,
      {
        vehicle_id: event.vehicle_id,
        vehicle_type: event.vehicle_type,
        arrived_at: event.timestamp || new Date().toISOString(),
      },
    ];

    return {
      updated: true,
      queue: {
        ...queue,
        vehicle_count: (queue.vehicle_count || 0) + 1,
        vehicles: updatedVehicles,
        // Track when first vehicle arrived (for starvation protection)
        first_vehicle_at: queue.first_vehicle_at || event.timestamp || new Date().toISOString(),
      },
      reason: 'VEHICLE_ADDED',
    };
  }

  /**
   * Process a VEHICLE_CLEARED event against a direction queue.
   *
   * @param {object} queue - current queue state
   * @param {object} event - sensor event with vehicle_id
   * @returns {object} - { updated: boolean, queue: object, reason: string }
   */
  static removeVehicle(queue, event) {
    const vehicles = queue.vehicles || [];
    const vehicleIndex = vehicles.findIndex(v => v.vehicle_id === event.vehicle_id);

    if (vehicleIndex === -1) {
      // Vehicle not found — don't allow queue to go negative
      return {
        updated: false,
        queue,
        reason: 'VEHICLE_NOT_IN_QUEUE',
      };
    }

    const updatedVehicles = [...vehicles];
    updatedVehicles.splice(vehicleIndex, 1);

    const newCount = Math.max(0, (queue.vehicle_count || 1) - 1);

    return {
      updated: true,
      queue: {
        ...queue,
        vehicle_count: newCount,
        vehicles: updatedVehicles,
        // Reset first_vehicle_at if queue is now empty
        first_vehicle_at: updatedVehicles.length > 0 ? queue.first_vehicle_at : null,
      },
      reason: 'VEHICLE_REMOVED',
    };
  }

  /**
   * Get the highest priority vehicle in a list.
   *
   * @param {Array} vehicles - array of { vehicle_id, vehicle_type }
   * @param {object} priorityMap - { EMERGENCY: 1000, TRUCK: 50, ... }
   * @returns {object|null} - highest priority vehicle or null
   */
  static getHighestPriority(vehicles, priorityMap) {
    if (!vehicles || vehicles.length === 0) return null;

    let highest = null;
    let highestWeight = -1;

    for (const v of vehicles) {
      const weight = priorityMap[v.vehicle_type] || 0;
      if (weight > highestWeight) {
        highestWeight = weight;
        highest = v;
      }
    }

    return highest;
  }

  /**
   * Check if any emergency vehicles are currently in the queues.
   *
   * @param {object} queues - { NORTH: {...}, SOUTH: {...}, ... }
   * @returns {{ hasEmergency: boolean, direction: string|null, vehicle: object|null }}
   */
  static hasEmergencyVehicle(queues) {
    for (const [direction, queue] of Object.entries(queues)) {
      if (queue.vehicles && queue.vehicles.length > 0) {
        const emergency = queue.vehicles.find(v => v.vehicle_type === VEHICLE_TYPES.EMERGENCY);
        if (emergency) {
          return {
            hasEmergency: true,
            direction,
            vehicle: emergency,
          };
        }
      }
    }
    return { hasEmergency: false, direction: null, vehicle: null };
  }

  /**
   * Calculate waiting time in seconds for a queue.
   *
   * @param {object} queue
   * @param {number} now - current timestamp ms
   * @returns {number} waiting time in seconds
   */
  static getWaitingTimeSeconds(queue, now = Date.now()) {
    if (!queue || !queue.first_vehicle_at) return 0;
    const firstAt = new Date(queue.first_vehicle_at).getTime();
    return Math.max(0, (now - firstAt) / 1000);
  }

  /**
   * Check if a queue is starving (waiting longer than threshold).
   *
   * @param {object} queue
   * @param {number} thresholdMs - e.g. 60000 (60s)
   * @param {number} now
   * @returns {boolean}
   */
  static isStarving(queue, thresholdMs = 60000, now = Date.now()) {
    if (!queue || !queue.first_vehicle_at || (queue.vehicle_count || 0) === 0) {
      return false;
    }
    const firstAt = new Date(queue.first_vehicle_at).getTime();
    return (now - firstAt) > thresholdMs;
  }
}

export default QueueManager;

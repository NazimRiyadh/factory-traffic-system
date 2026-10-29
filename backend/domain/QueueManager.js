/**
 * QueueManager — Pure logic for managing vehicle queues.
 *
 * Handles adding/removing vehicles, tracking queue counts,
 * and detecting emergency vehicles. Works with plain data objects only.
 * Zero I/O dependencies.
 */

const { VEHICLE_TYPES } = require('./constants');

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

    return vehicles.reduce((highest, v) => {
      const currentPriority = priorityMap[v.vehicle_type] || 0;
      const highestPriority = priorityMap[highest.vehicle_type] || 0;
      return currentPriority > highestPriority ? v : highest;
    }, vehicles[0]);
  }

  /**
   * Check if any direction queue has an emergency vehicle.
   *
   * @param {object} queues - { NORTH: { vehicles: [...] }, SOUTH: {...}, ... }
   * @returns {object} - { hasEmergency: boolean, direction?: string }
   */
  static hasEmergencyVehicle(queues) {
    for (const [direction, queue] of Object.entries(queues)) {
      const vehicles = queue.vehicles || [];
      if (vehicles.some(v => v.vehicle_type === VEHICLE_TYPES.EMERGENCY)) {
        return { hasEmergency: true, direction };
      }
    }
    return { hasEmergency: false, direction: null };
  }

  /**
   * Get total vehicle count across all queues.
   *
   * @param {object} queues
   * @returns {number}
   */
  static getTotalVehicleCount(queues) {
    let total = 0;
    for (const queue of Object.values(queues)) {
      total += queue.vehicle_count || 0;
    }
    return total;
  }

  /**
   * Get simple queue counts object for API response.
   *
   * @param {object} queues
   * @returns {object} - { NORTH: 3, SOUTH: 1, EAST: 7, WEST: 2 }
   */
  static getQueueCounts(queues) {
    const counts = {};
    for (const [direction, queue] of Object.entries(queues)) {
      counts[direction] = queue.vehicle_count || 0;
    }
    return counts;
  }
}

module.exports = QueueManager;

import Scheduler from '../../domain/Scheduler.js';
import { VEHICLE_TYPES } from '../../domain/constants.js';
import config from '../../config/index.js';

describe('Scheduler', () => {
  test('returns null when all queues are empty', () => {
    const emptyQueues = {
      NORTH: { vehicle_count: 0, vehicles: [] },
      SOUTH: { vehicle_count: 0, vehicles: [] },
      EAST: { vehicle_count: 0, vehicles: [] },
      WEST: { vehicle_count: 0, vehicles: [] },
    };

    const next = Scheduler.selectNextPhase(emptyQueues, 'NORTH_SOUTH', config);
    expect(next).toBeNull();
  });

  test('prioritizes phase with higher queue count and vehicle weights', () => {
    const queues = {
      NORTH: { vehicle_count: 1, vehicles: [{ vehicle_id: 'v1', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE }] },
      SOUTH: { vehicle_count: 0, vehicles: [] },
      EAST: {
        vehicle_count: 4,
        vehicles: [
          { vehicle_id: 'v2', vehicle_type: VEHICLE_TYPES.TRUCK },
          { vehicle_id: 'v3', vehicle_type: VEHICLE_TYPES.TRUCK },
          { vehicle_id: 'v4', vehicle_type: VEHICLE_TYPES.FORKLIFT },
          { vehicle_id: 'v5', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE }
        ]
      },
      WEST: { vehicle_count: 1, vehicles: [{ vehicle_id: 'v6', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE }] },
    };

    const next = Scheduler.selectNextPhase(queues, 'NORTH_SOUTH', config);
    expect(next).toBe('EAST_WEST');
  });

  test('emergency vehicle gives overwhelming priority', () => {
    const queues = {
      NORTH: {
        vehicle_count: 10,
        vehicles: Array.from({ length: 10 }, (_, i) => ({ vehicle_id: `v${i}`, vehicle_type: VEHICLE_TYPES.TRUCK }))
      },
      SOUTH: { vehicle_count: 5, vehicles: [] },
      EAST: {
        vehicle_count: 1,
        vehicles: [{ vehicle_id: 'em-1', vehicle_type: VEHICLE_TYPES.EMERGENCY }]
      },
      WEST: { vehicle_count: 0, vehicles: [] },
    };

    const next = Scheduler.selectNextPhase(queues, 'NORTH_SOUTH', config);
    expect(next).toBe('EAST_WEST');
  });

  test('starvation bonus triggers when waiting threshold exceeded', () => {
    const now = Date.now();
    const staleTime = new Date(now - 70000).toISOString(); // 70s ago (> 60s threshold)

    const queues = {
      NORTH: { vehicle_count: 1, vehicles: [{ vehicle_id: 'v1', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE }] },
      SOUTH: { vehicle_count: 0, vehicles: [] },
      EAST: {
        vehicle_count: 1,
        first_vehicle_at: staleTime,
        vehicles: [{ vehicle_id: 'v2', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE, arrived_at: staleTime }]
      },
      WEST: { vehicle_count: 0, vehicles: [] },
    };

    const next = Scheduler.selectNextPhase(queues, 'NORTH_SOUTH', config);
    expect(next).toBe('EAST_WEST');
  });
});

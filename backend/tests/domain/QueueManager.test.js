import QueueManager from '../../domain/QueueManager.js';
import { VEHICLE_TYPES } from '../../domain/constants.js';

describe('QueueManager', () => {
  let emptyQueue;

  beforeEach(() => {
    emptyQueue = {
      direction: 'NORTH',
      vehicle_count: 0,
      vehicles: [],
    };
  });

  test('addVehicle increases vehicle_count and appends to vehicles array', () => {
    const event = {
      vehicle_id: 'vh-1',
      vehicle_type: VEHICLE_TYPES.TRUCK,
      timestamp: '2026-10-29T10:00:00Z',
    };

    const result = QueueManager.addVehicle(emptyQueue, event);

    expect(result.updated).toBe(true);
    expect(result.queue.vehicle_count).toBe(1);
    expect(result.queue.vehicles).toHaveLength(1);
    expect(result.queue.vehicles[0].vehicle_id).toBe('vh-1');
    expect(result.queue.vehicles[0].vehicle_type).toBe(VEHICLE_TYPES.TRUCK);
  });

  test('addVehicle ignores duplicate vehicle_id in same queue', () => {
    const event = {
      vehicle_id: 'vh-1',
      vehicle_type: VEHICLE_TYPES.TRUCK,
      timestamp: '2026-10-29T10:00:00Z',
    };

    const first = QueueManager.addVehicle(emptyQueue, event);
    const second = QueueManager.addVehicle(first.queue, event);

    expect(second.updated).toBe(false);
    expect(second.reason).toBe('VEHICLE_ALREADY_IN_QUEUE');
    expect(second.queue.vehicle_count).toBe(1);
  });

  test('removeVehicle decrements vehicle_count and removes vehicle', () => {
    const queueWithTwo = {
      direction: 'NORTH',
      vehicle_count: 2,
      vehicles: [
        { vehicle_id: 'vh-1', vehicle_type: VEHICLE_TYPES.TRUCK, arrived_at: '2026-10-29T10:00:00Z' },
        { vehicle_id: 'vh-2', vehicle_type: VEHICLE_TYPES.FORKLIFT, arrived_at: '2026-10-29T10:01:00Z' },
      ],
    };

    const event = { vehicle_id: 'vh-1' };
    const result = QueueManager.removeVehicle(queueWithTwo, event);

    expect(result.updated).toBe(true);
    expect(result.queue.vehicle_count).toBe(1);
    expect(result.queue.vehicles).toHaveLength(1);
    expect(result.queue.vehicles[0].vehicle_id).toBe('vh-2');
  });

  test('removeVehicle on non-existent vehicle does not go negative', () => {
    const result = QueueManager.removeVehicle(emptyQueue, { vehicle_id: 'vh-999' });

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('VEHICLE_NOT_IN_QUEUE');
    expect(result.queue.vehicle_count).toBe(0);
  });

  test('hasEmergencyVehicle detects emergency presence', () => {
    const queues = {
      NORTH: { vehicle_count: 1, vehicles: [{ vehicle_id: 'v1', vehicle_type: VEHICLE_TYPES.EMPLOYEE_VEHICLE }] },
      EAST: { vehicle_count: 1, vehicles: [{ vehicle_id: 'v2', vehicle_type: VEHICLE_TYPES.EMERGENCY }] },
      SOUTH: { vehicle_count: 0, vehicles: [] },
      WEST: { vehicle_count: 0, vehicles: [] },
    };

    const check = QueueManager.hasEmergencyVehicle(queues);
    expect(check.hasEmergency).toBe(true);
    expect(check.direction).toBe('EAST');
  });
});

const TrafficEngine = require('../../domain/TrafficEngine');
const { JUNCTION_MODES, VEHICLE_TYPES, EVENT_TYPES } = require('../../domain/constants');
const config = require('../../config');

describe('TrafficEngine', () => {
  let baseJunctionState;

  beforeEach(() => {
    baseJunctionState = {
      id: 'A',
      name: 'Junction A',
      mode: JUNCTION_MODES.AUTOMATIC,
      current_phase: 'NORTH_SOUTH',
      controller_status: 'ONLINE',
      processedEventIds: new Set(),
      transitioning: false,
      queues: {
        NORTH: { direction: 'NORTH', vehicle_count: 0, vehicles: [] },
        SOUTH: { direction: 'SOUTH', vehicle_count: 0, vehicles: [] },
        EAST: { direction: 'EAST', vehicle_count: 0, vehicles: [] },
        WEST: { direction: 'WEST', vehicle_count: 0, vehicles: [] },
      },
    };
  });

  test('processes valid VEHICLE_ARRIVED sensor event', () => {
    const event = {
      event_id: 'evt-1',
      junction_id: 'A',
      direction: 'NORTH',
      event_type: EVENT_TYPES.VEHICLE_ARRIVED,
      vehicle_id: 'vh-truck-1',
      vehicle_type: VEHICLE_TYPES.TRUCK,
      timestamp: new Date().toISOString(),
    };

    const { actions, updatedState } = TrafficEngine.processSensorEvent(baseJunctionState, event, config);

    const updateAction = actions.find(a => a.type === 'UPDATE_QUEUE');
    expect(updateAction).toBeDefined();
    expect(updateAction.queue.vehicle_count).toBe(1);

    const historyAction = actions.find(a => a.type === 'LOG_HISTORY' && a.eventType === 'VEHICLE_DETECTED');
    expect(historyAction).toBeDefined();

    expect(updatedState.queues.NORTH.vehicle_count).toBe(1);
  });

  test('rejects duplicate event_id idempotently', () => {
    baseJunctionState.processedEventIds.add('evt-dup');

    const event = {
      event_id: 'evt-dup',
      junction_id: 'A',
      direction: 'NORTH',
      event_type: EVENT_TYPES.VEHICLE_ARRIVED,
      vehicle_id: 'vh-truck-1',
      vehicle_type: VEHICLE_TYPES.TRUCK,
      timestamp: new Date().toISOString(),
    };

    const { actions } = TrafficEngine.processSensorEvent(baseJunctionState, event, config);
    const reject = actions.find(a => a.type === 'REJECT_EVENT');
    expect(reject).toBeDefined();
    expect(reject.reason).toBe('DUPLICATE_EVENT');
  });

  test('emergency vehicle triggers TRIGGER_EMERGENCY and sets mode transition', () => {
    const event = {
      event_id: 'evt-em',
      junction_id: 'A',
      direction: 'EAST',
      event_type: EVENT_TYPES.VEHICLE_ARRIVED,
      vehicle_id: 'ambulance-1',
      vehicle_type: VEHICLE_TYPES.EMERGENCY,
      timestamp: new Date().toISOString(),
    };

    const { actions } = TrafficEngine.processSensorEvent(baseJunctionState, event, config);
    const emAction = actions.find(a => a.type === 'TRIGGER_EMERGENCY');
    expect(emAction).toBeDefined();
    expect(emAction.direction).toBe('EAST');
  });

  test('manual green request is accepted in AUTOMATIC mode', () => {
    const command = {
      command: 'MANUAL_GREEN_REQUEST',
      direction: 'EAST',
      admin: 'operator-1',
    };

    const result = TrafficEngine.processCommand(baseJunctionState, command, config);
    expect(result.valid).toBe(true);

    const modeAction = result.actions.find(a => a.type === 'SET_MODE');
    expect(modeAction.mode).toBe(JUNCTION_MODES.MANUAL);

    const transitionAction = result.actions.find(a => a.type === 'START_TRANSITION');
    expect(transitionAction.targetPhase).toBe('EAST_WEST');
  });

  test('manual green request is rejected in EMERGENCY mode', () => {
    baseJunctionState.mode = JUNCTION_MODES.EMERGENCY;
    baseJunctionState.emergency_direction = 'NORTH';

    const command = {
      command: 'MANUAL_GREEN_REQUEST',
      direction: 'EAST',
      admin: 'operator-1',
    };

    const result = TrafficEngine.processCommand(baseJunctionState, command, config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('emergency');
  });

  test('processes controller ACK successfully', () => {
    const controllerEvent = {
      command_id: 'cmd-1',
      junction_id: 'A',
      direction: 'NORTH',
      status: 'ACK',
      actual_state: 'YELLOW',
    };

    const { actions } = TrafficEngine.processControllerEvent(baseJunctionState, controllerEvent);
    const updateActual = actions.find(a => a.type === 'UPDATE_ACTUAL_STATE');
    expect(updateActual.actual_state).toBe('YELLOW');

    const updateCmd = actions.find(a => a.type === 'UPDATE_COMMAND_STATUS');
    expect(updateCmd.status).toBe('ACK');
  });

  test('processes controller OFFLINE by switching to DEGRADED mode', () => {
    const controllerEvent = {
      junction_id: 'A',
      status: 'OFFLINE',
    };

    const { actions } = TrafficEngine.processControllerEvent(baseJunctionState, controllerEvent);
    const setMode = actions.find(a => a.type === 'SET_MODE');
    expect(setMode.mode).toBe(JUNCTION_MODES.DEGRADED);
  });
});

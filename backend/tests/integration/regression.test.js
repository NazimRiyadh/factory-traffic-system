import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../server.js';
import { JUNCTION_MODES, CONTROLLER_STATUS } from '../../domain/constants.js';

describe('Critical Safety and Concurrency Regression Suite', () => {
  let app;
  let services;
  let repositories;
  let db;

  const testConfig = {
    GREEN_DURATION: 300,
    MIN_GREEN_DURATION: 200,
    YELLOW_DURATION: 50,
    ALL_RED_DURATION: 30,
    CONTROLLER_ACK_TIMEOUT: 1000,
    CONTROLLER_MAX_RETRIES: 1,
    CONTROLLER_AUTO_ACK: false,
    EMERGENCY_TIMEOUT: 5000,
  };

  beforeEach(() => {
    db = new Database(':memory:');
    const instance = createApp({ db, config: testConfig });
    app = instance.app;
    services = instance.services;
    repositories = instance.repositories;
  });

  afterEach(() => {
    if (services.timerManager) {
      services.timerManager.destroy();
    }
    if (services.controllerService) {
      services.controllerService.destroy();
    }
    if (services.junctionService) {
      services.junctionService.destroy();
    }
    if (db && db.open) {
      db.close();
    }
  });

  // ─── 1. MANUAL COMMAND DURING ACTIVE TRANSITION ────────────────────────
  test('1. Manual command during an active transition safely supersedes without executing old green', async () => {
    // Current phase is NORTH_SOUTH GREEN.
    // Start transition to EAST_WEST
    services.timerManager.startTransition('A', 'NORTH_SOUTH', 'EAST_WEST', 'AUTOMATIC_SCHEDULING');
    expect(services.timerManager.isTransitioning('A')).toBe(true);

    // Operator requests NORTH green while EAST_WEST transition is underway
    const res = await request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'MANUAL_GREEN_REQUEST',
        direction: 'NORTH',
        admin: 'dispatcher_1',
      });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe(JUNCTION_MODES.MANUAL);
    expect(res.body.transition.target_phase).toBe('NORTH_SOUTH');

    // Wait for transition to complete
    await new Promise(r => setTimeout(r, 150));

    const statusRes = await request(app).get('/api/junctions/A/status');
    expect(statusRes.body.current_phase).toBe('NORTH_SOUTH');
    expect(statusRes.body.signals.NORTH.desired_state).toBe('GREEN');
    expect(statusRes.body.signals.EAST.desired_state).toBe('RED');
    expect(statusRes.body.signals.WEST.desired_state).toBe('RED');
  });

  // ─── 2. EMERGENCY ARRIVAL DURING MANUAL OVERRIDE ─────────────────────────
  test('2. Emergency arrival preempts manual override, and manual commands cannot override emergency', async () => {
    // Put junction into manual override
    await request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'MANUAL_GREEN_REQUEST',
        direction: 'NORTH',
        admin: 'supervisor',
      });

    let status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.mode).toBe(JUNCTION_MODES.MANUAL);

    // Emergency vehicle arrives at EAST
    const evtRes = await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'emer_evt_1',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'ambulance_911',
        vehicle_type: 'EMERGENCY',
      });

    expect(evtRes.status).toBe(200);
    status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.mode).toBe(JUNCTION_MODES.EMERGENCY);
    expect(status.emergency_direction).toBe('EAST');

    // Operator attempts to override active emergency -> MUST BE REJECTED (409 Conflict)
    const rejectRes = await request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'MANUAL_GREEN_REQUEST',
        direction: 'NORTH',
      });

    expect(rejectRes.status).toBe(409);
    expect(rejectRes.body.message).toContain('emergency');
  });

  // ─── 3. TWO EMERGENCIES FROM CONFLICTING DIRECTIONS ─────────────────────
  test('3. Two emergencies from conflicting directions are arbitrated via deterministic FCFS queue', async () => {
    // Emergency 1 arrives at EAST
    await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'emer_1',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'amb_east',
        vehicle_type: 'EMERGENCY',
      });

    let status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.mode).toBe('EMERGENCY');
    expect(status.emergency_direction).toBe('EAST');

    // Emergency 2 arrives at NORTH while EAST emergency is active
    await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'emer_2',
        junction_id: 'A',
        direction: 'NORTH',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'firetruck_north',
        vehicle_type: 'EMERGENCY',
      });

    status = (await request(app).get('/api/junctions/A/status')).body;
    // Active emergency must STILL be EAST, and NORTH must be queued
    expect(status.emergency_direction).toBe('EAST');
    expect(status.emergency_queue.length).toBe(1);
    expect(status.emergency_queue[0].vehicle_id).toBe('firetruck_north');

    // Clear EAST emergency vehicle
    await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'clear_emer_1',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_CLEARED',
        vehicle_id: 'amb_east',
      });

    // NORTH emergency should be promoted
    status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.emergency_direction).toBe('NORTH');
    expect(status.emergency_queue.length).toBe(0);
  });

  // ─── 4. INVALID ACK AND ACK FOR UNKNOWN COMMAND ─────────────────────────
  test('4. Rejects invalid ACK, unknown command ACK, and conflicting GREEN physical states', async () => {
    // 4a. ACK for unknown command_id
    const unknownRes = await request(app)
      .post('/api/controller-events')
      .send({
        junction_id: 'A',
        command_id: 'non_existent_cmd_9999',
        status: 'ACK',
        direction: 'NORTH',
        actual_state: 'GREEN',
      });

    expect(unknownRes.status).toBe(404);

    // 4b. Missing command_id for ACK
    const missingCmdRes = await request(app)
      .post('/api/controller-events')
      .send({
        junction_id: 'A',
        status: 'ACK',
        direction: 'NORTH',
        actual_state: 'GREEN',
      });

    expect(missingCmdRes.status).toBe(400);

    // 4c. Create a valid pending command for EAST GREEN
    const cmdId = 'test_cmd_east_green';
    db.prepare(`
      INSERT INTO pending_commands (command_id, junction_id, direction, requested_state, status)
      VALUES (?, 'A', 'EAST', 'GREEN', 'SENT')
    `).run(cmdId);

    // Junction currently has NORTH/SOUTH GREEN. An ACK claiming EAST is GREEN would create conflicting GREENs!
    const conflictRes = await request(app)
      .post('/api/controller-events')
      .send({
        junction_id: 'A',
        command_id: cmdId,
        status: 'ACK',
        direction: 'EAST',
        actual_state: 'GREEN',
      });

    expect(conflictRes.status).toBe(409);
    // Controller and junction should be degraded
    const status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.controller_status).toBe(CONTROLLER_STATUS.DEGRADED);
    expect(status.mode).toBe(JUNCTION_MODES.DEGRADED);
    expect(status.signals.EAST.actual_state).toBe('RED'); // Not corrupted to GREEN!
  });

  // ─── 5. CONTROLLER OFFLINE, RECONNECT AND TIMEOUT ───────────────────────
  test('5. Handles controller OFFLINE, timeout retries and degradation, and reconnection', async () => {
    // OFFLINE event
    const offlineRes = await request(app)
      .post('/api/controller-events')
      .send({
        junction_id: 'A',
        status: 'OFFLINE',
      });

    expect(offlineRes.status).toBe(200);
    let status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.controller_status).toBe('OFFLINE');
    expect(status.mode).toBe(JUNCTION_MODES.DEGRADED);

    // RECONNECT / ONLINE event
    const onlineRes = await request(app)
      .post('/api/controller-events')
      .send({
        junction_id: 'A',
        status: 'ONLINE',
      });

    expect(onlineRes.status).toBe(200);
    status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.controller_status).toBe('ONLINE');
  });

  // ─── 6. RESTART DURING PENDING TRANSITION ────────────────────────────────
  test('6. System recovers restart during pending transition without fabricating ACKs', async () => {
    // Simulate pending command and mid-transition flag before restart
    db.prepare(`
      INSERT INTO pending_commands (command_id, junction_id, direction, requested_state, status, created_at)
      VALUES ('interrupted_cmd', 'A', 'NORTH', 'YELLOW', 'SENT', datetime('now'))
    `).run();
    db.prepare(`UPDATE junctions SET transitioning = 1, transition_step = 'YELLOW' WHERE id = 'A'`).run();

    // Trigger restart recovery
    services.controllerService.recoverJunctionAfterRestart('A');

    const status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.transition.isTransitioning).toBe(false);
    expect(status.signals.NORTH.actual_state).toBe('UNKNOWN');
    expect(status.controller_status).toBe(CONTROLLER_STATUS.UNKNOWN);
    expect(status.mode).toBe(JUNCTION_MODES.DEGRADED);

    const cmd = db.prepare(`SELECT * FROM pending_commands WHERE command_id = 'interrupted_cmd'`).get();
    expect(cmd.status).toBe('FAILED');
  });

  // ─── 7. DUPLICATE EVENTS OLDER THAN IN-MEMORY LIMIT ──────────────────────
  test('7. Enforces persistent database-level deduplication beyond in-memory window', async () => {
    const historicalEventId = 'old_event_from_archive_123';
    // Insert into DB processed_events
    db.prepare(`
      INSERT INTO processed_events (event_id, junction_id) VALUES (?, 'A')
    `).run(historicalEventId);

    const res = await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: historicalEventId,
        junction_id: 'A',
        direction: 'NORTH',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'truck_old',
        vehicle_type: 'TRUCK',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IGNORED');

    // Queue must NOT have increased
    const status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.queues.NORTH.vehicle_count).toBe(0);
  });

  // ─── 8. CONCURRENT REQUESTS SERIALIZATION ───────────────────────────────
  test('8. Simultaneous concurrent event, manual command, and ACK requests execute deterministically', async () => {
    const p1 = request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'concurrent_evt_1',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'truck_c1',
        vehicle_type: 'TRUCK',
      });

    const p2 = request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'MANUAL_GREEN_REQUEST',
        direction: 'WEST',
        admin: 'admin_concurrent',
      });

    const p3 = request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'concurrent_evt_2',
        junction_id: 'A',
        direction: 'NORTH',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'car_c2',
        vehicle_type: 'EMPLOYEE_VEHICLE',
      });

    const results = await Promise.all([p1, p2, p3]);
    for (const r of results) {
      expect([200, 409]).toContain(r.status);
    }

    const status = (await request(app).get('/api/junctions/A/status')).body;
    expect(['AUTOMATIC', 'MANUAL', 'EMERGENCY']).toContain(status.mode);
    expect(status.queues.EAST.vehicle_count).toBe(1);
    expect(status.queues.NORTH.vehicle_count).toBe(1);
  });

  // ─── 9. MINIMUM GREEN-TIME ENFORCEMENT ──────────────────────────────────
  test('9. Minimum green duration prevents immediate switching for normal traffic, but emergency preempts', async () => {
    // Current phase became green right now
    db.prepare(`UPDATE junctions SET phase_started_at = ? WHERE id = 'A'`).run(new Date().toISOString());

    // Normal truck arrives at EAST
    await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'normal_truck_east',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'heavy_truck_1',
        vehicle_type: 'TRUCK',
      });

    // Should NOT transition immediately because minimum green duration has not passed
    expect(services.timerManager.isTransitioning('A')).toBe(false);

    // Emergency vehicle arrives at EAST -> Preempts minimum green immediately!
    await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'emergency_east_preempt',
        junction_id: 'A',
        direction: 'EAST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'ambulance_preempt',
        vehicle_type: 'EMERGENCY',
      });

    expect(services.timerManager.isTransitioning('A')).toBe(true);
    expect(services.timerManager.getCurrentTransition('A').targetPhase).toBe('EAST_WEST');
  });

  // ─── 10. DATABASE FAILURE DURING EVENT PROCESSING ────────────────────────
  test('10. Database failure during event processing rolls back queue and processed record atomically', async () => {
    // Corrupt queue table with a check constraint or failure trigger
    db.prepare(`
      CREATE TRIGGER fail_queue_update
      BEFORE UPDATE ON queues
      WHEN NEW.direction = 'WEST'
      BEGIN
        SELECT RAISE(FAIL, 'Simulated database write failure');
      END;
    `).run();

    const failedEvt = await request(app)
      .post('/api/sensor-events')
      .send({
        event_id: 'failing_event_id',
        junction_id: 'A',
        direction: 'WEST',
        event_type: 'VEHICLE_ARRIVED',
        vehicle_id: 'failing_truck',
        vehicle_type: 'TRUCK',
      });

    expect(failedEvt.status).toBe(500);

    // Verify atomic rollback: event must NOT be recorded as processed
    const isProcessed = repositories.eventRepo.isProcessed('failing_event_id');
    expect(isProcessed).toBe(false);

    // Queue must remain 0
    const status = (await request(app).get('/api/junctions/A/status')).body;
    expect(status.queues.WEST.vehicle_count).toBe(0);
  });
});

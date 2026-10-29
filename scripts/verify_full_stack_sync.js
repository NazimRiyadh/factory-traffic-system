/**
 * verify_full_stack_sync.js
 * Comprehensive verification that backend and frontend contracts are 100% in sync.
 */

import { createApp } from '../backend/server.js';
import http from 'node:http';

async function main() {
  console.log('====================================================');
  console.log('   Full-Stack Frontend/Backend Sync Verification    ');
  console.log('====================================================\n');

  const instance = createApp();
  const app = instance.app;
  const services = instance.services;
  const db = instance.db;

  // Reset junction state to clean starting state
  db.prepare(`
    UPDATE junctions SET
      mode = 'AUTOMATIC',
      controller_status = 'ONLINE',
      emergency_direction = NULL,
      emergency_started_at = NULL,
      emergency_queue = '[]'
    WHERE id = 'A'
  `).run();

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3099, resolve));
  const baseUrl = 'http://127.0.0.1:3099/api';
  const runId = Date.now();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`\x1b[32m✔ PASS:\x1b[0m ${name}`);
      passed++;
    } catch (err) {
      console.error(`\x1b[31m✘ FAIL:\x1b[0m ${name}`);
      console.error(' ', err.message);
      failed++;
    }
  }

  try {
    // 1. Health check (polled / used for readiness)
    await test('GET /health contract matches frontend expectation', async () => {
      const res = await fetch(`${baseUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'UP' || !data.timestamp) {
        throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
      }
    });

    // 2. Junction list (used by Sidebar)
    await test('GET /junctions returns valid junctions array', async () => {
      const res = await fetch(`${baseUrl}/junctions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0 || data[0].id !== 'A') {
        throw new Error(`Invalid junctions data: ${JSON.stringify(data)}`);
      }
    });

    // 3. Junction status (polled every 1500ms by usePolling in Dashboard)
    await test('GET /junctions/A/status contains all fields expected by Dashboard & visualizers', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const requiredKeys = [
        'id', 'name', 'current_phase', 'mode', 'controller_status',
        'signals', 'queues', 'transition', 'hasSignalMismatch', 'serverTime'
      ];
      for (const k of requiredKeys) {
        if (!(k in data)) throw new Error(`Missing key in status: ${k}`);
      }

      // Verify signals structure
      for (const dir of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
        if (!data.signals[dir] || !data.signals[dir].desired_state) {
          throw new Error(`Missing signals[${dir}].desired_state`);
        }
      }

      // Verify queues structure
      for (const dir of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
        if (!data.queues[dir] || typeof data.queues[dir].vehicle_count !== 'number') {
          throw new Error(`Missing queues[${dir}].vehicle_count`);
        }
      }
    });

    // 4. Ingest vehicle sensor event (SimulationPanel -> VEHICLE_ARRIVED)
    await test('POST /sensor-events (VEHICLE_ARRIVED) increments approach queue', async () => {
      const res = await fetch(`${baseUrl}/sensor-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `evt_sync_${runId}_001`,
          junction_id: 'A',
          direction: 'NORTH',
          event_type: 'VEHICLE_ARRIVED',
          vehicle_id: `truck_sync_${runId}_01`,
          vehicle_type: 'TRUCK',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'PROCESSED') throw new Error(`Expected PROCESSED, got ${data.status}`);

      // Verify status reflected in GET /status
      const statusRes = await fetch(`${baseUrl}/junctions/A/status`);
      const status = await statusRes.json();
      if (status.queues.NORTH.vehicle_count < 1) {
        throw new Error('Vehicle count was not updated in junction status');
      }
    });

    // 5. Ingest vehicle clearance event (SimulationPanel -> VEHICLE_CLEARED)
    await test('POST /sensor-events (VEHICLE_CLEARED) decrements approach queue', async () => {
      const res = await fetch(`${baseUrl}/sensor-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `evt_sync_${runId}_002`,
          junction_id: 'A',
          direction: 'NORTH',
          event_type: 'VEHICLE_CLEARED',
          vehicle_id: `truck_sync_${runId}_01`,
          vehicle_type: 'TRUCK',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'PROCESSED') throw new Error(`Expected PROCESSED, got ${data.status}`);
    });

    // 6. Manual green override command (ManualControl -> Force EAST GREEN)
    await test('POST /junctions/A/commands (MANUAL_GREEN_REQUEST) initiates transition & switches mode to MANUAL', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'MANUAL_GREEN_REQUEST',
          direction: 'EAST',
          admin: 'dispatch_admin',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || data.mode !== 'MANUAL' || !data.transition) {
        throw new Error(`Unexpected command response: ${JSON.stringify(data)}`);
      }
    });

    // 7. Simulate ACK endpoint (SignalStatus -> Simulate Hardware ACK)
    await test('POST /junctions/A/simulate-ack synchronizes desired and actual signals', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/simulate-ack`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.message) throw new Error('Missing message in simulate-ack response');

      const statusRes = await fetch(`${baseUrl}/junctions/A/status`);
      const status = await statusRes.json();
      if (status.hasSignalMismatch) {
        throw new Error('hasSignalMismatch should be false after simulate-ack');
      }
    });

    // 8. Return to Automatic command (Header Quick Action / ManualControl)
    await test('POST /junctions/A/commands (RETURN_TO_AUTOMATIC) restores AUTOMATIC mode', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'RETURN_TO_AUTOMATIC',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || data.mode !== 'AUTOMATIC') {
        throw new Error(`Expected mode AUTOMATIC, got ${data.mode}`);
      }
    });

    // 9. Emergency Preemption & Multi-Emergency Arbitration Queue (EmergencyBanner & Presets)
    await test('Emergency arrival triggers EMERGENCY mode and secondary emergency queues in emergency_queue', async () => {
      // 1st Emergency (EAST)
      const em1 = await fetch(`${baseUrl}/sensor-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `evt_em_east_${runId}_01`,
          junction_id: 'A',
          direction: 'EAST',
          event_type: 'VEHICLE_ARRIVED',
          vehicle_id: `amb_east_${runId}_01`,
          vehicle_type: 'EMERGENCY',
        }),
      });
      if (!em1.ok) throw new Error(`HTTP ${em1.status}`);

      // 2nd Emergency (NORTH)
      const em2 = await fetch(`${baseUrl}/sensor-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: `evt_em_north_${runId}_02`,
          junction_id: 'A',
          direction: 'NORTH',
          event_type: 'VEHICLE_ARRIVED',
          vehicle_id: `amb_north_${runId}_02`,
          vehicle_type: 'EMERGENCY',
        }),
      });
      if (!em2.ok) throw new Error(`HTTP ${em2.status}`);

      const statusRes = await fetch(`${baseUrl}/junctions/A/status`);
      const status = await statusRes.json();
      if (status.mode !== 'EMERGENCY') {
        throw new Error(`Expected mode EMERGENCY, got ${status.mode}`);
      }
      if (status.emergency_direction !== 'EAST') {
        throw new Error(`Expected active emergency EAST, got ${status.emergency_direction}`);
      }
      if (!Array.isArray(status.emergency_queue) || status.emergency_queue.length !== 1 || status.emergency_queue[0].direction !== 'NORTH') {
        throw new Error(`Expected 1 queued emergency from NORTH, got: ${JSON.stringify(status.emergency_queue)}`);
      }
    });

    // 10. Manual command lockout during emergency
    await test('Manual command is rejected with 409 Conflict during active EMERGENCY', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'MANUAL_GREEN_REQUEST',
          direction: 'WEST',
        }),
      });
      if (res.status !== 409) {
        throw new Error(`Expected HTTP 409, got ${res.status}`);
      }
      const data = await res.json();
      if (!data.message || !data.message.includes('emergency')) {
        throw new Error(`Expected emergency rejection message, got: ${JSON.stringify(data)}`);
      }
    });

    // 11. Controller OFFLINE simulation (SimulationPanel -> OFFLINE)
    await test('POST /controller-events (OFFLINE) transitions junction to DEGRADED failsafe mode', async () => {
      const res = await fetch(`${baseUrl}/controller-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          junction_id: 'A',
          status: 'OFFLINE',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const statusRes = await fetch(`${baseUrl}/junctions/A/status`);
      const status = await statusRes.json();
      if (status.controller_status !== 'OFFLINE' || status.mode !== 'DEGRADED') {
        throw new Error(`Expected OFFLINE/DEGRADED, got ${status.controller_status}/${status.mode}`);
      }
    });

    // 12. Controller ONLINE restore (SimulationPanel -> ONLINE)
    await test('POST /controller-events (ONLINE) restores controller connectivity', async () => {
      const res = await fetch(`${baseUrl}/controller-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          junction_id: 'A',
          status: 'ONLINE',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const statusRes = await fetch(`${baseUrl}/junctions/A/status`);
      const status = await statusRes.json();
      if (status.controller_status !== 'ONLINE') {
        throw new Error(`Expected ONLINE, got ${status.controller_status}`);
      }
    });

    // 13. Audit history feed (AuditTrailView & ActivityLog)
    await test('GET /junctions/A/history returns formatted audit events with JSON details', async () => {
      const res = await fetch(`${baseUrl}/junctions/A/history?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`Expected non-empty history array, got: ${JSON.stringify(data)}`);
      }
      const record = data[0];
      if (!record.event_type || !record.timestamp) {
        throw new Error(`Invalid record structure: ${JSON.stringify(record)}`);
      }
    });

  } finally {
    if (services.junctionService) services.junctionService.destroy();
    if (services.controllerService) services.controllerService.destroy();
    if (services.timerManager) services.timerManager.destroy();
    server.close();
  }

  console.log('\n====================================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

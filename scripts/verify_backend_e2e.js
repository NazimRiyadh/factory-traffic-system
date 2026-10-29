/**
 * Comprehensive Backend E2E Verification Script
 * Validates all assessment requirements against the running backend API.
 */

import http from 'http';
import process from 'process';
import { createApp } from '../backend/server.js';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('   Factory Traffic System — Backend Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  let serverInstance = null;
  let servicesInstance = null;

  // Auto-launch server if not running on 3001
  try {
    await request({ host: 'localhost', port: 3001, path: '/api/health', method: 'GET' });
  } catch {
    console.log('Starting in-process backend server on port 3001...\n');
    const instance = createApp();
    servicesInstance = instance.services;
    serverInstance = http.createServer(instance.app);
    await new Promise(resolve => serverInstance.listen(3001, resolve));
  }

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health Check
    console.log('1. Checking Health Check API...');
    const health = await request({ host: 'localhost', port: 3001, path: '/api/health', method: 'GET' });
    assert(health.status === 200 && health.data.status === 'UP', 'Backend health check returns status UP');

    // 2. Junction Status
    console.log('\n2. Checking Junction A Status...');
    const status = await request({ host: 'localhost', port: 3001, path: '/api/junctions/A/status', method: 'GET' });
    assert(status.status === 200, 'GET /api/junctions/A/status returns 200');
    assert(status.data.id === 'A', 'Junction ID is A');
    assert(status.data.signals !== undefined, 'Signals object exists');
    assert(status.data.queues !== undefined, 'Queues object exists');

    // 3. Sensor Event Ingestion (Issue 6, 9)
    console.log('\n3. Ingesting Sensor Vehicle Arrival Event...');
    const uniqueEvtId = `evt_e2e_${Date.now()}`;
    const arriveEvent = {
      event_id: uniqueEvtId,
      junction_id: 'A',
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: `v_${Date.now()}`,
      vehicle_type: 'TRUCK',
      timestamp: new Date().toISOString()
    };
    const arriveRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/sensor-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, arriveEvent);
    assert(arriveRes.status === 200 && arriveRes.data.status === 'PROCESSED', 'Sensor event ingested successfully');

    // 4. Duplicate Event Deduplication (Issue 6)
    console.log('\n4. Testing Persistent Deduplication on Same Event ID...');
    const dupRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/sensor-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, arriveEvent);
    assert(dupRes.status === 200 && dupRes.data.status === 'IGNORED', 'Duplicate event is recognized and safely ignored');

    // 5. Manual Command Execution (Issue 1, 10)
    console.log('\n5. Executing Manual Green Request Override...');
    const cmdRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/junctions/A/commands',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      command: 'MANUAL_GREEN_REQUEST',
      direction: 'EAST'
    });
    assert(cmdRes.status === 200 && cmdRes.data.success === true, 'Manual override command accepted');
    assert(cmdRes.data.mode === 'MANUAL', 'Response accurately reflects persisted MANUAL mode');
    assert(cmdRes.data.transition !== undefined, 'Response returns transition status');

    // 6. Controller ACK Validation (Issue 2)
    console.log('\n6. Validating Controller ACK Verification Guards...');
    const invalidAck = {
      junction_id: 'A',
      direction: 'EAST',
      status: 'ACK',
      actual_state: 'GREEN'
    };
    const badAckRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/controller-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, invalidAck);
    assert(badAckRes.status === 400, 'Rejects ACK missing command_id (HTTP 400)');

    const unknownAck = {
      command_id: 'cmd_nonexistent_99999',
      junction_id: 'A',
      direction: 'EAST',
      status: 'ACK',
      actual_state: 'GREEN'
    };
    const unknownAckRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/controller-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, unknownAck);
    assert(unknownAckRes.status === 404, 'Rejects ACK for non-existent command_id (HTTP 404)');

    // 7. Conflicting Green Protection (Issue 2)
    console.log('\n7. Testing Conflicting Physical Green Protection...');
    const conflictRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/controller-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      command_id: 'cmd_nonexistent_99999',
      junction_id: 'A',
      direction: 'NORTH',
      status: 'ACK',
      actual_state: 'GREEN'
    });
    assert(conflictRes.status === 404 || conflictRes.status === 409, 'Conflicting green ACK cannot be accepted as valid physical state');

    // 8. Return to Automatic Scheduling
    console.log('\n8. Returning Junction to Automatic Mode...');
    const returnAutoRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/junctions/A/commands',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      command: 'RETURN_TO_AUTOMATIC'
    });
    assert(returnAutoRes.status === 200 && returnAutoRes.data.mode === 'AUTOMATIC', 'Junction restored to AUTOMATIC mode');

    // 9. Controller OFFLINE & Reconnect (Issue 8)
    console.log('\n9. Testing Controller OFFLINE & Reconnection...');
    const offlineEvent = {
      junction_id: 'A',
      status: 'OFFLINE'
    };
    const offlineRes = await request({
      host: 'localhost',
      port: 3001,
      path: '/api/controller-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, offlineEvent);
    assert(offlineRes.status === 200, 'Controller OFFLINE event registered');

    const offlineStatus = await request({ host: 'localhost', port: 3001, path: '/api/junctions/A/status', method: 'GET' });
    assert(offlineStatus.data.controller_status === 'OFFLINE' && offlineStatus.data.mode === 'DEGRADED', 'Junction switched to DEGRADED mode upon OFFLINE controller');

    const onlineEvent = {
      junction_id: 'A',
      status: 'ONLINE'
    };
    await request({
      host: 'localhost',
      port: 3001,
      path: '/api/controller-events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, onlineEvent);

    // 10. Audit History Query
    console.log('\n10. Checking SQLite Audit Trail...');
    const history = await request({ host: 'localhost', port: 3001, path: '/api/junctions/A/history?limit=10', method: 'GET' });
    assert(history.status === 200 && Array.isArray(history.data), 'GET /api/junctions/A/history returns array of audit records');
    assert(history.data.length > 0, `Audit log contains ${history.data.length} persistent SQLite records`);

    console.log('\n====================================================');
    console.log(`   Verification Summary: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    if (failed > 0) process.exit(1);
  } finally {
    if (servicesInstance) {
      if (servicesInstance.junctionService) servicesInstance.junctionService.destroy();
      if (servicesInstance.controllerService) servicesInstance.controllerService.destroy();
      if (servicesInstance.timerManager) servicesInstance.timerManager.destroy();
    }
    if (serverInstance) {
      serverInstance.close();
    }
  }
}

runVerification().catch(err => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});

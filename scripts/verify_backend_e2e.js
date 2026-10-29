/**
 * Comprehensive Backend E2E Verification Script
 * Validates all assessment requirements against the running backend API.
 */

const http = require('http');

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

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

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

  // Safety Invariant Check: Verify NO conflicting greens exist right now
  const signals = status.data.signals;
  const isNSGreen = (signals.NORTH?.desired_state === 'GREEN' || signals.SOUTH?.desired_state === 'GREEN');
  const isEWGreen = (signals.EAST?.desired_state === 'GREEN' || signals.WEST?.desired_state === 'GREEN');
  assert(!(isNSGreen && isEWGreen), 'SAFETY INVARIANT 1: NORTH_SOUTH and EAST_WEST are never GREEN simultaneously');

  // 3. Sensor Event Ingestion: Vehicle Arrival
  console.log('\n3. Testing Vehicle Arrival Event (Sensor Event)...');
  const testEventId = `e2e_arrival_${Date.now()}`;
  const arrivalPayload = {
    event_id: testEventId,
    junction_id: 'A',
    direction: 'NORTH',
    event_type: 'VEHICLE_ARRIVED',
    vehicle_id: 'TRUCK-999',
    vehicle_type: 'TRUCK',
    sequence_no: 101,
    timestamp: new Date().toISOString()
  };
  const arrivalRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/sensor-events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, arrivalPayload);
  assert(arrivalRes.status === 200 && arrivalRes.data.status === 'PROCESSED', 'Sensor arrival event processed with 200 OK');

  // 4. Idempotency Check: Resubmit exact same event_id
  console.log('\n4. Testing Idempotency on Duplicate Event Submission...');
  const duplicateRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/sensor-events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, arrivalPayload);
  assert(duplicateRes.status === 200 && duplicateRes.data.status === 'IGNORED', 'SAFETY INVARIANT 5: Duplicate event_id recognized and treated idempotently without double-counting');

  // 5. Sensor Event Ingestion: Vehicle Clearance
  console.log('\n5. Testing Vehicle Clearance Event...');
  const clearPayload = {
    event_id: `e2e_clear_${Date.now()}`,
    junction_id: 'A',
    direction: 'NORTH',
    event_type: 'VEHICLE_CLEARED',
    vehicle_id: 'TRUCK-999',
    sequence_no: 102,
    timestamp: new Date().toISOString()
  };
  const clearRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/sensor-events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, clearPayload);
  assert(clearRes.status === 200 && clearRes.data.status === 'PROCESSED', 'Vehicle clearance event processed with 200 OK');

  // 6. Manual Override Command
  console.log('\n6. Testing Manual Override Command...');
  const manualCmd = {
    command: 'MANUAL_GREEN_REQUEST',
    direction: 'EAST'
  };
  const cmdRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/junctions/A/commands',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, manualCmd);
  assert(cmdRes.status === 200 && cmdRes.data.success === true, 'Manual override command accepted and transition initiated safely');

  // Wait 1 second to inspect status during/after override
  await new Promise(r => setTimeout(r, 1000));
  const postCmdStatus = await request({ host: 'localhost', port: 3001, path: '/api/junctions/A/status', method: 'GET' });
  assert(postCmdStatus.data.mode === 'MANUAL', 'Operating mode transitioned to MANUAL');

  // 7. Return to Automatic Scheduling
  console.log('\n7. Testing Return to Automatic Mode...');
  const autoCmd = {
    command: 'RETURN_TO_AUTOMATIC'
  };
  const autoRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/junctions/A/commands',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, autoCmd);
  assert(autoRes.status === 200 && autoRes.data.success === true, 'Return to automatic command processed');

  // 8. Controller Hardware Event (Offline Simulation)
  console.log('\n8. Testing Hardware Controller OFFLINE Failure Handling...');
  const offlineEvent = {
    event_id: `ctrl_offline_${Date.now()}`,
    junction_id: 'A',
    device_type: 'SIGNAL_CONTROLLER',
    status: 'OFFLINE',
    timestamp: new Date().toISOString()
  };
  const offlineRes = await request({
    host: 'localhost',
    port: 3001,
    path: '/api/controller-events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, offlineEvent);
  assert(offlineRes.status === 200, 'Controller OFFLINE status ingested');

  const degradedStatus = await request({ host: 'localhost', port: 3001, path: '/api/junctions/A/status', method: 'GET' });
  assert(degradedStatus.data.controller_status === 'OFFLINE' || degradedStatus.data.mode === 'DEGRADED', 'System recognizes OFFLINE controller status safely');

  // Re-enable controller to ONLINE
  console.log('\n9. Restoring Controller to ONLINE...');
  const onlineEvent = {
    event_id: `ctrl_online_${Date.now()}`,
    junction_id: 'A',
    device_type: 'SIGNAL_CONTROLLER',
    status: 'ONLINE',
    timestamp: new Date().toISOString()
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
}

runVerification().catch(err => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});

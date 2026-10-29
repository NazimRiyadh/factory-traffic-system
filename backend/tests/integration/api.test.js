const request = require('supertest');
const { createApp } = require('../../server');

describe('REST API Integration Tests', () => {
  let app;
  let services;

  beforeAll(() => {
    const instance = createApp();
    app = instance.app;
    services = instance.services;
  });

  afterAll(() => {
    if (services.timerManager) {
      services.timerManager.destroy();
    }
    if (services.controllerService) {
      services.controllerService.destroy();
    }
  });

  test('GET /api/health returns 200 and UP status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
  });

  test('GET /api/junctions returns list with seeded Junction A', async () => {
    const res = await request(app).get('/api/junctions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(j => j.id === 'A')).toBe(true);
  });

  test('GET /api/junctions/A/status returns complete status object', async () => {
    const res = await request(app).get('/api/junctions/A/status');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('A');
    expect(res.body.signals).toHaveProperty('NORTH');
    expect(res.body.signals).toHaveProperty('SOUTH');
    expect(res.body.signals).toHaveProperty('EAST');
    expect(res.body.signals).toHaveProperty('WEST');
    expect(res.body.queues).toHaveProperty('NORTH');
    expect(res.body.mode).toBeDefined();
  });

  test('POST /api/sensor-events ingests vehicle arrival', async () => {
    const eventPayload = {
      event_id: `test_evt_${Date.now()}`,
      junction_id: 'A',
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: `v_test_${Date.now()}`,
      vehicle_type: 'FORKLIFT',
    };

    const res = await request(app)
      .post('/api/sensor-events')
      .send(eventPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSED');

    // Duplicate submission of same event_id should return 200 and IGNORED (idempotent)
    const dupRes = await request(app)
      .post('/api/sensor-events')
      .send(eventPayload);

    expect(dupRes.status).toBe(200);
    expect(dupRes.body.status).toBe('IGNORED');
  });

  test('POST /api/junctions/A/commands processes manual green request', async () => {
    const res = await request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'MANUAL_GREEN_REQUEST',
        direction: 'EAST',
        admin: 'test_admin',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Return to automatic
    const retRes = await request(app)
      .post('/api/junctions/A/commands')
      .send({
        command: 'RETURN_TO_AUTOMATIC',
      });

    expect(retRes.status).toBe(200);
    expect(retRes.body.success).toBe(true);
  });

  test('GET /api/junctions/A/history returns audit records', async () => {
    const res = await request(app).get('/api/junctions/A/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

/**
 * Application Routes.
 */

import express from 'express';
import {
  validateSensorEventBody,
  validateCommandBody,
  validateControllerEventBody,
} from '../middleware/validateRequest.js';

export function createRouter({
  junctionController,
  sensorEventController,
  commandController,
  controllerEventController,
  historyController,
}) {
  const router = express.Router();

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'UP',
      service: 'factory-traffic-backend',
      timestamp: new Date().toISOString()
    });
  });

  // Junctions
  router.get('/junctions', junctionController.getAll);
  router.post('/junctions', junctionController.create);
  router.get('/junctions/:id', junctionController.getById);
  router.get('/junctions/:id/status', junctionController.getStatus);
  router.post('/junctions/:id/simulate-ack', junctionController.simulateAck);

  // Commands (Manual control)
  router.post('/junctions/:id/commands', validateCommandBody, commandController.processCommand);

  // Sensor events
  router.post('/sensor-events', validateSensorEventBody, sensorEventController.processEvent);

  // Controller hardware callbacks
  router.post('/controller-events', validateControllerEventBody, controllerEventController.processEvent);

  // Audit history
  router.get('/junctions/:id/history', historyController.getByJunction);
  router.get('/history', historyController.getAll);

  return router;
}

export default createRouter;

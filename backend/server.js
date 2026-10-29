/**
 * Factory Traffic Management System — Backend Server Entry Point.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

import config from './config/index.js';
import { getDb } from './database/connection.js';
import { runMigrations } from './database/migrations.js';

// Repositories
import JunctionRepository from './repositories/JunctionRepository.js';
import EventRepository from './repositories/EventRepository.js';
import HistoryRepository from './repositories/HistoryRepository.js';
import CommandRepository from './repositories/CommandRepository.js';

// Services
import SignalTimerManager from './services/SignalTimerManager.js';
import JunctionService from './services/JunctionService.js';
import EventService from './services/EventService.js';
import CommandService from './services/CommandService.js';
import ControllerService from './services/ControllerService.js';
import HistoryService from './services/HistoryService.js';

// Controllers
import JunctionController from './controllers/junctionController.js';
import SensorEventController from './controllers/sensorEventController.js';
import CommandController from './controllers/commandController.js';
import ControllerEventController from './controllers/controllerEventController.js';
import HistoryController from './controllers/historyController.js';

// Router & Middleware
import createRouter from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import logger from './utils/logger.js';

export function createApp(options = {}) {
  const app = express();
  const activeConfig = { ...config, ...(options.config || {}) };

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Database initialization
  const db = options.db || getDb();
  runMigrations(db);

  // Repositories
  const junctionRepo = new JunctionRepository(db);
  const eventRepo = new EventRepository(db);
  const historyRepo = new HistoryRepository(db);
  const commandRepo = new CommandRepository(db);

  // Services
  const timerManager = new SignalTimerManager(junctionRepo, commandRepo, historyRepo, activeConfig);
  const controllerService = new ControllerService(junctionRepo, commandRepo, historyRepo, timerManager, activeConfig);
  const junctionService = new JunctionService(junctionRepo, commandRepo, historyRepo, timerManager, activeConfig);
  const eventService = new EventService(junctionRepo, eventRepo, historyRepo, timerManager, activeConfig);
  const commandService = new CommandService(junctionRepo, historyRepo, timerManager, activeConfig);
  const historyService = new HistoryService(historyRepo);

  // Auto-ACK controller simulation: automatically confirms hardware commands unless OFFLINE
  if (activeConfig.CONTROLLER_AUTO_ACK) {
    timerManager.onCommandsDispatched = (junctionId, commands) => {
      setTimeout(() => {
        if (!db.open) return;
        const junction = junctionRepo.findById(junctionId);
        if (junction && junction.controller_status !== 'OFFLINE' && junction.controller_status !== 'DEGRADED') {
          for (const cmd of commands) {
            controllerService.processControllerEvent({
              command_id: cmd.command_id,
              junction_id: junctionId,
              direction: cmd.direction,
              status: 'ACK',
              actual_state: cmd.requested_state
            }).catch(err => logger.error(`[${junctionId}] Auto-ACK error:`, err));
          }
        }
      }, activeConfig.CONTROLLER_SIM_DELAY || 400);
    };
  }

  // Recover state after restart without fabricating simulated ACKs
  const allJunctions = junctionRepo.findAll();
  for (const j of allJunctions) {
    controllerService.recoverJunctionAfterRestart(j.id);
  }

  // Controllers
  const junctionController = new JunctionController(junctionService, controllerService);
  const sensorEventController = new SensorEventController(eventService);
  const commandController = new CommandController(commandService);
  const controllerEventController = new ControllerEventController(controllerService);
  const historyController = new HistoryController(historyService);

  // Mount API router
  const apiRouter = createRouter({
    junctionController,
    sensorEventController,
    commandController,
    controllerEventController,
    historyController,
  });

  app.use('/api', apiRouter);

  // Error handling middleware
  app.use(errorHandler);

  return {
    app,
    db,
    repositories: {
      junctionRepo,
      eventRepo,
      historyRepo,
      commandRepo,
    },
    services: {
      junctionService,
      eventService,
      commandService,
      controllerService,
      historyService,
      timerManager,
    },
  };
}

export const { app } = createApp();

const isDirectRun = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const PORT = config.PORT || 3001;
  const server = app.listen(PORT, () => {
    logger.info(`🚦 Factory Traffic Backend running at http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      logger.info('HTTP server closed');
    });
  });
}

export default { app, createApp };

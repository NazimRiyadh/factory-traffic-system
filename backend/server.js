/**
 * Factory Traffic Management System — Backend Server Entry Point.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { getDb } = require('./database/connection');
const { runMigrations } = require('./database/migrations');

// Repositories
const JunctionRepository = require('./repositories/JunctionRepository');
const EventRepository = require('./repositories/EventRepository');
const HistoryRepository = require('./repositories/HistoryRepository');
const CommandRepository = require('./repositories/CommandRepository');

// Services
const SignalTimerManager = require('./services/SignalTimerManager');
const JunctionService = require('./services/JunctionService');
const EventService = require('./services/EventService');
const CommandService = require('./services/CommandService');
const ControllerService = require('./services/ControllerService');
const HistoryService = require('./services/HistoryService');

// Controllers
const JunctionController = require('./controllers/junctionController');
const SensorEventController = require('./controllers/sensorEventController');
const CommandController = require('./controllers/commandController');
const ControllerEventController = require('./controllers/controllerEventController');
const HistoryController = require('./controllers/historyController');

// Router & Middleware
const createRouter = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Database initialization
  const db = getDb();
  runMigrations(db);

  // Repositories
  const junctionRepo = new JunctionRepository(db);
  const eventRepo = new EventRepository(db);
  const historyRepo = new HistoryRepository(db);
  const commandRepo = new CommandRepository(db);

  // Services
  const timerManager = new SignalTimerManager(junctionRepo, commandRepo, historyRepo, config);
  const controllerService = new ControllerService(junctionRepo, commandRepo, historyRepo, config);
  const junctionService = new JunctionService(junctionRepo, commandRepo, historyRepo, timerManager, config);
  const eventService = new EventService(junctionRepo, eventRepo, historyRepo, timerManager, config);
  const commandService = new CommandService(junctionRepo, historyRepo, timerManager, config);
  const historyService = new HistoryService(historyRepo);

  // Auto-ACK controller simulation: automatically confirms hardware commands unless OFFLINE
  if (config.CONTROLLER_AUTO_ACK) {
    timerManager.onCommandsDispatched = (junctionId, commands) => {
      setTimeout(() => {
        const junction = junctionRepo.findById(junctionId);
        if (junction && junction.controller_status !== 'OFFLINE') {
          for (const cmd of commands) {
            controllerService.processControllerEvent({
              command_id: cmd.command_id,
              junction_id: junctionId,
              direction: cmd.direction,
              status: 'ACK',
              actual_state: cmd.requested_state
            });
          }
        }
      }, config.CONTROLLER_SIM_DELAY || 400);
    };
  }

  // Clear any stale pending timeouts from previous runs
  controllerService.simulateAcknowledgeAll('A');

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
    services: {
      junctionService,
      eventService,
      commandService,
      controllerService,
      historyService,
      timerManager
    }
  };
}

const { app } = createApp();

if (require.main === module) {
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

module.exports = { app, createApp };

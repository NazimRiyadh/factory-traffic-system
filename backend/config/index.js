import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  PORT: 3001,
  DB_PATH: process.env.DB_PATH || path.resolve(__dirname, '../traffic.db'),

  // Signal timing (milliseconds)
  GREEN_DURATION: 30000,       // 30 seconds
  YELLOW_DURATION: 5000,       // 5 seconds
  ALL_RED_DURATION: 2000,      // 2 seconds safety clearance

  // Controller
  CONTROLLER_ACK_TIMEOUT: 5000,  // 5 seconds
  CONTROLLER_RETRY_DELAY: 3000,  // 3 seconds before retry
  CONTROLLER_MAX_RETRIES: 1,
  CONTROLLER_AUTO_ACK: true,     // Simulates healthy controller hardware responding with ACK
  CONTROLLER_SIM_DELAY: 400,     // 400ms delay to simulate realistic controller transmission

  // Manual override
  MANUAL_OVERRIDE_TIMEOUT: 600000, // 10 minutes

  // Emergency
  EMERGENCY_TIMEOUT: 60000,     // 60 seconds

  // Starvation protection
  STARVATION_THRESHOLD: 60000,  // 60 seconds before starvation bonus

  // Polling interval for frontend
  POLL_INTERVAL: 2000,          // 2 seconds

  // Desired vs Actual mismatch threshold
  STATE_MISMATCH_THRESHOLD: 10000, // 10 seconds

  // Vehicle priority weights
  VEHICLE_PRIORITY: {
    EMERGENCY: 1000,
    TRUCK: 50,
    FORKLIFT: 30,
    EMPLOYEE_VEHICLE: 10,
  },

  // Scheduling weights
  SCHEDULING_WEIGHTS: {
    QUEUE_SIZE: 1,
    VEHICLE_PRIORITY: 2,
    WAITING_TIME: 1.5,
    STARVATION_BONUS: 100,
  },
};

export default config;

/**
 * Database Migrations — Creates schema and seeds initial data.
 *
 * Runs the schema.sql to create all tables, then seeds Junction A
 * with default signal states (NORTH/SOUTH GREEN, EAST/WEST RED)
 * and empty queues for all 4 directions.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Run all database migrations and seed data.
 * @param {Database} db - better-sqlite3 database instance
 */
function runMigrations(db) {
  // Read and execute the schema SQL
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Ensure highest_priority column exists on queues table
  const queueColumns = db.prepare("PRAGMA table_info(queues)").all().map(c => c.name);
  if (!queueColumns.includes('highest_priority')) {
    db.exec("ALTER TABLE queues ADD COLUMN highest_priority TEXT DEFAULT 'EMPLOYEE_VEHICLE'");
  }

  // Seed Junction A if it doesn't exist
  const existing = db.prepare('SELECT id FROM junctions WHERE id = ?').get('A');
  if (!existing) {
    logger.info('Seeding Junction A with default configuration...');

    const seedTransaction = db.transaction(() => {
      // Insert junction
      db.prepare(`
        INSERT INTO junctions (id, name, mode, current_phase, controller_status, transitioning)
        VALUES ('A', 'Junction A', 'AUTOMATIC', 'NORTH_SOUTH', 'ONLINE', 0)
      `).run();

      // Insert signal states — start with NORTH/SOUTH GREEN
      const insertSignal = db.prepare(`
        INSERT INTO signals (junction_id, direction, desired_state, actual_state)
        VALUES (?, ?, ?, ?)
      `);
      insertSignal.run('A', 'NORTH', 'GREEN', 'GREEN');
      insertSignal.run('A', 'SOUTH', 'GREEN', 'GREEN');
      insertSignal.run('A', 'EAST', 'RED', 'RED');
      insertSignal.run('A', 'WEST', 'RED', 'RED');

      // Insert empty queues for all directions
      const insertQueue = db.prepare(`
        INSERT INTO queues (junction_id, direction, vehicle_count)
        VALUES (?, ?, 0)
      `);
      insertQueue.run('A', 'NORTH');
      insertQueue.run('A', 'SOUTH');
      insertQueue.run('A', 'EAST');
      insertQueue.run('A', 'WEST');

      // Log initial history entry
      db.prepare(`
        INSERT INTO history (junction_id, event_type, details)
        VALUES ('A', 'MODE_CHANGED', '{"from": null, "to": "AUTOMATIC", "note": "System initialized"}')
      `).run();
    });

    seedTransaction();
    logger.info('Junction A seeded successfully');
  } else {
    logger.info('Junction A already exists — skipping seed');
  }

  logger.info('Database migrations completed successfully');
}

module.exports = { runMigrations };

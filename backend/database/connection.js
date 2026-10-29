/**
 * Database Connection — SQLite via better-sqlite3.
 *
 * Uses WAL journal mode for better concurrent read performance.
 * Provides a singleton database connection.
 */

import Database from 'better-sqlite3';
import path from 'path';
import config from '../config/index.js';

let db = null;

/**
 * Get the singleton database connection.
 * Creates the connection on first call with WAL mode and foreign keys enabled.
 * @returns {Database} better-sqlite3 database instance
 */
export function getDb() {
  if (!db) {
    const dbPath = path.resolve(config.DB_PATH);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * Close the database connection.
 * Call this during graceful shutdown.
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { getDb, closeDb };

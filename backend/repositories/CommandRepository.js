/**
 * CommandRepository — Tracking pending and confirmed controller commands.
 */

class CommandRepository {
  constructor(db) {
    this.db = db;
  }

  create(command) {
    const { command_id, junction_id, direction, requested_state, status = 'PENDING' } = command;

    this.db.prepare(`
      INSERT INTO pending_commands (command_id, junction_id, direction, requested_state, status, retries, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(command_id, junction_id, direction, requested_state, status);

    return this.findById(command_id);
  }

  findById(commandId) {
    return this.db.prepare(`
      SELECT * FROM pending_commands WHERE command_id = ?
    `).get(commandId);
  }

  updateStatus(commandId, status) {
    return this.db.prepare(`
      UPDATE pending_commands
      SET status = ?,
          updated_at = datetime('now')
      WHERE command_id = ?
    `).run(status, commandId);
  }

  incrementRetries(commandId) {
    return this.db.prepare(`
      UPDATE pending_commands
      SET retries = retries + 1,
          created_at = datetime('now'),
          updated_at = datetime('now')
      WHERE command_id = ?
    `).run(commandId);
  }

  findPending(junctionId = null) {
    if (junctionId) {
      return this.db.prepare(`
        SELECT * FROM pending_commands
        WHERE junction_id = ? AND status IN ('PENDING', 'SENT')
        ORDER BY created_at ASC
      `).all(junctionId);
    }

    return this.db.prepare(`
      SELECT * FROM pending_commands
      WHERE status IN ('PENDING', 'SENT')
      ORDER BY created_at ASC
    `).all();
  }

  findTimedOut(timeoutSeconds = 5) {
    return this.db.prepare(`
      SELECT * FROM pending_commands
      WHERE status IN ('PENDING', 'SENT')
        AND (strftime('%s', 'now') - strftime('%s', created_at)) > ?
    `).all(timeoutSeconds);
  }

  markAllPendingFailed(junctionId = null, reason = 'RESTART_RECOVERY') {
    if (junctionId) {
      return this.db.prepare(`
        UPDATE pending_commands
        SET status = 'FAILED',
            updated_at = datetime('now')
        WHERE junction_id = ? AND status IN ('PENDING', 'SENT')
      `).run(junctionId);
    }
    return this.db.prepare(`
      UPDATE pending_commands
      SET status = 'FAILED',
          updated_at = datetime('now')
      WHERE status IN ('PENDING', 'SENT')
    `).run();
  }
}

export default CommandRepository;

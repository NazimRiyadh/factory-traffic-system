/**
 * EventRepository — Persistent tracking of processed sensor events for deduplication.
 */

class EventRepository {
  constructor(db) {
    this.db = db;
  }

  isProcessed(eventId) {
    const row = this.db.prepare(`
      SELECT event_id FROM processed_events WHERE event_id = ?
    `).get(eventId);
    return !!row;
  }

  markProcessed(eventId, junctionId) {
    return this.db.prepare(`
      INSERT OR IGNORE INTO processed_events (event_id, junction_id)
      VALUES (?, ?)
    `).run(eventId, junctionId);
  }

  insertProcessed(eventId, junctionId) {
    return this.db.prepare(`
      INSERT INTO processed_events (event_id, junction_id)
      VALUES (?, ?)
    `).run(eventId, junctionId);
  }

  getProcessedEventIds(junctionId, limit = 1000) {
    const rows = this.db.prepare(`
      SELECT event_id FROM processed_events
      WHERE junction_id = ?
      ORDER BY processed_at DESC
      LIMIT ?
    `).all(junctionId, limit);
    return new Set(rows.map(r => r.event_id));
  }
}

export default EventRepository;

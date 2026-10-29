/**
 * HistoryRepository — Immutable audit trail of all traffic system events.
 */

class HistoryRepository {
  constructor(db) {
    this.db = db;
  }

  log(junctionId, eventType, direction = null, details = null) {
    const detailsStr = typeof details === 'object' && details !== null
      ? JSON.stringify(details)
      : (details || null);

    return this.db.prepare(`
      INSERT INTO history (junction_id, event_type, direction, details, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(junctionId, eventType, direction, detailsStr);
  }

  findByJunctionId(junctionId, limit = 100) {
    const rows = this.db.prepare(`
      SELECT id, junction_id, event_type, direction, details, timestamp
      FROM history
      WHERE junction_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(junctionId, limit);

    return rows.map(r => {
      let parsedDetails = null;
      try {
        parsedDetails = r.details ? JSON.parse(r.details) : null;
      } catch (e) {
        parsedDetails = r.details;
      }
      return {
        ...r,
        details: parsedDetails
      };
    });
  }

  findAll(limit = 100) {
    const rows = this.db.prepare(`
      SELECT id, junction_id, event_type, direction, details, timestamp
      FROM history
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);

    return rows.map(r => {
      let parsedDetails = null;
      try {
        parsedDetails = r.details ? JSON.parse(r.details) : null;
      } catch (e) {
        parsedDetails = r.details;
      }
      return {
        ...r,
        details: parsedDetails
      };
    });
  }
}

export default HistoryRepository;

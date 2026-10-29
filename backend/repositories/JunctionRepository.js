/**
 * JunctionRepository — Database operations for junctions, signals, and queues.
 */

class JunctionRepository {
  constructor(db) {
    this.db = db;
  }

  findAll() {
    return this.db.prepare(`
      SELECT * FROM junctions ORDER BY id ASC
    `).all();
  }

  findById(id) {
    const junction = this.db.prepare(`
      SELECT * FROM junctions WHERE id = ?
    `).get(id);

    if (!junction) return null;

    const signalsList = this.db.prepare(`
      SELECT direction, desired_state, actual_state, updated_at
      FROM signals WHERE junction_id = ?
    `).all(id);

    const signals = {};
    for (const s of signalsList) {
      signals[s.direction] = {
        desired_state: s.desired_state,
        actual_state: s.actual_state,
        updated_at: s.updated_at
      };
    }

    const queuesList = this.db.prepare(`
      SELECT direction, vehicle_count, highest_priority, first_vehicle_at, updated_at
      FROM queues WHERE junction_id = ?
    `).all(id);

    const vehiclesList = this.db.prepare(`
      SELECT direction, vehicle_id, vehicle_type, arrived_at
      FROM queue_vehicles WHERE junction_id = ?
      ORDER BY arrived_at ASC
    `).all(id);

    const queues = {};
    for (const q of queuesList) {
      const dirVehicles = vehiclesList.filter(v => v.direction === q.direction);
      queues[q.direction] = {
        direction: q.direction,
        vehicle_count: q.vehicle_count,
        highest_priority: q.highest_priority,
        first_vehicle_at: q.first_vehicle_at,
        updated_at: q.updated_at,
        vehicles: dirVehicles
      };
    }

    let parsedEmergencyQueue = [];
    try {
      parsedEmergencyQueue = junction.emergency_queue ? JSON.parse(junction.emergency_queue) : [];
    } catch (_) {
      parsedEmergencyQueue = [];
    }

    return {
      ...junction,
      emergency_queue: parsedEmergencyQueue,
      signals,
      queues
    };
  }

  create(junction) {
    const { id, name, mode = 'AUTOMATIC', current_phase = 'NORTH_SOUTH', controller_status = 'ONLINE' } = junction;

    const insertTx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO junctions (id, name, mode, current_phase, controller_status, phase_started_at, emergency_queue)
        VALUES (?, ?, ?, ?, ?, datetime('now'), '[]')
      `).run(id, name, mode, current_phase, controller_status);

      const insertSignal = this.db.prepare(`
        INSERT INTO signals (junction_id, direction, desired_state, actual_state)
        VALUES (?, ?, ?, ?)
      `);

      const initialSignals = {
        NORTH: 'GREEN',
        SOUTH: 'GREEN',
        EAST: 'RED',
        WEST: 'RED'
      };

      for (const [dir, state] of Object.entries(initialSignals)) {
        insertSignal.run(id, dir, state, state);
      }

      const insertQueue = this.db.prepare(`
        INSERT INTO queues (junction_id, direction, vehicle_count)
        VALUES (?, ?, 0)
      `);

      ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dir => {
        insertQueue.run(id, dir);
      });
    });

    insertTx();
    return this.findById(id);
  }

  updateMode(id, mode, manualDetails = {}) {
    return this.db.prepare(`
      UPDATE junctions
      SET mode = ?,
          manual_override_by = ?,
          manual_override_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      mode,
      manualDetails.by || null,
      manualDetails.at || null,
      id
    );
  }

  updateEmergency(id, mode, direction, startedAt, emergencyQueue = null) {
    if (emergencyQueue !== null) {
      return this.db.prepare(`
        UPDATE junctions
        SET mode = ?,
            emergency_direction = ?,
            emergency_started_at = ?,
            emergency_queue = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(mode, direction || null, startedAt || null, JSON.stringify(emergencyQueue), id);
    }
    return this.db.prepare(`
      UPDATE junctions
      SET mode = ?,
          emergency_direction = ?,
          emergency_started_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(mode, direction || null, startedAt || null, id);
  }

  updateEmergencyQueue(id, emergencyQueue) {
    return this.db.prepare(`
      UPDATE junctions
      SET emergency_queue = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(emergencyQueue || []), id);
  }

  updateTransitioning(id, transitioning, step = null) {
    return this.db.prepare(`
      UPDATE junctions
      SET transitioning = ?,
          transition_step = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(transitioning ? 1 : 0, step, id);
  }

  updatePhase(id, phase, phaseStartedAt = null) {
    return this.db.prepare(`
      UPDATE junctions
      SET current_phase = ?,
          phase_started_at = COALESCE(?, datetime('now')),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(phase, phaseStartedAt, id);
  }

  updateControllerStatus(id, status) {
    return this.db.prepare(`
      UPDATE junctions
      SET controller_status = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);
  }

  updateDesiredSignal(junctionId, direction, desiredState) {
    return this.db.prepare(`
      UPDATE signals
      SET desired_state = ?,
          updated_at = datetime('now')
      WHERE junction_id = ? AND direction = ?
    `).run(desiredState, junctionId, direction);
  }

  updateActualSignal(junctionId, direction, actualState) {
    return this.db.prepare(`
      UPDATE signals
      SET actual_state = ?,
          updated_at = datetime('now')
      WHERE junction_id = ? AND direction = ?
    `).run(actualState, junctionId, direction);
  }

  updateSignals(junctionId, signalsMap) {
    const updateTx = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        UPDATE signals
        SET desired_state = ?,
            updated_at = datetime('now')
        WHERE junction_id = ? AND direction = ?
      `);

      for (const [dir, state] of Object.entries(signalsMap)) {
        stmt.run(state, junctionId, dir);
      }
    });

    updateTx();
  }

  updateQueueAndVehicles(junctionId, direction, queueData) {
    const updateTx = this.db.transaction(() => {
      // 1. Update queue record
      const firstVehicleAt = queueData.vehicles && queueData.vehicles.length > 0
        ? (queueData.first_vehicle_at || queueData.vehicles[0].arrived_at)
        : null;

      this.db.prepare(`
        UPDATE queues
        SET vehicle_count = ?,
            first_vehicle_at = ?,
            updated_at = datetime('now')
        WHERE junction_id = ? AND direction = ?
      `).run(Math.max(0, queueData.vehicle_count || 0), firstVehicleAt, junctionId, direction);

      // 2. Clear old queue vehicles for this direction
      this.db.prepare(`
        DELETE FROM queue_vehicles
        WHERE junction_id = ? AND direction = ?
      `).run(junctionId, direction);

      // 3. Insert updated vehicles
      if (queueData.vehicles && queueData.vehicles.length > 0) {
        const insertStmt = this.db.prepare(`
          INSERT INTO queue_vehicles (junction_id, direction, vehicle_id, vehicle_type, arrived_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const v of queueData.vehicles) {
          insertStmt.run(junctionId, direction, v.vehicle_id, v.vehicle_type, v.arrived_at);
        }
      }
    });

    updateTx();
  }
}

export default JunctionRepository;

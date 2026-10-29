-- Factory Traffic Management System — Database Schema
-- SQLite database schema for junction state, queues, events, commands, and audit history

-- Junction configuration and current state
CREATE TABLE IF NOT EXISTS junctions (
  id TEXT PRIMARY KEY,                        -- e.g., 'A'
  name TEXT NOT NULL,                         -- e.g., 'Junction A'
  mode TEXT NOT NULL DEFAULT 'AUTOMATIC',     -- AUTOMATIC | MANUAL | EMERGENCY | DEGRADED
  current_phase TEXT DEFAULT 'NORTH_SOUTH',   -- NORTH_SOUTH | EAST_WEST
  controller_status TEXT DEFAULT 'ONLINE',    -- ONLINE | OFFLINE | DEGRADED | UNKNOWN
  transitioning INTEGER DEFAULT 0,           -- 1 if mid-transition, 0 if not
  transition_step TEXT,                       -- current transition step: YELLOW | ALL_RED | null
  manual_override_by TEXT,                    -- who initiated manual override
  manual_override_at TEXT,                    -- when manual override started (ISO string)
  emergency_direction TEXT,                   -- direction of active emergency vehicle
  emergency_started_at TEXT,                  -- when emergency mode started
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Signal states per direction per junction
-- Tracks both desired state (what backend wants) and actual state (what controller confirmed)
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  junction_id TEXT NOT NULL,
  direction TEXT NOT NULL,                    -- NORTH | SOUTH | EAST | WEST
  desired_state TEXT NOT NULL DEFAULT 'RED',  -- RED | YELLOW | GREEN
  actual_state TEXT DEFAULT 'RED',            -- RED | YELLOW | GREEN | UNKNOWN
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (junction_id) REFERENCES junctions(id),
  UNIQUE(junction_id, direction)
);

-- Traffic queue counts per direction
CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  junction_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  vehicle_count INTEGER NOT NULL DEFAULT 0,
  highest_priority TEXT DEFAULT 'EMPLOYEE_VEHICLE',
  first_vehicle_at TEXT,                      -- timestamp of first vehicle arrival (for starvation)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (junction_id) REFERENCES junctions(id),
  UNIQUE(junction_id, direction)
);

-- Individual vehicles currently in queues (detailed tracking)
CREATE TABLE IF NOT EXISTS queue_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  junction_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  arrived_at TEXT NOT NULL,
  FOREIGN KEY (junction_id) REFERENCES junctions(id),
  UNIQUE(junction_id, vehicle_id)
);

-- Processed event IDs (for deduplication)
CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  junction_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pending controller commands
CREATE TABLE IF NOT EXISTS pending_commands (
  command_id TEXT PRIMARY KEY,
  junction_id TEXT NOT NULL,
  direction TEXT,
  requested_state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',     -- PENDING | SENT | ACK | TIMEOUT | FAILED
  retries INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (junction_id) REFERENCES junctions(id)
);

-- Audit history / event log
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  junction_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  direction TEXT,
  details TEXT,                               -- JSON string with extra info
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (junction_id) REFERENCES junctions(id)
);

-- Index for faster history queries
CREATE INDEX IF NOT EXISTS idx_history_junction_time ON history(junction_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_event_type ON history(event_type);
CREATE INDEX IF NOT EXISTS idx_processed_events_junction ON processed_events(junction_id);
CREATE INDEX IF NOT EXISTS idx_pending_commands_junction ON pending_commands(junction_id, status);

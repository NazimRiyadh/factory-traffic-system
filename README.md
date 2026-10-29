# 🏭 Factory Traffic Management System

A robust, event-driven industrial traffic control system built for factory internal roadways and intersections. Designed for **safety-critical operation**, prioritizing emergency vehicles, preventing deadlocks, and maintaining a verifiable audit trail with hardware controller synchronization.

Built for the **CSI Smart Tech — Backend Developer Assessment**.

---

## 🚀 Quick Start & Run Instructions

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Start the Backend API (Port 3001)

```bash
cd backend
npm install
npm run dev
# Server starts at http://localhost:3001
# SQLite database is automatically migrated and Junction A seeded
```

To run all unit and integration tests:

```bash
npm test
```

### 2. Start the Frontend Dashboard (Port 3000)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
# Dashboard launches at http://localhost:3000
# Automatically proxies /api calls to http://localhost:3001
```

---

## 🏛️ System Architecture

The system is designed with a strict **Hexagonal / Clean Architecture**, cleanly separating pure mathematical/domain logic from infrastructure, storage, and HTTP concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│                    React Frontend Dashboard                     │
│      • Live SCADA Junction Visualizer                           │
│      • Manual Dispatch Overrides & Emergency Banner             │
│      • Interactive Evaluator Simulation Bench                   │
│      • Real-time Audit History Stream                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP Polling (every 1.5 - 2s)
┌───────────────────────────────▼─────────────────────────────────┐
│                    Express REST API Layer                       │
│      • Input validation & error boundaries                      │
│      • Route controllers (thin HTTP delegation)                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     Services Orchestration                      │
│  • EventService: Ingests sensor events with per-junction lock   │
│  • CommandService: Operator manual overrides & safety checks    │
│  • ControllerService: Hardware ACKs, timeouts, degradation      │
│  • SignalTimerManager: Non-blocking sequenced state transitions │
│  • JunctionService: Real-time status & auto-scheduling loop     │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
┌───────────────▼─────────────────┐     ┌─────────▼───────────────┐
│       Core Domain Engine        │     │   Persistence Layer     │
│   (Pure logic — ZERO I/O/DB)    │     │  (SQLite with WAL mode) │
│ • TrafficEngine (State Machine) │     │ • JunctionRepository    │
│ • SignalPhase (Safety Rules)    │     │ • EventRepository       │
│ • SignalTransition (Sequencer)  │     │ • CommandRepository     │
│ • Scheduler (Priority Scoring)  │     │ • HistoryRepository     │
│ • QueueManager (Lane Queues)    │     │                         │
└─────────────────────────────────┘     └─────────────────────────┘
```

### Key Architectural Invariants

1. **Isolated Domain Engine (`backend/domain/`)**: Pure functions and deterministic classes with **zero dependencies on HTTP, SQLite, or file systems**. Every test in `tests/domain/` executes in milliseconds.
2. **Safety clearance sequence**: Conflicting directions can **never** jump directly from GREEN to GREEN. Transitions always enforce:
   $$\text{GREEN} \longrightarrow \text{YELLOW (5s)} \longrightarrow \text{ALL\_RED (2s)} \longrightarrow \text{GREEN (target phase, 30s)}$$
3. **Hardware Desired vs. Actual State**:
   - `desired_state`: What the central server intends.
   - `actual_state`: What the physical roadside traffic light controller has confirmed via ACK.
   - Any persistent mismatch (> 10s) or missing ACK automatically triggers **DEGRADED mode**.
4. **Concurrency & Race Condition Prevention**:
   - `EventService` and `CommandService` utilize an in-memory **per-junction Promise lock (mutex)** to guarantee that simultaneous sensor events or operator commands for the same junction are processed in strictly serialized order.
   - SQLite is configured with `PRAGMA journal_mode = WAL` and foreign keys enabled.

---

## 🧮 Traffic Scheduling Algorithm

The automatic scheduler (`backend/domain/Scheduler.js`) continuously scores candidate phases (`NORTH_SOUTH` vs. `EAST_WEST`) to dynamically allocate green phases based on 4 weighted factors:

$$\text{Score}(\text{Phase}) = \sum_{\text{direction} \in \text{Phase}} \Big( W_{\text{queue}} \cdot Q + W_{\text{priority}} \cdot P_{\text{vehicles}} + W_{\text{wait}} \cdot T_{\text{wait}} + S_{\text{starvation}} \Big)$$

- **$Q$ (Queue Length)**: Total vehicles waiting in the approach lanes.
- **$P_{\text{vehicles}}$ (Vehicle Priority Weights)**:
  - `EMERGENCY`: Weight **1000** (Immediate preemption)
  - `TRUCK`: Weight **50**
  - `FORKLIFT`: Weight **30**
  - `EMPLOYEE_VEHICLE`: Weight **10**
- **$T_{\text{wait}}$ (Waiting Time)**: Seconds elapsed since the arrival of the first vehicle in the lane.
- **$S_{\text{starvation}}$ (Starvation Protection)**: If any vehicle has waited longer than the threshold (60s), a massive bonus (**+100**) is awarded to prevent starvation caused by heavy traffic on the opposing phase.

---

## 🚦 State Machine & Operating Modes

```
                    ┌──────────────┐
           ┌───────│  AUTOMATIC   │◄──────────────────┐
           │       └──────┬───────┘                    │
           │              │                            │
     Emergency         Manual                  RETURN_TO_AUTOMATIC
      Vehicle          Command                  or Emergency Cleared
      Detected                                         │
           │              │                            │
           ▼              ▼                            │
    ┌──────────────┐ ┌──────────────┐                  │
    │  EMERGENCY   │ │   MANUAL     │──────────────────┘
    └──────┬───────┘ └──────┬───────┘
           │                │
           │          Emergency Vehicle
           │          Detected (overrides manual)
           │                │
           └────────────────┘

    ANY mode ──── Controller Failure / Timeout ───► DEGRADED
    DEGRADED ──── Controller Reconnect / ACK ─────► AUTOMATIC
```

- **AUTOMATIC**: Standard dynamic scheduling based on queue weights and starvation rules.
- **MANUAL**: Operator command forces a selected direction green. Manual mode locks out automatic scheduling until explicitly returned to automatic.
- **EMERGENCY**: Highest priority. Preempts both automatic and manual modes. Conflicting phases transition to red clearance immediately.
- **DEGRADED**: Triggered on controller timeout or communication failure. Signals are held in safe fallback mode.

---

## 🧪 Evaluator Demonstration Walkthrough

You can test every scenario either through the **Interactive Evaluator Test Bench** at the bottom of the React dashboard or via standard `curl` commands.

### Scenario 1: Normal Traffic Arrival & Queue Building

1. In the Dashboard Simulator bench (or via curl):
   - Send `VEHICLE_ARRIVED`, Direction: `EAST`, Vehicle Type: `FORKLIFT`.
   - Send `VEHICLE_ARRIVED`, Direction: `EAST`, Vehicle Type: `TRUCK`.
2. Observe the EAST queue bar update to 2 vehicles with accumulated waiting time.

### Scenario 2: Priority-Based Automatic Phase Transition

1. NORTH/SOUTH starts GREEN by default.
2. Send 2 heavy trucks to `EAST`.
3. Notice the Scheduler automatically calculate that EAST_WEST score exceeds NORTH_SOUTH, safely transitioning:
   - NORTH/SOUTH turns **YELLOW** (5s)
   - All lights turn **RED** (2s all-red clearance interval)
   - EAST/WEST turns **GREEN** (30s)

### Scenario 3: Emergency Vehicle Preemption

1. Click the **🚨 Ambulance to EAST** preset button on the dashboard.
2. **Instant Emergency Banner** appears with audio-visual alert.
3. System immediately forces a safe transition to EAST_WEST green.
4. Attempting manual override commands during an active emergency returns `409 Conflict: Cannot override emergency mode`.
5. Send a `VEHICLE_CLEARED` event for the emergency vehicle ID:
   - System clears emergency mode and safely resumes normal operation.

### Scenario 4: Idempotent Event Deduplication

1. Click the **🔁 Test Duplicate Reject** button.
2. The first request processes with HTTP 200 `PROCESSED`.
3. Click the button again with the exact same `event_id`:
   - Returns HTTP 200 `IGNORED: Duplicate event already processed (idempotent)`.
   - The queue count does **not** increase, protecting the system from network duplicate packets.

### Scenario 5: Manual Operator Override

1. In the **Operator Manual Override** panel, click **Force GREEN WEST**.
2. System logs `MANUAL_OVERRIDE_ACTIVATED` in the audit log, sets mode to `MANUAL`, and executes transition sequence.
3. Click **Return to Automatic Mode** to yield control back to the scheduling engine.

### Scenario 6: Hardware Controller Timeout & Degradation

1. When signals transition, click **Broadcast Hardware State** with Status `OFFLINE`.
2. The junction controller status immediately switches to `OFFLINE` and the mode degrades to `DEGRADED`.
3. Switch status back to `ONLINE` or click **Simulate Controller ACK** to confirm recovery.

### Scenario 7: State Persistence Across Restarts

1. Build queues and manual states on Junction A.
2. Stop the backend process (`Ctrl+C`) and restart it (`npm run dev`).
3. Reload the dashboard: All queues, signals, mode, and audit records remain fully intact from SQLite.

---

## Assumptions / Questions / Requirement Issues

### Assumptions & Interpretations
1. **Conflicting Phase Definitions**: Directions are partitioned into two strictly mutually exclusive phases: `NORTH_SOUTH` (`NORTH`, `SOUTH`) and `EAST_WEST` (`EAST`, `WEST`). Conflicting greens are mathematically prohibited across domain and persistence layers (`SignalPhase.validateSafety`).
2. **Authoritative Timestamp Policy**: Server receipt time (`new Date().toISOString()`) is authoritative for event sequencing, waiting time computations, starvation bonuses, and timeout calculations. Sensor-generated timestamps are preserved as `sensor_timestamp` in audit records for provenance.
3. **Emergency Preemption & Arbitration**: Emergency vehicles strictly outrank automatic scheduling and manual operator overrides. When conflicting emergencies arrive in close temporal proximity, the system enforces a deterministic First-Come, First-Served (FCFS) priority queue: the first emergency is served immediately while subsequent conflicting emergencies are enqueued without loss of data or priority. When the active emergency clears, the next queued emergency is promoted automatically.
4. **Hardware Controller Decoupling & Recovery**: Backend desired states and physical controller actual states are tracked independently. Application startup never fabricates simulated ACKs. Pending commands interrupted by a restart are marked `FAILED`, unconfirmed physical signal states are marked `UNKNOWN`, and the junction enters `DEGRADED` mode until real controller confirmation is established.
5. **Controller Retries & Timeouts**: Commands unacknowledged after `CONTROLLER_ACK_TIMEOUT` (5s) are retried with timestamp resetting. When retries exceed `CONTROLLER_MAX_RETRIES` (1), commands transition to `TIMEOUT` and the junction degrades safely. Stale or mismatched ACKs are rejected without corrupting physical states.

### Requirement Clarifications & Handled Edge Cases
- **Vehicle Cleared without Prior Arrival**: Defensively handled without throwing; clamps lane count to `0` and logs an audit trail warning.
- **Concurrent Requests**: Serialized per-junction using an asynchronous promise-chain mutex (`junctionLock`). Simultaneous events, operator commands, controller ACKs, and timer callbacks execute in strict determinism.
- **Minimum Green Duration Enforcement**: Automatic scheduling enforces `MIN_GREEN_DURATION` (30s) from `phase_started_at`. Normal vehicle events cannot disrupt active green phases early; emergencies explicitly preempt minimum green delays while preserving yellow and all-red clearance intervals.

---

## AI / Tool Usage

In accordance with the assessment submission requirements, AI tooling (Google DeepMind Antigravity / Gemini) was utilized as an assistive pair-programming and diagnostic tool during this development cycle.

### Scope of AI Assistance
1. **Root-Cause Analysis & Traceability**: Assisted in diagnosing state race conditions, locating the startup `simulateAcknowledgeAll` side effect, and tracing the transition superseding bug in `SignalTimerManager.js`.
2. **Deterministic State Machine Formalization**: Formulated the pure-domain emergency FIFO queue logic and controller ACK invariant validators in `TrafficEngine.js`.
3. **Comprehensive Regression Suite Generation**: Aided in synthesizing the 10 critical safety regression integration test suites in `tests/integration/regression.test.js`.
4. **Architecture Documentation**: Assisted in drafting the complete `DESIGN.md` specification and updating architectural design rationale.

All architectural decisions, safety invariant proofs, concurrency locking schemes, and test validations were reviewed, verified, and executed against the live test runners.

A full engineering dialogue and pair-programming transcript is documented in [AI_CHAT_HISTORY.md](AI_CHAT_HISTORY.md).

---

## 📡 REST API Reference

| Method | Endpoint                          | Description                                                             | Request Payload                                                                                                                               |
| ------ | --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                     | Healthcheck and service heartbeat                                       | None                                                                                                                                          |
| `GET`  | `/api/junctions`                  | List all configured junctions                                           | None                                                                                                                                          |
| `GET`  | `/api/junctions/:id/status`       | Comprehensive status: signals, queues, mode, transition, controller     | None                                                                                                                                          |
| `POST` | `/api/junctions/:id/commands`     | Dispatch manual command (`MANUAL_GREEN_REQUEST`, `RETURN_TO_AUTOMATIC`) | `{"command": "MANUAL_GREEN_REQUEST", "direction": "EAST"}`                                                                                    |
| `POST` | `/api/sensor-events`              | Ingest vehicle arrival or clearance event                               | `{"event_id": "...", "junction_id": "A", "direction": "NORTH", "event_type": "VEHICLE_ARRIVED", "vehicle_id": "v1", "vehicle_type": "TRUCK"}` |
| `POST` | `/api/controller-events`          | Hardware controller ACK or status update                                | `{"junction_id": "A", "status": "ACK", "actual_state": "GREEN", "direction": "EAST", "command_id": "cmd_..."}`                               |
| `POST` | `/api/junctions/:id/simulate-ack` | Evaluator bench helper: simulate ACK for pending signals                | None                                                                                                                                          |
| `GET`  | `/api/junctions/:id/history`      | Paginated audit trail history                                           | `?limit=50`                                                                                                                                   |

---

## 🧪 Automated Test Suite

Run the full Jest test suite with verbose reporting:

```bash
cd backend
npm test
```

### Test Coverage Highlights (39 Tests Across 7 Suites)

- ✅ `tests/integration/regression.test.js`: All 10 critical safety regression tests:
  1. Manual command during an active transition (safely supersedes without serving old green).
  2. Emergency arrival during manual override (preempts manual mode; blocks manual commands).
  3. Two emergencies from conflicting directions (arbitrated via FCFS emergency queue).
  4. Invalid ACK and ACK for unknown commands (strictly rejected without corrupting physical states; conflicting greens rejected).
  5. Controller offline, reconnect, and timeout retries.
  6. Restart recovery during pending transitions (no fabricated ACKs; unconfirmed states marked UNKNOWN; junction degraded).
  7. Persistent database-level deduplication beyond in-memory window.
  8. Concurrent event, command, and controller ACK serialization.
  9. Minimum green-time enforcement for ordinary traffic with emergency bypass.
  10. Atomic rollback on database failure during event processing.
- ✅ `tests/domain/QueueManager.test.js`: Vehicle additions, deduplication, safe decrements, emergency detection.
- ✅ `tests/domain/SignalPhase.test.js`: Conflicting phase detection, green state assignments, safety invariant verification.
- ✅ `tests/domain/SignalTransition.test.js`: Three-step `YELLOW` $\to$ `ALL_RED` $\to$ `GREEN` sequencing.
- ✅ `tests/domain/Scheduler.test.js`: Weighted scoring, priority dominance, and starvation prevention after 60s.
- ✅ `tests/domain/TrafficEngine.test.js`: Core deterministic state machine, manual overrides, emergency transitions, controller callbacks.
- ✅ `tests/integration/api.test.js`: Full end-to-end HTTP integration tests for all endpoints.

---

## 🔮 Known Limitations & Production Roadmap

1. **Distributed Coordination Across Multiple Junctions**: Current scope models isolated 4-way intersections. Multi-junction arterial corridors ("green wave" coordination) will require decentralized consensus or synchronized corridor scheduling.
2. **WebSocket / SSE Feed**: Current frontend utilizes HTTP polling every 1.5–2s. Migrating to Server-Sent Events or WebSockets will enable sub-millisecond signal telemetry streaming.
3. **Hardware Gateway (MQTT / Modbus)**: In physical production deployments, the controller HTTP callback endpoint should be bridged to an industrial PLC gateway communicating via Modbus TCP or MQTT.

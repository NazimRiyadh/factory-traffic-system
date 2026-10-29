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

## 📋 Design Decisions & Assumptions

| # | Ambiguous Area | Design Decision & Engineering Rationale |
|---|---|---|
| 1 | **Conflicting Phases** | Grouped into two mutually exclusive phases: `NORTH_SOUTH` and `EAST_WEST`. Conflicting greens are mathematically prohibited in `SignalPhase.validateSafety()`. |
| 2 | **Event Deduplication** | Primary key deduplication on `event_id` stored in SQLite `processed_events`. Duplicate requests receive 200 OK without side effects. |
| 3 | **Authoritative Timestamps** | Server arrival time (`datetime('now')`) is authoritative for sequencing and timeouts. Sensor timestamps are retained for audit inspection. |
| 4 | **Vehicle Cleared without Arrival** | Handled defensively: logs a warning to the audit history and clamps queue count to `0` (never permits negative queues). |
| 5 | **Emergency vs. Manual Hierarchy** | `EMERGENCY` strictly outranks `MANUAL`. An operator cannot override an active emergency; manual override buttons are disabled. |
| 6 | **Two Conflicting Emergencies** | Serves the first-arriving emergency. Once cleared via `VEHICLE_CLEARED`, immediately schedules the second emergency direction. |
| 7 | **Controller ACK Timeout** | Set to 5 seconds with 1 retry (3s delay). If unacknowledged, commands are marked `TIMEOUT` and junction mode switches to `DEGRADED`. |
| 8 | **State Discrepancy** | Desired signal state is tracked separately from actual confirmed state. A dedicated column in the UI highlights discrepancies until ACK is received. |
| 9 | **Signal Transitions on Restart** | If the system restarts during an intermediate step (e.g. Yellow), it conservatively transitions all signals to `ALL_RED` before scheduling. |
| 10 | **Communication Protocol** | HTTP REST with 1.5s client polling was selected for simplicity, deterministic state recovery, and zero external broker dependencies (like Redis/Kafka). |

---

## 📡 REST API Reference

| Method | Endpoint | Description | Request Payload |
|---|---|---|---|
| `GET` | `/api/health` | Healthcheck and service heartbeat | None |
| `GET` | `/api/junctions` | List all configured junctions | None |
| `GET` | `/api/junctions/:id/status` | Comprehensive status: signals, queues, mode, transition, controller | None |
| `POST` | `/api/junctions/:id/commands` | Dispatch manual command (`MANUAL_GREEN_REQUEST`, `RETURN_TO_AUTOMATIC`) | `{"command": "MANUAL_GREEN_REQUEST", "direction": "EAST"}` |
| `POST` | `/api/sensor-events` | Ingest vehicle arrival or clearance event | `{"event_id": "...", "junction_id": "A", "direction": "NORTH", "event_type": "VEHICLE_ARRIVED", "vehicle_id": "v1", "vehicle_type": "TRUCK"}` |
| `POST` | `/api/controller-events` | Hardware controller ACK or status update | `{"junction_id": "A", "status": "ACK", "actual_state": "GREEN", "direction": "EAST"}` |
| `POST` | `/api/junctions/:id/simulate-ack` | Helper endpoint to simulate immediate ACK for pending signals | None |
| `GET` | `/api/junctions/:id/history` | Paginated audit trail history | `?limit=50` |

---

## 🧪 Automated Test Suite

Run the full Jest test suite with verbose reporting:
```bash
cd backend
npm test
```

### Test Coverage Highlights
- ✅ `tests/domain/QueueManager.test.js`: Vehicle additions, deduplication, safe decrements, emergency detection.
- ✅ `tests/domain/SignalPhase.test.js`: Conflicting phase detection, green state assignments, safety invariant verification.
- ✅ `tests/domain/SignalTransition.test.js`: Three-step `YELLOW` $\to$ `ALL_RED` $\to$ `GREEN` sequencing.
- ✅ `tests/domain/Scheduler.test.js`: Weighted scoring, priority dominance, and starvation prevention after 60s.
- ✅ `tests/domain/TrafficEngine.test.js`: Core deterministic state machine, manual overrides, emergency transitions, controller callbacks.
- ✅ `tests/integration/api.test.js`: Full end-to-end HTTP integration tests for all endpoints.

---

## 🔮 Future Enhancements
1. **WebSocket / SSE Feed**: Replace client polling with Server-Sent Events for sub-millisecond signal telemetry streaming.
2. **Multi-Junction Coordination (Green Wave)**: Coordinate sequential junctions along an industrial corridor so trucks pass uninterrupted through multiple intersections.
3. **Hardware Gateway (MQTT / Modbus)**: Connect directly to industrial PLCs (Programmable Logic Controllers) via an MQTT/Modbus TCP bridge.

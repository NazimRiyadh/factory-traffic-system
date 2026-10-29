# Factory Traffic Management System — System Architecture & Design Specification

## 1. Overview & System Mission

The **Factory Traffic Management System** is a safety-critical, event-driven industrial traffic controller built for internal factory roadways, warehouse logistics lanes, and high-frequency vehicle intersections. Factory roadways exhibit unique characteristics distinct from municipal traffic:
- **Asymmetric Vehicle Priority**: Automated forklifts, heavy raw material transport trucks, employee commuter vehicles, and ambulances/fire emergency units share single-lane corridors.
- **Physical Safety Invariants**: Conflicting green phases (`NORTH_SOUTH` vs. `EAST_WEST`) can cause catastrophic vehicular collisions and operational downtime.
- **Hardware Controller Decoupling**: Central software calculates desired states, but physical signal heads are actuated by roadside field controllers whose acknowledgements (`ACK`) must be verified against pending commands.
- **Network Degradation Resilience**: In industrial environments with intermittent Wi-Fi or packet drops, the system must maintain idempotent deduplication, retry unacknowledged hardware commands, and transition to a safe degraded state if communication fails.

---

## 2. Hexagonal Clean Architecture

The codebase enforces a strict separation of concerns following Hexagonal (Ports & Adapters) principles:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        External Interface                              │
│   • REST API Routes (/api/junctions, /api/sensor-events, etc.)         │
│   • Middleware (Input validation, body schemas, error boundary)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Service Orchestration Layer                      │
│   • junctionLock: Global per-junction mutex serialization             │
│   • EventService: Ingests sensor events, enforces atomic transactions  │
│   • CommandService: Operator manual overrides & supersede transitions  │
│   • ControllerService: Hardware ACK verification, retries, degradation│
│   • SignalTimerManager: Timed state machine sequencer                 │
│   • JunctionService: Query aggregation & centralized scheduling loop   │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
┌──────────────────▼───────────────┐     ┌───────────▼───────────────────┐
│        Pure Domain Engine        │     │       Persistence Layer       │
│    (Zero DB, Zero HTTP, Pure)    │     │      (SQLite in WAL Mode)     │
│ • TrafficEngine (State Machine)  │     │ • JunctionRepository          │
│ • SignalPhase (Safety Rules)     │     │ • CommandRepository           │
│ • SignalTransition (Sequencer)   │     │ • EventRepository             │
│ • Scheduler (Priority Scoring)   │     │ • HistoryRepository           │
│ • QueueManager (Lane FIFO Lists) │     │                               │
└──────────────────────────────────┘     └───────────────────────────────┘
```

### Architectural Boundaries & Invariants
1. **Isolated Domain Engine (`backend/domain/`)**: Pure functions and immutable transitions with zero I/O, database, or external library dependencies. Every unit test executes in single-digit milliseconds.
2. **Transactional State Mutations**: Queue updates, event deduplication records, and audit history entries are wrapped in atomic SQLite transactions (`db.transaction`). If any constraint fails, all modifications are rolled back.
3. **Hardware State Split**:
   - `desired_state`: The phase and light colour intended by the central backend.
   - `actual_state`: The physical signal confirmed by field controller ACK.
   - Discrepancies are tracked in real-time and flagged if unconfirmed.

---

## 3. Concurrency Model & Per-Junction Serialization

A critical challenge in traffic systems is race conditions between asynchronous events:
- A sensor reports a heavy truck arrival.
- An emergency vehicle is detected on a conflicting lane.
- An operator clicks "Force Green" on a manual override panel.
- A field controller returns a delayed ACK for a previous transition step.
- An in-memory timer fires to advance YELLOW to ALL-RED.

### The Solution: Shared Per-Junction Mutex (`junctionLock`)
All state-modifying operations (sensor events, operator commands, controller callbacks, and timer callbacks) are funneled through a shared mutex queue per junction (`utils/junctionLock.js`).

```javascript
class JunctionLockManager {
  async runExclusive(junctionId, fn) {
    // Chains execution onto the existing Promise for this junction
  }
}
```

### Transition Generation Tokens
To prevent stale timer callbacks from corrupting new decisions:
- Every phase transition generates a unique token: `transitionId = trans_${Date.now()}_${random}`.
- Timer callbacks pass this token into `_executeStep(junctionId, steps, stepIndex, transitionId)`.
- If an operator override or emergency supersedes the transition, the active transition is cancelled and a new token is minted.
- When any superseded timer callback wakes up, it detects `state.transitionId !== transitionId` and aborts immediately without mutating state or sending hardware commands.

---

## 4. Signal Transitions & Safety Invariants

### Safety Invariant #1: Conflicting Greens Prohibited
Conflicting directions can never display GREEN simultaneously:
- Phase 1: `NORTH` and `SOUTH`
- Phase 2: `EAST` and `WEST`

`SignalPhase.validateSafety(signals)` verifies that all non-RED directions belong exclusively to the same phase. If any command or ACK attempts to violate this rule, it is immediately rejected with HTTP 409 and logs a `SAFETY_VIOLATION_PREVENTED` audit event.

### Safety Invariant #2: Safe Clearance Sequence
Direct GREEN-to-GREEN transitions between conflicting phases are mathematically impossible. Transitions always strictly traverse:

$$\text{GREEN} \xrightarrow{\quad\text{YELLOW (5s)}\quad} \text{ALL-RED (2s clearance)} \xrightarrow{\quad\text{Target GREEN (30s)}\quad}$$

### Superseding In-Progress Transitions Safely
If an emergency vehicle arrives or an operator forces a manual green while a transition to another phase is already in progress:
1. If the target phase matches the active transition, the active transition is preserved and metadata is updated.
2. If the target phase is conflicting:
   - If currently in **YELLOW**: The signal cannot snap directly to GREEN for safety. The sequencer schedules immediate progression to **ALL-RED** clearance (2s), followed directly by the new target **GREEN**.
   - If currently in **ALL-RED**: All lights are already red; the sequencer proceeds directly to the new target **GREEN**.
   - The old transition is completely invalidated; it cannot continue to its superseded target green.

---

## 5. Traffic Scheduling Algorithm

The automatic scheduler (`backend/domain/Scheduler.js`) dynamically scores candidate phases (`NORTH_SOUTH` vs. `EAST_WEST`) using four weighted parameters:

$$\text{Score}(\text{Phase}) = \sum_{\text{direction} \in \text{Phase}} \Big( W_{\text{queue}} \cdot Q + W_{\text{priority}} \cdot P_{\text{vehicles}} + W_{\text{wait}} \cdot T_{\text{wait}} + S_{\text{starvation}} \Big)$$

### Weight Configuration
| Factor | Weight Variable | Default Weight | Description |
| :--- | :--- | :--- | :--- |
| **Queue Size ($Q$)** | `SCHEDULING_WEIGHTS.QUEUE_SIZE` | `1.0` | Number of vehicles waiting in queue |
| **Vehicle Priority ($P$)** | `SCHEDULING_WEIGHTS.VEHICLE_PRIORITY` | `2.0` | Sum of vehicle priority scores |
| **Waiting Time ($T$)** | `SCHEDULING_WEIGHTS.WAITING_TIME` | `1.5` | Seconds elapsed since arrival of first vehicle |
| **Starvation Bonus ($S$)** | `SCHEDULING_WEIGHTS.STARVATION_BONUS` | `+100` | Applied when wait time exceeds threshold |

### Vehicle Priority Scores
- `EMERGENCY`: **1000** (Immediate preemption)
- `TRUCK`: **50** (Heavy cargo, high momentum)
- `FORKLIFT`: **30** (Active warehouse operations)
- `EMPLOYEE_VEHICLE`: **10** (Commuter traffic)

### Starvation Prevention
If light cross-traffic waits behind heavy truck corridors for longer than `STARVATION_THRESHOLD` (default: 60s), the phase receives a **+100 starvation bonus**, guaranteeing bounded maximum waiting times and preventing starvation deadlocks.

### Minimum Green Time Enforcement
Normal vehicle arrivals cannot preempt or switch an active phase until at least `MIN_GREEN_DURATION` (default: 30s) has elapsed since `phase_started_at`. This prevents rapid, erratic signal flipping. Emergency vehicles explicitly bypass minimum green delays while preserving yellow and all-red clearance intervals.

---

## 6. Emergency Vehicle Arbitration Policy

When emergency vehicles (ambulances, fire response units) arrive:
1. **Preemption**: Emergency mode immediately preempts both `AUTOMATIC` and `MANUAL` modes.
2. **Conflict Resolution Policy (First-Come, First-Served Emergency Queue)**:
   - When the first emergency arrives, the system enters `EMERGENCY` mode and initiates a safe clearance transition to its phase.
   - If a second emergency arrives in the **same phase** (e.g. SOUTH when NORTH is active), both are served simultaneously.
   - If a second emergency arrives from a **conflicting direction** (e.g. NORTH when EAST is active), the system **does not overwrite or drop** either vehicle. The second emergency is added to the persistent `emergency_queue` following First-Come, First-Served (FCFS) arbitration.
3. **Promotion & Clearance**:
   - When `VEHICLE_CLEARED` arrives for the active emergency direction, the system inspects `emergency_queue`.
   - If waiting emergencies exist, the next emergency is popped, promoted to active, and a safe transition sequence is executed.
   - When all emergencies clear, the junction returns to `AUTOMATIC` mode.
4. **Manual Lockout**: Any `MANUAL_GREEN_REQUEST` sent during active emergency mode is rejected with HTTP 409 Conflict.

---

## 7. Controller Synchronization & Failure Recovery

### Strict Controller ACK Validation
A physical signal light controller must confirm signal actuations. An ACK is validated against:
1. `command_id` existence in `pending_commands`.
2. Junction ID and direction matching.
3. Command status (`PENDING` or `SENT` only; stale or duplicate ACKs rejected).
4. Actual confirmed state matching requested state (`actual_state === requested_state`).
5. **Physical Conflict Guard**: Proposed actual signals are passed through `SignalPhase.validateSafety()`. If an ACK falsely claims GREEN on a conflicting lane, the ACK is rejected, actual signals are left unchanged, and the controller is marked `DEGRADED`.

### Retry & Timeout Policy
- When a command is dispatched, it is assigned status `SENT` with an ACK timeout window (5s).
- If unacknowledged after the timeout:
  - If `retries < CONTROLLER_MAX_RETRIES`: The retry counter increments, the timeout resets, and the command is re-dispatched.
  - If retries are exhausted: The command is marked `TIMEOUT`, the junction controller status degrades to `DEGRADED`, and active transitions are suspended.

### Restart Recovery Without Simulated ACKs
On backend startup or crash recovery:
- The system **never fabricates ACKs** or silently marks controllers ONLINE.
- Any commands left in `PENDING` or `SENT` from the previous process run are marked `FAILED`.
- Physical signals with unconfirmed states are marked `UNKNOWN`.
- Junctions with interrupted transitions are set to mode `DEGRADED` with controller status `UNKNOWN`.
- Automatic scheduling is suspended until verified controller ACKs or manual reconciliation restores verified connectivity.

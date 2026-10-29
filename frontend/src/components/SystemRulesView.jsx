import React from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, Layers, Cpu } from 'lucide-react';

export default function SystemRulesView() {
  return (
    <div className="rules-view-container">
      <div>
        <span className="eyebrow">Safety & Engineering Standards</span>
        <h2>System Invariants & Scheduling Logic</h2>
        <p className="view-subtext">
          Formal operating parameters, safety constraints, and mathematical scoring equations governing autonomous dispatch.
        </p>
      </div>

      <div className="rules-grid">
        {/* Card 1: Safety Invariants */}
        <div className="rule-card">
          <div className="rule-card-header">
            <ShieldAlert size={20} color="var(--color-primary)" />
            <h3>Safety-Critical Invariants</h3>
          </div>
          <ul className="invariants-list">
            <li>
              <CheckCircle size={16} color="var(--color-green)" />
              <div>
                <strong>Zero Conflicting Green States:</strong> Conflicting movements (`NORTH_SOUTH` vs. `EAST_WEST`) are physically and logically precluded from holding simultaneous green indications.
              </div>
            </li>
            <li>
              <CheckCircle size={16} color="var(--color-green)" />
              <div>
                <strong>Mandatory Yellow + All-Red Sequence:</strong> Signal phase switches must strictly cycle through Yellow (5s) $\to$ All-Red (2s clearance) before displaying Green on the cross-phase.
              </div>
            </li>
            <li>
              <CheckCircle size={16} color="var(--color-green)" />
              <div>
                <strong>Emergency Vehicle Preemption:</strong> Emergency sensor events immediately seize phase control, overriding manual dispatch and automatic queues.
              </div>
            </li>
            <li>
              <CheckCircle size={16} color="var(--color-green)" />
              <div>
                <strong>Hardware Controller Disconnect Fallback:</strong> If roadside controller communication fails (&gt;5s timeout), the system enters DEGRADED failsafe mode.
              </div>
            </li>
          </ul>
        </div>

        {/* Card 2: Priority Weight Matrix */}
        <div className="rule-card">
          <div className="rule-card-header">
            <Layers size={20} color="var(--color-ink)" />
            <h3>Vehicle Priority Matrix</h3>
          </div>
          <table className="weights-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Priority Weight</th>
                <th>Preemption Type</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>EMERGENCY</strong> (Ambulance/Fire)</td>
                <td><span className="weight-badge high">1000 pts</span></td>
                <td>Immediate Preempt</td>
              </tr>
              <tr>
                <td><strong>TRUCK</strong> (Heavy Logistics)</td>
                <td><span className="weight-badge mid">50 pts</span></td>
                <td>Weighted Priority</td>
              </tr>
              <tr>
                <td><strong>FORKLIFT</strong> (Internal Cargo)</td>
                <td><span className="weight-badge mid">30 pts</span></td>
                <td>Weighted Priority</td>
              </tr>
              <tr>
                <td><strong>EMPLOYEE_VEHICLE</strong></td>
                <td><span className="weight-badge base">10 pts</span></td>
                <td>FIFO Base Queue</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Card 3: Scheduling Equation */}
        <div className="rule-card full-width-card">
          <div className="rule-card-header">
            <Cpu size={20} color="var(--color-primary)" />
            <h3>Dynamic Scoring Formula</h3>
          </div>
          <div className="formula-block font-mono">
            Score(Phase) = (QueueCount × W_queue) + (PrioritySum × W_priority) + (WaitSeconds × W_wait) + StarvationBonus
          </div>
          <div className="formula-breakdown-grid">
            <div className="param-item">
              <span className="param-title">Queue Weight (W_queue)</span>
              <span className="param-val">1.0</span>
            </div>
            <div className="param-item">
              <span className="param-title">Priority Weight (W_priority)</span>
              <span className="param-val">2.0</span>
            </div>
            <div className="param-item">
              <span className="param-title">Wait Time Weight (W_wait)</span>
              <span className="param-val">1.5 pts/sec</span>
            </div>
            <div className="param-item">
              <span className="param-title">Starvation Threshold</span>
              <span className="param-val">60s (+100 pts)</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .rules-view-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .rules-view-container h2 {
          font-size: 24px;
          margin-top: 4px;
        }

        .view-subtext {
          font-size: 14px;
          color: var(--color-body);
          margin-top: 4px;
        }

        .rules-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        @media (max-width: 900px) {
          .rules-grid {
            grid-template-columns: 1fr;
          }
        }

        .rule-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .full-width-card {
          grid-column: 1 / -1;
        }

        .rule-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-card-border);
        }

        .rule-card-header h3 {
          font-size: 17px;
          color: var(--color-ink);
        }

        .invariants-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 14px;
          font-size: 14px;
          color: var(--color-body);
        }

        .invariants-list li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          line-height: 1.45;
        }

        .invariants-list strong {
          color: var(--color-ink);
        }

        .weights-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
        }

        .weights-table th {
          text-align: left;
          padding: 10px 14px;
          background-color: var(--color-canvas-soft);
          border-bottom: 1px solid var(--color-card-border);
          font-size: 11.5px;
          font-weight: 600;
          color: var(--color-body);
          text-transform: uppercase;
        }

        .weights-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--color-card-border);
          color: var(--color-ink-mid);
        }

        .weights-table tr:last-child td {
          border-bottom: none;
        }

        .weight-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: var(--radius-pill);
          font-size: 11.5px;
          font-weight: 700;
        }

        .weight-badge.high {
          background-color: var(--color-red-soft);
          color: var(--color-red);
        }

        .weight-badge.mid {
          background-color: var(--color-primary-soft);
          color: var(--color-primary);
        }

        .weight-badge.base {
          background-color: var(--color-canvas-soft);
          color: var(--color-body);
        }

        .formula-block {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          padding: 16px 20px;
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          color: var(--color-primary);
          overflow-x: auto;
        }

        .formula-breakdown-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        @media (max-width: 768px) {
          .formula-breakdown-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .param-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          padding: 12px 14px;
          border-radius: var(--radius-sm);
        }

        .param-title {
          font-size: 12px;
          color: var(--color-body);
          font-weight: 500;
        }

        .param-val {
          font-size: 16px;
          font-weight: 700;
          color: var(--color-ink);
        }
      `}</style>
    </div>
  );
}

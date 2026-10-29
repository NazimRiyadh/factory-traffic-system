import React from 'react';
import SimulationPanel from './SimulationPanel';
import StatusBadge from './StatusBadge';

export default function SimulationBenchView({ junctionId, status, onEventSimulated }) {
  const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  const signals = status?.signals || {};

  return (
    <div className="sim-bench-view">
      <div className="bench-header">
        <div>
          <span className="eyebrow">Sandbox & Edge-Case Testing</span>
          <h2>Interactive Evaluation Bench</h2>
          <p className="view-subtext">
            Inject sensor arrivals, simulate hardware controller callbacks, and trigger stress-testing scenarios.
          </p>
        </div>

        {/* Live Mini State Strip */}
        <div className="mini-state-strip">
          <div className="mini-state-item">
            <span className="mini-label">Mode:</span>
            <StatusBadge value={status?.mode} />
          </div>
          <div className="mini-state-item">
            <span className="mini-label">Active Phase:</span>
            <span className="mini-val font-mono">{status?.current_phase || 'NORTH_SOUTH'}</span>
          </div>
          <div className="mini-signal-dots">
            {directions.map((d) => (
              <span key={d} className={`dot-${(signals[d]?.desired_state || 'RED').toLowerCase()}`} title={`${d}: ${signals[d]?.desired_state}`}>
                {d[0]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Simulation Form */}
      <SimulationPanel
        junctionId={junctionId}
        onEventSimulated={onEventSimulated}
      />

      <style>{`
        .sim-bench-view {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .bench-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
        }

        .bench-header h2 {
          font-size: 24px;
          margin-top: 4px;
        }

        .view-subtext {
          font-size: 14px;
          color: var(--color-body);
          margin-top: 4px;
        }

        .mini-state-strip {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          padding: 8px 14px;
          border-radius: var(--radius-md);
        }

        .mini-state-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .mini-label {
          color: var(--color-body);
          font-weight: 500;
        }

        .mini-val {
          color: var(--color-primary);
          font-weight: 700;
        }

        .mini-signal-dots {
          display: flex;
          gap: 4px;
          border-left: 1px solid var(--color-card-border);
          padding-left: 10px;
        }

        .mini-signal-dots span {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          font-family: var(--font-mono);
        }

        .dot-green { background-color: #10b981; }
        .dot-yellow { background-color: #f59e0b; }
        .dot-red { background-color: #ef4444; }
      `}</style>
    </div>
  );
}

import React from 'react';
import StatusBadge from './StatusBadge';
import { Check, RefreshCw } from 'lucide-react';

export default function SignalStatus({ signals = {}, onSimulateAck, isSimulatingAck }) {
  const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  const safeSignals = signals || {};

  return (
    <div className="zapier-card signal-table-card">
      <div className="table-top-header">
        <div>
          <span className="eyebrow">Controller Telemetry</span>
          <h3>Signal Hardware Confirmation</h3>
        </div>
        {onSimulateAck && (
          <button
            className="btn-tertiary ack-btn"
            onClick={onSimulateAck}
            disabled={isSimulatingAck}
            title="Send controller confirmation for desired signal states"
          >
            <RefreshCw size={13} className={isSimulatingAck ? 'spinning' : ''} />
            <span>Simulate Hardware ACK</span>
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="zapier-table">
          <thead>
            <tr>
              <th>Direction</th>
              <th>Desired (Backend)</th>
              <th>Confirmed (Hardware)</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {directions.map((dir) => {
              const sig = safeSignals[dir] || { desired_state: 'RED', actual_state: 'RED' };
              const isMatch = sig.desired_state === sig.actual_state;

              return (
                <tr key={dir} className={!isMatch ? 'row-mismatch' : ''}>
                  <td className="dir-cell font-mono">{dir}</td>
                  <td>
                    <StatusBadge value={sig.desired_state} />
                  </td>
                  <td>
                    <StatusBadge value={sig.actual_state || 'UNKNOWN'} />
                  </td>
                  <td>
                    {isMatch ? (
                      <span className="sync-chip confirmed">
                        <Check size={12} /> Confirmed
                      </span>
                    ) : (
                      <span className="sync-chip pending">
                        Pending ACK
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .signal-table-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .table-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
        }
        .table-top-header h3 {
          font-size: 20px;
          color: var(--color-ink);
          margin-top: 4px;
        }
        .ack-btn {
          font-size: 13px;
          padding: 7px 14px;
        }
        .spinning {
          animation: spin 1s infinite linear;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .table-wrapper {
          overflow-x: auto;
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
          background-color: var(--color-canvas);
        }
        .zapier-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .zapier-table th {
          text-align: left;
          padding: 10px 14px;
          background-color: var(--color-canvas-soft);
          color: var(--color-body);
          border-bottom: 1px solid var(--color-card-border);
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .zapier-table td {
          padding: 12px 14px;
          border-bottom: 1px solid var(--color-card-border);
          color: var(--color-ink-mid);
        }
        .zapier-table tr:last-child td {
          border-bottom: none;
        }
        .dir-cell {
          font-weight: 700;
          color: var(--color-ink);
        }
        .row-mismatch {
          background-color: var(--color-yellow-soft);
        }
        .sync-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: var(--radius-pill);
        }
        .sync-chip.confirmed {
          background-color: var(--color-green-soft);
          color: var(--color-green);
        }
        .sync-chip.pending {
          background-color: var(--color-yellow-soft);
          color: var(--color-yellow);
        }
      `}</style>
    </div>
  );
}

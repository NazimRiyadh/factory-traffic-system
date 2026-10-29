import React, { useState } from 'react';
import { ShieldAlert, ArrowRight, RotateCcw } from 'lucide-react';
import { submitCommand } from '../api/trafficApi';

export default function ManualControl({ junctionId, mode, onCommandSent }) {
  const [loadingDir, setLoadingDir] = useState(null);
  const [returningAuto, setReturningAuto] = useState(false);
  const [msg, setMsg] = useState(null);

  const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  const isEmergency = mode === 'EMERGENCY';
  const isManual = mode === 'MANUAL';

  const handleManualGreen = async (direction) => {
    setLoadingDir(direction);
    setMsg(null);
    try {
      await submitCommand(junctionId, {
        command: 'MANUAL_GREEN_REQUEST',
        direction,
        admin: 'dispatch_admin',
      });
      setMsg({ type: 'success', text: `Green phase granted for ${direction}. Transition initiated.` });
      if (onCommandSent) onCommandSent();
    } catch (err) {
      setMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to trigger manual green.',
      });
    } finally {
      setLoadingDir(null);
    }
  };

  const handleReturnAutomatic = async () => {
    setReturningAuto(true);
    setMsg(null);
    try {
      await submitCommand(junctionId, {
        command: 'RETURN_TO_AUTOMATIC',
      });
      setMsg({ type: 'success', text: 'Junction returned to automated priority scheduling.' });
      if (onCommandSent) onCommandSent();
    } catch (err) {
      setMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to return to automatic mode.',
      });
    } finally {
      setReturningAuto(false);
    }
  };

  return (
    <div className="zapier-card manual-control-card">
      <div className="control-top-header">
        <div>
          <span className="eyebrow">Dispatch Console</span>
          <h3>Manual Override Controls</h3>
        </div>
        {isManual && <span className="manual-active-badge">MANUAL OVERRIDE ACTIVE</span>}
      </div>

      <p className="control-explanation">
        Operator overrides hold green priority on a specified direction until manually cleared or returned to the automated scheduler.
      </p>

      {isEmergency && (
        <div className="emergency-lockout-note">
          <ShieldAlert size={16} />
          <span>Manual commands are prohibited during an active emergency vehicle passage.</span>
        </div>
      )}

      <div className="directional-actions-grid">
        {directions.map((dir) => (
          <button
            key={dir}
            className="btn-tertiary dir-override-btn"
            disabled={isEmergency || loadingDir !== null || returningAuto}
            onClick={() => handleManualGreen(dir)}
          >
            <span>Force {dir} GREEN</span>
            <ArrowRight size={14} />
          </button>
        ))}
      </div>

      <div className="return-auto-wrapper">
        <button
          className={`btn-primary full-width-btn ${!isManual ? 'disabled-neutral' : ''}`}
          disabled={isEmergency || mode === 'AUTOMATIC' || returningAuto}
          onClick={handleReturnAutomatic}
        >
          <RotateCcw size={15} />
          <span>{returningAuto ? 'Switching...' : 'Return to Automated Scheduling'}</span>
        </button>
      </div>

      {msg && (
        <div className={`control-status-msg ${msg.type}`}>
          {msg.text}
        </div>
      )}

      <style>{`
        .manual-control-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .control-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 8px;
        }
        .control-top-header h3 {
          font-size: 20px;
          color: var(--color-ink);
          margin-top: 4px;
        }
        .control-explanation {
          font-size: 14px;
          color: var(--color-body);
          line-height: 1.5;
        }
        .manual-active-badge {
          background-color: var(--color-yellow-soft);
          color: var(--color-yellow);
          border: 1px solid var(--color-yellow-border);
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
        }
        .emergency-lockout-note {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--color-red-soft);
          border: 1px solid var(--color-red-border);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          color: var(--color-red);
          font-size: 13px;
        }
        .directional-actions-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .dir-override-btn {
          justify-content: space-between;
          background-color: var(--color-canvas);
          border-color: var(--color-card-border);
          color: var(--color-ink);
          font-size: 13.5px;
          padding: 10px 14px;
        }
        .return-auto-wrapper {
          border-top: 1px solid var(--color-card-border);
          padding-top: 16px;
        }
        .full-width-btn {
          width: 100%;
        }
        .disabled-neutral {
          background-color: #eee9e2 !important;
          color: var(--color-body-mid) !important;
          cursor: not-allowed;
        }
        .control-status-msg {
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 13.5px;
        }
        .control-status-msg.success {
          background-color: var(--color-green-soft);
          color: var(--color-green);
          border: 1px solid var(--color-green-border);
        }
        .control-status-msg.error {
          background-color: var(--color-red-soft);
          color: var(--color-red);
          border: 1px solid var(--color-red-border);
        }
      `}</style>
    </div>
  );
}

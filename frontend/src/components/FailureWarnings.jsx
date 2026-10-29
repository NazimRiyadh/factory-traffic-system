import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export default function FailureWarnings({ controllerStatus, hasSignalMismatch, transition }) {
  const warnings = [];

  if (controllerStatus === 'OFFLINE') {
    warnings.push({
      id: 'controller-offline',
      title: 'Controller Offline',
      message: 'Hardware traffic light controller is unreachable. System running in DEGRADED failsafe mode.',
      severity: 'critical'
    });
  } else if (controllerStatus === 'DEGRADED') {
    warnings.push({
      id: 'controller-degraded',
      title: 'Controller Degraded (Command Timeout)',
      message: 'Controller commands have timed out without acknowledgement. Hardware state may lag behind backend.',
      severity: 'warning'
    });
  }

  if (hasSignalMismatch) {
    warnings.push({
      id: 'signal-mismatch',
      title: 'Signal State Discrepancy Detected',
      message: 'Actual physical signal states differ from desired backend states. Pending controller confirmation.',
      severity: 'warning'
    });
  }

  if (transition?.isTransitioning) {
    warnings.push({
      id: 'transition-active',
      title: 'Phase Transition in Progress',
      message: `Safely transitioning from ${transition.currentPhase} to ${transition.targetPhase} (Reason: ${transition.reason}).`,
      severity: 'info'
    });
  }

  if (warnings.length === 0) {
    return (
      <div className="zapier-status-nominal">
        <CheckCircle size={16} color="#1a7f37" />
        <span>All systems operational. Roadside hardware controller confirmed ONLINE and in sync.</span>
        <style>{`
          .zapier-status-nominal {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            background-color: var(--color-green-soft);
            border: 1px solid var(--color-green-border);
            border-radius: var(--radius-md);
            color: var(--color-green);
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 20px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="zapier-warnings-stack">
      {warnings.map((w) => (
        <div key={w.id} className={`warning-box ${w.severity}`}>
          <div className="warning-icon-wrap">
            {w.severity === 'info' ? <Info size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div className="warning-copy">
            <div className="warning-title">{w.title}</div>
            <div className="warning-detail">{w.message}</div>
          </div>
        </div>
      ))}

      <style>{`
        .zapier-warnings-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }
        .warning-box {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 18px;
          border-radius: var(--radius-md);
          font-size: 14px;
        }
        .warning-box.critical {
          background-color: var(--color-red-soft);
          border: 1px solid var(--color-red-border);
          color: var(--color-red);
        }
        .warning-box.warning {
          background-color: var(--color-yellow-soft);
          border: 1px solid var(--color-yellow-border);
          color: var(--color-yellow);
        }
        .warning-box.info {
          background-color: #f0f7ff;
          border: 1px solid #cce3ff;
          color: #0369a1;
        }
        .warning-icon-wrap {
          margin-top: 1px;
          flex-shrink: 0;
        }
        .warning-title {
          font-weight: 700;
          color: inherit;
        }
        .warning-detail {
          margin-top: 2px;
          color: var(--color-ink-mid);
          font-size: 13.5px;
        }
      `}</style>
    </div>
  );
}

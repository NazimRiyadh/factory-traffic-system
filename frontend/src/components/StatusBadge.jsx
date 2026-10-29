import React from 'react';

export default function StatusBadge({ value, label }) {
  let badgeStyle = 'badge-neutral';
  const val = (value || label || '').toUpperCase();

  switch (val) {
    case 'AUTOMATIC':
    case 'ONLINE':
    case 'GREEN':
      badgeStyle = 'badge-green';
      break;
    case 'YELLOW':
    case 'MANUAL':
    case 'PENDING':
    case 'SENT':
      badgeStyle = 'badge-amber';
      break;
    case 'RED':
    case 'EMERGENCY':
    case 'OFFLINE':
    case 'FAILED':
    case 'TIMEOUT':
      badgeStyle = 'badge-red';
      break;
    case 'DEGRADED':
      badgeStyle = 'badge-dark';
      break;
    default:
      badgeStyle = 'badge-neutral';
  }

  return (
    <span className={`zapier-status-pill ${badgeStyle}`}>
      <span className="pill-dot" />
      <span className="pill-label">{label || value}</span>
      <style>{`
        .zapier-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2px;
          border: 1px solid transparent;
          font-family: var(--font-sans);
        }
        .pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .badge-green {
          background-color: var(--color-green-soft);
          color: var(--color-green);
          border-color: var(--color-green-border);
        }
        .badge-green .pill-dot {
          background-color: var(--color-green);
        }
        .badge-amber {
          background-color: var(--color-yellow-soft);
          color: var(--color-yellow);
          border-color: var(--color-yellow-border);
        }
        .badge-amber .pill-dot {
          background-color: var(--color-yellow);
        }
        .badge-red {
          background-color: var(--color-red-soft);
          color: var(--color-red);
          border-color: var(--color-red-border);
        }
        .badge-red .pill-dot {
          background-color: var(--color-red);
        }
        .badge-dark {
          background-color: #f1ede8;
          color: var(--color-ink);
          border-color: var(--color-mute);
        }
        .badge-dark .pill-dot {
          background-color: var(--color-ink);
        }
        .badge-neutral {
          background-color: var(--color-canvas-soft);
          color: var(--color-body);
          border-color: var(--color-card-border);
        }
        .badge-neutral .pill-dot {
          background-color: var(--color-body-mid);
        }
      `}</style>
    </span>
  );
}

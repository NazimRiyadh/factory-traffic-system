import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function EmergencyBanner({ emergencyDirection, emergencyStartedAt, emergencyQueue = [] }) {
  const queuedItems = Array.isArray(emergencyQueue) ? emergencyQueue : [];

  return (
    <div className="zapier-emergency-banner">
      <div className="banner-left">
        <div className="alert-circle-icon">
          <AlertCircle size={20} color="#c5221f" />
        </div>
        <div>
          <div className="banner-heading">Active Emergency Vehicle Preemption</div>
          <div className="banner-subtext">
            Emergency approaching from <strong>{emergencyDirection || 'UNKNOWN'}</strong>.
            Conflicting roadway phases are held RED until the lane clears.
          </div>
          {queuedItems.length > 0 && (
            <div className="banner-queue-note">
              <span>Arbitration Queue ({queuedItems.length} waiting):</span>{' '}
              {queuedItems.map((e, idx) => (
                <span key={idx} className="queued-tag">
                  {e.direction} ({e.vehicle_id})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {emergencyStartedAt && (
        <div className="banner-time-tag">
          Started: {new Date(emergencyStartedAt).toLocaleTimeString()}
        </div>
      )}

      <style>{`
        .zapier-emergency-banner {
          background-color: var(--color-red-soft);
          border: 1px solid var(--color-red-border);
          border-radius: var(--radius-md);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .alert-circle-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fee2e2;
          width: 38px;
          height: 38px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .banner-heading {
          font-weight: 700;
          color: var(--color-red);
          font-size: 15px;
          letter-spacing: -0.2px;
        }
        .banner-subtext {
          font-size: 14px;
          color: var(--color-ink-mid);
          margin-top: 2px;
        }
        .banner-subtext strong {
          color: var(--color-ink);
        }
        .banner-queue-note {
          margin-top: 6px;
          font-size: 12.5px;
          color: var(--color-ink);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .queued-tag {
          background-color: #fca5a5;
          color: #7f1d1d;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .banner-time-tag {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--color-red);
          background-color: #fee2e2;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

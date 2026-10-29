import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function EmergencyBanner({ emergencyDirection, emergencyStartedAt }) {
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

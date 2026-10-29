import React from "react";

export default function ActivityLog({ history = [] }) {
  const safeHistory = Array.isArray(history) ? history : [];

  const getEventTagStyle = (eventType) => {
    switch (eventType) {
      case "VEHICLE_DETECTED":
      case "CONTROLLER_ACK":
        return "tag-green";
      case "VEHICLE_CLEARED":
      case "PHASE_CHANGED":
        return "tag-blue";
      case "SIGNAL_TRANSITION_STARTED":
      case "SIGNAL_STATE_REQUESTED":
        return "tag-amber";
      case "EMERGENCY_DETECTED":
      case "SAFETY_VIOLATION_PREVENTED":
        return "tag-red";
      case "MANUAL_OVERRIDE_ACTIVATED":
        return "tag-purple";
      case "CONTROLLER_TIMEOUT":
      case "CONTROLLER_FAILURE":
        return "tag-orange";
      default:
        return "tag-neutral";
    }
  };

  return (
    <div className="zapier-card activity-log-card">
      <div className="log-top-header">
        <div>
          <span className="eyebrow">Audit & Compliance</span>
          <h3>Event History Stream</h3>
        </div>
        <span className="log-count-pill">
          {safeHistory.length} events logged
        </span>
      </div>

      <div className="log-scroll-view">
        {safeHistory.length === 0 ? (
          <div className="empty-log-state">
            No events recorded in this session.
          </div>
        ) : (
          safeHistory.slice(0, 40).map((item) => (
            <div key={item.id} className="log-row">
              <span className="log-time font-mono">
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`log-event-badge ${getEventTagStyle(item.event_type)}`}
              >
                {item.event_type}
              </span>
              {item.direction && (
                <span className="log-dir-chip font-mono">{item.direction}</span>
              )}
              <span className="log-json-text font-mono">
                {item.details ? JSON.stringify(item.details) : "—"}
              </span>
            </div>
          ))
        )}
      </div>

      <style>{`
        .activity-log-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .log-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .log-top-header h3 {
          font-size: 20px;
          color: var(--color-ink);
          margin-top: 4px;
        }
        .log-count-pill {
          font-size: 12px;
          color: var(--color-body);
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-weight: 500;
        }
        .log-scroll-view {
          max-height: 400px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 4px;
        }
        .log-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
          font-size: 13px;
        }
        .log-time {
          color: var(--color-body-mid);
          font-size: 11.5px;
          white-space: nowrap;
        }
        .log-event-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: var(--radius-pill);
          white-space: nowrap;
          letter-spacing: 0.2px;
        }
        .tag-green { background-color: var(--color-green-soft); color: var(--color-green); }
        .tag-blue { background-color: #f0f7ff; color: #0369a1; }
        .tag-amber { background-color: var(--color-yellow-soft); color: var(--color-yellow); }
        .tag-red { background-color: var(--color-red-soft); color: var(--color-red); }
        .tag-orange { background-color: #fff3ec; color: var(--color-primary); }
        .tag-purple { background-color: #f5f3ff; color: #6d28d9; }
        .tag-neutral { background-color: var(--color-canvas-soft); color: var(--color-body); }

        .log-dir-chip {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          color: var(--color-ink);
          font-size: 11px;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .log-json-text {
          color: var(--color-body);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }
        .empty-log-state {
          text-align: center;
          padding: 30px;
          color: var(--color-body-mid);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

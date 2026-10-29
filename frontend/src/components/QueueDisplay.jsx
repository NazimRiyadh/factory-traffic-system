import React from 'react';
import { Clock } from 'lucide-react';

export default function QueueDisplay({ queues = {} }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  const maxQueueLimit = 10;
  const safeQueues = queues || {};

  return (
    <div className="zapier-card queue-overview-card">
      <div className="queue-top-header">
        <div>
          <span className="eyebrow">Approach Load</span>
          <h3>Lane Vehicle Queues</h3>
        </div>
        <span className="queue-hint">Capacity: 10 vehicles/lane</span>
      </div>

      <div className="zapier-queues-grid">
        {directions.map((dir) => {
          const q = safeQueues[dir] || { vehicle_count: 0, vehicles: [] };
          const count = q.vehicle_count || 0;
          const percentage = Math.min(100, Math.round((count / maxQueueLimit) * 100));

          let isStarving = false;
          let waitSeconds = 0;
          if (q.first_vehicle_at) {
            waitSeconds = Math.max(0, Math.round((now - new Date(q.first_vehicle_at).getTime()) / 1000));
            if (waitSeconds >= 60) {
              isStarving = true;
            }
          }

          return (
            <div key={dir} className={`queue-metric-box ${isStarving ? 'box-starving' : ''}`}>
              <div className="box-header">
                <span className="lane-name font-mono">{dir}</span>
                <span className="lane-qty">{count}</span>
              </div>

              {/* Progress bar */}
              <div className="meter-rail">
                <div
                  className="meter-fill"
                  style={{
                    width: `${Math.max(count > 0 ? 10 : 0, percentage)}%`,
                    backgroundColor: isStarving ? 'var(--color-yellow)' : 'var(--color-primary)'
                  }}
                />
              </div>

              <div className="box-footer">
                {count > 0 && q.first_vehicle_at ? (
                  <span className={`wait-pill ${isStarving ? 'starving-pill' : ''}`}>
                    <Clock size={12} /> {waitSeconds}s waiting
                  </span>
                ) : (
                  <span className="lane-idle">Clear</span>
                )}
                {isStarving && <span className="starvation-notice">Priority Boost</span>}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .queue-overview-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .queue-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .queue-top-header h3 {
          font-size: 20px;
          color: var(--color-ink);
          margin-top: 4px;
        }
        .queue-hint {
          font-size: 13px;
          color: var(--color-body-mid);
        }
        .zapier-queues-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        .queue-metric-box {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .queue-metric-box.box-starving {
          border-color: var(--color-yellow-border);
          background-color: var(--color-yellow-soft);
        }
        .box-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .lane-name {
          font-size: 12px;
          font-weight: 700;
          color: var(--color-body);
        }
        .lane-qty {
          font-size: 24px;
          font-weight: 700;
          color: var(--color-ink);
          font-family: var(--font-sans);
          line-height: 1;
        }
        .meter-rail {
          height: 6px;
          width: 100%;
          background-color: var(--color-canvas-soft);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }
        .meter-fill {
          height: 100%;
          border-radius: var(--radius-pill);
          transition: width 0.3s ease;
        }
        .box-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
        .wait-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--color-body);
          font-weight: 500;
        }
        .wait-pill.starving-pill {
          color: var(--color-yellow);
          font-weight: 600;
        }
        .starvation-notice {
          font-size: 11px;
          font-weight: 700;
          color: var(--color-yellow);
          text-transform: uppercase;
        }
        .lane-idle {
          color: var(--color-mute);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

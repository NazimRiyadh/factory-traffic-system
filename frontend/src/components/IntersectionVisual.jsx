import React from 'react';

export default function IntersectionVisual({
  signals = {},
  queues = {},
  currentPhase,
  transitioning,
}) {
  const safeSignals = signals || {};
  const safeQueues = queues || {};

  const getLightState = (direction) => {
    return safeSignals[direction]?.desired_state || 'RED';
  };

  const getQueueCount = (direction) => {
    return safeQueues[direction]?.vehicle_count || 0;
  };

  const renderLightHead = (direction) => {
    const state = getLightState(direction);
    return (
      <div className={`signal-housing housing-${direction.toLowerCase()}`}>
        <div className={`bulb bulb-red ${state === 'RED' ? 'active' : ''}`} title="RED" />
        <div className={`bulb bulb-yellow ${state === 'YELLOW' ? 'active' : ''}`} title="YELLOW" />
        <div className={`bulb bulb-green ${state === 'GREEN' ? 'active' : ''}`} title="GREEN" />
      </div>
    );
  };

  return (
    <div className="zapier-card intersection-card">
      <div className="card-top-header">
        <div>
          <span className="eyebrow">Real-Time Visualization</span>
          <h3>Junction Topography</h3>
        </div>
        <div className="phase-pill-tag">
          Active Phase: <strong>{transitioning ? 'CLEARANCE INTERVAL' : currentPhase || 'NORTH_SOUTH'}</strong>
        </div>
      </div>

      <div className="scada-viewport">
        {/* Road Surface */}
        <div className="scada-road-vertical" />
        <div className="scada-road-horizontal" />
        <div className="scada-center-junction" />

        {/* NORTH */}
        <div className="scada-approach scada-north">
          <div className="lane-meta">
            <span className="lane-title">NORTH</span>
            <span className="queue-counter">{getQueueCount('NORTH')} in queue</span>
          </div>
          {renderLightHead('NORTH')}
        </div>

        {/* SOUTH */}
        <div className="scada-approach scada-south">
          {renderLightHead('SOUTH')}
          <div className="lane-meta">
            <span className="lane-title">SOUTH</span>
            <span className="queue-counter">{getQueueCount('SOUTH')} in queue</span>
          </div>
        </div>

        {/* WEST */}
        <div className="scada-approach scada-west">
          <div className="lane-meta">
            <span className="lane-title">WEST</span>
            <span className="queue-counter">{getQueueCount('WEST')} in queue</span>
          </div>
          {renderLightHead('WEST')}
        </div>

        {/* EAST */}
        <div className="scada-approach scada-east">
          {renderLightHead('EAST')}
          <div className="lane-meta">
            <span className="lane-title">EAST</span>
            <span className="queue-counter">{getQueueCount('EAST')} in queue</span>
          </div>
        </div>

        {/* Transitioning notice */}
        {transitioning && (
          <div className="transitioning-badge">
            Safety Clearance Interval
          </div>
        )}
      </div>

      <style>{`
        .intersection-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .card-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .card-top-header h3 {
          font-size: 18px;
          color: var(--color-ink);
          margin-top: 2px;
        }
        .phase-pill-tag {
          font-size: 12px;
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          color: var(--color-body);
          padding: 4px 12px;
          border-radius: var(--radius-pill);
        }
        .phase-pill-tag strong {
          color: var(--color-primary);
        }

        .scada-viewport {
          position: relative;
          width: 100%;
          height: 350px;
          background-color: #f6f3ee;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-card-border);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Roads */
        .scada-road-vertical {
          position: absolute;
          width: 90px;
          height: 100%;
          background-color: #2b2825;
          border-left: 2px dashed rgba(255, 255, 255, 0.3);
          border-right: 2px dashed rgba(255, 255, 255, 0.3);
        }
        .scada-road-horizontal {
          position: absolute;
          width: 100%;
          height: 90px;
          background-color: #2b2825;
          border-top: 2px dashed rgba(255, 255, 255, 0.3);
          border-bottom: 2px dashed rgba(255, 255, 255, 0.3);
        }
        .scada-center-junction {
          position: absolute;
          width: 90px;
          height: 90px;
          background-color: #383430;
          border: 1px solid rgba(255, 255, 255, 0.15);
          z-index: 1;
        }

        /* Signal housings */
        .signal-housing {
          background-color: #171513;
          border: 2px solid #4a453f;
          border-radius: 16px;
          padding: 4px;
          display: flex;
          gap: 4px;
          z-index: 10;
          box-shadow: 0 4px 10px rgba(32, 21, 21, 0.2);
        }
        .housing-north, .housing-south {
          flex-direction: row;
        }
        .housing-east, .housing-west {
          flex-direction: column;
        }
        .bulb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background-color: #38332c;
          transition: background-color 0.2s ease, box-shadow 0.2s ease;
        }
        .bulb-red.active {
          background-color: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.75);
        }
        .bulb-yellow.active {
          background-color: #f59e0b;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.75);
        }
        .bulb-green.active {
          background-color: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.75);
        }

        /* Approach Positions */
        .scada-approach {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 12;
        }
        .scada-north {
          top: 14px;
          flex-direction: column;
        }
        .scada-south {
          bottom: 14px;
          flex-direction: column;
        }
        .scada-west {
          left: 14px;
          flex-direction: row;
        }
        .scada-east {
          right: 14px;
          flex-direction: row;
        }

        .lane-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          background-color: #ffffff;
          border: 1.5px solid var(--color-ink);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
          padding: 4px 12px;
          border-radius: 8px;
          z-index: 15;
        }
        .lane-title {
          font-size: 13px;
          font-weight: 800;
          color: var(--color-primary);
          letter-spacing: 0.8px;
          line-height: 1.1;
        }
        .queue-counter {
          font-size: 11px;
          font-weight: 700;
          background-color: var(--color-canvas-soft);
          color: var(--color-ink);
          border: 1px solid var(--color-border-hairline);
          padding: 1px 7px;
          border-radius: var(--radius-pill);
          white-space: nowrap;
        }

        .transitioning-badge {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background-color: var(--color-yellow-soft);
          border: 1px solid var(--color-yellow-border);
          color: var(--color-yellow);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          z-index: 20;
        }
      `}</style>
    </div>
  );
}

import React from 'react';
import StatusBadge from './StatusBadge';
import { Car, Clock, ShieldCheck, Cpu } from 'lucide-react';

export default function MetricsHeader({ status }) {
  const queues = status?.queues || {};
  const totalVehicles = Object.values(queues).reduce((sum, q) => sum + (q.vehicle_count || 0), 0);

  return (
    <div className="metrics-strip-grid">
      {/* Metric 1: Total Queue */}
      <div className="metric-tile">
        <div className="metric-icon-box">
          <Car size={18} color="var(--color-primary)" />
        </div>
        <div className="metric-content">
          <span className="eyebrow metric-caption">Corridor Load</span>
          <div className="metric-number">
            {totalVehicles} <span className="metric-unit">vehicles</span>
          </div>
        </div>
      </div>

      {/* Metric 2: Active Phase */}
      <div className="metric-tile">
        <div className="metric-icon-box">
          <Clock size={18} color="var(--color-ink)" />
        </div>
        <div className="metric-content">
          <span className="eyebrow metric-caption">Active Phase</span>
          <div className="metric-number">
            {status?.current_phase || 'NORTH_SOUTH'}
          </div>
        </div>
      </div>

      {/* Metric 3: Operating Mode */}
      <div className="metric-tile">
        <div className="metric-icon-box">
          <ShieldCheck size={18} color="var(--color-green)" />
        </div>
        <div className="metric-content">
          <span className="eyebrow metric-caption">Operating Mode</span>
          <div className="metric-badge-wrap">
            <StatusBadge value={status?.mode || 'AUTOMATIC'} />
          </div>
        </div>
      </div>

      {/* Metric 4: Hardware Link */}
      <div className="metric-tile">
        <div className="metric-icon-box">
          <Cpu size={18} color="var(--color-body)" />
        </div>
        <div className="metric-content">
          <span className="eyebrow metric-caption">Roadside Controller</span>
          <div className="metric-badge-wrap">
            <StatusBadge value={status?.controller_status || 'ONLINE'} />
          </div>
        </div>
      </div>

      <style>{`
        .metrics-strip-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        @media (max-width: 1100px) {
          .metrics-strip-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .metrics-strip-grid {
            grid-template-columns: 1fr;
          }
        }

        .metric-tile {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .metric-icon-box {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          width: 42px;
          height: 42px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .metric-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-caption {
          font-size: 11px;
        }

        .metric-number {
          font-size: 18px;
          font-weight: 700;
          color: var(--color-ink);
          letter-spacing: -0.3px;
          line-height: 1.2;
        }

        .metric-unit {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-body);
        }

        .metric-badge-wrap {
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

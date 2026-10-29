import React from 'react';
import { LayoutDashboard, Sliders, History, ShieldCheck, Activity, Cpu } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, junctionId, setJunctionId, controllerStatus }) {
  const navItems = [
    { id: 'operations', label: 'Live Operations', icon: LayoutDashboard },
    { id: 'simulator', label: 'Simulation Bench', icon: Sliders },
    { id: 'audit', label: 'Audit Trail', icon: History },
    { id: 'system', label: 'Safety & Timing Rules', icon: ShieldCheck },
  ];

  return (
    <aside className="app-shell-sidebar">
      {/* Brand & Junction Lockup */}
      <div className="sidebar-brand">
        <div className="brand-logo-mark">
          <Activity size={20} color="var(--color-primary)" />
        </div>
        <div>
          <div className="brand-product-name">Factory Traffic OS</div>
          <div className="brand-junction-tag">Industrial Corridor A</div>
        </div>
      </div>

      {/* Junction Selector Dropdown */}
      <div className="junction-selector-container">
        <label className="eyebrow selector-label">Monitored Junction</label>
        <select
          value={junctionId}
          onChange={(e) => setJunctionId(e.target.value)}
          className="junction-select"
        >
          <option value="A">Junction A (Main Crossway)</option>
        </select>
      </div>

      {/* Main Navigation - ex-app-shell-row from DESIGN.md */}
      <nav className="sidebar-navigation">
        <div className="eyebrow nav-section-title">Operations Console</div>
        <div className="nav-items-stack">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`app-shell-row ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} className="row-icon" />
                <span className="row-label">{item.label}</span>
                {isActive && <span className="active-pill-dot" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Footer: Hardware Status Card */}
      <div className="sidebar-footer-card">
        <div className="footer-status-row">
          <div className="hardware-icon-wrap">
            <Cpu size={15} color={controllerStatus === 'ONLINE' ? 'var(--color-green)' : 'var(--color-yellow)'} />
          </div>
          <div>
            <div className="hardware-label">PLC Controller Link</div>
            <div className="hardware-value">
              <span className={`status-indicator-dot ${controllerStatus === 'ONLINE' ? 'dot-online' : 'dot-warn'}`} />
              {controllerStatus || 'ONLINE'} (0ms)
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .app-shell-sidebar {
          width: 260px;
          min-width: 260px;
          background-color: var(--color-canvas);
          border-right: 1px solid var(--color-card-border);
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: sticky;
          top: 0;
          z-index: 50;
          padding: 24px 16px 20px 16px;
          gap: 24px;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 4px;
        }

        .brand-logo-mark {
          background-color: var(--color-primary-soft);
          border: 1px solid #ffd4bf;
          width: 38px;
          height: 38px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .brand-product-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--color-ink);
          letter-spacing: -0.2px;
          line-height: 1.2;
        }

        .brand-junction-tag {
          font-size: 12px;
          color: var(--color-body);
        }

        .junction-selector-container {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .selector-label {
          font-size: 11px;
        }

        .junction-select {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          color: var(--color-ink);
          padding: 6px 8px;
          outline: none;
          width: 100%;
        }

        .sidebar-navigation {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex: 1;
        }

        .nav-section-title {
          padding-left: 8px;
          font-size: 11px;
        }

        .nav-items-stack {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* ex-app-shell-row from DESIGN.md */
        .app-shell-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: transparent;
          border: none;
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          color: var(--color-body);
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: all 0.15s ease;
          width: 100%;
          text-align: left;
        }

        .app-shell-row:hover {
          background-color: var(--color-canvas-soft);
          color: var(--color-ink);
        }

        .app-shell-row.active {
          background-color: var(--color-canvas-soft);
          color: var(--color-ink);
          font-weight: 600;
        }

        .app-shell-row.active .row-icon {
          color: var(--color-primary);
        }

        .app-shell-row.active .active-pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--color-primary);
          margin-left: auto;
        }

        .sidebar-footer-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 12px 14px;
        }

        .footer-status-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hardware-icon-wrap {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          width: 30px;
          height: 30px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .hardware-label {
          font-size: 11px;
          color: var(--color-body);
          font-weight: 500;
        }

        .hardware-value {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-ink);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-indicator-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .dot-online {
          background-color: var(--color-green);
        }

        .dot-warn {
          background-color: var(--color-yellow);
        }
      `}</style>
    </aside>
  );
}

import React, { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getJunctionStatus, getJunctionHistory, simulateAck, submitCommand } from '../api/trafficApi';

import Sidebar from './Sidebar';
import MetricsHeader from './MetricsHeader';
import LiveOperationsView from './LiveOperationsView';
import SimulationBenchView from './SimulationBenchView';
import AuditTrailView from './AuditTrailView';
import SystemRulesView from './SystemRulesView';

import { RefreshCw, RotateCcw, AlertOctagon } from 'lucide-react';

export default function Dashboard() {
  const [junctionId, setJunctionId] = useState('A');
  const [activeTab, setActiveTab] = useState('operations');
  const [isSimulatingAck, setIsSimulatingAck] = useState(false);
  const [isDispatchingQuickAction, setIsDispatchingQuickAction] = useState(false);

  const fetchStatus = React.useCallback(() => getJunctionStatus(junctionId), [junctionId]);
  const fetchHistory = React.useCallback(() => getJunctionHistory(junctionId, 60), [junctionId]);

  // Poll junction status every 1500ms
  const { data: status, error: statusError, refetch: refetchStatus } = usePolling(fetchStatus, 1500);

  // Poll history every 2500ms
  const { data: rawHistory, refetch: refetchHistory } = usePolling(fetchHistory, 2500);
  const history = Array.isArray(rawHistory) ? rawHistory : [];

  const handleSimulateAck = async () => {
    setIsSimulatingAck(true);
    try {
      await simulateAck(junctionId);
      refetchStatus();
      refetchHistory();
    } catch (err) {
      console.error('Simulate ACK error:', err);
    } finally {
      setIsSimulatingAck(false);
    }
  };

  const handleReturnToAuto = async () => {
    setIsDispatchingQuickAction(true);
    try {
      await submitCommand(junctionId, { command: 'RETURN_TO_AUTOMATIC' });
      refetchStatus();
      refetchHistory();
    } catch (err) {
      console.error('Return to auto failed:', err);
    } finally {
      setIsDispatchingQuickAction(false);
    }
  };

  const handleDataChanged = () => {
    refetchStatus();
    refetchHistory();
  };

  const getTabBreadcrumb = () => {
    switch (activeTab) {
      case 'simulator': return 'Simulation & Test Bench';
      case 'audit': return 'Verifiable Audit Trail';
      case 'system': return 'Safety & Timing Invariants';
      default: return 'Live Operational Dispatch';
    }
  };

  return (
    <div className="industry-app-shell">
      {/* 1. Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        junctionId={junctionId}
        setJunctionId={setJunctionId}
        controllerStatus={status?.controller_status}
      />

      {/* 2. Main Workstation Area */}
      <div className="app-shell-main">
        {/* Global Operational Header Bar */}
        <header className="shell-top-bar">
          <div className="breadcrumb-box">
            <span className="breadcrumb-root">Junction A</span>
            <span className="breadcrumb-divider">/</span>
            <span className="breadcrumb-current">{getTabBreadcrumb()}</span>
          </div>

          <div className="header-quick-actions">
            {status?.mode === 'MANUAL' && (
              <button
                className="btn-primary quick-return-btn"
                onClick={handleReturnToAuto}
                disabled={isDispatchingQuickAction}
              >
                <RotateCcw size={13} />
                <span>Return to Auto</span>
              </button>
            )}

            <button
              className="btn-tertiary reload-btn"
              onClick={handleDataChanged}
              title="Refresh telemetry"
            >
              <RefreshCw size={13} />
              <span>Sync</span>
            </button>
          </div>
        </header>

        {/* Scrollable View Container */}
        <div className="shell-scroll-content">
          {statusError && (
            <div className="global-error-notice">
              ⚠️ Link connection interrupted: {statusError}. Retrying in background...
            </div>
          )}

          {/* Top KPI Metric Strip */}
          <MetricsHeader status={status} />

          {/* Active View Switching */}
          {activeTab === 'operations' && (
            <LiveOperationsView
              status={status}
              junctionId={junctionId}
              isSimulatingAck={isSimulatingAck}
              onSimulateAck={handleSimulateAck}
              onCommandSent={handleDataChanged}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulationBenchView
              junctionId={junctionId}
              status={status}
              onEventSimulated={handleDataChanged}
            />
          )}

          {activeTab === 'audit' && (
            <AuditTrailView
              history={history}
              onRefresh={handleDataChanged}
            />
          )}

          {activeTab === 'system' && (
            <SystemRulesView />
          )}
        </div>
      </div>

      <style>{`
        .industry-app-shell {
          display: flex;
          min-height: 100vh;
          background-color: var(--color-canvas);
          color: var(--color-ink);
        }

        .app-shell-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100vh;
          overflow: hidden;
        }

        .shell-top-bar {
          height: 60px;
          min-height: 60px;
          background-color: var(--color-canvas);
          border-bottom: 1px solid var(--color-card-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          z-index: 40;
        }

        .breadcrumb-box {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .breadcrumb-root {
          color: var(--color-body);
          font-weight: 500;
        }

        .breadcrumb-divider {
          color: var(--color-mute);
        }

        .breadcrumb-current {
          color: var(--color-ink);
          font-weight: 600;
        }

        .header-quick-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .quick-return-btn {
          font-size: 13px;
          padding: 6px 14px;
        }

        .reload-btn {
          font-size: 13px;
          padding: 6px 12px;
        }

        .shell-scroll-content {
          flex: 1;
          overflow-y: auto;
          padding: 28px 32px 48px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .global-error-notice {
          background-color: var(--color-red-soft);
          border: 1px solid var(--color-red-border);
          color: var(--color-red);
          padding: 12px 18px;
          border-radius: var(--radius-md);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

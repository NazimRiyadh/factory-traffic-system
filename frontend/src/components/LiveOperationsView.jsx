import React from 'react';
import IntersectionVisual from './IntersectionVisual';
import SignalStatus from './SignalStatus';
import QueueDisplay from './QueueDisplay';
import ManualControl from './ManualControl';
import EmergencyBanner from './EmergencyBanner';
import FailureWarnings from './FailureWarnings';

export default function LiveOperationsView({
  status,
  junctionId,
  isSimulatingAck,
  onSimulateAck,
  onCommandSent,
}) {
  return (
    <div className="live-ops-container">
      {/* Emergency Banner Alert */}
      {status?.mode === 'EMERGENCY' && (
        <EmergencyBanner
          emergencyDirection={status.emergency_direction}
          emergencyStartedAt={status.emergency_started_at}
        />
      )}

      {/* Failure / Warning Notification */}
      {status && (
        <FailureWarnings
          controllerStatus={status.controller_status}
          hasSignalMismatch={status.hasSignalMismatch}
          transition={status.transition}
        />
      )}

      {/* Operations Grid: Visualizer & Controls on Left, Hardware Telemetry & Queues on Right */}
      <div className="ops-split-grid">
        {/* Left Column: Visualizer + Dispatch Console directly under it */}
        <div className="ops-col visual-col">
          <IntersectionVisual
            signals={status?.signals || {}}
            queues={status?.queues || {}}
            currentPhase={status?.current_phase}
            transitioning={status?.transition?.isTransitioning}
            transition={status?.transition}
            junctionId={junctionId}
            mode={status?.mode}
            onEventTriggered={onCommandSent}
          />

          <ManualControl
            junctionId={junctionId}
            mode={status?.mode}
            onCommandSent={onCommandSent}
          />
        </div>

        {/* Right Column: Hardware Telemetry and Lane Approach Queues */}
        <div className="ops-col telemetry-col">
          <SignalStatus
            signals={status?.signals || {}}
            onSimulateAck={onSimulateAck}
            isSimulatingAck={isSimulatingAck}
          />

          <QueueDisplay
            queues={status?.queues || {}}
          />
        </div>
      </div>

      <style>{`
        .live-ops-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .ops-split-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 24px;
        }

        @media (max-width: 1100px) {
          .ops-split-grid {
            grid-template-columns: 1fr;
          }
        }

        .ops-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
      `}</style>
    </div>
  );
}

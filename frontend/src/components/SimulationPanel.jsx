import React, { useState } from 'react';
import { Send, Zap, Radio } from 'lucide-react';
import { submitSensorEvent, submitControllerEvent, simulateAck } from '../api/trafficApi';

export default function SimulationPanel({ junctionId, onEventSimulated }) {
  const [eventType, setEventType] = useState('VEHICLE_ARRIVED');
  const [direction, setDirection] = useState('NORTH');
  const [vehicleType, setVehicleType] = useState('TRUCK');
  const [vehicleId, setVehicleId] = useState('');
  const [isSubmittingSensor, setIsSubmittingSensor] = useState(false);
  const [sensorFeedback, setSensorFeedback] = useState(null);

  const [controllerStatus, setControllerStatus] = useState('ACK');
  const [controllerDirection, setControllerDirection] = useState('NORTH');
  const [controllerState, setControllerState] = useState('GREEN');
  const [commandId, setCommandId] = useState('');
  const [isSubmittingController, setIsSubmittingController] = useState(false);
  const [controllerFeedback, setControllerFeedback] = useState(null);

  const handleSendSensorEvent = async (overrideData = null) => {
    setIsSubmittingSensor(true);
    setSensorFeedback(null);

    const generatedId = `vh_${vehicleType.toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const eventPayload = overrideData || {
      event_id: `sim_evt_${Date.now()}`,
      junction_id: junctionId,
      direction,
      event_type: eventType,
      vehicle_id: vehicleId.trim() || generatedId,
      vehicle_type: vehicleType,
      timestamp: new Date().toISOString()
    };

    try {
      const res = await submitSensorEvent(eventPayload);
      setSensorFeedback({
        type: 'success',
        text: `[${res.data.status}] ${res.data.message || 'Event processed'} (ID: ${eventPayload.event_id})`
      });
      if (!overrideData) setVehicleId('');
      if (onEventSimulated) onEventSimulated();
    } catch (err) {
      setSensorFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Event submission failed'
      });
    } finally {
      setIsSubmittingSensor(false);
    }
  };

  const handleSendControllerEvent = async () => {
    setIsSubmittingController(true);
    setControllerFeedback(null);

    try {
      if (controllerStatus === 'ACK') {
        if (!commandId.trim()) {
          // Acknowledge all active pending transitions cleanly
          const res = await simulateAck(junctionId);
          setControllerFeedback({
            type: 'success',
            text: res.data.message || 'Successfully synchronized hardware state'
          });
        } else {
          // Specific command ID requested (tests validation & rejection)
          const eventPayload = {
            command_id: commandId.trim(),
            junction_id: junctionId,
            direction: controllerDirection,
            status: 'ACK',
            actual_state: controllerState
          };
          await submitControllerEvent(eventPayload);
          setControllerFeedback({
            type: 'success',
            text: `Hardware ACK confirmed for command '${commandId.trim()}'`
          });
        }
      } else if (controllerStatus === 'OFFLINE' || controllerStatus === 'ONLINE') {
        await submitControllerEvent({
          junction_id: junctionId,
          status: controllerStatus
        });
        setControllerFeedback({
          type: 'success',
          text: `Roadside controller transitioned to ${controllerStatus}`
        });
      } else {
        // NACK / FAILED
        const eventPayload = {
          junction_id: junctionId,
          status: controllerStatus,
          direction: controllerDirection,
          actual_state: controllerState,
          ...(commandId.trim() ? { command_id: commandId.trim() } : {})
        };
        await submitControllerEvent(eventPayload);
        setControllerFeedback({
          type: 'success',
          text: `Controller event registered: ${controllerStatus}`
        });
      }
      if (onEventSimulated) onEventSimulated();
    } catch (err) {
      setControllerFeedback({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Controller event failed'
      });
    } finally {
      setIsSubmittingController(false);
    }
  };

  const triggerEmergencyPreset = () => {
    handleSendSensorEvent({
      event_id: `evt_emergency_east_${Date.now()}`,
      junction_id: junctionId,
      direction: 'EAST',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: 'amb_east_01',
      vehicle_type: 'EMERGENCY',
      timestamp: new Date().toISOString()
    });
  };

  const triggerSecondEmergencyPreset = () => {
    handleSendSensorEvent({
      event_id: `evt_emergency_north_${Date.now()}`,
      junction_id: junctionId,
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: 'amb_north_02',
      vehicle_type: 'EMERGENCY',
      timestamp: new Date().toISOString()
    });
  };

  const triggerClearEmergencyPreset = () => {
    handleSendSensorEvent({
      event_id: `evt_clear_east_${Date.now()}`,
      junction_id: junctionId,
      direction: 'EAST',
      event_type: 'VEHICLE_CLEARED',
      vehicle_id: 'amb_east_01',
      vehicle_type: 'EMERGENCY',
      timestamp: new Date().toISOString()
    });
  };

  const triggerDuplicatePreset = () => {
    const staticId = 'fixed_dup_event_001';
    handleSendSensorEvent({
      event_id: staticId,
      junction_id: junctionId,
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: 'vh_truck_dup',
      vehicle_type: 'TRUCK',
      timestamp: new Date().toISOString()
    });
  };

  return (
    <div className="zapier-card simulation-card">
      <div className="sim-top-header">
        <div>
          <span className="eyebrow">Testing & Evaluation</span>
          <h3>Interactive System Bench</h3>
        </div>
        <div className="presets-group">
          <span className="presets-label">Quick Presets:</span>
          <button className="btn-tertiary preset-btn-emergency" onClick={triggerEmergencyPreset}>
            🚨 Ambulance EAST
          </button>
          <button className="btn-tertiary preset-btn-emergency" onClick={triggerSecondEmergencyPreset} title="Test multi-emergency queuing">
            🚨 Firetruck NORTH
          </button>
          <button className="btn-tertiary preset-btn" onClick={triggerClearEmergencyPreset} title="Clear EAST emergency vehicle">
            🚑 Clear EAST
          </button>
          <button className="btn-tertiary preset-btn" onClick={triggerDuplicatePreset}>
            🔁 Duplicate Test
          </button>
        </div>
      </div>

      <div className="sim-dual-grid">
        {/* Sensor Event Ingestion */}
        <div className="sim-panel-subcard">
          <div className="subcard-title">
            <Radio size={16} color="var(--color-primary)" />
            <h4>Simulate Roadway Sensor Event</h4>
          </div>

          <div className="field-group">
            <label>Event Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="VEHICLE_ARRIVED">VEHICLE_ARRIVED</option>
              <option value="VEHICLE_CLEARED">VEHICLE_CLEARED</option>
            </select>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label>Approach Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="NORTH">NORTH</option>
                <option value="SOUTH">SOUTH</option>
                <option value="EAST">EAST</option>
                <option value="WEST">WEST</option>
              </select>
            </div>
            <div className="field-group">
              <label>Vehicle Classification</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="TRUCK">TRUCK</option>
                <option value="FORKLIFT">FORKLIFT</option>
                <option value="EMPLOYEE_VEHICLE">EMPLOYEE</option>
                <option value="EMERGENCY">EMERGENCY</option>
              </select>
            </div>
          </div>

          <div className="field-group">
            <label>Vehicle Identifier (optional)</label>
            <input
              type="text"
              placeholder="e.g. TRK-201 (auto if empty)"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            />
          </div>

          <button
            className="btn-primary form-submit-btn"
            onClick={() => handleSendSensorEvent()}
            disabled={isSubmittingSensor}
          >
            <Send size={15} />
            <span>{isSubmittingSensor ? 'Injecting...' : 'Dispatch Sensor Event'}</span>
          </button>

          {sensorFeedback && (
            <div className={`sim-note ${sensorFeedback.type}`}>
              {sensorFeedback.text}
            </div>
          )}
        </div>

        {/* Controller Hardware Simulator */}
        <div className="sim-panel-subcard">
          <div className="subcard-title">
            <Zap size={16} color="var(--color-ink)" />
            <h4>Roadside Hardware Telemetry</h4>
          </div>

          <div className="field-group">
            <label>Hardware Status Code</label>
            <select value={controllerStatus} onChange={(e) => setControllerStatus(e.target.value)}>
              <option value="ACK">ACK (Confirm State Synchronization)</option>
              <option value="NACK">NACK (Hardware Conflict Rejection)</option>
              <option value="OFFLINE">OFFLINE (Simulate Hardware Disconnect)</option>
              <option value="ONLINE">ONLINE (Restore Online Link)</option>
            </select>
          </div>

          <div className="field-row">
            <div className="field-group">
              <label>Direction</label>
              <select value={controllerDirection} onChange={(e) => setControllerDirection(e.target.value)}>
                <option value="NORTH">NORTH</option>
                <option value="SOUTH">SOUTH</option>
                <option value="EAST">EAST</option>
                <option value="WEST">WEST</option>
              </select>
            </div>
            <div className="field-group">
              <label>Physical Signal State</label>
              <select value={controllerState} onChange={(e) => setControllerState(e.target.value)}>
                <option value="GREEN">GREEN</option>
                <option value="YELLOW">YELLOW</option>
                <option value="RED">RED</option>
              </select>
            </div>
          </div>

          {(controllerStatus === 'ACK' || controllerStatus === 'NACK') && (
            <div className="field-group">
              <label>Target Command ID (optional for ACK)</label>
              <input
                type="text"
                placeholder="Leave empty to sync active commands, or type ID to test rejection"
                value={commandId}
                onChange={(e) => setCommandId(e.target.value)}
              />
            </div>
          )}

          <button
            className="btn-secondary form-submit-btn"
            onClick={handleSendControllerEvent}
            disabled={isSubmittingController}
          >
            <Zap size={15} />
            <span>{isSubmittingController ? 'Broadcasting...' : 'Broadcast Hardware State'}</span>
          </button>

          {controllerFeedback && (
            <div className={`sim-note ${controllerFeedback.type}`}>
              {controllerFeedback.text}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .simulation-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .sim-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
        }
        .sim-top-header h3 {
          font-size: 20px;
          color: var(--color-ink);
          margin-top: 4px;
        }
        .presets-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .presets-label {
          font-size: 13px;
          color: var(--color-body);
          font-weight: 600;
        }
        .preset-btn {
          font-size: 13px;
          padding: 6px 12px;
        }
        .preset-btn-emergency {
          font-size: 13px;
          padding: 6px 12px;
          border-color: var(--color-red-border);
          color: var(--color-red);
          background-color: var(--color-red-soft);
        }
        .preset-btn-emergency:hover {
          background-color: #fee2e2;
        }

        .sim-dual-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        @media (max-width: 840px) {
          .sim-dual-grid {
            grid-template-columns: 1fr;
          }
        }
        .sim-panel-subcard {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .subcard-title {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--color-card-border);
        }
        .subcard-title h4 {
          font-size: 15px;
          color: var(--color-ink);
          font-weight: 600;
        }
        .field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-body);
        }
        .form-submit-btn {
          margin-top: 6px;
          width: 100%;
        }
        .sim-note {
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          line-height: 1.4;
        }
        .sim-note.success {
          background-color: var(--color-green-soft);
          color: var(--color-green);
          border: 1px solid var(--color-green-border);
        }
        .sim-note.error {
          background-color: var(--color-red-soft);
          color: var(--color-red);
          border: 1px solid var(--color-red-border);
        }
      `}</style>
    </div>
  );
}

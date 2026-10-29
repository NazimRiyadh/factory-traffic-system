import React, { useState, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';

export default function AuditTrailView({ history = [], onRefresh }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = useMemo(() => {
    const safeHistory = Array.isArray(history) ? history : [];
    return safeHistory.filter((item) => {
      // Filter by category
      if (filterType === 'EMERGENCY' && !item.event_type.includes('EMERGENCY')) return false;
      if (filterType === 'SIGNAL' && !item.event_type.includes('SIGNAL') && !item.event_type.includes('PHASE')) return false;
      if (filterType === 'VEHICLE' && !item.event_type.includes('VEHICLE')) return false;
      if (filterType === 'CONTROLLER' && !item.event_type.includes('CONTROLLER')) return false;
      if (filterType === 'MANUAL' && !item.event_type.includes('MANUAL') && !item.event_type.includes('MODE')) return false;

      // Filter by search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const detailsStr = item.details ? JSON.stringify(item.details).toLowerCase() : '';
        const typeStr = (item.event_type || '').toLowerCase();
        const dirStr = (item.direction || '').toLowerCase();
        return detailsStr.includes(query) || typeStr.includes(query) || dirStr.includes(query);
      }

      return true;
    });
  }, [history, filterType, searchTerm]);

  const getTagStyle = (eventType) => {
    if (eventType.includes('EMERGENCY')) return 'tag-red';
    if (eventType.includes('VEHICLE')) return 'tag-green';
    if (eventType.includes('SIGNAL') || eventType.includes('PHASE')) return 'tag-blue';
    if (eventType.includes('CONTROLLER')) return 'tag-orange';
    if (eventType.includes('MANUAL')) return 'tag-purple';
    return 'tag-neutral';
  };

  return (
    <div className="audit-view-container">
      <div className="audit-view-header">
        <div>
          <span className="eyebrow">Verifiable Compliance Log</span>
          <h2>System Audit Trail</h2>
          <p className="view-subtext">
            Immutable log of all sensor arrivals, signal state sequences, controller ACKs, and manual operator commands.
          </p>
        </div>
        <button className="btn-tertiary" onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>Refresh Feed</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-search-toolbar">
        <div className="filter-chips-group">
          {[
            { id: 'ALL', label: 'All Records' },
            { id: 'EMERGENCY', label: 'Emergencies' },
            { id: 'SIGNAL', label: 'Signal Transitions' },
            { id: 'VEHICLE', label: 'Vehicle Events' },
            { id: 'CONTROLLER', label: 'Controller ACKs' },
            { id: 'MANUAL', label: 'Operator Commands' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`filter-chip ${filterType === tab.id ? 'active' : ''}`}
              onClick={() => setFilterType(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="search-input-wrap">
          <Search size={15} color="var(--color-body-mid)" />
          <input
            type="text"
            placeholder="Search events, vehicle IDs, directions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="audit-search-field"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="audit-table-card">
        <div className="table-responsive-box">
          <table className="audit-data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Direction</th>
                <th>Payload / Details</th>
                <th>Junction</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-table-cell">
                    No matching events found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredHistory.slice(0, 50).map((row) => (
                  <tr key={row.id}>
                    <td className="time-col font-mono">
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className={`event-badge-pill ${getTagStyle(row.event_type)}`}>
                        {row.event_type}
                      </span>
                    </td>
                    <td className="dir-col font-mono">
                      {row.direction ? <span className="dir-chip">{row.direction}</span> : '—'}
                    </td>
                    <td className="details-col font-mono">
                      {row.details ? JSON.stringify(row.details) : '—'}
                    </td>
                    <td className="junction-col font-mono">
                      {row.junction_id || 'A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .audit-view-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .audit-view-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
        }

        .audit-view-header h2 {
          font-size: 24px;
          margin-top: 4px;
        }

        .view-subtext {
          font-size: 14px;
          color: var(--color-body);
          margin-top: 4px;
        }

        .filter-search-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .filter-chips-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-chip {
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-pill);
          color: var(--color-body);
          font-size: 13px;
          font-weight: 500;
          padding: 6px 14px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-chip:hover {
          background-color: var(--color-canvas-soft);
          color: var(--color-ink);
        }

        .filter-chip.active {
          background-color: var(--color-canvas-soft);
          border-color: var(--color-ink);
          color: var(--color-ink);
          font-weight: 600;
        }

        .search-input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--color-canvas);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-sm);
          padding: 6px 12px;
          min-width: 280px;
        }

        .audit-search-field {
          border: none !important;
          padding: 0 !important;
          font-size: 13.5px !important;
          background: transparent !important;
          width: 100%;
        }

        .audit-table-card {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .table-responsive-box {
          overflow-x: auto;
          background-color: var(--color-canvas);
        }

        .audit-data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }

        .audit-data-table th {
          text-align: left;
          padding: 12px 16px;
          background-color: var(--color-canvas-soft);
          color: var(--color-body);
          border-bottom: 1px solid var(--color-card-border);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .audit-data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-card-border);
          color: var(--color-ink);
        }

        .audit-data-table tr:last-child td {
          border-bottom: none;
        }

        .time-col {
          color: var(--color-body-mid);
          font-size: 12px;
          white-space: nowrap;
          width: 110px;
        }

        .event-badge-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: var(--radius-pill);
          white-space: nowrap;
        }

        .tag-green { background-color: var(--color-green-soft); color: var(--color-green); }
        .tag-blue { background-color: #f0f7ff; color: #0369a1; }
        .tag-amber { background-color: var(--color-yellow-soft); color: var(--color-yellow); }
        .tag-red { background-color: var(--color-red-soft); color: var(--color-red); }
        .tag-orange { background-color: #fff3ec; color: var(--color-primary); }
        .tag-purple { background-color: #f5f3ff; color: #6d28d9; }
        .tag-neutral { background-color: var(--color-canvas-soft); color: var(--color-body); }

        .dir-col {
          width: 90px;
        }

        .dir-chip {
          background-color: var(--color-canvas-soft);
          border: 1px solid var(--color-card-border);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }

        .details-col {
          color: var(--color-body);
          font-size: 12px;
          max-width: 420px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .junction-col {
          color: var(--color-body-mid);
          width: 70px;
        }

        .empty-table-cell {
          text-align: center;
          padding: 40px;
          color: var(--color-body-mid);
        }
      `}</style>
    </div>
  );
}

// ─── TimingSummaryTable Component ───────────────────────────────────────────
// Live status table showing all players with time_started, time_ended, time_used.

import type { GameTimingRecord } from '../types';
import { formatTimestamp, formatDuration } from '../utils/timeFormatter';

interface TimingSummaryTableProps {
  records: GameTimingRecord[];
  loading: boolean;
}

function statusBadge(status: GameTimingRecord['status']) {
  const map = {
    CREATED: { label: 'Waiting', className: 'badge-created' },
    IN_PROGRESS: { label: 'Running', className: 'badge-progress' },
    COMPLETED: { label: 'Done', className: 'badge-completed' },
  };
  const info = map[status];
  return <span className={`status-badge ${info.className}`}>{info.label}</span>;
}

export default function TimingSummaryTable({ records, loading }: TimingSummaryTableProps) {
  if (loading && records.length === 0) {
    return (
      <div className="table-empty">
        <div className="loading-dots">
          <span /><span /><span />
        </div>
        <p>Loading records…</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty-icon">👥</span>
        <p>No players registered yet.</p>
        <p className="table-empty-hint">Add players to begin tracking.</p>
      </div>
    );
  }

  return (
    <div className="timing-table-wrapper">
      <table className="timing-table" id="timing-summary-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Status</th>
            <th>Started</th>
            <th>Ended</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr key={rec.id} className={`row-${rec.status.toLowerCase()}`}>
              <td className="cell-username">{rec.username}</td>
              <td>{statusBadge(rec.status)}</td>
              <td className="cell-time">{formatTimestamp(rec.time_started)}</td>
              <td className="cell-time">{formatTimestamp(rec.time_ended)}</td>
              <td className="cell-duration">
                {rec.status === 'COMPLETED' ? (
                  <span className="duration-value">{formatDuration(rec.time_used)}</span>
                ) : rec.status === 'IN_PROGRESS' ? (
                  <span className="duration-live">⏱ Running</span>
                ) : (
                  <span className="duration-waiting">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

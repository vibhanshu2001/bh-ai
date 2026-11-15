import React from 'react';
import { Cpu } from 'lucide-react';
import { MemoryInspectResult } from '../../shared/contracts/dto';

interface MemoryCardProps {
  data: MemoryInspectResult;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ data }) => {
  const formatGb = (bytes: number, precision = 1) =>
    (bytes / (1024 * 1024 * 1024)).toFixed(precision) + ' GB';

  // Available memory on macOS is free memory + inactive/cached pages
  const availableBytes = data.freeBytes + (data.inactiveBytes || 0);
  const freePercent = Math.round((availableBytes / data.totalBytes) * 100);
  const usedPercent = Math.min(100, Math.max(0, 100 - freePercent));

  const timeStr = new Date(data.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <div className="memory-result-card">
      {/* Top Header: Prominent Available Memory Metric + System RAM Tag */}
      <div className="memory-card-header">
        <div className="memory-primary-group">
          <div className="memory-metric-number">{formatGb(availableBytes, 1)}</div>
          <div className="memory-metric-subtext">available of {formatGb(data.totalBytes, 0)}</div>
        </div>

        <div className="memory-type-pill" title="Hardware RAM Inspection">
          <Cpu size={13} strokeWidth={2} className="memory-type-icon" />
          <span>RAM</span>
        </div>
      </div>

      {/* Thin Subtle Progress Bar */}
      <div className="memory-bar-section">
        <div className="memory-bar-track">
          <div
            className="memory-bar-fill"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <div className="memory-bar-caption">
          <span>{usedPercent}% used</span>
          <span>{freePercent}% free</span>
        </div>
      </div>

      {/* 4-Column Secondary Metrics Grid */}
      <div className="memory-secondary-grid">
        <div className="memory-grid-col">
          <span className="memory-grid-label">Used</span>
          <span className="memory-grid-val">{formatGb(data.usedBytes, 1)}</span>
        </div>
        <div className="memory-grid-col">
          <span className="memory-grid-label">Active</span>
          <span className="memory-grid-val">
            {data.activeBytes !== undefined ? formatGb(data.activeBytes, 1) : '—'}
          </span>
        </div>
        <div className="memory-grid-col">
          <span className="memory-grid-label">Inactive</span>
          <span className="memory-grid-val">
            {data.inactiveBytes !== undefined ? formatGb(data.inactiveBytes, 2) : '—'}
          </span>
        </div>
        <div className="memory-grid-col">
          <span className="memory-grid-label">Wired</span>
          <span className="memory-grid-val">
            {data.wiredBytes !== undefined ? formatGb(data.wiredBytes, 2) : '—'}
          </span>
        </div>
      </div>

      {/* Footer Snapshot Timestamp */}
      <div className="memory-card-footer">
        <span className="memory-footer-timestamp">
          Snapshot · Today, {timeStr}
        </span>
      </div>
    </div>
  );
};

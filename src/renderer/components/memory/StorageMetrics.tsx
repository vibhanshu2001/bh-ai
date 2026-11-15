import React, { useState } from 'react';
import { Database, Zap, Check, RefreshCw, Shield, HardDrive, ArrowRight } from 'lucide-react';

interface StorageMetricsProps {
  metrics: {
    checkpointsCount: number;
    handoffsCount: number;
    recordsCount: number;
    decisionsCount: number;
    tasksCount: number;
  } | null;
  projectId: string;
  onRunCompaction: () => Promise<any>;
}

export const StorageMetrics: React.FC<StorageMetricsProps> = ({
  metrics,
  projectId,
  onRunCompaction
}) => {
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactionResult, setCompactionResult] = useState<any | null>(null);

  const handleCompact = async () => {
    setIsCompacting(true);
    try {
      const res = await onRunCompaction();
      setCompactionResult(res);
    } finally {
      setIsCompacting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Entity Breakdown Grid */}
      <div className="memory-card">
        <div className="memory-card-header">
          <div>
            <h3 className="memory-card-title">Project Storage Breakdown</h3>
            <span className="memory-card-subtitle">
              Entities stored in project-scoped SQLite database on this Mac
            </span>
          </div>
          <HardDrive size={16} style={{ color: 'var(--text-tertiary)' }} />
        </div>

        <div className="memory-grid-4">
          <div className="memory-stat-card">
            <span className="memory-stat-lbl">Conventions</span>
            <span className="memory-stat-num">{metrics?.recordsCount ?? 0}</span>
            <span className="memory-stat-note">Documented rules & guidelines</span>
          </div>

          <div className="memory-stat-card">
            <span className="memory-stat-lbl">Decisions (ADRs)</span>
            <span className="memory-stat-num">{metrics?.decisionsCount ?? 0}</span>
            <span className="memory-stat-note">Guaranteed invariant retention</span>
          </div>

          <div className="memory-stat-card">
            <span className="memory-stat-lbl">Tasks</span>
            <span className="memory-stat-num">{metrics?.tasksCount ?? 0}</span>
            <span className="memory-stat-note">Active and completed tasks</span>
          </div>

          <div className="memory-stat-card">
            <span className="memory-stat-lbl">Handoffs & Checkpoints</span>
            <span className="memory-stat-num">
              {(metrics?.handoffsCount ?? 0) + (metrics?.checkpointsCount ?? 0)}
            </span>
            <span className="memory-stat-note">
              {metrics?.handoffsCount ?? 0} handoffs, {metrics?.checkpointsCount ?? 0} checkpoints
            </span>
          </div>
        </div>
      </div>

      {/* Layer A Deterministic Compactor Card */}
      <div className="memory-card">
        <div className="memory-card-header">
          <div>
            <h3 className="memory-card-title">Context Compaction Engine</h3>
            <span className="memory-card-subtitle">
              Deterministic AST & token compaction keeps context packs fast, bounded, and cheap
            </span>
          </div>
          <button
            onClick={handleCompact}
            disabled={isCompacting}
            className="p3-btn primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px'
            }}
          >
            {isCompacting ? (
              <>
                <RefreshCw size={12} className="spinning" />
                <span>Compacting...</span>
              </>
            ) : (
              <>
                <Zap size={12} />
                <span>Compact Memory Now</span>
              </>
            )}
          </button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Bhai’s <strong>Layer A Deterministic Compactor</strong> runs completely offline with zero LLM hallucinations.
          It trims milestone journal logs while guaranteeing <strong>100% preservation</strong> of:
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>All accepted architectural decisions (ADRs) and invariants</li>
            <li>All active, unresolved task blockers and root causes</li>
            <li>Key file references and cross-agent handoff milestones</li>
          </ul>
        </div>

        {compactionResult && (
          <div
            className="memory-card"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              marginTop: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34c759', fontWeight: 600, fontSize: '12px' }}>
              <Check size={14} />
              <span>Compaction Completed Successfully</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>Before</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {compactionResult.originalTokenCount || compactionResult.tokensBefore || 0} tokens
                </span>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block' }}>After Compaction</span>
                <span style={{ fontWeight: 600, color: '#34c759' }}>
                  {compactionResult.compactedTokenCount || compactionResult.tokensAfter || 0} tokens
                </span>
              </div>
              {compactionResult.reductionPercentage && (
                <span className="p3-tech-pill" style={{ color: '#34c759', fontWeight: 600 }}>
                  -{compactionResult.reductionPercentage}% Token Reduction
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

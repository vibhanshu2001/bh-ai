import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  X,
  Brain,
  LayoutGrid,
  BookOpen,
  FileCheck2,
  CheckSquare,
  ArrowRightLeft,
  Activity,
  Cpu,
  Database,
  Plus,
  Search,
  Check,
  Clock,
  AlertCircle,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronRight,
  Code2,
  FolderOpen
} from 'lucide-react';
import { ProjectDto } from '../../../shared/contracts/dto';
import { DecisionEditor } from './DecisionEditor';
import { StorageMetrics } from './StorageMetrics';

interface MemoryHubProps {
  project: ProjectDto;
  onBack: () => void;
  onClose: () => void;
}

type MemoryTab =
  | 'overview'
  | 'knowledge'
  | 'decisions'
  | 'tasks'
  | 'handoffs'
  | 'activity'
  | 'storage';

function formatCompactPath(fullPath: string): string {
  if (!fullPath) return '';
  const match = fullPath.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (match) return '~' + (match[1] || '');
  return fullPath;
}

export const MemoryHub: React.FC<MemoryHubProps> = ({ project, onBack, onClose }) => {
  const [activeTab, setActiveTab] = useState<MemoryTab>('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [storageMetrics, setStorageMetrics] = useState<any>(null);

  // Editor states
  const [editingDecision, setEditingDecision] = useState<any | null>(null);
  const [isDecisionEditorOpen, setIsDecisionEditorOpen] = useState(false);

  // Add Record Modal state
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);
  const [newRecordCategory, setNewRecordCategory] = useState<'convention' | 'architecture' | 'decision'>('convention');
  const [newRecordTitle, setNewRecordTitle] = useState('');
  const [newRecordContent, setNewRecordContent] = useState('');

  // Search & Filter queries
  const [searchQuery, setSearchQuery] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'proposed' | 'accepted' | 'rejected'>('all');
  const [expandedCheckpointId, setExpandedCheckpointId] = useState<string | null>(null);

  const loadTabData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.bhaiApi?.memory) {
        const ov = await window.bhaiApi.memory.overview(project.id);
        setOverview(ov);

        switch (activeTab) {
          case 'overview':
            break;
          case 'knowledge': {
            const recs = await window.bhaiApi.memory.listRecords(project.id);
            setRecords(recs || []);
            break;
          }
          case 'decisions': {
            const decs = await window.bhaiApi.memory.listDecisions(project.id);
            setDecisions(decs || []);
            break;
          }
          case 'tasks': {
            const tsks = await window.bhaiApi.memory.listTasks(project.id);
            setTasks(tsks || []);
            break;
          }
          case 'handoffs': {
            const hnd = await window.bhaiApi.memory.listHandoffs(project.id);
            setHandoffs(Array.isArray(hnd) ? hnd : (hnd?.handoffs || []));
            break;
          }
          case 'activity': {
            const chks = await window.bhaiApi.memory.listCheckpoints(project.id, { limit: 50 });
            setCheckpoints(chks || []);
            break;
          }
          case 'storage': {
            const metrics = await window.bhaiApi.memory.getStorageMetrics(project.id);
            setStorageMetrics(metrics);
            break;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load memory hub data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, activeTab]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  // Global keydown: Esc triggers onBack / onClose
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDecisionEditorOpen) {
          setIsDecisionEditorOpen(false);
        } else if (isAddRecordOpen) {
          setIsAddRecordOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDecisionEditorOpen, isAddRecordOpen, onBack]);

  // Handlers
  const handleSaveDecision = async (decisionData: any) => {
    await window.bhaiApi.memory.saveDecision(decisionData);
    setIsDecisionEditorOpen(false);
    setEditingDecision(null);
    loadTabData();
  };

  const handleApproveDecision = async (id: string, approved: boolean) => {
    await window.bhaiApi.memory.approveDecision(id, approved);
    loadTabData();
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecordTitle.trim() || !newRecordContent.trim()) return;

    await window.bhaiApi.memory.saveRecord({
      projectId: project.id,
      category: newRecordCategory,
      key: `rec_${Date.now()}`,
      title: newRecordTitle.trim(),
      content: newRecordContent.trim(),
      authorType: 'user',
      authorId: 'bhai_user'
    });

    setIsAddRecordOpen(false);
    setNewRecordTitle('');
    setNewRecordContent('');
    loadTabData();
  };

  const handleDeleteRecord = async (id: string) => {
    if (confirm('Delete this project convention?')) {
      await window.bhaiApi.memory.deleteRecord(id);
      loadTabData();
    }
  };

  const handleRevokeAuth = async (clientName: string) => {
    await window.bhaiApi.memory.revokeAuthorization(clientName, project.id);
    loadTabData();
  };

  const handleRunCompaction = async () => {
    const res = await window.bhaiApi.memory.runCompaction(project.id);
    loadTabData();
    return res;
  };

  // Filtered lists
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.title?.toLowerCase().includes(q) ||
        r.content?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      if (decisionFilter !== 'all' && d.status !== decisionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          d.title?.toLowerCase().includes(q) ||
          d.decision?.toLowerCase().includes(q) ||
          d.context?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [decisions, decisionFilter, searchQuery]);

  const hasNoMemory =
    overview &&
    (overview.recordsCount ?? 0) === 0 &&
    (overview.decisionsCount ?? 0) === 0 &&
    (overview.activeTasksCount ?? 0) === 0 &&
    (overview.handoffsCount ?? 0) === 0;

  const techs = (project.detectedMetadata?.technologies as string[]) || [];

  return (
    <div className="memory-hub-workspace">
      {/* Native macOS Header */}
      <div className="memory-hub-header">
        <div className="memory-hub-header-left">
          <button className="memory-hub-back-btn" onClick={onBack} title="Return to Project Details">
            <ArrowLeft size={13} strokeWidth={2.2} />
            <span>Project Details</span>
          </button>

          <div className="memory-hub-title-cluster">
            <span
              className={`p3-status-dot ${project.availability}`}
              title={`Project is ${project.availability}`}
            />
            <span className="memory-hub-title">{project.displayName}</span>
            <span className="memory-hub-badge">Memory Hub</span>
            <span className="memory-hub-root" title={project.canonicalRoot}>
              {formatCompactPath(project.canonicalRoot)}
            </span>
          </div>
        </div>

        <div className="memory-hub-header-right">
          <button className="p3-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Segmented Tab Navigation Bar (8 views) */}
      <div className="memory-hub-tabs-bar">
        {[
          { key: 'overview', label: 'Overview', icon: LayoutGrid, count: null },
          { key: 'knowledge', label: 'Knowledge', icon: BookOpen, count: overview?.recordsCount },
          {
            key: 'decisions',
            label: 'Decisions (ADRs)',
            icon: FileCheck2,
            count: overview?.decisionsCount,
            alert: (overview?.pendingDecisionsCount ?? 0) > 0
          },
          {
            key: 'tasks',
            label: 'Tasks',
            icon: CheckSquare,
            count: overview?.activeTasksCount,
            danger: (overview?.blockedTasksCount ?? 0) > 0
          },
          { key: 'handoffs', label: 'Handoffs', icon: ArrowRightLeft, count: overview?.handoffsCount },
          { key: 'activity', label: 'Activity', icon: Activity, count: null },
          { key: 'storage', label: 'Storage', icon: Database, count: null }
        ].map(({ key, label, icon: Icon, count, alert, danger }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as MemoryTab)}
            className={`memory-hub-tab-btn ${activeTab === key ? 'active' : ''}`}
          >
            <Icon size={12} strokeWidth={2} />
            <span>{label}</span>
            {count !== null && count !== undefined && count > 0 && (
              <span
                className={`memory-hub-tab-count ${danger ? 'danger' : alert ? 'alert' : ''}`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content Body */}
      <div className="memory-hub-content">
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
            Loading project memory...
          </div>
        ) : (
          <>
            {/* =============================================================
                1. OVERVIEW TAB
               ============================================================= */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Pending Decisions Alert Banner */}
                {(overview?.pendingDecisionsCount ?? 0) > 0 && (
                  <div className="memory-alert-banner warning">
                    <Clock size={14} />
                    <span>
                      <strong>{overview.pendingDecisionsCount} architectural decision(s)</strong> proposed by coding agents are pending your review.
                    </span>
                    <button
                      className="p3-btn secondary"
                      style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: '11px' }}
                      onClick={() => setActiveTab('decisions')}
                    >
                      Review ADRs
                    </button>
                  </div>
                )}

                {/* Blocked Tasks Alert Banner */}
                {(overview?.blockedTasksCount ?? 0) > 0 && (
                  <div className="memory-alert-banner danger">
                    <AlertCircle size={14} />
                    <span>
                      <strong>{overview.blockedTasksCount} task(s)</strong> currently blocked in this project.
                    </span>
                    <button
                      className="p3-btn secondary"
                      style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: '11px' }}
                      onClick={() => setActiveTab('tasks')}
                    >
                      Inspect Blockers
                    </button>
                  </div>
                )}

                {/* 4 Stat KPI Cards */}
                <div className="memory-grid-4">
                  <div className="memory-stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('knowledge')}>
                    <span className="memory-stat-lbl">
                      <BookOpen size={12} />
                      <span>Conventions</span>
                    </span>
                    <span className="memory-stat-num">{overview?.recordsCount ?? 0}</span>
                    <span className="memory-stat-note">Documented rules & patterns</span>
                  </div>

                  <div className="memory-stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('decisions')}>
                    <span className="memory-stat-lbl">
                      <FileCheck2 size={12} />
                      <span>Decisions (ADRs)</span>
                    </span>
                    <span className="memory-stat-num">{overview?.decisionsCount ?? 0}</span>
                    <span className="memory-stat-note">
                      {(overview?.pendingDecisionsCount ?? 0) > 0
                        ? `${overview.pendingDecisionsCount} pending approval`
                        : 'Accepted invariants'}
                    </span>
                  </div>

                  <div className="memory-stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('tasks')}>
                    <span className="memory-stat-lbl">
                      <CheckSquare size={12} />
                      <span>Active Tasks</span>
                    </span>
                    <span className="memory-stat-num">{overview?.activeTasksCount ?? 0}</span>
                    <span className="memory-stat-note">
                      {(overview?.blockedTasksCount ?? 0) > 0
                        ? `${overview.blockedTasksCount} currently blocked`
                        : 'In development'}
                    </span>
                  </div>

                  <div className="memory-stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('handoffs')}>
                    <span className="memory-stat-lbl">
                      <ArrowRightLeft size={12} />
                      <span>Durable Handoffs</span>
                    </span>
                    <span className="memory-stat-num">{overview?.handoffsCount ?? 0}</span>
                    <span className="memory-stat-note">Cross-agent session continuity</span>
                  </div>
                </div>

                {/* Empty State vs. Latest Handoff Preview */}
                {hasNoMemory ? (
                  <div className="memory-empty-state">
                    <div className="memory-empty-icon-wrap">
                      <Brain size={24} style={{ color: '#ff9500' }} />
                    </div>
                    <h3 className="memory-empty-title">Offline Project Memory & Continuous Context</h3>
                    <p className="memory-empty-desc">
                      Bhai automatically retains project context, architecture decisions, and task handoffs across AI coding agents.
                      Connect <strong>Google Antigravity</strong>, <strong>OpenAI Codex</strong>, <strong>Claude Code</strong>, or <strong>Cursor</strong> to start sharing memory without cloud dependencies.
                    </p>

                    <div className="memory-empty-actions">
                      <button className="p3-btn primary" onClick={() => setIsDecisionEditorOpen(true)}>
                        <FileCheck2 size={12} />
                        <span>Document Decision (ADR)</span>
                      </button>
                      <button className="p3-btn secondary" onClick={() => setIsAddRecordOpen(true)}>
                        <Plus size={12} />
                        <span>Add Convention</span>
                      </button>
                    </div>

                    {/* Detected Project Context Footer */}
                    {techs.length > 0 && (
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-divider)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Detected technologies:</span>
                        {techs.map((t, idx) => (
                          <span key={idx} className="p3-tech-pill">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : overview?.latestHandoff ? (
                  <div className="memory-card">
                    <div className="memory-card-header">
                      <div>
                        <h4 className="memory-card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ArrowRightLeft size={13} style={{ color: '#007aff' }} />
                          <span>Latest Session Handoff</span>
                        </h4>
                        <span className="memory-card-subtitle">
                          Saved by <strong>{overview.latestHandoff.authorClient}</strong> on{' '}
                          {new Date(overview.latestHandoff.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <button className="p3-btn secondary" onClick={() => setActiveTab('handoffs')} style={{ fontSize: '11px', padding: '3px 8px' }}>
                        View All Handoffs
                      </button>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      Objective: <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{overview.latestHandoff.objective}</span>
                    </div>

                    <div className="memory-grid-2">
                      <div style={{ backgroundColor: 'var(--surface-secondary)', padding: '10px 12px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                          Completed Work
                        </span>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {overview.latestHandoff.completedSummary}
                        </div>
                      </div>

                      <div style={{ backgroundColor: 'var(--surface-secondary)', padding: '10px 12px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                          Remaining Work / Next Steps
                        </span>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {overview.latestHandoff.remainingSummary}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p3-empty-services">
                    <span>No session handoffs recorded yet. Agents call <code>handoffsavekar</code> when concluding a work milestone.</span>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================
                2. KNOWLEDGE / CONVENTIONS TAB
               ============================================================= */}
            {activeTab === 'knowledge' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="memory-toolbar">
                  <div className="memory-toolbar-left">
                    <div className="memory-search-box">
                      <Search size={13} className="memory-search-icon" />
                      <input
                        type="text"
                        placeholder="Search conventions and rules..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="memory-search-input"
                      />
                    </div>
                  </div>

                  <button className="p3-btn primary" onClick={() => setIsAddRecordOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Plus size={12} strokeWidth={2} />
                    <span>Add Convention</span>
                  </button>
                </div>

                {filteredRecords.length === 0 ? (
                  <div className="p3-empty-services">
                    <span>No architectural conventions or guidelines documented. Click &quot;Add Convention&quot; to define project conventions.</span>
                  </div>
                ) : (
                  filteredRecords.map((r) => (
                    <div key={r.id} className="memory-card">
                      <div className="memory-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="p3-tech-pill" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                            {r.category || 'convention'}
                          </span>
                          <span className="memory-card-title">{r.title || r.key}</span>
                          <span className="p3-tech-pill" style={{ fontSize: '9.5px' }}>
                            rev {r.revision || 1}
                          </span>
                        </div>
                        <button
                          className="p3-icon-btn danger"
                          onClick={() => handleDeleteRecord(r.id)}
                          title="Delete convention"
                        >
                          <X size={13} />
                        </button>
                      </div>

                      <div className="memory-card-body" style={{ whiteSpace: 'pre-wrap' }}>
                        {r.content}
                      </div>

                      <div className="memory-card-footer">
                        <span>Author: {r.authorId || 'User'}</span>
                        <span>{new Date(r.updatedAt || r.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* =============================================================
                3. DECISIONS (ADRs) TAB
               ============================================================= */}
            {activeTab === 'decisions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="memory-toolbar">
                  <div className="memory-toolbar-left">
                    <div className="memory-search-box">
                      <Search size={13} className="memory-search-icon" />
                      <input
                        type="text"
                        placeholder="Search architectural decisions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="memory-search-input"
                      />
                    </div>

                    <select
                      value={decisionFilter}
                      onChange={(e) => setDecisionFilter(e.target.value as any)}
                      className="memory-select"
                    >
                      <option value="all">All Decisions</option>
                      <option value="proposed">Pending Approval</option>
                      <option value="accepted">Accepted (Active Invariants)</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  <button className="p3-btn primary" onClick={() => { setEditingDecision(null); setIsDecisionEditorOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Plus size={12} strokeWidth={2} />
                    <span>New ADR</span>
                  </button>
                </div>

                {filteredDecisions.length === 0 ? (
                  <div className="p3-empty-services">
                    <span>No architectural decisions found matching criteria. Propose one or connect an agent.</span>
                  </div>
                ) : (
                  filteredDecisions.map((d) => (
                    <div key={d.id} className="memory-card">
                      <div className="memory-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`memory-status-pill ${d.status}`}>
                            {d.status === 'accepted' ? <Check size={10} /> : d.status === 'proposed' ? <Clock size={10} /> : <X size={10} />}
                            {d.status}
                          </span>
                          <span className="memory-card-title">{d.title}</span>
                        </div>

                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          Author: <strong>{d.authorId || d.authorType}</strong>
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                            Decision & Invariant:
                          </span>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{d.decision}</div>
                        </div>

                        {d.context && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                              Context:
                            </span>
                            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{d.context}</div>
                          </div>
                        )}

                        {d.consequences && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                              Consequences & Trade-offs:
                            </span>
                            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{d.consequences}</div>
                          </div>
                        )}
                      </div>

                      {/* Approval Action Bar for Proposed Decisions */}
                      {d.status === 'proposed' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-divider)' }}>
                          <button
                            onClick={() => handleApproveDecision(d.id, false)}
                            className="p3-btn danger"
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleApproveDecision(d.id, true)}
                            className="p3-btn primary"
                            style={{ fontSize: '11px', padding: '4px 12px' }}
                          >
                            Approve Decision
                          </button>
                        </div>
                      ) : (
                        <div className="memory-card-footer">
                          <span>Status: {d.status === 'accepted' ? 'Enforced Invariant' : 'Archived'}</span>
                          <span>{new Date(d.updatedAt || d.createdAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* =============================================================
                4. TASKS TAB
               ============================================================= */}
            {activeTab === 'tasks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tasks.length === 0 ? (
                  <div className="p3-empty-services">
                    <span>No active tasks recorded. Agents track tasks using <code>yesavekar</code>.</span>
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="memory-card">
                      <div className="memory-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`memory-status-pill ${t.status}`}>
                            {t.status}
                          </span>
                          <span className="memory-card-title">{t.title}</span>
                        </div>
                        <span className="p3-tech-pill">Priority {t.priority || 1}</span>
                      </div>

                      {t.description && (
                        <div className="memory-card-body">{t.description}</div>
                      )}

                      {/* Blocker Callout */}
                      {t.status === 'blocked' && t.blockerReason && (
                        <div className="memory-alert-banner danger">
                          <AlertCircle size={14} />
                          <div>
                            <strong>Blocker:</strong> {t.blockerReason}
                          </div>
                        </div>
                      )}

                      <div className="memory-card-footer">
                        <span>Checkpoints: {t.checkpointCount || 0}</span>
                        <span>Updated: {new Date(t.updatedAt || t.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* =============================================================
                5. HANDOFFS TAB
               ============================================================= */}
            {activeTab === 'handoffs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {handoffs.length === 0 ? (
                  <div className="p3-empty-services">
                    <span>No session handoffs saved yet. Coding agents invoke <code>handoffsavekar</code> upon completing milestones or before context compaction.</span>
                  </div>
                ) : (
                  handoffs.map((h) => (
                    <div key={h.id} className="memory-card">
                      <div className="memory-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="p3-tech-pill" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                            {h.authorClient || 'agent'}
                          </span>
                          <span className="memory-card-title">{h.objective}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {new Date(h.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="memory-grid-2">
                        <div style={{ backgroundColor: 'var(--surface-secondary)', padding: '10px 12px', borderRadius: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>
                            Completed Work
                          </span>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                            {h.completedSummary}
                          </div>
                        </div>

                        <div style={{ backgroundColor: 'var(--surface-secondary)', padding: '10px 12px', borderRadius: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>
                            Remaining Work & Next Steps
                          </span>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                            {h.remainingSummary}
                          </div>
                        </div>
                      </div>

                      {/* Dirty Files */}
                      {h.relevantFiles && (Array.isArray(h.relevantFiles) ? h.relevantFiles : JSON.parse(h.relevantFiles || '[]')).length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Touched files:</span>
                          {(Array.isArray(h.relevantFiles) ? h.relevantFiles : JSON.parse(h.relevantFiles || '[]')).map((f: string, idx: number) => (
                            <span key={idx} className="p3-tech-pill" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '9.5px' }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* =============================================================
                6. ACTIVITY (CHECKPOINTS) TAB
               ============================================================= */}
            {activeTab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {checkpoints.length === 0 ? (
                  <div className="p3-empty-services">
                    <span>No milestone checkpoints recorded in this project journal.</span>
                  </div>
                ) : (
                  checkpoints.map((c) => {
                    const isExpanded = expandedCheckpointId === c.id;
                    return (
                      <div
                        key={c.id}
                        className="checkpoint-row"
                        style={{ cursor: c.payloadJson ? 'pointer' : 'default', flexDirection: 'column' }}
                        onClick={() => {
                          if (c.payloadJson) {
                            setExpandedCheckpointId(isExpanded ? null : c.id);
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`memory-status-pill ${c.checkpointType?.replace('.', '_') || 'in_progress'}`}>
                              {c.checkpointType}
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {c.summary}
                            </span>
                          </div>

                          <div className="checkpoint-meta">
                            <span className="checkpoint-author">{c.authorClient || 'agent'}</span>
                            <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                            {c.payloadJson && (
                              <button className="p3-icon-btn" style={{ width: '16px', height: '16px' }}>
                                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable JSON Payload */}
                        {isExpanded && c.payloadJson && (
                          <div style={{ marginTop: '8px', width: '100%' }}>
                            <pre className="memory-code-block" style={{ margin: 0, maxHeight: '180px' }}>
                              {typeof c.payloadJson === 'string'
                                ? JSON.stringify(JSON.parse(c.payloadJson), null, 2)
                                : JSON.stringify(c.payloadJson, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* =============================================================
                7. STORAGE & COMPACTION TAB
               ============================================================= */}
            {activeTab === 'storage' && (
              <StorageMetrics
                metrics={storageMetrics}
                projectId={project.id}
                onRunCompaction={handleRunCompaction}
              />
            )}
          </>
        )}
      </div>

      {/* Modal: Decision Editor (New / Edit ADR) */}
      {isDecisionEditorOpen && (
        <DecisionEditor
          decision={editingDecision}
          projectId={project.id}
          onSave={handleSaveDecision}
          onCancel={() => {
            setIsDecisionEditorOpen(false);
            setEditingDecision(null);
          }}
        />
      )}

      {/* Modal: Add Convention */}
      {isAddRecordOpen && (
        <div
          className="p3-submodal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddRecordOpen(false);
            }
          }}
        >
          <div
            className="p3-submodal-card"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p3-submodal-header">
              <span className="p3-submodal-title">Add Architectural Convention</span>
              <button className="p3-icon-btn" onClick={() => setIsAddRecordOpen(false)}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveRecord}>
              <div className="p3-submodal-body">
                <div className="p3-field-group">
                  <label className="p3-field-label">Category</label>
                  <select
                    value={newRecordCategory}
                    onChange={(e) => setNewRecordCategory(e.target.value as any)}
                    className="p3-input"
                  >
                    <option value="convention">Coding Convention & Pattern</option>
                    <option value="architecture">Architectural Guideline</option>
                    <option value="decision">Standard Rule</option>
                  </select>
                </div>

                <div className="p3-field-group">
                  <label className="p3-field-label">Title / Rule Summary</label>
                  <input
                    type="text"
                    value={newRecordTitle}
                    onChange={(e) => setNewRecordTitle(e.target.value)}
                    placeholder="e.g. Always use UUID v4 for database primary keys"
                    className="p3-input"
                    required
                    autoFocus
                  />
                </div>

                <div className="p3-field-group">
                  <label className="p3-field-label">Content / Guideline Details</label>
                  <textarea
                    rows={4}
                    value={newRecordContent}
                    onChange={(e) => setNewRecordContent(e.target.value)}
                    placeholder="Specify the exact invariant, code style, or architecture rule that agents must follow..."
                    className="p3-input"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    required
                  />
                </div>
              </div>

              <div className="p3-submodal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--border-divider)' }}>
                <button type="button" onClick={() => setIsAddRecordOpen(false)} className="p3-btn secondary">
                  Cancel
                </button>
                <button type="submit" disabled={!newRecordTitle.trim() || !newRecordContent.trim()} className="p3-btn primary">
                  Save Convention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  MoreHorizontal,
  Copy,
  Check,
  FolderOpen,
  Code2,
  Terminal,
  GitBranch,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  X,
  Server,
  Globe,
  Layers,
  Edit3,
  Brain,
  Sparkles
} from 'lucide-react';
import { ProjectDto, ProjectGitInfoDto, ServiceDto, ServiceDefinitionDto } from '../../shared/contracts/dto';

interface ProjectDetailModalProps {
  project: ProjectDto;
  activeChatId?: string;
  onClose: () => void;
  onProjectUpdated: () => void;
  onProjectDeleted: (project: ProjectDto) => void;
  onOpenMemoryHub?: (project: ProjectDto) => void;
}

// Compact path formatter: turns /Users/developer/... into ~/Developer/...
function formatCompactPath(fullPath: string): string {
  if (!fullPath) return '';
  const match = fullPath.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (match) {
    return '~' + (match[1] || '');
  }
  return fullPath;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  project,
  activeChatId,
  onClose,
  onProjectUpdated,
  onProjectDeleted,
  onOpenMemoryHub
}) => {
  // Navigation & Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(project.displayName);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Path Feedback
  const [isCopied, setIsCopied] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Git State
  const [gitInfo, setGitInfo] = useState<ProjectGitInfoDto | null>(null);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [isConnectingAgents, setIsConnectingAgents] = useState(false);

  // Service Editing State
  const [editingService, setEditingService] = useState<ServiceDefinitionDto | null>(null);
  const [isNewService, setIsNewService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  // Global keydown: Esc closes sub-modals or main modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingService) {
          setEditingService(null);
        } else if (isConfirmingDelete) {
          setIsConfirmingDelete(false);
        } else if (isRenaming) {
          setIsRenaming(false);
        } else if (isMenuOpen) {
          setIsMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingService, isConfirmingDelete, isRenaming, isMenuOpen, onClose]);

  // Actions
  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(project.canonicalRoot);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1800);
    } catch {
      setActionFeedback('Failed to copy path to clipboard.');
    }
  };

  const handleRevealInFinder = async () => {
    setActionFeedback(null);
    try {
      const res = await window.bhaiApi.project.revealInFinder(project.id);
      setActionFeedback(res.message);
    } catch (err: any) {
      setActionFeedback(`Reveal failed: ${err.message}`);
    }
  };

  const handleOpenEditor = async () => {
    setActionFeedback(null);
    try {
      const res = await window.bhaiApi.project.openEditor(project.id);
      setActionFeedback(res.message);
    } catch (err: any) {
      setActionFeedback(`Editor launch failed: ${err.message}`);
    }
  };

  const handleOpenTerminal = async () => {
    setActionFeedback(null);
    try {
      const res = await window.bhaiApi.project.openTerminal(project.id);
      setActionFeedback(res.message);
    } catch (err: any) {
      setActionFeedback(`Terminal launch failed: ${err.message}`);
    }
  };

  const handleLoadGit = async () => {
    setIsLoadingGit(true);
    setActionFeedback(null);
    try {
      const info = await window.bhaiApi.project.getGitInfo(project.id);
      setGitInfo(info);
    } catch (err: any) {
      setActionFeedback(`Git inspection failed: ${err.message}`);
    } finally {
      setIsLoadingGit(false);
    }
  };

  const handleConnectAgents = async () => {
    setIsConnectingAgents(true);
    setActionFeedback(null);
    try {
      const res = await window.bhaiApi.agent.connectProject({
        projectRoot: project.canonicalRoot,
        projectId: project.id
      });
      setActionFeedback(`Connected ${res.installedTargets.join(', ')} to ${project.displayName}!`);
    } catch (err: any) {
      setActionFeedback(`Agent connection failed: ${err.message}`);
    } finally {
      setIsConnectingAgents(false);
    }
  };

  const handleSaveRename = async () => {
    if (!editName.trim()) return;
    try {
      await window.bhaiApi.project.update({
        id: project.id,
        displayName: editName.trim()
      });
      setIsRenaming(false);
      onProjectUpdated();
    } catch (err: any) {
      setActionFeedback(`Rename failed: ${err.message}`);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await window.bhaiApi.project.delete(project.id, activeChatId);
      setIsConfirmingDelete(false);
      onProjectDeleted(project);
      onClose();
    } catch (err: any) {
      setActionFeedback(`Removal failed: ${err.message}`);
    }
  };

  // Service Management
  const handleStartAddService = () => {
    setServiceError(null);
    setIsNewService(true);
    setEditingService({
      id: `srv_${Date.now()}`,
      name: '',
      serviceType: 'backend',
      relativeCwd: '.',
      port: null,
      portConfidence: 'configured',
      packageScript: 'npm run dev'
    });
  };

  const handleStartEditService = (srv: ServiceDto) => {
    setServiceError(null);
    setIsNewService(false);
    setEditingService({
      id: srv.id,
      name: srv.name,
      serviceType: srv.serviceType,
      relativeCwd: srv.relativeCwd,
      port: srv.port,
      portConfidence: srv.portConfidence || (srv.port ? 'configured' : undefined),
      packageScript: srv.packageScript || (srv.readiness as any)?.packageScript || 'npm run dev'
    });
  };

  const handleSaveService = async () => {
    if (!editingService) return;
    const cleanName = editingService.name.trim();
    if (!cleanName) {
      setServiceError('Service name is required');
      return;
    }

    const currentServices = (project.services || []).map((s) => ({
      id: s.id,
      name: s.name,
      serviceType: s.serviceType,
      relativeCwd: s.relativeCwd,
      port: s.port,
      portConfidence: s.portConfidence,
      packageScript: s.packageScript || (s.readiness as any)?.packageScript
    }));

    // Prevent duplicate service names within project (case-insensitive)
    const isDuplicate = currentServices.some(
      (s) => s.id !== editingService.id && s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (isDuplicate) {
      setServiceError(`A service named "${cleanName}" already exists in this project.`);
      return;
    }

    // Validate relative cwd: cannot be absolute outside or escape with ..
    const cleanCwd = editingService.relativeCwd.trim();
    if (!cleanCwd) {
      setServiceError('Working directory is required');
      return;
    }
    if (cleanCwd.startsWith('/') || cleanCwd.startsWith('..') || cleanCwd.includes('/../')) {
      setServiceError('Working directory must remain inside project root and cannot escape with ".."');
      return;
    }

    // Validate port
    if (editingService.port !== null && editingService.port !== undefined) {
      if (isNaN(editingService.port) || editingService.port < 1 || editingService.port > 65535) {
        setServiceError('Port must be a valid integer between 1 and 65535.');
        return;
      }
    }

    let updatedList: ServiceDefinitionDto[];
    if (isNewService) {
      updatedList = [...currentServices, { ...editingService, name: cleanName, relativeCwd: cleanCwd }];
    } else {
      updatedList = currentServices.map((s) => (s.id === editingService.id ? { ...editingService, name: cleanName, relativeCwd: cleanCwd } : s));
    }

    try {
      await window.bhaiApi.project.update({
        id: project.id,
        services: updatedList
      });
      setEditingService(null);
      onProjectUpdated();
      setActionFeedback(isNewService ? `Added service "${cleanName}".` : `Updated service "${cleanName}".`);
    } catch (err: any) {
      setServiceError(`Failed to save service: ${err.message}`);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const currentServices = (project.services || []).map((s) => ({
      id: s.id,
      name: s.name,
      serviceType: s.serviceType,
      relativeCwd: s.relativeCwd,
      port: s.port,
      portConfidence: s.portConfidence
    }));

    const updatedList = currentServices.filter((s) => s.id !== serviceId);
    try {
      await window.bhaiApi.project.update({
        id: project.id,
        services: updatedList
      });
      setEditingService(null);
      onProjectUpdated();
      setActionFeedback('Service removed.');
    } catch (err: any) {
      setServiceError(`Failed to delete service: ${err.message}`);
    }
  };

  const techs = (project.detectedMetadata?.technologies as string[]) || [];

  return (
    <div
      className="project-detail-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="project-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Redesigned Native Header */}
        <div className="p3-header-row">
          <div className="p3-header-left">
            <button className="p3-icon-btn" onClick={onClose} title="Back to conversation" aria-label="Back">
              <ArrowLeft size={15} strokeWidth={2} />
            </button>
            <div className="p3-title-cluster">
              <span className="p3-project-name">{project.displayName}</span>
              <span
                className={`p3-status-dot ${project.availability}`}
                title={`Project is ${project.availability}`}
                aria-label={`Status: ${project.availability}`}
              />
            </div>
          </div>

          <div className="p3-header-right" ref={menuRef}>
            <button
              className="p3-icon-btn"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              title="Project settings"
              aria-label="Project settings"
              aria-expanded={isMenuOpen}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>

            {isMenuOpen && (
              <div className="p3-overflow-menu" role="menu">
                <button
                  className="p3-menu-item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setEditName(project.displayName);
                    setIsRenaming(true);
                  }}
                  role="menuitem"
                >
                  <Edit3 size={13} strokeWidth={1.8} />
                  <span>Rename Project...</span>
                </button>
                <div className="p3-menu-divider" />
                <button
                  className="p3-menu-item danger"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsConfirmingDelete(true);
                  }}
                  role="menuitem"
                >
                  <Trash2 size={13} strokeWidth={1.8} />
                  <span>Remove from Bhai...</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className="p3-feedback-banner">
            <span>{actionFeedback}</span>
            <button className="p3-feedback-close" onClick={() => setActionFeedback(null)} title="Dismiss">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Compact Path Bar with Copy & Reveal */}
        <div className="p3-path-bar">
          <span className="p3-compact-path" title={project.canonicalRoot}>
            {formatCompactPath(project.canonicalRoot)}
          </span>
          <div className="p3-path-actions">
            <button
              className="p3-path-btn"
              onClick={handleCopyPath}
              title={isCopied ? 'Copied full path!' : 'Copy absolute path'}
              aria-label="Copy path"
            >
              {isCopied ? <Check size={12} className="p3-copied-icon" /> : <Copy size={12} />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              className="p3-path-btn"
              onClick={handleRevealInFinder}
              title="Reveal in Finder"
              aria-label="Reveal in Finder"
            >
              <FolderOpen size={12} />
              <span>Finder</span>
            </button>
          </div>
        </div>

        {/* Consistent Action Toolbar */}
        <div className="p3-toolbar-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <button
            className="p3-toolbar-btn"
            onClick={() => onOpenMemoryHub?.(project)}
            title="Inspect project memory, decisions, and agent activity"
          >
            <Brain size={13} strokeWidth={2} style={{ color: '#ff9500' }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Memory</span>
          </button>
          <button
            className={`p3-toolbar-btn ${isConnectingAgents ? 'loading' : ''}`}
            onClick={handleConnectAgents}
            title="Connect Codex, Cursor, Claude & Antigravity to this project"
          >
            {isConnectingAgents ? (
              <RefreshCw size={13} className="spinning" />
            ) : (
              <Sparkles size={13} strokeWidth={2} style={{ color: 'var(--accent)' }} />
            )}
            <span>Connect</span>
          </button>
          <button className="p3-toolbar-btn" onClick={handleOpenEditor} title="Open in VS Code or Cursor">
            <Code2 size={13} strokeWidth={2} />
            <span>Editor</span>
          </button>
          <button className="p3-toolbar-btn" onClick={handleOpenTerminal} title="Open Terminal at project root">
            <Terminal size={13} strokeWidth={2} />
            <span>Terminal</span>
          </button>
          <button
            className={`p3-toolbar-btn ${isLoadingGit ? 'loading' : ''}`}
            onClick={handleLoadGit}
            title="Inspect Git repository status"
          >
            {isLoadingGit ? <RefreshCw size={13} className="spinning" /> : <GitBranch size={13} strokeWidth={2} />}
            <span>Git</span>
          </button>
        </div>

        {/* Git Info Panel (Expanded on Demand) */}
        {gitInfo && (
          <div className="p3-git-card">
            <div className="p3-git-main">
              <div className="p3-git-branch">
                <GitBranch size={13} />
                <span>{gitInfo.branch || 'detached HEAD'}</span>
              </div>
              <span className={`p3-git-clean-pill ${gitInfo.isClean ? 'clean' : 'modified'}`}>
                {gitInfo.isClean ? 'Clean' : 'Modified'}
              </span>
            </div>
            {!gitInfo.isClean && (
              <div className="p3-git-counts">
                <span>{gitInfo.modifiedCount} modified</span>
                <span className="p3-dot-separator">•</span>
                <span>{gitInfo.untrackedCount} untracked</span>
              </div>
            )}
          </div>
        )}

        {/* Detected Technologies - Subtle Pills */}
        {techs.length > 0 && (
          <div className="p3-tech-row">
            <span className="p3-tech-label">Detected:</span>
            <div className="p3-tech-pills">
              {techs.map((t, idx) => (
                <span key={idx} className="p3-tech-pill">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Registered Services (Primary Content) */}
        <div className="p3-services-section">
          <div className="p3-section-header">
            <div className="p3-section-title-wrap">
              <span className="p3-section-title">Registered Services</span>
              <span className="p3-section-count">{project.services?.length || 0}</span>
            </div>
            <button className="p3-add-service-btn" onClick={handleStartAddService} title="Register a service">
              <Plus size={12} strokeWidth={2.2} />
              <span>Add</span>
            </button>
          </div>

          {(!project.services || project.services.length === 0) ? (
            <div className="p3-empty-services">
              <span>No services registered yet. Click &quot;Add&quot; to define a service.</span>
            </div>
          ) : (
            <div className="p3-services-list">
              {project.services.map((srv) => {
                const isConfiguredPort = srv.portConfidence === 'configured';
                return (
                  <div
                    key={srv.id}
                    className="p3-service-row"
                    onClick={() => handleStartEditService(srv)}
                    title="Click to edit service definition"
                  >
                    <div className="p3-service-left">
                      <div className="p3-service-icon">
                        {srv.serviceType === 'backend' ? (
                          <Server size={13} />
                        ) : srv.serviceType === 'frontend' ? (
                          <Globe size={13} />
                        ) : (
                          <Layers size={13} />
                        )}
                      </div>
                      <div className="p3-service-name-group">
                        <span className="p3-service-name">{srv.name}</span>
                        <span className="p3-service-type-badge">{srv.serviceType}</span>
                      </div>
                      <span className="p3-service-cwd" title={`Working directory: ${srv.relativeCwd}`}>
                        {srv.relativeCwd === '.' ? 'root' : srv.relativeCwd}
                      </span>
                    </div>

                    <div className="p3-service-right">
                      {srv.port ? (
                        <span
                          className={`p3-port-pill ${isConfiguredPort ? 'configured' : 'inferred'}`}
                          title={
                            isConfiguredPort
                              ? `Configured port: ${srv.port}`
                              : `Inferred default convention: ${srv.port} (unconfirmed)`
                          }
                        >
                          :{srv.port}
                          {!isConfiguredPort && <span className="p3-port-inferred-tag">def</span>}
                        </span>
                      ) : (
                        <span className="p3-port-none">--</span>
                      )}

                      <button
                        className="p3-service-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditService(srv);
                        }}
                        title="Edit service details"
                      >
                        <Pencil size={12} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: Rename Project */}
        {isRenaming && (
          <div
            className="p3-submodal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsRenaming(false);
              }
            }}
          >
            <div className="p3-submodal-card" onClick={(e) => e.stopPropagation()}>
              <div className="p3-submodal-header">
                <span className="p3-submodal-title">Rename Project</span>
                <button className="p3-icon-btn" onClick={() => setIsRenaming(false)}>
                  <X size={14} />
                </button>
              </div>

              <div className="p3-submodal-body">
                <label className="p3-field-label">Display Name</label>
                <input
                  type="text"
                  className="p3-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                  }}
                  autoFocus
                />
              </div>

              <div className="p3-submodal-footer">
                <button className="p3-btn secondary" onClick={() => setIsRenaming(false)}>
                  Cancel
                </button>
                <button className="p3-btn primary" onClick={handleSaveRename} disabled={!editName.trim()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Service Editor (Add / Edit) */}
        {editingService && (
          <div
            className="p3-submodal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setEditingService(null);
              }
            }}
          >
            <div className="p3-submodal-card" onClick={(e) => e.stopPropagation()}>
              <div className="p3-submodal-header">
                <span className="p3-submodal-title">
                  {isNewService ? 'Add Service' : `Edit ${editingService.name}`}
                </span>
                <button className="p3-icon-btn" onClick={() => setEditingService(null)}>
                  <X size={14} />
                </button>
              </div>

              {serviceError && (
                <div className="p3-submodal-error">
                  <AlertCircle size={13} />
                  <span>{serviceError}</span>
                </div>
              )}

              <div className="p3-submodal-body">
                <div className="p3-field-group">
                  <label className="p3-field-label">Service Name</label>
                  <input
                    type="text"
                    className="p3-input"
                    placeholder="e.g. Backend, Frontend, API"
                    value={editingService.name}
                    onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="p3-fields-row">
                  <div className="p3-field-group flex-1">
                    <label className="p3-field-label">Type</label>
                    <select
                      className="p3-select"
                      value={editingService.serviceType}
                      onChange={(e) => setEditingService({ ...editingService, serviceType: e.target.value })}
                    >
                      <option value="backend">Backend</option>
                      <option value="frontend">Frontend</option>
                      <option value="worker">Worker</option>
                      <option value="database">Database</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>

                  <div className="p3-field-group flex-1">
                    <label className="p3-field-label">Working Directory</label>
                    <input
                      type="text"
                      className="p3-input"
                      placeholder="e.g. backend or ."
                      value={editingService.relativeCwd}
                      onChange={(e) => setEditingService({ ...editingService, relativeCwd: e.target.value })}
                    />
                  </div>
                </div>

                <div className="p3-fields-row">
                  <div className="p3-field-group flex-1">
                    <label className="p3-field-label">Port</label>
                    <input
                      type="number"
                      className="p3-input"
                      placeholder="e.g. 3000, 4000"
                      value={editingService.port ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        setEditingService({ ...editingService, port: val });
                      }}
                    />
                  </div>

                  <div className="p3-field-group flex-1">
                    <label className="p3-field-label">Port Status</label>
                    <select
                      className="p3-select"
                      value={editingService.portConfidence || 'configured'}
                      onChange={(e) =>
                        setEditingService({
                          ...editingService,
                          portConfidence: e.target.value as 'configured' | 'inferred'
                        })
                      }
                      disabled={!editingService.port}
                    >
                      <option value="configured">Confirmed / Configured</option>
                      <option value="inferred">Inferred Default</option>
                    </select>
                  </div>
                </div>

                <div className="p3-field-group">
                  <label className="p3-field-label">Package Script (Optional)</label>
                  <input
                    type="text"
                    className="p3-input"
                    placeholder="e.g. npm run dev"
                    value={editingService.packageScript || ''}
                    onChange={(e) => setEditingService({ ...editingService, packageScript: e.target.value })}
                  />
                </div>
              </div>

              <div className="p3-submodal-footer">
                {!isNewService && (
                  <button
                    className="p3-btn danger-link"
                    onClick={() => handleDeleteService(editingService.id!)}
                    title="Remove this service"
                  >
                    Delete Service
                  </button>
                )}
                <div className="p3-footer-spacer" />
                <button className="p3-btn secondary" onClick={() => setEditingService(null)}>
                  Cancel
                </button>
                <button className="p3-btn primary" onClick={handleSaveService}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Remove Project Confirmation Sheet */}
        {isConfirmingDelete && (
          <div
            className="p3-submodal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsConfirmingDelete(false);
              }
            }}
          >
            <div className="p3-submodal-card delete-card" onClick={(e) => e.stopPropagation()}>
              <div className="p3-submodal-header">
                <span className="p3-submodal-title">Remove from Bhai?</span>
                <button className="p3-icon-btn" onClick={() => setIsConfirmingDelete(false)}>
                  <X size={14} />
                </button>
              </div>

              <div className="p3-submodal-body">
                <p className="p3-delete-notice">
                  Are you sure you want to unregister <strong>{project.displayName}</strong> from Bhai?
                </p>
                <div className="p3-guarantee-box">
                  <Check size={14} className="p3-check-accent" />
                  <span>
                    <strong>File Safety Guarantee:</strong> All project files, Git history, and directories on your Mac will remain <strong>100% untouched</strong>.
                  </span>
                </div>
              </div>

              <div className="p3-submodal-footer">
                <button className="p3-btn secondary" onClick={() => setIsConfirmingDelete(false)} autoFocus>
                  Cancel
                </button>
                <button className="p3-btn danger" onClick={handleDeleteProject}>
                  Remove Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

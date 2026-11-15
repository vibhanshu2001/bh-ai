import React from 'react';
import { Folder, ExternalLink, Terminal, GitBranch, Layers, AlertCircle } from 'lucide-react';
import { ProjectDto } from '../../shared/contracts/dto';

interface ProjectResultCardProps {
  project?: ProjectDto;
  projects?: ProjectDto[];
  actionId?: string;
  onOpenProjectDetail?: (project: ProjectDto) => void;
  onOpenEditor?: (projectId: string) => void;
  onOpenTerminal?: (projectId: string) => void;
}

function formatCompactPath(fullPath: string): string {
  if (!fullPath) return '';
  const match = fullPath.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (match) {
    return '~' + (match[1] || '');
  }
  return fullPath;
}

export const ProjectResultCard: React.FC<ProjectResultCardProps> = ({
  project,
  projects,
  actionId,
  onOpenProjectDetail,
  onOpenEditor,
  onOpenTerminal
}) => {
  // If a single project is returned
  if (project) {
    if (project.availability === 'removed') {
      return (
        <div className="project-result-card removed-card">
          <div className="card-top-row">
            <div className="card-title-group">
              <Folder size={16} className="project-icon text-muted" />
              <span className="card-project-title text-muted">{project.displayName}</span>
            </div>
            <span className="status-pill removed">
              Removed from Bhai
            </span>
          </div>

          <div className="card-path-row">
            <span className="card-path-text text-muted">
              Project unregistered from Bhai. Local files on Mac remain untouched.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="project-result-card">
        <div className="card-top-row">
          <div className="card-title-group">
            <Folder size={16} className="project-icon" />
            <span className="card-project-title">{project.displayName}</span>
          </div>
          <span className={`status-pill ${project.availability}`}>
            {project.availability}
          </span>
        </div>

        <div className="card-path-row">
          <span className="card-path-text" title={project.canonicalRoot}>
            {formatCompactPath(project.canonicalRoot)}
          </span>
        </div>

        {project.services && project.services.length > 0 && (
          <div className="card-services-preview">
            <span className="services-count-label">
              {project.services.length} registered service{project.services.length === 1 ? '' : 's'}:
            </span>
            <div className="services-chips-wrap">
              {project.services.map((s) => (
                <span key={s.id} className="service-chip-badge">
                  {s.name} ({s.serviceType})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="card-actions-toolbar">
          {onOpenEditor && (
            <button
              className="card-mini-btn"
              onClick={() => onOpenEditor(project.id)}
              title="Open in VS Code or Cursor"
            >
              <ExternalLink size={12} />
              <span>Open in Editor</span>
            </button>
          )}

          {onOpenTerminal && (
            <button
              className="card-mini-btn"
              onClick={() => onOpenTerminal(project.id)}
              title="Open Terminal at project directory"
            >
              <Terminal size={12} />
              <span>Open Terminal</span>
            </button>
          )}

          {onOpenProjectDetail && (
            <button
              className="card-mini-btn primary"
              onClick={() => onOpenProjectDetail(project)}
              title="View full project details and services"
            >
              <Layers size={12} />
              <span>View Details</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // If a list of projects is returned
  if (projects !== undefined) {
    const activeProjects = projects.filter((p) => p.availability !== 'removed');

    if (activeProjects.length === 0) {
      return (
        <div className="project-list-result-card">
          <div className="list-card-header">
            <span className="list-card-title">Registered Projects (0)</span>
          </div>
          <div className="card-path-row" style={{ padding: '8px 12px' }}>
            <span className="card-path-text text-muted">
              No registered projects in Bhai. Use "project add karo" to onboard a project.
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="project-list-result-card">
        <div className="list-card-header">
          <span className="list-card-title">Registered Projects ({activeProjects.length})</span>
        </div>

        <div className="project-items-col">
          {activeProjects.map((p) => (
            <div key={p.id} className="project-list-item-row" onClick={() => onOpenProjectDetail?.(p)}>
              <div className="item-row-left">
                <Folder size={14} className="folder-icon" />
                <span className="item-name">{p.displayName}</span>
                <span className="item-path" title={p.canonicalRoot}>{formatCompactPath(p.canonicalRoot)}</span>
              </div>
              <div className="item-row-right">
                <span className="item-services-count">{p.services?.length || 0} services</span>
                <span className={`status-dot ${p.availability}`}></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

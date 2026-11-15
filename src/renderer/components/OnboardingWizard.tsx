import React, { useState, useEffect } from 'react';
import { Folder, GitBranch, Check, AlertCircle, ArrowLeft, ArrowRight, Plus, Trash2, Layers } from 'lucide-react';
import { ProjectInspectionResult, ServiceDefinitionDto } from '../../shared/contracts/dto';

interface OnboardingWizardProps {
  onClose: () => void;
  onProjectRegistered: (projectId: string) => void;
}

type OnboardingStep = 'select' | 'inspecting' | 'review' | 'services' | 'success';

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onClose, onProjectRegistered }) => {
  const [step, setStep] = useState<OnboardingStep>('select');
  const [directoryPath, setDirectoryPath] = useState('');
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<ProjectInspectionResult | null>(null);

  // Review & Configure State
  const [displayName, setDisplayName] = useState('');
  const [services, setServices] = useState<ServiceDefinitionDto[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [isSaving, setIsSaving] = useState(false);
  const [registeredProjectId, setRegisteredProjectId] = useState<string | null>(null);

  // Step 1: Select directory via native folder picker
  const handleSelectNativeFolder = async () => {
    setInspectionError(null);
    try {
      const res = await window.bhaiApi.project.selectDirectory();
      if (!res.canceled && res.directoryPath) {
        setDirectoryPath(res.directoryPath);
        handleInspect(res.directoryPath);
      }
    } catch (err: any) {
      setInspectionError(err.message || 'Failed to open native folder picker');
    }
  };

  // Step 2: Read-Only Project Inspection
  const handleInspect = async (pathToInspect: string) => {
    if (!pathToInspect.trim()) return;
    setStep('inspecting');
    setInspectionError(null);

    try {
      const result = await window.bhaiApi.project.inspect(pathToInspect.trim());
      setInspectionResult(result);
      setDisplayName(result.displayName);
      setServices(result.services || []);
      setStep('review');
    } catch (err: any) {
      setInspectionError(err.message || 'Inspection failed');
      setStep('select');
    }
  };

  // Step 4: Configure services
  const handleAddService = () => {
    const newService: ServiceDefinitionDto = {
      id: `srv_${Date.now()}`,
      name: `Service-${services.length + 1}`,
      serviceType: 'custom',
      relativeCwd: '.',
      packageScript: 'npm run start',
      port: 3000
    };
    setServices([...services, newService]);
  };

  const handleUpdateService = (index: number, updates: Partial<ServiceDefinitionDto>) => {
    const updated = [...services];
    updated[index] = { ...updated[index], ...updates };
    setServices(updated);
  };

  const handleRemoveService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  // Step 5: Save Project
  const handleSaveProject = async () => {
    if (!inspectionResult) return;
    setIsSaving(true);
    setInspectionError(null);

    try {
      const created = await window.bhaiApi.project.create({
        displayName: displayName.trim() || inspectionResult.displayName,
        canonicalRoot: inspectionResult.canonicalPath,
        detectedMetadata: {
          technologies: inspectionResult.technologies,
          packageManager: inspectionResult.packageManager,
          isGitRepo: inspectionResult.isGitRepo,
          gitBranch: inspectionResult.gitBranch,
          rawMetadata: inspectionResult.rawMetadata
        },
        services
      });

      setRegisteredProjectId(created.id);
      setStep('success');
      onProjectRegistered(created.id);
    } catch (err: any) {
      setInspectionError(err.message || 'Failed to persist project');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="onboarding-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
        {/* Step Indicator Header */}
        <div className="onboarding-header">
          <div className="onboarding-brand-row">
            <span className="brand-b">b_</span>
            <span className="brand-title">Add a project</span>
          </div>
          <span className="step-badge">
            {step === 'select' && 'Step 1 of 4'}
            {step === 'inspecting' && 'Scanning...'}
            {step === 'review' && 'Step 2 of 4'}
            {step === 'services' && 'Step 3 of 4'}
            {step === 'success' && 'Done'}
          </span>
        </div>

        {/* Error banner */}
        {inspectionError && (
          <div className="onboarding-error-banner">
            <AlertCircle size={14} />
            <span>{inspectionError}</span>
          </div>
        )}

        {/* STEP 1: Select Directory */}
        {step === 'select' && (
          <div className="onboarding-step-body">
            <p className="onboarding-desc">
              Select a project directory on your Mac. Bhai will perform a safe, read-only inspection to discover technologies, package manifests, and services.
            </p>

            <div className="select-folder-action-box">
              <button className="primary-folder-btn" onClick={handleSelectNativeFolder}>
                <Folder size={16} />
                <span>Choose Folder...</span>
              </button>
              <span className="or-divider">or enter path manually</span>
              <div className="manual-path-row">
                <input
                  type="text"
                  className="manual-path-input"
                  placeholder="~/Developer/my-project"
                  value={directoryPath}
                  onChange={(e) => setDirectoryPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleInspect(directoryPath);
                  }}
                />
                <button
                  className="secondary-btn-sm"
                  disabled={!directoryPath.trim()}
                  onClick={() => handleInspect(directoryPath)}
                >
                  Scan
                </button>
              </div>
            </div>

            <div className="onboarding-step-footer">
              <button className="secondary-btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {/* STEP 2: Scanning / Inspecting */}
        {step === 'inspecting' && (
          <div className="onboarding-step-body inspecting-center">
            <div className="scanning-pulse"></div>
            <p className="scanning-text">Inspecting directory structure safely...</p>
            <span className="scanning-subtext">{directoryPath}</span>
          </div>
        )}

        {/* STEP 3: Review Findings */}
        {step === 'review' && inspectionResult && (
          <div className="onboarding-step-body">
            <p className="onboarding-desc">
              Review detected project structure. You can customize the display name before configuring services.
            </p>

            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Location</label>
              <div className="path-display-box">
                <Folder size={14} className="path-icon" />
                <span className="path-text">{inspectionResult.canonicalPath}</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Detected Technologies</label>
              <div className="tech-chips-row">
                {inspectionResult.technologies.length > 0 ? (
                  inspectionResult.technologies.map((t, i) => (
                    <span key={i} className="tech-chip">{t}</span>
                  ))
                ) : (
                  <span className="empty-subtext">No standard framework manifests detected.</span>
                )}
                {inspectionResult.packageManager && (
                  <span className="tech-chip pm">PM: {inspectionResult.packageManager}</span>
                )}
                {inspectionResult.isGitRepo && (
                  <span className="tech-chip git">
                    <GitBranch size={12} />
                    <span>{inspectionResult.gitBranch || 'git'}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="onboarding-step-footer">
              <button className="secondary-btn" onClick={() => setStep('select')}>
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <button className="primary-btn" onClick={() => setStep('services')}>
                <span>Configure Services ({services.length})</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Configure Services */}
        {step === 'services' && (
          <div className="onboarding-step-body">
            <div className="services-header-row">
              <p className="onboarding-desc">
                Register services for this project. Services will not be executed or started until approved.
              </p>
              <button className="add-service-btn" onClick={handleAddService}>
                <Plus size={14} />
                <span>Add Service</span>
              </button>
            </div>

            <div className="services-config-list">
              {services.length === 0 ? (
                <div className="empty-services-prompt">
                  <span>No services defined yet. Click "Add Service" to add one, or save as a single project.</span>
                </div>
              ) : (
                services.map((srv, idx) => (
                  <div key={srv.id || idx} className="service-config-card">
                    <div className="service-row-top">
                      <input
                        type="text"
                        className="service-name-input"
                        placeholder="Service Name (e.g. Backend)"
                        value={srv.name}
                        onChange={(e) => handleUpdateService(idx, { name: e.target.value })}
                      />
                      <select
                        className="service-type-select"
                        value={srv.serviceType}
                        onChange={(e) => handleUpdateService(idx, { serviceType: e.target.value })}
                      >
                        <option value="backend">Backend</option>
                        <option value="frontend">Frontend</option>
                        <option value="worker">Worker</option>
                        <option value="custom">Custom</option>
                      </select>
                      <button
                        className="remove-srv-btn"
                        onClick={() => handleRemoveService(idx)}
                        title="Remove service"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="service-row-bottom">
                      <div className="field-group-half">
                        <label className="sub-label">Working Directory</label>
                        <input
                          type="text"
                          className="sub-input"
                          placeholder="."
                          value={srv.relativeCwd}
                          onChange={(e) => handleUpdateService(idx, { relativeCwd: e.target.value })}
                        />
                      </div>
                      <div className="field-group-half">
                        <label className="sub-label">Expected Port</label>
                        <input
                          type="number"
                          className="sub-input"
                          placeholder="e.g. 3000"
                          value={srv.port || ''}
                          onChange={(e) => handleUpdateService(idx, { port: e.target.value ? parseInt(e.target.value, 10) : null })}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="onboarding-step-footer">
              <button className="secondary-btn" onClick={() => setStep('review')}>
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <button className="primary-btn" onClick={handleSaveProject} disabled={isSaving}>
                <Check size={14} />
                <span>{isSaving ? 'Saving...' : 'Save Project'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Success State */}
        {step === 'success' && (
          <div className="onboarding-step-body success-center">
            <div className="success-icon-wrap">
              <Check size={28} />
            </div>
            <span className="success-title">Project Registered</span>
            <p className="success-desc">
              "{displayName}" is now registered in Bhai with {services.length} service{services.length === 1 ? '' : 's'}. You can inspect it anytime using natural commands like <code>{displayName.toLowerCase()} project dikha</code>.
            </p>

            <div className="success-actions-row">
              <button
                className="secondary-btn"
                onClick={() => {
                  setStep('select');
                  setDirectoryPath('');
                  setInspectionResult(null);
                  setServices([]);
                }}
              >
                Add Another Project
              </button>
              <button className="primary-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

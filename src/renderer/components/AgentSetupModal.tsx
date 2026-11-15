import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, Cpu, ShieldCheck, RefreshCw, Terminal, Monitor, CheckCircle2, AlertCircle } from 'lucide-react';

interface AgentSetupModalProps {
  onClose: () => void;
}

export const AgentSetupModal: React.FC<AgentSetupModalProps> = ({ onClose }) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<{ installedTargets: string[]; installedFiles: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);

  // Load detected agents on mount
  useEffect(() => {
    let mounted = true;
    window.bhaiApi.agent.getStatus()
      .then((res) => {
        if (mounted) setAgents(res || []);
      })
      .catch((err) => console.error('Failed to detect agents:', err))
      .finally(() => {
        if (mounted) setIsLoadingAgents(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleInstallGlobal = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      const res = await window.bhaiApi.agent.installSkill({
        global: true,
        targets: ['antigravity', 'codex', 'claude-code', 'cursor']
      });
      setInstallResult(res);

      // Refresh agent statuses
      const updated = await window.bhaiApi.agent.getStatus();
      setAgents(updated || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to install skill across agents.');
    } finally {
      setIsInstalling(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="p3-submodal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="p3-submodal-card"
        style={{ maxWidth: '480px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p3-submodal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span className="p3-submodal-title">AI Coding Agents & CLI Integration</span>
          </div>
          <button className="p3-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={14} />
          </button>
        </div>

        <div className="p3-submodal-body">
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            Teach your AI coding agents how and when to use Bhai offline memory across <strong>all sessions and projects</strong>.
          </p>

          {/* Detected Agents & CLIs on User's Mac */}
          <div
            style={{
              backgroundColor: 'var(--surface-secondary)',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Detected on this Mac
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                {agents.length} agent{agents.length === 1 ? '' : 's'} found
              </span>
            </div>

            {isLoadingAgents ? (
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', padding: '6px 0' }}>
                Detecting installed CLIs and IDEs...
              </div>
            ) : agents.length === 0 ? (
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', padding: '6px 0' }}>
                No standard coding agents detected in /Applications or PATH.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '2px' }}>
                {agents.map((ag) => (
                  <div
                    key={ag.agent}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--surface-elevated)',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--card-border)',
                      fontSize: '11.5px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {ag.category === 'cli' ? (
                        <Terminal size={13} style={{ color: 'var(--text-secondary)' }} />
                      ) : (
                        <Monitor size={13} style={{ color: 'var(--text-secondary)' }} />
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ag.name}</span>
                      <span className="p3-tech-pill" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
                        {ag.category}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {ag.appInstalled && (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>App</span>
                      )}
                      {ag.cliInstalled && (
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>CLI</span>
                      )}
                      {ag.globalSkillInstalled ? (
                        <span className="p3-git-clean-pill clean" style={{ fontSize: '9px' }}>
                          Skill Installed
                        </span>
                      ) : (
                        <span className="p3-git-clean-pill modified" style={{ fontSize: '9px' }}>
                          Ready to Install
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="p3-submodal-error" style={{ borderRadius: '6px' }}>
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          {installResult && (
            <div
              style={{
                backgroundColor: 'rgba(52, 199, 89, 0.1)',
                border: '1px solid rgba(52, 199, 89, 0.25)',
                padding: '10px 12px',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34c759', fontWeight: 600, fontSize: '12px' }}>
                <CheckCircle2 size={15} />
                <span>Global Skill Installed Successfully!</span>
              </div>
              <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Installed to your global user configuration. Any new session at any repository will now have access to Bhai offline memory guidelines.
              </p>
              <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                Installed files:
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {installResult.installedFiles.map((file, i) => (
                    <li key={i} style={{ wordBreak: 'break-all' }}>{file.replace(/^\/Users\/[^/]+/, '~')}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="p3-submodal-footer">
          <button className="p3-btn secondary" onClick={onClose}>
            {installResult ? 'Done' : 'Cancel'}
          </button>
          {!installResult && (
            <button
              className="p3-btn primary"
              onClick={handleInstallGlobal}
              disabled={isInstalling}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {isInstalling ? (
                <>
                  <RefreshCw size={12} className="spinning" />
                  <span>Installing Globally...</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>Install Guiding Skill Globally</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

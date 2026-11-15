import React from 'react';
import { X, Terminal, CheckCircle2, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';
import { EngineDiagnostics } from '../../language/types';

interface DevDiagnosticsProps {
  diagnostics: EngineDiagnostics | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DevDiagnostics: React.FC<DevDiagnosticsProps> = ({
  diagnostics,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const getDispositionBadge = (decision?: string) => {
    switch (decision) {
      case 'resolved':
        return <span className="diag-badge badge-resolved"><CheckCircle2 size={12} /> Resolved</span>;
      case 'clarify':
        return <span className="diag-badge badge-clarify"><AlertTriangle size={12} /> Clarify</span>;
      case 'negated':
        return <span className="diag-badge badge-negated"><ShieldAlert size={12} /> Negated</span>;
      case 'invalid':
        return <span className="diag-badge badge-invalid">Invalid</span>;
      case 'unsupported':
      default:
        return <span className="diag-badge badge-unsupported">Unsupported</span>;
    }
  };

  return (
    <div className="dev-diagnostics-drawer" role="complementary" aria-label="Developer Diagnostics">
      <div className="diag-header">
        <div className="diag-title-row">
          <Terminal size={15} strokeWidth={1.8} className="diag-icon" />
          <span className="diag-title">Language Engine Diagnostics</span>
          {diagnostics && getDispositionBadge(diagnostics.finalDecision)}
        </div>
        <button className="diag-close-btn" onClick={onClose} aria-label="Close diagnostics">
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="diag-content">
        {!diagnostics ? (
          <div className="diag-empty">No telemetry recorded. Submit a command to inspect pipeline decisions.</div>
        ) : (
          <div className="diag-grid">
            <div className="diag-row">
              <span className="diag-key">Raw Input:</span>
              <code className="diag-val">{diagnostics.originalInput}</code>
            </div>

            <div className="diag-row">
              <span className="diag-key">Normalized:</span>
              <code className="diag-val">{diagnostics.normalizedText || '(empty)'}</code>
            </div>

            <div className="diag-row">
              <span className="diag-key">Grammar Rule:</span>
              <span className="diag-val rule-tag">{diagnostics.grammarRuleOrSource}</span>
            </div>

            <div className="diag-row">
              <span className="diag-key">Detected Intent:</span>
              <span className="diag-val">{diagnostics.detectedIntent || 'None'}</span>
            </div>

            <div className="diag-row">
              <span className="diag-key">Extracted Params:</span>
              <code className="diag-val">
                {diagnostics.extractedParams ? JSON.stringify(diagnostics.extractedParams) : 'None'}
              </code>
            </div>

            <div className="diag-row">
              <span className="diag-key">Negation Scan:</span>
              <span className="diag-val">
                {diagnostics.negationResult?.hasNegation ? (
                  <span className="text-warning">
                    Detected ({diagnostics.negationResult.markers.join(', ')})
                  </span>
                ) : (
                  'None'
                )}
              </span>
            </div>

            <div className="diag-row">
              <span className="diag-key">Capability Gating:</span>
              <span className="diag-val">
                {diagnostics.capabilityAvailability ? (
                  <span>
                    {diagnostics.capabilityAvailability.actionId} (P2 Executable:{' '}
                    {diagnostics.capabilityAvailability.isExecutableInP2 ? 'Yes' : 'No [Gated]'})
                  </span>
                ) : (
                  'Not matched to catalog'
                )}
              </span>
            </div>

            {diagnostics.fuzzyCandidates && diagnostics.fuzzyCandidates.length > 0 && (
              <div className="diag-row full-width">
                <span className="diag-key">Fuzzy Suggestions:</span>
                <div className="diag-fuzzy-list">
                  {diagnostics.fuzzyCandidates.map((c) => (
                    <div key={c.id} className="diag-fuzzy-chip">
                      <span className="fuzzy-label">{c.label}</span>
                      <span className="fuzzy-kind">[{c.kind}]</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnostics.reason && (
              <div className="diag-row full-width">
                <span className="diag-key">Reason / Policy:</span>
                <span className="diag-val text-muted">{diagnostics.reason}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

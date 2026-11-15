import React, { useState } from 'react';
import { X, FileCheck2 } from 'lucide-react';

interface DecisionEditorProps {
  decision?: any;
  projectId: string;
  onSave: (decision: any) => Promise<void>;
  onCancel: () => void;
}

export const DecisionEditor: React.FC<DecisionEditorProps> = ({
  decision,
  projectId,
  onSave,
  onCancel
}) => {
  const [title, setTitle] = useState(decision?.title || '');
  const [status, setStatus] = useState(decision?.status || 'proposed');
  const [contextText, setContextText] = useState(decision?.context || '');
  const [decisionText, setDecisionText] = useState(decision?.decision || '');
  const [consequences, setConsequences] = useState(decision?.consequences || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !decisionText.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        id: decision?.id,
        projectId,
        title: title.trim(),
        status,
        context: contextText.trim(),
        decision: decisionText.trim(),
        consequences: consequences.trim(),
        authorType: decision?.authorType || 'user',
        authorId: decision?.authorId || 'bhai_user'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="p3-submodal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="p3-submodal-card"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p3-submodal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <FileCheck2 size={14} style={{ color: '#ff9500' }} />
            <span className="p3-submodal-title">
              {decision ? 'Edit Architectural Decision' : 'New Architectural Decision (ADR)'}
            </span>
          </div>
          <button className="p3-icon-btn" onClick={onCancel} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p3-submodal-body">
            <div className="p3-field-group">
              <label className="p3-field-label">Decision Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. ADR-003: Postgres over DynamoDB"
                className="p3-input"
                required
                autoFocus
              />
            </div>

            <div className="p3-fields-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="p3-field-group">
                <label className="p3-field-label">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="p3-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="proposed">Proposed (Pending Review)</option>
                  <option value="accepted">Accepted (Active Invariant)</option>
                  <option value="rejected">Rejected</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>

              <div className="p3-field-group">
                <label className="p3-field-label">Author Identity</label>
                <input
                  type="text"
                  disabled
                  value={decision?.authorId || 'User (You)'}
                  className="p3-input"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
            </div>

            <div className="p3-field-group">
              <label className="p3-field-label">Decision & Invariant (Required)</label>
              <textarea
                rows={3}
                value={decisionText}
                onChange={(e) => setDecisionText(e.target.value)}
                placeholder="What architectural decision was made? What is the enforced rule?"
                className="p3-input"
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
                required
              />
            </div>

            <div className="p3-field-group">
              <label className="p3-field-label">Context & Problem Statement</label>
              <textarea
                rows={2}
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                placeholder="Why was this decision required? What constraints existed?"
                className="p3-input"
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
              />
            </div>

            <div className="p3-field-group">
              <label className="p3-field-label">Consequences & Trade-offs</label>
              <textarea
                rows={2}
                value={consequences}
                onChange={(e) => setConsequences(e.target.value)}
                placeholder="What becomes easier or harder as a result?"
                className="p3-input"
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
              />
            </div>
          </div>

          <div className="p3-submodal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 14px', borderTop: '1px solid var(--border-divider)' }}>
            <button type="button" onClick={onCancel} className="p3-btn secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !decisionText.trim()}
              className="p3-btn primary"
            >
              {isSubmitting ? 'Saving...' : 'Save Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

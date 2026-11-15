import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Pencil, Trash2, CheckCircle2, AlertCircle, Plus, Check } from 'lucide-react';
import { AliasDto } from '../../shared/contracts/dto';

interface TeachModalProps {
  initialPhrase?: string;
  onClose: () => void;
  onAliasSaved?: (phrase: string) => void;
}

const SUPPORTED_TARGETS = [
  { id: 'system.memory.inspect', kind: 'action' as const, label: 'Inspect System Memory [Executable]' },
  { id: 'system.cpu.inspect', kind: 'action' as const, label: 'Inspect CPU Activity' },
  { id: 'system.disk.inspect', kind: 'action' as const, label: 'Inspect Disk Space' },
  { id: 'system.battery.inspect', kind: 'action' as const, label: 'Inspect Battery Status' },
  { id: 'W_OFFICE', kind: 'workflow' as const, label: 'Office Start Routine' },
  { id: 'W_WRAP', kind: 'workflow' as const, label: 'Wrap Up Routine' }
];

const CORE_RESERVED_COMMANDS = new Set([
  'memory', 'memory usage', 'memory dekh', 'ram dekh', 'bhai memory dekh', 'bhai ram dekh',
  'cpu', 'cpu usage', 'disk space', 'battery status', 'port 3000 check', 'volume 50'
]);

export const TeachModal: React.FC<TeachModalProps> = ({
  initialPhrase = '',
  onClose,
  onAliasSaved
}) => {
  const [phrase, setPhrase] = useState(initialPhrase.replace(/^bhai\s+/i, ''));
  const [targetId, setTargetId] = useState(SUPPORTED_TARGETS[0].id);
  const [aliases, setAliases] = useState<AliasDto[]>([]);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount and restore previous focus on unmount
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      prevFocus?.focus?.();
    };
  }, []);

  // Keyboard shortcut listener for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Load aliases from storage
  const loadAliases = async () => {
    try {
      const list = await window.bhaiApi.alias.list();
      setAliases(list);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load existing phrases.' });
    }
  };

  useEffect(() => {
    loadAliases();
  }, []);

  // Validation state
  const validation = useMemo(() => {
    const trimmed = phrase.trim().toLowerCase();
    if (!trimmed) {
      return { isValid: false, reason: 'Enter a phrase to save.' };
    }
    if (trimmed.length > 128) {
      return { isValid: false, reason: 'Phrase exceeds 128 characters.' };
    }
    if (/[;&|><$`\\]/.test(trimmed)) {
      return { isValid: false, reason: 'Phrase cannot contain shell metacharacters.' };
    }
    if (/\b(?:mat|nahi|nahin|don't|not|never|dont)\b/i.test(trimmed)) {
      return { isValid: false, reason: 'Phrases cannot contain negation words.' };
    }
    if (CORE_RESERVED_COMMANDS.has(trimmed)) {
      return { isValid: false, reason: `"${trimmed}" is reserved by a built-in system command.` };
    }
    const collision = aliases.find((a) => a.normalizedPhrase === trimmed && a.id !== editingAliasId);
    if (collision) {
      return { isValid: false, reason: `Phrase is already mapped to ${collision.targetId}.` };
    }
    return { isValid: true, reason: null };
  }, [phrase, aliases, editingAliasId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid || isSubmitting) return;

    setFeedback(null);
    setIsSubmitting(true);
    const trimmed = phrase.trim().toLowerCase();
    const selectedTarget = SUPPORTED_TARGETS.find((t) => t.id === targetId) || SUPPORTED_TARGETS[0];

    try {
      if (editingAliasId) {
        // Update existing alias
        if (window.bhaiApi.alias.update) {
          await window.bhaiApi.alias.update({
            id: editingAliasId,
            phrase: trimmed,
            targetKind: selectedTarget.kind,
            targetId: selectedTarget.id
          });
        } else {
          // Fallback: delete + create
          await window.bhaiApi.alias.delete(editingAliasId);
          await window.bhaiApi.alias.create({
            phrase: trimmed,
            targetKind: selectedTarget.kind,
            targetId: selectedTarget.id
          });
        }
        setFeedback({ type: 'success', message: `Phrase "${trimmed}" updated.` });
      } else {
        // Create new alias
        await window.bhaiApi.alias.create({
          phrase: trimmed,
          targetKind: selectedTarget.kind,
          targetId: selectedTarget.id
        });
        setFeedback({ type: 'success', message: `Phrase "${trimmed}" saved.` });
      }

      setPhrase('');
      setEditingAliasId(null);
      await loadAliases();

      // Notify parent without executing the mapped command
      if (onAliasSaved) {
        onAliasSaved(trimmed);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save phrase.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (alias: AliasDto) => {
    setEditingAliasId(alias.id);
    setPhrase(alias.phrase);
    setTargetId(alias.targetId);
    setFeedback(null);
    inputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingAliasId(null);
    setPhrase('');
    setFeedback(null);
  };

  const handleDelete = async (id: string, phraseLabel: string) => {
    try {
      await window.bhaiApi.alias.delete(id);
      setFeedback({ type: 'success', message: `Deleted phrase "${phraseLabel}".` });
      if (editingAliasId === id) {
        handleCancelEdit();
      }
      await loadAliases();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete phrase.' });
    }
  };

  return (
    <div className="teach-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="teach-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="teach-header">
          <div className="teach-header-text">
            <h3 className="teach-title">Teach Bhai</h3>
            <p className="teach-subtitle">Create your own phrases for commands.</p>
          </div>
          <button
            className="teach-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`teach-alert ${feedback.type}`}>
            {feedback.type === 'error' ? (
              <AlertCircle size={14} strokeWidth={2} className="alert-icon" />
            ) : (
              <CheckCircle2 size={14} strokeWidth={2} className="alert-icon" />
            )}
            <span className="alert-text">{feedback.message}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="teach-form">
          <div className="teach-field-group">
            <div className="teach-label-row">
              <label htmlFor="teach-phrase-input" className="teach-label">
                When I say
              </label>
              {editingAliasId && (
                <button
                  type="button"
                  className="teach-cancel-edit-btn"
                  onClick={handleCancelEdit}
                >
                  Cancel editing
                </button>
              )}
            </div>
            <input
              id="teach-phrase-input"
              ref={inputRef}
              type="text"
              className={`teach-input ${!validation.isValid && phrase.trim() ? 'invalid' : ''}`}
              placeholder='e.g. "mera laptop check kar"'
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
            {/* Inline validation message */}
            {!validation.isValid && phrase.trim() && (
              <span className="teach-inline-hint error">{validation.reason}</span>
            )}
          </div>

          <div className="teach-field-group">
            <label htmlFor="teach-target-select" className="teach-label">
              Bhai executes
            </label>
            <div className="teach-select-wrapper">
              <select
                id="teach-target-select"
                className="teach-select"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {SUPPORTED_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="teach-form-footer">
            <div className="teach-disabled-reason">
              {!validation.isValid && !phrase.trim() && (
                <span className="teach-inline-hint muted">{validation.reason}</span>
              )}
            </div>
            <button
              type="submit"
              className="teach-submit-btn"
              disabled={isSubmitting || !validation.isValid}
              title={validation.isValid ? 'Save this phrase' : (validation.reason || 'Enter phrase')}
            >
              {editingAliasId ? (
                <>
                  <Check size={13} strokeWidth={2.2} />
                  <span>Update Phrase</span>
                </>
              ) : (
                <>
                  <Plus size={13} strokeWidth={2.2} />
                  <span>Save Phrase</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="teach-divider" />

        {/* Saved Phrases Section */}
        <div className="teach-saved-section">
          <div className="teach-section-header">
            <span className="teach-section-title">Saved Phrases</span>
            <span className="teach-count-badge">{aliases.length}</span>
          </div>

          {aliases.length === 0 ? (
            <div className="teach-empty-state">
              <span>No custom phrases yet. Create one above.</span>
            </div>
          ) : (
            <div className="teach-aliases-list">
              {aliases.map((item) => {
                const isCurrentEdit = editingAliasId === item.id;
                const targetObj = SUPPORTED_TARGETS.find((t) => t.id === item.targetId);
                const displayTarget = targetObj ? targetObj.label.replace(' [Executable]', '') : item.targetId;

                return (
                  <div key={item.id} className={`teach-alias-row ${isCurrentEdit ? 'editing' : ''}`}>
                    <div className="teach-alias-body">
                      <span className="teach-alias-phrase">"{item.phrase}"</span>
                      <span className="teach-alias-sep">→</span>
                      <span className="teach-alias-target" title={item.targetId}>
                        {displayTarget}
                      </span>
                    </div>
                    <div className="teach-alias-actions">
                      <button
                        type="button"
                        className="teach-action-btn edit"
                        onClick={() => handleStartEdit(item)}
                        title={`Edit "${item.phrase}"`}
                        aria-label={`Edit "${item.phrase}"`}
                      >
                        <Pencil size={12} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="teach-action-btn delete"
                        onClick={() => handleDelete(item.id, item.phrase)}
                        title={`Delete "${item.phrase}"`}
                        aria-label={`Delete "${item.phrase}"`}
                      >
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

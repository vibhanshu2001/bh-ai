import React from 'react';
import { ChevronRight, HelpCircle, Sparkles } from 'lucide-react';

interface UnsupportedCardProps {
  text: string;
  teachCandidatePhrase?: string;
  onSelectCommand: (cmd: string) => void;
  onTeachPhrase?: (phrase: string) => void;
}

export const UnsupportedCard: React.FC<UnsupportedCardProps> = ({
  text,
  teachCandidatePhrase,
  onSelectCommand,
  onTeachPhrase
}) => {
  return (
    <div className="unsupported-card">
      <div className="unsupported-card-header">
        <HelpCircle size={15} strokeWidth={2} className="unsupported-status-icon" />
        <span className="unsupported-title">Command not recognized</span>
      </div>

      <p className="unsupported-desc">
        {text || "I don't know this phrase yet. You can teach me what it should do, or try a standard command:"}
      </p>

      <div className="unsupported-actions-row">
        {teachCandidatePhrase && onTeachPhrase && (
          <button
            className="unsupported-teach-action-btn"
            onClick={() => onTeachPhrase(teachCandidatePhrase)}
            title={`Teach Bhai what "${teachCandidatePhrase}" means`}
          >
            <Sparkles size={12} strokeWidth={2.2} />
            <span>Teach Bhai</span>
          </button>
        )}

        <button
          className="unsupported-suggestion-chip"
          onClick={() => onSelectCommand('bhai memory dekh')}
          title="Run 'bhai memory dekh'"
        >
          <ChevronRight size={12} strokeWidth={2.2} className="unsupported-chip-arrow" />
          <span>memory dekh</span>
        </button>

        <button
          className="unsupported-suggestion-chip"
          onClick={() => onSelectCommand('mere projects dikhao')}
          title="Run 'mere projects dikhao'"
        >
          <ChevronRight size={12} strokeWidth={2.2} className="unsupported-chip-arrow" />
          <span>projects dikha</span>
        </button>
      </div>
    </div>
  );
};

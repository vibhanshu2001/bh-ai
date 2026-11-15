import React from 'react';
import { HelpCircle, ChevronRight } from 'lucide-react';
import { ClarificationCandidate } from '../../shared/contracts/dto';

interface ClarificationCardProps {
  question: string;
  candidates: ClarificationCandidate[];
  draftId?: string;
  onSelectCandidate: (candidateId: string, draftId?: string) => void;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({
  question,
  candidates,
  draftId,
  onSelectCandidate
}) => {
  return (
    <div className="clarification-card">
      <div className="clarification-header">
        <HelpCircle size={15} strokeWidth={1.8} className="clarification-icon" />
        <span className="clarification-question">{question}</span>
      </div>

      <div className="clarification-candidates-row">
        {candidates.map((c) => (
          <button
            key={c.id}
            className="clarification-candidate-pill"
            onClick={() => onSelectCandidate(c.id, draftId)}
            title={c.description || c.label}
          >
            <ChevronRight size={13} strokeWidth={2} className="candidate-arrow" />
            <span className="candidate-label">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

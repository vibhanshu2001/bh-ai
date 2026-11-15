import React from 'react';
import { Ban } from 'lucide-react';

interface NegationCardProps {
  explanation: string;
}

export const NegationCard: React.FC<NegationCardProps> = ({ explanation }) => {
  return (
    <div className="negation-card">
      <div className="negation-badge">
        <Ban size={14} strokeWidth={2} className="negation-icon" />
        <span className="negation-title">Command Cancelled</span>
      </div>
      <div className="negation-body">{explanation}</div>
    </div>
  );
};

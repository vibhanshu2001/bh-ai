import React, { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { MessageDto, ProjectDto } from '../../shared/contracts/dto';
import { MemoryCard } from './MemoryCard';
import { UnsupportedCard } from './UnsupportedCard';
import { ClarificationCard } from './ClarificationCard';
import { NegationCard } from './NegationCard';
import { ProjectResultCard } from './ProjectResultCard';
import { BhaiLogo } from './Logo';

interface MessageListProps {
  messages: MessageDto[];
  onSelectCommand: (cmd: string) => void;
  onSelectCandidate?: (candidateId: string, draftId?: string) => void;
  onTeachPhrase?: (phrase: string) => void;
  onOpenProjectDetail?: (project: ProjectDto) => void;
  onOpenEditor?: (projectId: string) => void;
  onOpenTerminal?: (projectId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onSelectCommand,
  onSelectCandidate,
  onTeachPhrase,
  onOpenProjectDetail,
  onOpenEditor,
  onOpenTerminal
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(messages.length);

  useEffect(() => {
    // Only scroll to bottom when new messages arrive
    if (messages.length > prevCountRef.current) {
      const container = containerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="idle-welcome-pane">
        <div className="idle-logo-wrapper">
          <BhaiLogo size={36} variant="glyph-only" />
        </div>

        <h2 className="idle-heading">Ready when you are.</h2>
        <p className="idle-subheading">Type a command or choose a suggestion below</p>

        <div className="idle-chips-row">
          <button
            className="idle-suggestion-chip"
            onClick={() => onSelectCommand('bhai memory dekh')}
            title="Inspect system memory"
          >
            <ChevronRight size={13} strokeWidth={2.2} className="idle-chip-arrow" />
            <span>memory dekh</span>
          </button>

          <button
            className="idle-suggestion-chip"
            onClick={() => onSelectCommand('mere projects dikhao')}
            title="Show registered projects"
          >
            <ChevronRight size={13} strokeWidth={2.2} className="idle-chip-arrow" />
            <span>projects dikha</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="conversation-pane" role="log" aria-live="polite">
      {messages.map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="chat-row user-row">
              <div className="user-command-bubble">
                <span className="user-command-text">{m.body}</span>
              </div>
            </div>
          );
        }

        // Assistant Message
        return (
          <div key={m.id} className="chat-row assistant-row">
            {m.kind === 'result' && m.payload?.totalBytes ? (
              <MemoryCard data={m.payload} />
            ) : m.kind === 'result' && (m.payload?.project || m.payload?.projects) ? (
              <ProjectResultCard
                project={m.payload?.project}
                projects={m.payload?.projects}
                actionId={m.payload?.actionId}
                onOpenProjectDetail={onOpenProjectDetail}
                onOpenEditor={onOpenEditor}
                onOpenTerminal={onOpenTerminal}
              />
            ) : m.kind === 'clarify' && m.payload?.candidates ? (
              <ClarificationCard
                question={m.body}
                candidates={m.payload.candidates}
                draftId={m.payload.draftId}
                onSelectCandidate={onSelectCandidate || (() => {})}
              />
            ) : m.kind === 'negated' ? (
              <NegationCard explanation={m.body} />
            ) : m.kind === 'unsupported' ? (
              <UnsupportedCard
                text={m.body}
                teachCandidatePhrase={m.payload?.teachCandidatePhrase}
                onSelectCommand={onSelectCommand}
                onTeachPhrase={onTeachPhrase}
              />
            ) : (
              <div className="assistant-plain-bubble">
                <div className="assistant-plain-text">{m.body}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

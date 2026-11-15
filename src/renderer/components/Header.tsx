import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Check, Trash2, BookOpen, Terminal, FolderPlus, MoreHorizontal, Sparkles } from 'lucide-react';
import { ChatDto } from '../../shared/contracts/dto';
import { BhaiLogo } from './Logo';

interface HeaderProps {
  currentChat: ChatDto | null;
  chats: ChatDto[];
  isDropdownOpen: boolean;
  isDiagnosticsOpen?: boolean;
  onToggleDropdown: () => void;
  onCloseDropdown?: () => void;
  onSelectChat: (chat: ChatDto) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onOpenTeachModal?: () => void;
  onOpenAddProject?: () => void;
  onOpenAgentSetup?: () => void;
  onToggleDiagnostics?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentChat,
  chats,
  isDropdownOpen,
  isDiagnosticsOpen = false,
  onToggleDropdown,
  onCloseDropdown,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenTeachModal,
  onOpenAddProject,
  onOpenAgentSetup,
  onToggleDiagnostics
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  const closeDropdown = () => {
    if (onCloseDropdown) {
      onCloseDropdown();
    } else if (isDropdownOpen) {
      onToggleDropdown();
    }
  };

  // Close conversation dropdown on click outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        pillRef.current &&
        !pillRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, onCloseDropdown, onToggleDropdown]);

  // Close more menu on click outside
  useEffect(() => {
    if (!isMoreOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreOpen]);

  // Keyboard shortcut listener for Escape
  useEffect(() => {
    if (!isDropdownOpen && !isMoreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDropdownOpen) {
          closeDropdown();
        }
        if (isMoreOpen) {
          setIsMoreOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDropdownOpen, isMoreOpen, onCloseDropdown, onToggleDropdown]);

  return (
    <header className="app-header">
      {/* Brand & Active Chat Pill */}
      <div className="header-left">
        <div className="brand-lockup">
          <BhaiLogo size={18} variant="squircle" />
          <span className="brand-wordmark">Bhai</span>
        </div>

        <span className="header-separator">/</span>

        <button
          ref={pillRef}
          className="chat-pill-btn"
          onClick={() => {
            setIsMoreOpen(false);
            onToggleDropdown();
          }}
          title="Switch conversation"
          aria-label="Switch conversation"
          aria-expanded={isDropdownOpen}
        >
          <span className="chat-pill-title">{currentChat?.title || 'General'}</span>
          <ChevronDown size={12} strokeWidth={2} className="chat-pill-chevron" />
        </button>
      </div>

      {/* Streamlined Right Actions: New Chat & More Menu */}
      <div className="header-right" ref={moreRef}>
        <button
          className="header-icon-btn"
          onClick={() => {
            setIsMoreOpen(false);
            onNewChat();
          }}
          title="New conversation (⌘N)"
          aria-label="New conversation (⌘N)"
        >
          <Plus size={16} strokeWidth={1.8} />
        </button>

        <button
          className={`header-icon-btn ${isMoreOpen ? 'active' : ''}`}
          onClick={() => {
            if (isDropdownOpen) onToggleDropdown();
            setIsMoreOpen((prev) => !prev);
          }}
          title="More actions"
          aria-label="More actions"
          aria-expanded={isMoreOpen}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>

        {isMoreOpen && (
          <div className="header-more-popover" role="menu">
            {onOpenAddProject && (
              <button
                className="header-more-item"
                role="menuitem"
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenAddProject();
                }}
              >
                <FolderPlus size={14} strokeWidth={1.8} />
                <span>Add Project…</span>
              </button>
            )}

            {onOpenTeachModal && (
              <button
                className="header-more-item"
                role="menuitem"
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenTeachModal();
                }}
              >
                <BookOpen size={14} strokeWidth={1.8} />
                <span>Teach Bhai…</span>
              </button>
            )}

            {onOpenAgentSetup && (
              <button
                className="header-more-item"
                role="menuitem"
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenAgentSetup();
                }}
              >
                <Sparkles size={14} strokeWidth={1.8} />
                <span>Agent Skill Setup…</span>
              </button>
            )}

            <div className="header-more-divider" />

            {onToggleDiagnostics && (
              <button
                className="header-more-item"
                role="menuitem"
                onClick={() => {
                  setIsMoreOpen(false);
                  onToggleDiagnostics();
                }}
              >
                <Terminal size={14} strokeWidth={1.8} />
                <span>Diagnostics</span>
                <span className="header-more-item-shortcut">⌘⌥D</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Conversation Switcher Dropdown */}
      {isDropdownOpen && (
        <div ref={dropdownRef} className="chat-dropdown-popover" role="menu">
          <div className="dropdown-section-header">Conversations</div>
          <div className="dropdown-list">
            {chats.map((c) => {
              const isActive = currentChat?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`dropdown-row ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectChat(c)}
                  role="menuitem"
                >
                  <div className="dropdown-row-left">
                    <span className="dropdown-check">
                      {isActive && <Check size={13} strokeWidth={2.4} />}
                    </span>
                    <span className="dropdown-title">{c.title}</span>
                  </div>
                  {chats.length > 1 && (
                    <button
                      className="dropdown-row-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(c.id);
                      }}
                      title="Delete conversation"
                      aria-label={`Delete conversation ${c.title}`}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};

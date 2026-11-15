import React, { useState, useEffect, useCallback } from 'react';
import { ChatDto, MessageDto, ProjectDto } from '../shared/contracts/dto';
import { EngineDiagnostics } from '../language/types';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { CommandInput } from './components/CommandInput';
import { TeachModal } from './components/TeachModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { MemoryHub } from './components/memory/MemoryHub';
import { DevDiagnostics } from './components/DevDiagnostics';
import { AgentSetupModal } from './components/AgentSetupModal';
import './types';

export const App: React.FC = () => {
  const [chats, setChats] = useState<ChatDto[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Teach Modal state
  const [isTeachModalOpen, setIsTeachModalOpen] = useState(false);
  const [teachModalInitialPhrase, setTeachModalInitialPhrase] = useState('');

  // Agent Setup Skill Modal state
  const [isAgentSetupOpen, setIsAgentSetupOpen] = useState(false);

  // Project Onboarding & Details state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<ProjectDto | null>(null);
  const [memoryHubProject, setMemoryHubProject] = useState<ProjectDto | null>(null);

  // Diagnostics state
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [latestDiagnostics, setLatestDiagnostics] = useState<EngineDiagnostics | null>(null);

  // Load chat list on mount
  const loadChats = useCallback(async () => {
    try {
      const list = await window.bhaiApi.chat.list();
      if (list.length > 0) {
        setChats(list);
        if (!activeChat) {
          setActiveChat(list[0]);
        }
      } else {
        // Auto-create initial default chat if none exists on launch
        const initial = await window.bhaiApi.chat.create('General');
        setChats([initial]);
        setActiveChat(initial);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  }, [activeChat]);

  // Load messages whenever active chat changes
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const msgs = await window.bhaiApi.chat.getMessages(chatId);
      setMessages(msgs);
      // Restore latest diagnostics from last assistant message payload if present
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].payload?.diagnostics) {
          setLatestDiagnostics(msgs[i].payload.diagnostics);
          break;
        }
      }
    } catch (err) {
      console.error('Failed to load messages for chat:', chatId, err);
    }
  }, []);

  // Adaptive Window Dimensions:
  // - Memory Hub Workspace: 760x600 expanded dedicated workspace
  // - Standard conversation / modals: 440x540
  // - Compact idle state: 440x250
  useEffect(() => {
    if (memoryHubProject) {
      window.bhaiApi?.app?.setDimensions?.(760, 600);
    } else {
      const isExpanded = messages.length > 0 || isTeachModalOpen || isAgentSetupOpen || isDiagnosticsOpen || isOnboardingOpen || !!selectedProjectForDetail;
      const targetHeight = isExpanded ? 540 : 250;
      if (window.bhaiApi?.app?.setDimensions) {
        window.bhaiApi.app.setDimensions(440, targetHeight);
      } else {
        window.bhaiApi?.app?.setHeight?.(targetHeight);
      }
    }
  }, [messages.length, isTeachModalOpen, isAgentSetupOpen, isDiagnosticsOpen, isOnboardingOpen, selectedProjectForDetail, memoryHubProject]);

  useEffect(() => {
    loadChats();

    const unsub = window.bhaiApi.onChatCreated((newChat) => {
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat);
      setMessages([]);
    });

    return () => unsub();
  }, [loadChats]);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat, loadMessages]);

  const handleSelectChat = (chat: ChatDto) => {
    setActiveChat(chat);
    setIsDropdownOpen(false);
  };

  const handleNewChat = useCallback(async () => {
    try {
      const newChat = await window.bhaiApi.chat.create();
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat);
      setMessages([]);
      setIsDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create new chat:', err);
    }
  }, []);

  // Global Keyboard shortcuts: Cmd+N (new chat), Cmd+Opt+D (toggle dev diagnostics)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      } else if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDiagnosticsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleNewChat]);

  const handleDeleteChat = async (chatId: string) => {
    try {
      await window.bhaiApi.chat.delete(chatId);
      const remaining = chats.filter((c) => c.id !== chatId);
      setChats(remaining);
      if (activeChat?.id === chatId) {
        setActiveChat(remaining[0] || null);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleSubmit = async () => {
    if (!activeChat || !inputValue.trim() || isLoading) return;

    const text = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    const commandText = /^bhai\s+/i.test(text) ? text : `bhai ${text}`;

    try {
      const res = await window.bhaiApi.command.submit(activeChat.id, commandText);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      if (res.diagnostics) {
        setLatestDiagnostics(res.diagnostics as EngineDiagnostics);
      } else if (res.assistantMessage.payload?.diagnostics) {
        setLatestDiagnostics(res.assistantMessage.payload.diagnostics);
      }

      // If user invoked natural onboarding command ("bhai project add karo")
      if (res.assistantMessage.payload?.onboardingRequested) {
        setIsOnboardingOpen(true);
      }
    } catch (err: any) {
      console.error('Command submission failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCommandChip = (cmd: string) => {
    setInputValue(cmd);
    // Submit on chip select for instant execution
    if (activeChat && !isLoading) {
      setIsLoading(true);
      window.bhaiApi.command.submit(activeChat.id, cmd).then((res) => {
        setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
        if (res.diagnostics) {
          setLatestDiagnostics(res.diagnostics as EngineDiagnostics);
        } else if (res.assistantMessage.payload?.diagnostics) {
          setLatestDiagnostics(res.assistantMessage.payload.diagnostics);
        }
        if (res.assistantMessage.payload?.onboardingRequested) {
          setIsOnboardingOpen(true);
        }
      }).catch((err) => {
        console.error('Chip command execution failed:', err);
      }).finally(() => {
        setIsLoading(false);
        setInputValue('');
      });
    }
  };

  const handleSelectCandidate = async (candidateId: string, draftId?: string) => {
    if (!activeChat || !draftId || isLoading) return;
    setIsLoading(true);
    try {
      const res = await window.bhaiApi.clarify.select(activeChat.id, draftId, candidateId);
      setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
      if (res.diagnostics) {
        setLatestDiagnostics(res.diagnostics as EngineDiagnostics);
      }
    } catch (err) {
      console.error('Clarification selection failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeachPhrase = (phrase: string) => {
    setTeachModalInitialPhrase(phrase);
    setIsTeachModalOpen(true);
  };

  const handleAliasSaved = (_savedPhrase: string) => {
    // Functional requirement: Saving a phrase must never execute its mapped action.
  };

  const handleOpenEditor = async (projectId: string) => {
    try {
      const res = await window.bhaiApi.project.openEditor(projectId);
      if (activeChat) {
        const assistantMsg: MessageDto = {
          id: `msg_${Date.now()}`,
          chatId: activeChat.id,
          chatSeq: messages.length + 1,
          role: 'assistant',
          kind: 'result',
          body: res.message,
          createdAt: Date.now()
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      console.error('Open editor failed:', err);
    }
  };

  const handleOpenTerminal = async (projectId: string) => {
    try {
      const res = await window.bhaiApi.project.openTerminal(projectId);
      if (activeChat) {
        const assistantMsg: MessageDto = {
          id: `msg_${Date.now()}`,
          chatId: activeChat.id,
          chatSeq: messages.length + 1,
          role: 'assistant',
          kind: 'result',
          body: res.message,
          createdAt: Date.now()
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      console.error('Open terminal failed:', err);
    }
  };

  const handleEscape = () => {
    if (isOnboardingOpen) {
      setIsOnboardingOpen(false);
    } else if (selectedProjectForDetail) {
      setSelectedProjectForDetail(null);
    } else if (isTeachModalOpen) {
      setIsTeachModalOpen(false);
    } else if (isAgentSetupOpen) {
      setIsAgentSetupOpen(false);
    } else if (isDiagnosticsOpen) {
      setIsDiagnosticsOpen(false);
    } else if (isDropdownOpen) {
      setIsDropdownOpen(false);
    } else {
      window.bhaiApi.app.hide();
    }
  };

  if (memoryHubProject) {
    return (
      <div className="app-container memory-hub-mode">
        <MemoryHub
          project={memoryHubProject}
          onBack={() => setMemoryHubProject(null)}
          onClose={() => {
            setMemoryHubProject(null);
            setSelectedProjectForDetail(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`app-container ${messages.length === 0 ? 'state-idle' : 'state-active'}`}>
      <Header
        currentChat={activeChat}
        chats={chats}
        isDropdownOpen={isDropdownOpen}
        isDiagnosticsOpen={isDiagnosticsOpen}
        onToggleDropdown={() => setIsDropdownOpen((prev) => !prev)}
        onCloseDropdown={() => setIsDropdownOpen(false)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenAddProject={() => setIsOnboardingOpen(true)}
        onOpenTeachModal={() => {
          setTeachModalInitialPhrase('');
          setIsTeachModalOpen(true);
        }}
        onOpenAgentSetup={() => setIsAgentSetupOpen(true)}
        onToggleDiagnostics={() => setIsDiagnosticsOpen((prev) => !prev)}
      />

      <DevDiagnostics
        diagnostics={latestDiagnostics}
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />

      <MessageList
        messages={messages}
        onSelectCommand={handleSelectCommandChip}
        onSelectCandidate={handleSelectCandidate}
        onTeachPhrase={handleTeachPhrase}
        onOpenProjectDetail={(p) => setSelectedProjectForDetail(p)}
        onOpenEditor={handleOpenEditor}
        onOpenTerminal={handleOpenTerminal}
      />

      <CommandInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onEscape={handleEscape}
      />

      {isTeachModalOpen && (
        <TeachModal
          initialPhrase={teachModalInitialPhrase}
          onClose={() => setIsTeachModalOpen(false)}
          onAliasSaved={handleAliasSaved}
        />
      )}

      {isAgentSetupOpen && (
        <AgentSetupModal
          onClose={() => setIsAgentSetupOpen(false)}
        />
      )}

      {isOnboardingOpen && (
        <OnboardingWizard
          onClose={() => setIsOnboardingOpen(false)}
          onProjectRegistered={(projId) => {
            // Refresh messages if active chat is open
            if (activeChat) {
              window.bhaiApi.project.get(projId).then((proj) => {
                if (proj) {
                  const assistantMsg: MessageDto = {
                    id: `msg_${Date.now()}`,
                    chatId: activeChat.id,
                    chatSeq: messages.length + 1,
                    role: 'assistant',
                    kind: 'result',
                    body: `Project **${proj.displayName}** successfully registered in Bhai.`,
                    payload: { project: proj },
                    createdAt: Date.now()
                  };
                  setMessages((prev) => [...prev, assistantMsg]);
                }
              });
            }
          }}
        />
      )}

      {selectedProjectForDetail && !memoryHubProject && (
        <ProjectDetailModal
          project={selectedProjectForDetail}
          activeChatId={activeChat?.id}
          onClose={() => setSelectedProjectForDetail(null)}
          onOpenMemoryHub={(proj) => setMemoryHubProject(proj)}
          onProjectUpdated={() => {
            window.bhaiApi.project.get(selectedProjectForDetail.id).then((p) => {
              if (p) setSelectedProjectForDetail(p);
            });
          }}
          onProjectDeleted={(deletedProj) => {
            setSelectedProjectForDetail(null);
            setMemoryHubProject(null);
            // Immediately update messages in local state
            setMessages((prev) =>
              prev.map((m) => {
                let updatedPayload = m.payload;
                let modified = false;
                if (m.payload?.project?.id === deletedProj.id) {
                  updatedPayload = { ...m.payload, project: { ...m.payload.project, availability: 'removed' } };
                  modified = true;
                }
                if (m.payload?.projects && Array.isArray(m.payload.projects)) {
                  updatedPayload = {
                    ...m.payload,
                    projects: m.payload.projects.filter((p: any) => p.id !== deletedProj.id)
                  };
                  modified = true;
                }
                return modified ? { ...m, payload: updatedPayload } : m;
              })
            );

            if (activeChat) {
              loadMessages(activeChat.id);
            }
          }}
        />
      )}
    </div>
  );
};

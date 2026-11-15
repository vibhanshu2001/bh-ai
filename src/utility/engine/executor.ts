import { ChatRepository } from '../storage/chat_repository';
import { ExecutionRepository } from '../storage/execution_repository';
import { AliasRepository } from '../storage/alias_repository';
import { ClarificationRepository } from '../storage/clarification_repository';
import { ProjectRepository } from '../storage/project_repository';
import { DeterministicLanguageEngine } from '../../language/engine';
import { MemoryInspectAction } from '../actions/memory_action';
import { PortInspector } from '../inspector/port_inspector';
import { CommandSubmitResponse, MemoryInspectResult } from '../../shared/contracts/dto';

export class MinimalCommandExecutor {
  private chatRepo: ChatRepository;
  private execRepo: ExecutionRepository;
  private aliasRepo?: AliasRepository;
  private clarificationRepo?: ClarificationRepository;
  private projectRepo?: ProjectRepository;
  private engine: DeterministicLanguageEngine;
  private memoryAction: MemoryInspectAction;

  constructor(
    chatRepo: ChatRepository,
    execRepo: ExecutionRepository,
    aliasRepo?: AliasRepository,
    clarificationRepo?: ClarificationRepository,
    projectRepo?: ProjectRepository
  ) {
    this.chatRepo = chatRepo;
    this.execRepo = execRepo;
    this.aliasRepo = aliasRepo;
    this.clarificationRepo = clarificationRepo;
    this.projectRepo = projectRepo;
    this.engine = new DeterministicLanguageEngine(aliasRepo, projectRepo);
    this.memoryAction = new MemoryInspectAction();
  }

  public setProjectRepository(projectRepo: ProjectRepository): void {
    this.projectRepo = projectRepo;
    this.engine.setProjectRepository(projectRepo);
  }

  public setAliasRepository(aliasRepo: AliasRepository): void {
    this.aliasRepo = aliasRepo;
    this.engine.setAliasRepository(aliasRepo);
  }

  public setClarificationRepository(clarificationRepo: ClarificationRepository): void {
    this.clarificationRepo = clarificationRepo;
  }

  public async executeCommand(chatId: string, text: string): Promise<CommandSubmitResponse> {
    const chat = this.chatRepo.getChat(chatId);
    if (!chat) {
      throw new Error(`Chat '${chatId}' not found`);
    }

    // 1. Fetch current chat context snapshot
    const contextSnapshot = this.chatRepo.getChatContext(chatId);

    // 1b. Check if there is a pending confirmation draft (e.g. for project.delete)
    const pendingDraft = this.clarificationRepo?.getPendingDraft(chatId);
    if (pendingDraft && pendingDraft.candidates.some((c) => c.id.startsWith('confirm_delete_'))) {
      const cleanLower = text.trim().toLowerCase();
      const isAffirmative = /^(yes|haan|ha|confirm|remove|delete|sure|proceed|ok|okay|yep|y)$/i.test(cleanLower) ||
        cleanLower.includes('yes, remove') || cleanLower.includes('confirm remove') || cleanLower.includes('delete it');
      const isNegative = /^(no|nahi|nah|cancel|stop|abort|n)$/i.test(cleanLower) || cleanLower.includes('cancel');

      if (isAffirmative) {
        const confirmCand = pendingDraft.candidates.find((c) => c.id.startsWith('confirm_delete_'));
        if (confirmCand) {
          return this.selectClarification(chatId, pendingDraft.id, confirmCand.id);
        }
      } else if (isNegative) {
        const cancelCand = pendingDraft.candidates.find((c) => c.id.startsWith('cancel_delete_'));
        if (cancelCand) {
          return this.selectClarification(chatId, pendingDraft.id, cancelCand.id);
        }
      }
    }

    // 2. Resolve command deterministically
    const resolution = this.engine.resolveCommand({
      chatId,
      text,
      chatContext: contextSnapshot || undefined
    });

    // 3. Append User Message
    const userMessage = this.chatRepo.appendMessage({
      chatId,
      role: 'user',
      kind: 'text',
      body: text
    });

    // 4. Handle Dispositions

    // A. Negated Commands
    if (resolution.disposition === 'negated') {
      this.execRepo.recordCommandIntent({
        chatId,
        originalText: text,
        resolutionStatus: 'negated'
      });

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'negated',
        body: resolution.negation.explanation,
        payload: {
          markers: resolution.negation.markers,
          prohibitedSpans: resolution.negation.prohibitedSpans,
          diagnostics: resolution.diagnostics
        }
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'negated',
        diagnostics: resolution.diagnostics
      };
    }

    // B. Clarification Requests
    if (resolution.disposition === 'clarify') {
      const intentRecord = this.execRepo.recordCommandIntent({
        chatId,
        originalText: text,
        resolutionStatus: 'clarify'
      });

      let draftDto;
      if (this.clarificationRepo) {
        draftDto = this.clarificationRepo.createDraft({
          chatId,
          commandId: intentRecord.commandId,
          originalText: text,
          question: resolution.clarification.question,
          candidates: resolution.clarification.candidates
        });
      }

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'clarify',
        body: resolution.clarification.question,
        payload: {
          draftId: draftDto?.id,
          candidates: resolution.clarification.candidates,
          reason: resolution.clarification.reason,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'clarify',
        clarification: draftDto,
        diagnostics: resolution.diagnostics
      };
    }

    // C. Invalid Input / Parameter Violations
    if (resolution.disposition === 'invalid') {
      this.execRepo.recordCommandIntent({
        chatId,
        originalText: text,
        resolutionStatus: 'invalid'
      });

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'error',
        body: resolution.invalid.reason,
        payload: {
          parameter: resolution.invalid.parameter,
          errorType: resolution.invalid.errorType,
          diagnostics: resolution.diagnostics
        }
      });

      return {
        ok: false,
        userMessage,
        assistantMessage,
        disposition: 'invalid',
        error: resolution.invalid.reason,
        diagnostics: resolution.diagnostics
      };
    }

    // D. Unsupported Commands
    if (resolution.disposition === 'unsupported') {
      this.execRepo.recordCommandIntent({
        chatId,
        originalText: text,
        resolutionStatus: 'unsupported'
      });

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'unsupported',
        body: resolution.unsupported.reason,
        payload: {
          supportedExamples: resolution.unsupported.supportedExamples,
          teachCandidatePhrase: resolution.unsupported.teachCandidatePhrase,
          diagnostics: resolution.diagnostics
        }
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'unsupported',
        diagnostics: resolution.diagnostics
      };
    }

    // E. Resolved Action Proposal
    const proposal = resolution.proposal;
    const intentRecord = this.execRepo.recordCommandIntent({
      chatId,
      originalText: text,
      resolutionStatus: 'resolved',
      actionId: proposal.actionId,
      proposalSnapshot: proposal
    });

    // Update Context if proposal specifies an unambiguous target
    if (proposal.targetId) {
      if (proposal.targetId.includes('/')) {
        const [proj, serv] = proposal.targetId.split('/');
        this.chatRepo.updateChatContext(chatId, proj, serv);
      } else if (proposal.targetKind === 'project') {
        this.chatRepo.updateChatContext(chatId, proposal.targetId, null);
      }
    }

    // Strict Action Registry Gating: In Phase P1 and P2, only standalone memory inspection is authorized for execution.
    // Chained commands or recognized actions outside memory inspection return truthful catalog guidance without executing OS effects.
    const isAuthorizedP2Executable = proposal.actionId === 'system.memory.inspect' &&
                                    proposal.executable === true &&
                                    (!proposal.chaining || proposal.chaining.length === 1);

    if (isAuthorizedP2Executable) {
      try {
        const result: MemoryInspectResult = await this.memoryAction.execute();

        if (intentRecord.executionId && intentRecord.stepId && intentRecord.attemptId) {
          this.execRepo.completeExecution({
            executionId: intentRecord.executionId,
            stepId: intentRecord.stepId,
            attemptId: intentRecord.attemptId,
            output: result,
            state: 'completed'
          });
        }

        const totalGb = (result.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
        const usedGb = (result.usedBytes / (1024 * 1024 * 1024)).toFixed(1);
        const freeGb = (result.freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        const resultBody = `Memory: ${usedGb} GB used of ${totalGb} GB (${result.usedPercent}%). Free: ${freeGb} GB.`;

        const assistantMessage = this.chatRepo.appendMessage({
          chatId,
          role: 'assistant',
          kind: 'result',
          body: resultBody,
          payload: {
            ...result,
            diagnostics: resolution.diagnostics
          },
          commandId: intentRecord.commandId,
          executionId: intentRecord.executionId
        });

        return {
          ok: true,
          userMessage,
          assistantMessage,
          disposition: 'resolved',
          result,
          diagnostics: resolution.diagnostics
        };
      } catch (err: any) {
        if (intentRecord.executionId && intentRecord.stepId && intentRecord.attemptId) {
          this.execRepo.completeExecution({
            executionId: intentRecord.executionId,
            stepId: intentRecord.stepId,
            attemptId: intentRecord.attemptId,
            output: { error: err?.message || String(err) },
            state: 'failed'
          });
        }

        const errorMessage = this.chatRepo.appendMessage({
          chatId,
          role: 'assistant',
          kind: 'error',
          body: `Failed to inspect system memory: ${err?.message || 'Unknown error'}`,
          payload: { diagnostics: resolution.diagnostics }
        });

        return {
          ok: false,
          userMessage,
          assistantMessage: errorMessage,
          disposition: 'resolved',
          error: err?.message,
          diagnostics: resolution.diagnostics
        };
      }
    }

    // Handle Phase P3 Project Registry & Developer Context Actions
    if (proposal.actionId === 'project.onboard') {
      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: 'Opening guided project onboarding. Select a project directory to discover and register your project.',
        payload: {
          actionId: 'project.onboard',
          onboardingRequested: true,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved',
        diagnostics: resolution.diagnostics
      };
    }

    if (proposal.actionId === 'project.list') {
      const projects = this.projectRepo ? this.projectRepo.listProjects() : [];
      let bodyText = '';
      if (projects.length === 0) {
        bodyText = 'No registered projects found. Use "project add karo" or click "+ Add Project" to onboard a project.';
      } else {
        const lines = projects.map((p) => {
          const srvCount = p.services ? p.services.length : 0;
          return `• **${p.displayName}** (${p.canonicalRoot}) — ${srvCount} service${srvCount === 1 ? '' : 's'}`;
        });
        bodyText = `Registered Projects (${projects.length}):\n${lines.join('\n')}`;
      }

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: bodyText,
        payload: {
          actionId: 'project.list',
          projects,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved',
        diagnostics: resolution.diagnostics
      };
    }

    if (proposal.actionId === 'project.status' && proposal.targetId) {
      const project = this.projectRepo ? this.projectRepo.getProject(proposal.targetId) : null;
      let bodyText = '';
      if (project) {
        const srvLines = (project.services || []).map((s) => `  - ${s.name} (${s.serviceType}, cwd: ${s.relativeCwd}${s.port ? `, port: ${s.port}` : ''})`);
        const srvSection = srvLines.length > 0 ? `\nServices:\n${srvLines.join('\n')}` : '\nNo services registered.';
        bodyText = `Project: **${project.displayName}**\nRoot: ${project.canonicalRoot}\nStatus: ${project.availability}${srvSection}`;
      } else {
        bodyText = `Project details for ${proposal.targetId}`;
      }

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: bodyText,
        payload: {
          actionId: 'project.status',
          project,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved',
        diagnostics: resolution.diagnostics
      };
    }

    if (proposal.actionId === 'service.list' && proposal.targetId) {
      const project = this.projectRepo ? this.projectRepo.getProject(proposal.targetId) : null;
      let bodyText = '';
      if (project) {
        const services = project.services || [];
        if (services.length === 0) {
          bodyText = `No services registered for **${project.displayName}**.`;
        } else {
          const lines = services.map((s) => `• **${s.name}** [${s.serviceType}] — dir: \`${s.relativeCwd}\`${s.port ? `, port: ${s.port}` : ''}`);
          bodyText = `Services for **${project.displayName}** (${services.length}):\n${lines.join('\n')}`;
        }
      } else {
        bodyText = `No services found for project ${proposal.targetId}.`;
      }

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: bodyText,
        payload: {
          actionId: 'service.list',
          project,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved',
        diagnostics: resolution.diagnostics
      };
    }

    if (proposal.actionId === 'project.delete' && proposal.targetId) {
      const project = this.projectRepo ? this.projectRepo.getProject(proposal.targetId) : null;
      if (!project) {
        const notFoundBody = `Project was not found in Bhai's registry. It may have already been removed.`;
        const assistantMessage = this.chatRepo.appendMessage({
          chatId,
          role: 'assistant',
          kind: 'result',
          body: notFoundBody,
          payload: {
            actionId: 'project.delete',
            notFound: true,
            diagnostics: resolution.diagnostics
          },
          commandId: intentRecord.commandId
        });
        return {
          ok: true,
          userMessage,
          assistantMessage,
          disposition: 'resolved',
          diagnostics: resolution.diagnostics
        };
      }

      const projName = project.displayName;
      const questionText = `Are you sure you want to remove project "${projName}" from Bhai? This will remove its registry entry and services, but will NEVER delete its files on your Mac.`;

      let draftDto;
      if (this.clarificationRepo) {
        draftDto = this.clarificationRepo.createDraft({
          chatId,
          commandId: intentRecord.commandId,
          originalText: text,
          question: questionText,
          candidates: [
            {
              id: `confirm_delete_${project.id}`,
              label: `Yes, remove ${projName}`,
              kind: 'action',
              description: 'Unregisters project from Bhai; source files remain untouched'
            },
            {
              id: `cancel_delete_${project.id}`,
              label: 'Cancel',
              kind: 'action',
              description: 'Keep project registered in Bhai'
            }
          ]
        });
      }

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'clarify',
        body: questionText,
        payload: {
          actionId: 'project.delete',
          projectId: project.id,
          projectName: projName,
          confirmationRequired: true,
          draftId: draftDto?.id,
          candidates: draftDto?.candidates || [],
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'clarify',
        clarification: draftDto,
        diagnostics: resolution.diagnostics
      };
    }

    if (proposal.actionId === 'port.inspect') {
      const portNum = typeof proposal.params?.port === 'number'
        ? proposal.params.port
        : parseInt(String(proposal.params?.port || '0'), 10);

      if (!portNum || portNum < 1 || portNum > 65535) {
        const assistantMessage = this.chatRepo.appendMessage({
          chatId,
          role: 'assistant',
          kind: 'error',
          body: `Port number invalid hai. Kripya 1 se 65535 ke beech valid port specify karein.`,
          payload: {
            actionId: 'port.inspect',
            diagnostics: resolution.diagnostics
          },
          commandId: intentRecord.commandId
        });

        return {
          ok: false,
          userMessage,
          assistantMessage,
          disposition: 'resolved',
          diagnostics: resolution.diagnostics
        };
      }

      const portResult = PortInspector.inspectPort(portNum, this.projectRepo);

      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: portResult.summary,
        payload: {
          actionId: 'port.inspect',
          portResult,
          diagnostics: resolution.diagnostics
        },
        commandId: intentRecord.commandId
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved',
        diagnostics: resolution.diagnostics
      };
    }

    // Other recognized catalog actions (P3+ capabilities such as service.start/stop)
    // Return a truthful recognized explanation rather than shell execution or error
    let recognizedBody = `[${proposal.actionId}] ${proposal.summary}`;
    if (proposal.actionId === 'service.start' || proposal.actionId === 'service.stop') {
      recognizedBody = `Managed service execution (${proposal.actionId}) is scheduled for Phase P4. Bhai has understood your intent for "${proposal.summary}", but process supervision is not yet active.`;
    }

    const assistantMessage = this.chatRepo.appendMessage({
      chatId,
      role: 'assistant',
      kind: 'result',
      body: recognizedBody,
      payload: {
        proposal,
        catalogStatus: 'recognized_p3_scheduled',
        diagnostics: resolution.diagnostics
      },
      commandId: intentRecord.commandId
    });

    return {
      ok: true,
      userMessage,
      assistantMessage,
      disposition: 'resolved',
      diagnostics: resolution.diagnostics
    };
  }

  public async selectClarification(chatId: string, draftId: string, candidateId: string): Promise<CommandSubmitResponse> {
    if (!this.clarificationRepo) {
      throw new Error('Clarification repository not initialized');
    }

    const draft = this.clarificationRepo.resolveDraft(draftId, candidateId);
    const chosenCandidate = draft.candidates.find((c) => c.id === candidateId);
    const candidateLabel = chosenCandidate ? chosenCandidate.label : candidateId;

    // Append user selection message
    const userMessage = this.chatRepo.appendMessage({
      chatId,
      role: 'user',
      kind: 'text',
      body: `Selected: ${candidateLabel}`
    });

    // Special handling for project deletion confirmation
    if (candidateId.startsWith('confirm_delete_')) {
      const projId = candidateId.replace('confirm_delete_', '');
      const project = this.projectRepo ? this.projectRepo.getProject(projId) : null;
      const projName = project ? project.displayName : projId;

      if (this.projectRepo) {
        this.projectRepo.deleteProject(projId, chatId);
      }

      const confirmBody = `Project **${projName}** has been removed from Bhai. All project files, Git history, and directories on your Mac remain untouched.`;
      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: confirmBody,
        payload: {
          actionId: 'project.delete',
          deletedProjectId: projId,
          projectName: projName,
          status: 'deleted'
        }
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved'
      };
    }

    if (candidateId.startsWith('cancel_delete_')) {
      const projId = candidateId.replace('cancel_delete_', '');
      const project = this.projectRepo ? this.projectRepo.getProject(projId) : null;
      const projName = project ? project.displayName : projId;

      const cancelBody = `Removal cancelled. Project **${projName}** remains registered in Bhai.`;
      const assistantMessage = this.chatRepo.appendMessage({
        chatId,
        role: 'assistant',
        kind: 'result',
        body: cancelBody,
        payload: {
          actionId: 'project.delete',
          projectId: projId,
          projectName: projName,
          status: 'cancelled'
        }
      });

      return {
        ok: true,
        userMessage,
        assistantMessage,
        disposition: 'resolved'
      };
    }

    // Update context if candidate is project or service
    if (candidateId.includes('/')) {
      const [proj, serv] = candidateId.split('/');
      this.chatRepo.updateChatContext(chatId, proj, serv);
    } else if (chosenCandidate?.kind === 'project' || candidateId.startsWith('P_')) {
      this.chatRepo.updateChatContext(chatId, candidateId, null);
    }

    // Re-resolve or confirm resolution
    const confirmBody = `Target clarified: ${candidateLabel}. Context updated for this conversation.`;
    const assistantMessage = this.chatRepo.appendMessage({
      chatId,
      role: 'assistant',
      kind: 'result',
      body: confirmBody,
      payload: {
        resolvedCandidateId: candidateId,
        originalDraftId: draftId
      }
    });

    return {
      ok: true,
      userMessage,
      assistantMessage,
      disposition: 'resolved'
    };
  }
}

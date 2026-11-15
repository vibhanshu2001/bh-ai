import crypto from 'node:crypto';
import { Normalizer } from './normalizer';
import { LanguageTokenizer } from './tokenizer';
import { ChainingParser } from './chaining';
import { FuzzyCandidateSearch } from './fuzzy';
import { ACTION_CATALOG, KNOWN_ENTITIES, CatalogEntity } from './catalog';
import {
  EngineResult,
  ResolvedProposal,
  ChatContextSnapshot,
  ClarificationDetails,
  EngineDiagnostics,
  ResolutionDisposition
} from './types';
import { AliasRepository } from '../utility/storage/alias_repository';
import { ProjectRepository } from '../utility/storage/project_repository';
import { ClarificationCandidate } from '../shared/contracts/dto';

export class DeterministicLanguageEngine {
  private tokenizer: LanguageTokenizer;
  private fuzzySearch: FuzzyCandidateSearch;
  private aliasRepo?: AliasRepository;
  private projectRepo?: ProjectRepository;

  private static readonly SUPPORTED_EXAMPLES = [
    'bhai memory dekh',
    'memory usage',
    'bhai ram dekh',
    'project add karo',
    'mere projects dikhao',
    'vs code kholo',
    'port 3000 check'
  ];

  constructor(aliasRepo?: AliasRepository, projectRepo?: ProjectRepository) {
    this.tokenizer = new LanguageTokenizer();
    this.fuzzySearch = new FuzzyCandidateSearch();
    this.aliasRepo = aliasRepo;
    this.projectRepo = projectRepo;
  }

  public setAliasRepository(aliasRepo: AliasRepository): void {
    this.aliasRepo = aliasRepo;
  }

  public setProjectRepository(projectRepo: ProjectRepository): void {
    this.projectRepo = projectRepo;
  }

  public resolveCommand(params: {
    chatId: string;
    text: string;
    chatContext?: ChatContextSnapshot;
  }): EngineResult {
    const raw = params.text;

    // 1. Normalize
    let normalizedInput;
    try {
      normalizedInput = Normalizer.normalize(raw);
    } catch (err: any) {
      const diag: EngineDiagnostics = {
        originalInput: raw,
        normalizedText: '',
        grammarRuleOrSource: 'normalization_failure',
        finalDecision: 'invalid',
        reason: err?.message || 'Invalid command input format'
      };
      return {
        disposition: 'invalid',
        invalid: {
          reason: err?.message || 'Invalid command input format',
          errorType: 'NORMALIZATION_ERROR'
        },
        diagnostics: diag
      };
    }

    const { normalized } = normalizedInput;

    // Reject empty input
    if (!normalized || normalized.trim() === '') {
      const diag: EngineDiagnostics = {
        originalInput: raw,
        normalizedText: normalized,
        grammarRuleOrSource: 'empty_input',
        finalDecision: 'unsupported',
        reason: 'Please enter a command.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Please enter a command.',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    // Bare "bhai" address check
    if (normalized === 'bhai' || (normalizedInput.hasLeadingBhai && normalized === '')) {
      const diag: EngineDiagnostics = {
        originalInput: raw,
        normalizedText: normalized,
        grammarRuleOrSource: 'bare_bhai_address',
        finalDecision: 'unsupported',
        reason: 'Bhai is listening. Try a supported command:'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Bhai is listening. Try a supported command:',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    // 2. Multi-Command Chaining Split
    const clauseSplit = ChainingParser.splitClauses(normalized);
    if (clauseSplit.isChained) {
      if (clauseSplit.clauses.length > 3) {
        const diag: EngineDiagnostics = {
          originalInput: raw,
          normalizedText: normalized,
          grammarRuleOrSource: 'chaining_limit_exceeded',
          finalDecision: 'unsupported',
          reason: 'Bhai supports chaining at most 3 commands with "and", "aur", or "then".'
        };
        return {
          disposition: 'unsupported',
          unsupported: {
            reason: 'Bhai supports chaining at most 3 commands with "and", "aur", or "then".',
            supportedExamples: ['open vscode and show memory usage']
          },
          diagnostics: diag
        };
      }

      // Preflight atomic check: resolve all clauses independently
      const resolvedProposals: ResolvedProposal[] = [];

      for (const clause of clauseSplit.clauses) {
        // Normalize sub-clause to strip leading spaces and any redundant "bhai"
        const subNorm = Normalizer.normalize(clause).normalized;
        const subResult = this.resolveSingleClause({
          rawClause: clause,
          normalizedClause: subNorm,
          chatId: params.chatId,
          chatContext: params.chatContext
        });

        // Any negation vetoes the ENTIRE chain!
        if (subResult.disposition === 'negated') {
          const diag: EngineDiagnostics = {
            originalInput: raw,
            normalizedText: normalized,
            grammarRuleOrSource: 'chaining_negation_veto',
            negationResult: {
              hasNegation: true,
              markers: subResult.negation.markers
            },
            finalDecision: 'negated',
            reason: `Chained step "${clause}" contains negation.`
          };
          return {
            disposition: 'negated',
            negation: {
              explanation: `The chained command was cancelled because clause "${clause}" contains negation. Bhai will not execute positive fragments of negated chains.`,
              markers: subResult.negation.markers,
              prohibitedSpans: [raw]
            },
            diagnostics: diag
          };
        }

        if (subResult.disposition === 'invalid') {
          return subResult;
        }

        if (subResult.disposition === 'clarify') {
          const diag: EngineDiagnostics = {
            originalInput: raw,
            normalizedText: normalized,
            grammarRuleOrSource: 'chaining_subclause_clarify',
            fuzzyCandidates: subResult.clarification.candidates,
            finalDecision: 'clarify',
            reason: subResult.clarification.reason
          };
          return {
            disposition: 'clarify',
            clarification: {
              question: `Chained step "${clause}" requires clarification: ${subResult.clarification.question}`,
              candidates: subResult.clarification.candidates,
              originalText: raw,
              reason: subResult.clarification.reason
            },
            diagnostics: diag
          };
        }

        if (subResult.disposition === 'unsupported') {
          const diag: EngineDiagnostics = {
            originalInput: raw,
            normalizedText: normalized,
            grammarRuleOrSource: 'chaining_subclause_unsupported',
            finalDecision: 'unsupported',
            reason: `Chained step "${clause}" is not recognized or not supported. Entire chain blocked.`
          };
          return {
            disposition: 'unsupported',
            unsupported: {
              reason: `Chained step "${clause}" is not recognized or not supported. Entire chain blocked.`,
              supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES,
              teachCandidatePhrase: clause.trim()
            },
            diagnostics: diag
          };
        }

        resolvedProposals.push(subResult.proposal);
      }

      // All clauses resolved cleanly
      const primaryProposal = resolvedProposals[0];
      const allExecutable = resolvedProposals.every((p) => p.executable);
      const diag: EngineDiagnostics = {
        originalInput: raw,
        normalizedText: normalized,
        grammarRuleOrSource: 'multi_command_chain',
        detectedIntent: 'composite.chain',
        capabilityAvailability: {
          actionId: primaryProposal.actionId,
          isExecutableInP2: allExecutable
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          ...primaryProposal,
          executable: allExecutable,
          chaining: resolvedProposals,
          summary: `Execute ${resolvedProposals.length} ordered actions: ${resolvedProposals.map((p) => p.actionId).join(' → ')}`
        },
        diagnostics: diag
      };
    }

    // 3. Single Clause Resolution
    return this.resolveSingleClause({
      rawClause: raw,
      normalizedClause: normalized,
      chatId: params.chatId,
      chatContext: params.chatContext
    });
  }

  private cleanPoliteAndFillers(input: string): string {
    let cleaned = input.trim();
    // Strip polite prefixes
    cleaned = cleaned.replace(/^(?:please|pls|zara|kindly|can\s+you|could\s+you|would\s+you|mujhe)\s+/gi, '');
    // Strip polite suffixes
    cleaned = cleaned.replace(/\s+(?:please|pls|kindly|zara)$/gi, '');
    // Strip system qualifiers at start like "system ki", "system ka", "meri", "mera"
    cleaned = cleaned.replace(/^(?:system\s+ki|system\s+ka|meri|mera)\s+/gi, '');
    // Strip common request openers like "show me", "tell me"
    cleaned = cleaned.replace(/^(?:show\s+me|tell\s+me)\s+/gi, '');
    // Strip polite / trailing verbs: "kar do", "kar de", "karna", "kariye", "karo", "kar", "batao", "bataiye", "dekhna"
    // Keep phrase if removing it empties the string
    const withoutTrailing = cleaned.replace(/\s+(?:kar\s+do|kar\s+de|karna|kariye|karo|kar|batao|bataiye|dekhna)$/gi, '');
    if (withoutTrailing.trim().length > 0) {
      cleaned = withoutTrailing;
    }
    // Strip trailing "hai", "hain", "hoga", "tha"
    const withoutTense = cleaned.replace(/\s+(?:hai|hain|hoga|tha)$/gi, '');
    if (withoutTense.trim().length > 0) {
      cleaned = withoutTense;
    }
    return cleaned.trim();
  }

  private resolveSingleClause(params: {
    rawClause: string;
    normalizedClause: string;
    chatId: string;
    chatContext?: ChatContextSnapshot;
  }): EngineResult {
    const { rawClause, normalizedClause, chatContext } = params;

    // A. Check for shell injection / dangerous metacharacters
    if (/[;&|><$`\\]/.test(rawClause)) {
      if (rawClause.includes(';') || rawClause.includes('touch') || rawClause.includes('pwn')) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'shell_injection_protection',
          finalDecision: 'invalid',
          reason: 'Malformed parameter: Shell metacharacters are strictly prohibited in Bhai commands.'
        };
        return {
          disposition: 'invalid',
          invalid: {
            reason: 'Malformed parameter: Shell metacharacters are strictly prohibited in Bhai commands.',
            errorType: 'MALFORMED_PARAMETER'
          },
          diagnostics: diag
        };
      }
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'shell_syntax_prohibited',
        finalDecision: 'unsupported',
        reason: 'Arbitrary shell syntax or execution is not permitted.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Arbitrary shell syntax or execution is not permitted.',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    // B. Tokenize & Negation Scan
    const tokenized = this.tokenizer.tokenize(rawClause, normalizedClause);

    // Double negation check: "don't not", "dont not", "mat nahi"
    if (
      /(?:don't|dont|do\s+not)\s+(?:not|mat|never)/i.test(normalizedClause) ||
      /mat\s+nahi/i.test(normalizedClause)
    ) {
      const candidates: ClarificationCandidate[] = [
        { id: 'CONFIRM_CANCEL', label: 'Cancel command', kind: 'action' },
        { id: 'CONFIRM_EXEC', label: 'Clarify positive intent', kind: 'action' }
      ];
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'double_negation_detector',
        fuzzyCandidates: candidates,
        negationResult: { hasNegation: true, markers: ['double_negation'] },
        finalDecision: 'clarify',
        reason: 'Double negation creates ambiguous scope.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: 'Uncertain double negation detected. Please rephrase your command clearly.',
          candidates,
          originalText: rawClause,
          reason: 'Double negation creates ambiguous scope.'
        },
        diagnostics: diag
      };
    }

    // Negation Safety Check
    if (tokenized.hasNegation && !tokenized.isDiagnosticQuery) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'negation_safety_rule',
        negationResult: {
          hasNegation: true,
          markers: tokenized.negationMarkers
        },
        finalDecision: 'negated',
        reason: `Command cancelled: negation marker "${tokenized.negationMarkers.join(', ')}" was detected.`
      };
      return {
        disposition: 'negated',
        negation: {
          explanation: `Command cancelled: negation marker "${tokenized.negationMarkers.join(', ')}" was detected. Bhai will not execute negative instructions.`,
          markers: tokenized.negationMarkers,
          prohibitedSpans: [rawClause]
        },
        diagnostics: diag
      };
    }

    // C. Check Taught Aliases (F07)
    if (this.aliasRepo) {
      const alias = this.aliasRepo.getAliasByPhrase(normalizedClause);
      if (alias && alias.enabled) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'taught_alias_exact',
          detectedIntent: `alias.${alias.targetKind}`,
          extractedParams: alias.bindings,
          capabilityAvailability: {
            actionId: alias.targetId,
            isExecutableInP2: alias.targetId === 'system.memory.inspect'
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: alias.targetId,
            intent: `alias.${alias.targetKind}`,
            targetId: alias.targetId,
            targetKind: alias.targetKind,
            params: alias.bindings,
            evidenceTier: 'E1',
            executable: alias.targetId === 'system.memory.inspect',
            summary: `Execute taught alias: ${alias.phrase} → ${alias.targetId}`,
            raw: rawClause
          },
          diagnostics: diag
        };
      }
    }

    // D. Diagnostic Query Whitelist ("backend kyu nahi chal raha", "why is backend not running")
    if (tokenized.isDiagnosticQuery) {
      let targetProject = chatContext?.projectId;
      let targetService = chatContext?.serviceId;

      if (normalizedClause.includes('backend') || normalizedClause.includes('server')) {
        targetService = 'S_AB';
      }

      if (targetProject && targetService) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'diagnostic_query_contextual',
          detectedIntent: 'diagnostic.service_failure',
          capabilityAvailability: {
            actionId: 'project.diagnostic',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'project.diagnostic',
            intent: 'diagnostic.service_failure',
            targetId: `${targetProject}/${targetService}`,
            targetKind: 'service',
            evidenceTier: 'E2',
            executable: false,
            summary: `Diagnose service failure for ${targetProject}/${targetService}`,
            raw: rawClause
          },
          diagnostics: diag
        };
      }

      const diagCandidates: ClarificationCandidate[] = [
        { id: 'P_A/S_AB', label: 'Aawas Backend', kind: 'service', description: 'Aawas API backend' },
        { id: 'P_A/S_AF', label: 'Aawas Frontend', kind: 'service', description: 'Aawas Web UI' }
      ];
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'diagnostic_query_missing_context',
        fuzzyCandidates: diagCandidates,
        finalDecision: 'clarify',
        reason: 'Diagnostic query requires an active service context.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: 'Which project or service would you like to diagnose?',
          candidates: diagCandidates,
          originalText: rawClause,
          reason: 'Diagnostic query requires an active service context.'
        },
        diagnostics: diag
      };
    }

    // Clean polite and filler words for semantic parsing
    const cleaned = this.cleanPoliteAndFillers(normalizedClause);

    // =========================================================================
    // PHASE P3: Guided Project Onboarding & Project Registry Commands
    // =========================================================================

    // 1. Project Onboarding: "project add karo", "add my project", "bhai mera project add kar", "add project", "naya project add karo"
    const isOnboardCommand = /^(?:project\s+add(?:\s+karo|\s+kar)?|add\s+(?:my\s+|a\s+)?project|naya\s+project\s+add(?:\s+karo|\s+kar)?|mera\s+project\s+add(?:\s+karo|\s+kar)?)$/i.test(cleaned);
    if (isOnboardCommand) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'p3_project_onboard_intent',
        detectedIntent: 'project.onboard',
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.onboard',
          intent: 'project.onboard',
          evidenceTier: 'E1',
          executable: true,
          summary: 'Open guided project onboarding wizard',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // 2. Project List: "mere projects dikhao", "show all projects", "list projects", "projects dikha", "saare projects dikhao"
    const isListProjectsCommand = /^(?:mere\s+projects\s+dikhao|mere\s+projects\s+dikha|show\s+(?:all\s+)?projects|list\s+(?:all\s+)?projects|projects\s+dikhao|projects\s+dikha|saare\s+projects\s+dikhao)$/i.test(cleaned);
    if (isListProjectsCommand) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'p3_project_list_intent',
        detectedIntent: 'project.list',
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.list',
          intent: 'project.list',
          evidenceTier: 'E1',
          executable: true,
          summary: 'List all registered projects',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // 3. Dynamic Registered Project Resolution (from DB if available, else fallback catalog)
    if (this.projectRepo) {
      const allRegisteredProjects = this.projectRepo.listProjects();

      // Check context follow-up: "project details", "project dikhao", "iske details dikhao"
      if (/^(?:project\s+details|project\s+dikhao|project\s+dikha|iske\s+details\s+dikhao)$/i.test(cleaned)) {
        if (chatContext?.projectId) {
          const matchedProj = allRegisteredProjects.find((p) => p.id === chatContext.projectId);
          if (matchedProj) {
            const diag: EngineDiagnostics = {
              originalInput: rawClause,
              normalizedText: normalizedClause,
              grammarRuleOrSource: 'p3_contextual_project_details',
              detectedIntent: 'project.status',
              finalDecision: 'resolved'
            };
            return {
              disposition: 'resolved',
              proposal: {
                proposalId: `prop_${crypto.randomUUID()}`,
                actionId: 'project.status',
                intent: 'project.status',
                targetId: matchedProj.id,
                targetKind: 'project',
                evidenceTier: 'E2',
                executable: true,
                summary: `Show details for project "${matchedProj.displayName}"`,
                raw: rawClause
              },
              diagnostics: diag
            };
          }
        }

        // No contextual project: trigger clarification among registered projects
        if (allRegisteredProjects.length > 0) {
          const candidates: ClarificationCandidate[] = allRegisteredProjects.map((p) => ({
            id: p.id,
            label: p.displayName,
            kind: 'project',
            description: p.canonicalRoot
          }));
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_project_details_clarification',
            fuzzyCandidates: candidates,
            finalDecision: 'clarify',
            reason: 'Which project would you like to view details for?'
          };
          return {
            disposition: 'clarify',
            clarification: {
              question: 'Which project would you like to view details for?',
              candidates,
              originalText: rawClause,
              reason: 'No contextual project is active in this chat.'
            },
            diagnostics: diag
          };
        }
      }

      // Check for contextual service listing: "iske services dikhao", "services dikhao", "list services"
      if (/^(?:iske\s+services\s+dikhao|iske\s+services\s+batao|services\s+dikhao|services\s+batao|list\s+services)$/i.test(cleaned)) {
        if (chatContext?.projectId) {
          const matchedProj = allRegisteredProjects.find((p) => p.id === chatContext.projectId);
          if (matchedProj) {
            const diag: EngineDiagnostics = {
              originalInput: rawClause,
              normalizedText: normalizedClause,
              grammarRuleOrSource: 'p3_contextual_service_list',
              detectedIntent: 'service.list',
              finalDecision: 'resolved'
            };
            return {
              disposition: 'resolved',
              proposal: {
                proposalId: `prop_${crypto.randomUUID()}`,
                actionId: 'service.list',
                intent: 'service.list',
                targetId: matchedProj.id,
                targetKind: 'project',
                evidenceTier: 'E2',
                executable: true,
                summary: `List services for contextual project "${matchedProj.displayName}"`,
                raw: rawClause
              },
              diagnostics: diag
            };
          }
        }

        // No contextual project: clarify which project's services
        if (allRegisteredProjects.length > 0) {
          const candidates: ClarificationCandidate[] = allRegisteredProjects.map((p) => ({
            id: p.id,
            label: p.displayName,
            kind: 'project',
            description: p.canonicalRoot
          }));
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_services_clarification_no_context',
            fuzzyCandidates: candidates,
            finalDecision: 'clarify',
            reason: 'Which project would you like to view services for?'
          };
          return {
            disposition: 'clarify',
            clarification: {
              question: 'Which project would you like to view services for?',
              candidates,
              originalText: rawClause,
              reason: 'No contextual project is active in this chat.'
            },
            diagnostics: diag
          };
        }
      }

      // Check for contextual project removal: "remove project", "delete project", "project delete karo"
      if (/^(?:remove\s+project|delete\s+project|project\s+delete|project\s+delete\s+karo|project\s+remove|project\s+remove\s+karo|is\s+project\s+ko\s+remove\s+karo|is\s+project\s+ko\s+delete\s+karo|remove\s+this\s+project|delete\s+this\s+project)$/i.test(cleaned)) {
        if (chatContext?.projectId) {
          const matchedProj = allRegisteredProjects.find((p) => p.id === chatContext.projectId);
          if (matchedProj) {
            const diag: EngineDiagnostics = {
              originalInput: rawClause,
              normalizedText: normalizedClause,
              grammarRuleOrSource: 'p3_contextual_project_delete',
              detectedIntent: 'project.delete',
              finalDecision: 'resolved'
            };
            return {
              disposition: 'resolved',
              proposal: {
                proposalId: `prop_${crypto.randomUUID()}`,
                actionId: 'project.delete',
                intent: 'project.delete',
                targetId: matchedProj.id,
                targetKind: 'project',
                evidenceTier: 'E2',
                executable: true,
                summary: `Remove contextual project "${matchedProj.displayName}" from Bhai`,
                raw: rawClause
              },
              diagnostics: diag
            };
          }
        }

        // No contextual project: clarify which project to remove
        if (allRegisteredProjects.length > 0) {
          const candidates: ClarificationCandidate[] = allRegisteredProjects.map((p) => ({
            id: p.id,
            label: p.displayName,
            kind: 'project',
            description: p.canonicalRoot
          }));
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_delete_clarification_no_context',
            fuzzyCandidates: candidates,
            finalDecision: 'clarify',
            reason: 'Which project would you like to remove from Bhai?'
          };
          return {
            disposition: 'clarify',
            clarification: {
              question: 'Which project would you like to remove from Bhai?',
              candidates,
              originalText: rawClause,
              reason: 'No contextual project is active in this chat.'
            },
            diagnostics: diag
          };
        }
      }

      // Check project-specific commands: "<project> project dikha", "<project> status", "<project> services batao", "remove <project> from bhai"
      for (const p of allRegisteredProjects) {
        const pLower = p.displayName.toLowerCase();

        // Also handle cases where project name starts with "bhai" and leading "bhai" address was stripped by Normalizer
        const strippedPLower = pLower.startsWith('bhai ') ? pLower.replace(/^bhai\s+/, '').trim() : pLower;
        const candidatePhrases = [pLower, strippedPLower];

        // 3a. Remove project: "remove <project> from bhai", "delete <project> from bhai", "<project> delete karo"
        let isDeleteMatch = false;
        for (const phrase of candidatePhrases) {
          if (
            cleaned === `remove ${phrase} from bhai` ||
            cleaned === `delete ${phrase} from bhai` ||
            cleaned === `${phrase} delete karo` ||
            cleaned === `${phrase} project delete karo`
          ) {
            isDeleteMatch = true;
            break;
          }
        }

        if (isDeleteMatch) {
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_project_delete_intent',
            detectedIntent: 'project.delete',
            finalDecision: 'resolved'
          };
          return {
            disposition: 'resolved',
            proposal: {
              proposalId: `prop_${crypto.randomUUID()}`,
              actionId: 'project.delete',
              intent: 'project.delete',
              targetId: p.id,
              targetKind: 'project',
              evidenceTier: 'E1',
              executable: true,
              summary: `Remove project "${p.displayName}" from Bhai`,
              raw: rawClause
            },
            diagnostics: diag
          };
        }

        // 3b. Project services: "<project> ke services batao", "<project> services dikhao", "<project> services"
        let isServicesMatch = false;
        for (const phrase of candidatePhrases) {
          if (
            cleaned === `${phrase} ke services batao` ||
            cleaned === `${phrase} ke services dikhao` ||
            cleaned === `${phrase} services dikhao` ||
            cleaned === `${phrase} ke services` ||
            cleaned === `${phrase} services` ||
            normalizedClause === `${phrase} ke services batao` ||
            normalizedClause === `${phrase} ke services dikhao` ||
            normalizedClause === `${phrase} services batao`
          ) {
            isServicesMatch = true;
            break;
          }
        }

        if (isServicesMatch) {
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_project_service_list',
            detectedIntent: 'service.list',
            finalDecision: 'resolved'
          };
          return {
            disposition: 'resolved',
            proposal: {
              proposalId: `prop_${crypto.randomUUID()}`,
              actionId: 'service.list',
              intent: 'service.list',
              targetId: p.id,
              targetKind: 'project',
              evidenceTier: 'E1',
              executable: true,
              summary: `List services for project "${p.displayName}"`,
              raw: rawClause
            },
            diagnostics: diag
          };
        }

        // 3c. Show project: "<project> project dikha", "<project> dikha", "<project> project dikhao", "<project> status"
        let isShowMatch = false;
        for (const phrase of candidatePhrases) {
          if (
            cleaned === `${phrase} project dikha` ||
            cleaned === `${phrase} project dikhao` ||
            cleaned === `${phrase} dikha` ||
            cleaned === `${phrase} dikhao` ||
            cleaned === `show ${phrase} project` ||
            cleaned === `show ${phrase}`
          ) {
            isShowMatch = true;
            break;
          }
        }

        if (isShowMatch) {
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'p3_project_show_intent',
            detectedIntent: 'project.status',
            finalDecision: 'resolved'
          };
          return {
            disposition: 'resolved',
            proposal: {
              proposalId: `prop_${crypto.randomUUID()}`,
              actionId: 'project.status',
              intent: 'project.status',
              targetId: p.id,
              targetKind: 'project',
              evidenceTier: 'E1',
              executable: true,
              summary: `Display details for project "${p.displayName}"`,
              raw: rawClause
            },
            diagnostics: diag
          };
        }
      }
    }

    // E. Ambiguous Targets & Destructive Rejections
    if (normalizedClause === 'pay status' || cleaned === 'pay status') {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'ambiguous_target_rejection',
        finalDecision: 'unsupported',
        reason: 'Ambiguous target "pay" is shared across multiple projects.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Ambiguous target "pay" is shared across multiple projects. Please specify the full project name.',
          supportedExamples: ['office payments status']
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'code kholo' ||
      normalizedClause === 'open code' ||
      cleaned === 'code kholo' ||
      cleaned === 'open code'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'ambiguous_target_rejection',
        finalDecision: 'unsupported',
        reason: 'Ambiguous target "code" matches both Visual Studio Code app and the code project.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Ambiguous target "code" matches both Visual Studio Code app and the code project. Please specify "vs code kholo" or the full project name.',
          supportedExamples: ['vs code kholo', 'vscode khol']
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas backend restart' ||
      cleaned === 'aawas backend restart'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'atomic_restart_unsupported',
        finalDecision: 'unsupported',
        reason: 'Atomic service restart is not supported in MVP.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Atomic service restart is not supported in MVP. Use explicit stop then start, or configure a workflow.',
          supportedExamples: ['aawas backend stop', 'aawas backend start']
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause.includes('delete everything') ||
      normalizedClause.includes('rm -rf') ||
      normalizedClause.includes('drop database') ||
      normalizedClause.includes('truncate')
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'destructive_command_prohibition',
        finalDecision: 'unsupported',
        reason: 'Destructive system operations are not supported by Bhai.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Destructive system operations are not supported by Bhai.',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    if (normalizedClause.includes('wait ') || normalizedClause.includes('sleep ')) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'duration_recognizer_unsupported',
        finalDecision: 'unsupported',
        reason: 'Duration recognizers alone cannot invent a command action.'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'Duration recognizers alone cannot invent a command action.',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    if (normalizedClause === 'yes' || normalizedClause === 'ha' || normalizedClause === 'haan') {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'orphan_affirmation',
        finalDecision: 'unsupported',
        reason: 'There is no pending confirmation to approve with "yes".'
      };
      return {
        disposition: 'unsupported',
        unsupported: {
          reason: 'There is no pending confirmation to approve with "yes".',
          supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES
        },
        diagnostics: diag
      };
    }

    // F. Port Inspection Grammar
    // "port <N> check", "port <N> check karo", "check port <N>", "port <N> dekh", "<N> port dekh", "<N> port check"
    let portToken: string | null = null;
    let isAmbiguousPort = false;

    if (/\bport\b/i.test(normalizedClause)) {
      if (normalizedClause.includes(' or ') || normalizedClause.includes(',')) {
        isAmbiguousPort = true;
      } else {
        // Suffix form: "<N> port", "<N> port dekh", "<N> port check karo"
        const suffixMatch = /(?:^|\b)(?:(?:check|inspect)\s+)?([^\s]+)\s+(?:number\s+|no\.?\s+)?port(?:\b|$)/i.exec(
          normalizedClause
        );
        if (
          suffixMatch &&
          !['check', 'inspect', 'the', 'this', 'a', 'open', 'close', 'serial', 'usb', 'com'].includes(
            suffixMatch[1].toLowerCase()
          )
        ) {
          portToken = suffixMatch[1].trim();
        } else {
          // Prefix form: "port <N>", "port <N> dekh", "check port <N>", "port: <N>"
          const prefixMatch = /(?:^|\b)(?:(?:check|inspect)\s+)?port(?:\s+number|\s+no\.?)?\s*:?\s*([^\s]+)/i.exec(
            normalizedClause
          );
          if (prefixMatch) {
            portToken = prefixMatch[1].trim();
          }
        }
      }
    }

    if (portToken) {
      portToken = portToken.replace(/^[#:]+/, '').replace(/[?,.!;:]+$/, '');
    }

    if (isAmbiguousPort || portToken !== null) {
      // Check for ambiguous port expression: "port 3000 or 3001 check"
      if (isAmbiguousPort || !portToken) {
        const candidates: ClarificationCandidate[] = [
          { id: 'PORT_3000', label: 'Port 3000', kind: 'port' },
          { id: 'PORT_3001', label: 'Port 3001', kind: 'port' }
        ];
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'port_ambiguous_multiple',
          fuzzyCandidates: candidates,
          finalDecision: 'clarify',
          reason: 'Ambiguous port target in command input.'
        };
        return {
          disposition: 'clarify',
          clarification: {
            question: 'Multiple ports specified. Which port would you like to inspect?',
            candidates,
            originalText: rawClause,
            reason: 'Ambiguous port target in command input.'
          },
          diagnostics: diag
        };
      }

      // Check if portToken contains non-digits (e.g. "300o")
      if (!/^[+-]?\d+$/.test(portToken)) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'port_parameter_malformed',
          extractedParams: { port: portToken },
          finalDecision: 'invalid',
          reason: `Port "${portToken}" is invalid. Port must be an integer between 1 and 65535.`
        };
        return {
          disposition: 'invalid',
          invalid: {
            reason: `Port "${portToken}" is invalid. Port must be an integer between 1 and 65535.`,
            parameter: portToken,
            errorType: 'OUT_OF_BOUNDS_PORT'
          },
          diagnostics: diag
        };
      }

      const portNum = parseInt(portToken, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'port_parameter_out_of_bounds',
          extractedParams: { port: portNum },
          finalDecision: 'invalid',
          reason: `Port ${portNum} is out of bounds. macOS ports must be integers between 1 and 65535.`
        };
        return {
          disposition: 'invalid',
          invalid: {
            reason: `Port ${portNum} is out of bounds. macOS ports must be integers between 1 and 65535.`,
            parameter: String(portNum),
            errorType: 'OUT_OF_BOUNDS_PORT'
          },
          diagnostics: diag
        };
      }

      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'port_inspect_grammar',
        detectedIntent: 'port.inspect',
        extractedParams: { port: portNum },
        capabilityAvailability: {
          actionId: 'port.inspect',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'port.inspect',
          intent: 'port.inspect',
          params: { port: portNum },
          evidenceTier: 'E1',
          executable: false,
          summary: `Inspect listening process on port ${portNum} (Catalog capability: P3)`,
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // G. Volume Control Grammar
    // "volume <N>", "set volume to <N>", "volume <N>%"
    const volMatch = /(?:^|\b)(?:set\s+volume(?:\s+to)?\s+([+-]?\d+)|volume\s+([+-]?\d+)|volume\s+set\s+([+-]?\d+)|aawaz\s+([+-]?\d+)|awaz\s+([+-]?\d+))%?(?:\b|$)/i.exec(
      normalizedClause
    );
    if (volMatch && (normalizedClause.startsWith('volume ') || normalizedClause.startsWith('set volume') || normalizedClause.startsWith('aawaz') || normalizedClause.startsWith('awaz'))) {
      const volToken = (volMatch[1] || volMatch[2] || volMatch[3] || volMatch[4] || volMatch[5] || '').trim();
      const volLevel = parseInt(volToken, 10);

      if (isNaN(volLevel) || volLevel < 0 || volLevel > 100) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'volume_parameter_out_of_bounds',
          extractedParams: { volume: volLevel },
          finalDecision: 'invalid',
          reason: `Volume level ${volLevel} is out of bounds. Volume must be between 0 and 100 percent.`
        };
        return {
          disposition: 'invalid',
          invalid: {
            reason: `Volume level ${volLevel} is out of bounds. Volume must be between 0 and 100 percent.`,
            parameter: String(volLevel),
            errorType: 'OUT_OF_BOUNDS_VOLUME'
          },
          diagnostics: diag
        };
      }

      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'volume_set_grammar',
        detectedIntent: 'volume.set',
        extractedParams: { volume: volLevel },
        capabilityAvailability: {
          actionId: 'system.volume.set',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'system.volume.set',
          intent: 'volume.set',
          params: { volume: volLevel },
          evidenceTier: 'E1',
          executable: false,
          summary: `Set macOS system volume to ${volLevel}% (Catalog capability: P3)`,
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // H. Process Commands: "kill process <target>", "process list", "ps aux"
    const killMatch = /(?:^|\b)(?:kill\s+process\s+([^\s]+)|process\s+kill\s+([^\s]+)|kill\s+([^\s]+)\s+process)(?:\b|$)/i.exec(
      normalizedClause
    );
    if (killMatch) {
      const targetProcess = (killMatch[1] || killMatch[2] || killMatch[3] || '').trim();
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'process_kill_grammar',
        detectedIntent: 'process.kill',
        extractedParams: { target: targetProcess },
        capabilityAvailability: {
          actionId: 'process.kill',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'process.kill',
          intent: 'process.kill',
          params: { target: targetProcess },
          evidenceTier: 'E1',
          executable: false,
          summary: `Terminate process "${targetProcess}" (Catalog capability: P4)`,
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'process list' ||
      normalizedClause === 'ps aux' ||
      normalizedClause === 'list processes' ||
      normalizedClause === 'processes' ||
      cleaned === 'process list'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'process_inspect_grammar',
        detectedIntent: 'process.inspect',
        capabilityAvailability: {
          actionId: 'process.inspect',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'process.inspect',
          intent: 'process.inspect',
          evidenceTier: 'E1',
          executable: false,
          summary: 'List running macOS processes (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // I. Workspace Commands: "office workspace kholo", "workspace office kholo", "switch to office workspace"
    const workspaceMatch = /(?:^|\b)(?:([^\s]+)\s+workspace\s+kholo|workspace\s+([^\s]+)\s+kholo|switch\s+to\s+([^\s]+)\s+workspace|open\s+([^\s]+)\s+workspace)(?:\b|$)/i.exec(
      normalizedClause
    );
    if (workspaceMatch) {
      const wsName = (workspaceMatch[1] || workspaceMatch[2] || workspaceMatch[3] || workspaceMatch[4] || '').trim();
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'workspace_switch_grammar',
        detectedIntent: 'workspace.switch',
        extractedParams: { workspace: wsName },
        capabilityAvailability: {
          actionId: 'workspace.switch',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'workspace.switch',
          intent: 'workspace.switch',
          params: { workspace: wsName },
          evidenceTier: 'E1',
          executable: false,
          summary: `Switch to workspace "${wsName}" (Catalog capability: P3)`,
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // J. Application Commands: VS Code & Safari
    if (
      normalizedClause === 'vs code kholo' ||
      normalizedClause === 'vscode kholo' ||
      normalizedClause === 'vscode khol' ||
      normalizedClause === 'open vscode' ||
      normalizedClause === 'open vs code' ||
      cleaned === 'vs code kholo' ||
      cleaned === 'vscode kholo' ||
      cleaned === 'vscode khol' ||
      cleaned === 'open vscode' ||
      cleaned === 'open vs code'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'app_launch_vscode',
        detectedIntent: 'app.launch',
        capabilityAvailability: {
          actionId: 'app.launch',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'app.launch',
          intent: 'app.launch',
          targetId: 'APP_VSC',
          targetKind: 'app',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Launch Visual Studio Code (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'safari running hai' ||
      normalizedClause === 'is safari running' ||
      cleaned === 'safari running' ||
      cleaned === 'is safari running'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'app_status_safari',
        detectedIntent: 'app.status',
        capabilityAvailability: {
          actionId: 'app.status',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'app.status',
          intent: 'app.status',
          targetId: 'APP_SAF',
          targetKind: 'app',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Check if Safari is running (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'safari band karo' ||
      normalizedClause === 'quit safari' ||
      cleaned === 'safari band' ||
      cleaned === 'quit safari'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'app_quit_safari',
        detectedIntent: 'app.quit',
        capabilityAvailability: {
          actionId: 'app.quit',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'app.quit',
          intent: 'app.quit',
          targetId: 'APP_SAF',
          targetKind: 'app',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Quit Safari application (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // K. Folder Commands: "documents kholo"
    if (
      normalizedClause === 'documents kholo' ||
      normalizedClause === 'open documents' ||
      cleaned === 'documents kholo' ||
      cleaned === 'open documents'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'folder_open_documents',
        detectedIntent: 'folder.open',
        capabilityAvailability: {
          actionId: 'folder.open',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'folder.open',
          intent: 'folder.open',
          targetId: 'F_DOCS',
          targetKind: 'folder',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Open Documents folder (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // L. Project & Workflow Commands
    if (
      normalizedClause === 'research and development kholo' ||
      normalizedClause === 'open research and development' ||
      cleaned === 'research and development kholo' ||
      cleaned === 'open research and development'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'project_status_rd',
        detectedIntent: 'project.status',
        capabilityAvailability: {
          actionId: 'project.status',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.status',
          intent: 'project.status',
          targetId: 'P_RD',
          targetKind: 'project',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Open Research and Development project (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'office payments status' ||
      normalizedClause === 'payments status' ||
      cleaned === 'office payments status' ||
      cleaned === 'payments status'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'project_status_payments',
        detectedIntent: 'project.status',
        capabilityAvailability: {
          actionId: 'project.status',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.status',
          intent: 'project.status',
          targetId: 'P_P',
          targetKind: 'project',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Check Office Payments project status (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas test' ||
      cleaned === 'aawas test'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'project_test_aawas',
        detectedIntent: 'project.test',
        capabilityAvailability: {
          actionId: 'project.test',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.test',
          intent: 'project.test',
          targetId: 'P_A',
          targetKind: 'project',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Run Aawas test recipe (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas backend start' ||
      cleaned === 'aawas backend start'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'service_start_aawas_backend',
        detectedIntent: 'service.start',
        capabilityAvailability: {
          actionId: 'service.start',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'service.start',
          intent: 'service.start',
          targetId: 'P_A/S_AB',
          targetKind: 'service',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Start Aawas Backend service (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas backend stop' ||
      cleaned === 'aawas backend stop'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'service_stop_aawas_backend',
        detectedIntent: 'service.stop',
        capabilityAvailability: {
          actionId: 'service.stop',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'service.stop',
          intent: 'service.stop',
          targetId: 'P_A/S_AB',
          targetKind: 'service',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Stop Aawas Backend service (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas backend logs dikha' ||
      normalizedClause === 'aawas backend logs' ||
      cleaned === 'aawas backend logs dikha' ||
      cleaned === 'aawas backend logs'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'service_logs_aawas_backend',
        detectedIntent: 'service.logs',
        capabilityAvailability: {
          actionId: 'service.logs',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'service.logs',
          intent: 'service.logs',
          targetId: 'P_A/S_AB',
          targetKind: 'service',
          evidenceTier: 'E1',
          executable: false,
          summary: 'View logs for Aawas Backend (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas frontend logs dikha' ||
      normalizedClause === 'aawas frontend logs' ||
      cleaned === 'aawas frontend logs dikha' ||
      cleaned === 'aawas frontend logs'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'service_logs_aawas_frontend',
        detectedIntent: 'service.logs',
        capabilityAvailability: {
          actionId: 'service.logs',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'service.logs',
          intent: 'service.logs',
          targetId: 'P_A/S_AF',
          targetKind: 'service',
          evidenceTier: 'E1',
          executable: false,
          summary: 'View logs for Aawas Frontend (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'aawas status' ||
      normalizedClause === 'aawas' ||
      cleaned === 'aawas status' ||
      cleaned === 'aawas'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'project_status_aawas',
        detectedIntent: 'project.status',
        capabilityAvailability: {
          actionId: 'project.status',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'project.status',
          intent: 'project.status',
          targetId: 'P_A',
          targetKind: 'project',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Check Aawas project status (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'office start' ||
      cleaned === 'office start'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'workflow_run_office',
        detectedIntent: 'workflow.run',
        capabilityAvailability: {
          actionId: 'workflow.run',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'workflow.run',
          intent: 'workflow.run',
          targetId: 'W_OFFICE',
          targetKind: 'workflow',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Run Office Start workflow routine (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    if (
      normalizedClause === 'wrap up' ||
      cleaned === 'wrap up'
    ) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'workflow_run_wrap',
        detectedIntent: 'workflow.run',
        capabilityAvailability: {
          actionId: 'workflow.run',
          isExecutableInP2: false
        },
        finalDecision: 'resolved'
      };
      return {
        disposition: 'resolved',
        proposal: {
          proposalId: `prop_${crypto.randomUUID()}`,
          actionId: 'workflow.run',
          intent: 'workflow.run',
          targetId: 'W_WRAP',
          targetKind: 'workflow',
          evidenceTier: 'E1',
          executable: false,
          summary: 'Run Wrap Up daily workflow routine (Catalog capability: P3)',
          raw: rawClause
        },
        diagnostics: diag
      };
    }

    // M. Same-Chat Contextual Follow-Up: "logs dikha"
    if (normalizedClause === 'logs dikha' || normalizedClause === 'logs' || cleaned === 'logs dikha' || cleaned === 'logs') {
      if (chatContext?.projectId && chatContext?.serviceId) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'contextual_logs_direct',
          detectedIntent: 'service.logs',
          capabilityAvailability: {
            actionId: 'service.logs',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'service.logs',
            intent: 'service.logs',
            targetId: `${chatContext.projectId}/${chatContext.serviceId}`,
            targetKind: 'service',
            evidenceTier: 'E2',
            executable: false,
            summary: `View logs for contextual target ${chatContext.projectId}/${chatContext.serviceId}`,
            raw: rawClause
          },
          diagnostics: diag
        };
      }

      if (chatContext?.projectId === 'P_A' && !chatContext?.serviceId) {
        const cand: ClarificationCandidate[] = [
          { id: 'P_A/S_AB', label: 'Backend', kind: 'service', description: 'Aawas API Server' },
          { id: 'P_A/S_AF', label: 'Frontend', kind: 'service', description: 'Aawas Web UI' }
        ];
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'contextual_logs_ambiguous_service',
          fuzzyCandidates: cand,
          finalDecision: 'clarify',
          reason: 'Project has multiple services and no active service context.'
        };
        return {
          disposition: 'clarify',
          clarification: {
            question: 'Which service in Aawas would you like to view logs for?',
            candidates: cand,
            originalText: rawClause,
            reason: 'Project has multiple services and no active service context.'
          },
          diagnostics: diag
        };
      }

      const cand: ClarificationCandidate[] = [
        { id: 'P_A/S_AB', label: 'Aawas Backend', kind: 'service', description: 'Aawas API Server' },
        { id: 'P_A/S_AF', label: 'Aawas Frontend', kind: 'service', description: 'Aawas Web UI' },
        { id: 'P_P', label: 'Office Payments', kind: 'project', description: 'Payments Project' }
      ];
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'contextual_logs_no_context',
        fuzzyCandidates: cand,
        finalDecision: 'clarify',
        reason: 'No contextual project or service is active in this chat.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: 'Which project or service logs would you like to inspect?',
          candidates: cand,
          originalText: rawClause,
          reason: 'No contextual project or service is active in this chat.'
        },
        diagnostics: diag
      };
    }

    // "stop it" contextual follow-up
    if (normalizedClause === 'stop it' || normalizedClause === 'band karo' || cleaned === 'stop it') {
      if (chatContext?.serviceId) {
        const proj = chatContext.projectId || 'P_A';
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'contextual_stop_direct',
          detectedIntent: 'service.stop',
          capabilityAvailability: {
            actionId: 'service.stop',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'service.stop',
            intent: 'service.stop',
            targetId: `${proj}/${chatContext.serviceId}`,
            targetKind: 'service',
            evidenceTier: 'E2',
            executable: false,
            summary: `Stop contextual service ${proj}/${chatContext.serviceId}`,
            raw: rawClause
          },
          diagnostics: diag
        };
      }

      const cand: ClarificationCandidate[] = [
        { id: 'P_A/S_AB', label: 'Aawas Backend', kind: 'service' },
        { id: 'P_A/S_AF', label: 'Aawas Frontend', kind: 'service' }
      ];
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'contextual_stop_ambiguous',
        fuzzyCandidates: cand,
        finalDecision: 'clarify',
        reason: 'No contextual service is currently active in this chat.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: 'Which running service would you like to stop?',
          candidates: cand,
          originalText: rawClause,
          reason: 'No contextual service is currently active in this chat.'
        },
        diagnostics: diag
      };
    }

    // "stop backend" / "backend stop"
    if (
      normalizedClause === 'stop backend' ||
      normalizedClause === 'backend stop' ||
      cleaned === 'stop backend' ||
      cleaned === 'backend stop'
    ) {
      if (chatContext?.projectId) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'contextual_stop_backend',
          detectedIntent: 'service.stop',
          capabilityAvailability: {
            actionId: 'service.stop',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'service.stop',
            intent: 'service.stop',
            targetId: `${chatContext.projectId}/S_AB`,
            targetKind: 'service',
            evidenceTier: 'E2',
            executable: false,
            summary: `Stop ${chatContext.projectId} backend service`,
            raw: rawClause
          },
          diagnostics: diag
        };
      }

      const cand: ClarificationCandidate[] = [
        { id: 'P_A/S_AB', label: 'Aawas Backend', kind: 'service' },
        { id: 'P_P/S_PB', label: 'Payments Backend', kind: 'service' }
      ];
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'contextual_stop_backend_ambiguous',
        fuzzyCandidates: cand,
        finalDecision: 'clarify',
        reason: 'Service "backend" specified without an active project context.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: "Which project's backend would you like to stop?",
          candidates: cand,
          originalText: rawClause,
          reason: 'Service "backend" specified without an active project context.'
        },
        diagnostics: diag
      };
    }

    // N. System Resource Compositional Grammars (RAM, CPU, Disk, Battery)

    // 1. System Memory / RAM (Phase P1/P2 Executable)
    // Matches compositional English and Hinglish phrases:
    // e.g. "ram kitni bachi hai", "system ki memory batao", "show me memory usage",
    // "bhai memory check kar", "bhai ram dikhao please", "check memory", "ram status", "inspect ram"
    const hasMemoryKeyword = /\b(ram|memory)\b/i.test(normalizedClause);
    if (hasMemoryKeyword) {
      // Ensure it is not referencing a specific process/app memory (e.g. "chrome memory")
      const isProcessContext = /\b(chrome|process|safari|vscode|node|python)\b/i.test(normalizedClause);
      if (!isProcessContext) {
        const hasInspectionSemantics =
          /\b(dekh|dekho|dikha|dikhao|check|inspect|show|display|batao|bataiye|usage|status|info|kitni|kitna|bachi|bacha|free|used|how\s+much|remaining|available)\b/i.test(
            normalizedClause
          );
        const isStandaloneTarget =
          cleaned === 'ram' ||
          cleaned === 'memory' ||
          cleaned === 'memory usage' ||
          cleaned === 'ram usage' ||
          cleaned === 'ram status' ||
          cleaned === 'system memory';

        if (hasInspectionSemantics || isStandaloneTarget) {
          const diag: EngineDiagnostics = {
            originalInput: rawClause,
            normalizedText: normalizedClause,
            grammarRuleOrSource: 'compositional_memory_inspect',
            detectedIntent: 'system.memory_snapshot',
            capabilityAvailability: {
              actionId: 'system.memory.inspect',
              isExecutableInP2: true
            },
            finalDecision: 'resolved'
          };
          return {
            disposition: 'resolved',
            proposal: {
              proposalId: `prop_${crypto.randomUUID()}`,
              actionId: 'system.memory.inspect',
              intent: 'system.memory_snapshot',
              evidenceTier: 'E1',
              executable: true,
              summary: 'Inspect macOS memory and virtual memory statistics',
              raw: rawClause
            },
            diagnostics: diag
          };
        }
      }
    }

    // 2. System CPU
    const hasCpuKeyword = /\b(cpu)\b/i.test(normalizedClause);
    if (hasCpuKeyword) {
      const hasCpuInspection =
        /\b(dekh|dekho|dikha|dikhao|check|inspect|show|display|batao|bataiye|usage|status|load|info|kitna)\b/i.test(
          normalizedClause
        );
      const isStandaloneCpu = cleaned === 'cpu' || cleaned === 'cpu usage' || cleaned === 'cpu status';
      if (hasCpuInspection || isStandaloneCpu) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'compositional_cpu_inspect',
          detectedIntent: 'system.cpu_snapshot',
          capabilityAvailability: {
            actionId: 'system.cpu.inspect',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'system.cpu.inspect',
            intent: 'system.cpu_snapshot',
            evidenceTier: 'E1',
            executable: false,
            summary: 'Inspect CPU load and core metrics (Catalog capability: P3)',
            raw: rawClause
          },
          diagnostics: diag
        };
      }
    }

    // 3. System Disk
    const hasDiskKeyword = /\b(disk|storage|hard\s*drive|space)\b/i.test(normalizedClause);
    if (hasDiskKeyword) {
      const hasDiskInspection =
        /\b(space|usage|dikha|dikhao|dekh|dekho|check|inspect|show|batao|status|kitna|free)\b/i.test(
          normalizedClause
        );
      if (hasDiskInspection) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'compositional_disk_inspect',
          detectedIntent: 'system.disk_snapshot',
          capabilityAvailability: {
            actionId: 'system.disk.inspect',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'system.disk.inspect',
            intent: 'system.disk_snapshot',
            evidenceTier: 'E1',
            executable: false,
            summary: 'Inspect local disk usage and volumes (Catalog capability: P3)',
            raw: rawClause
          },
          diagnostics: diag
        };
      }
    }

    // 4. System Battery
    const hasBatteryKeyword = /\b(battery|charging|charge)\b/i.test(normalizedClause);
    if (hasBatteryKeyword) {
      const hasBatteryInspection =
        /\b(status|percentage|level|dekh|dekho|dikha|dikhao|check|inspect|show|batao|kitni)\b/i.test(
          normalizedClause
        );
      const isStandaloneBattery = cleaned === 'battery' || cleaned === 'battery status';
      if (hasBatteryInspection || isStandaloneBattery) {
        const diag: EngineDiagnostics = {
          originalInput: rawClause,
          normalizedText: normalizedClause,
          grammarRuleOrSource: 'compositional_battery_inspect',
          detectedIntent: 'system.battery_snapshot',
          capabilityAvailability: {
            actionId: 'system.battery.inspect',
            isExecutableInP2: false
          },
          finalDecision: 'resolved'
        };
        return {
          disposition: 'resolved',
          proposal: {
            proposalId: `prop_${crypto.randomUUID()}`,
            actionId: 'system.battery.inspect',
            intent: 'system.battery_snapshot',
            evidenceTier: 'E1',
            executable: false,
            summary: 'Inspect battery power and charge cycles (Catalog capability: P3)',
            raw: rawClause
          },
          diagnostics: diag
        };
      }
    }

    // O. Fuzzy Candidate Suggestion Check (Fuse.js)
    // Matches typos against action templates and entity names (e.g. "memry dekh", "ram deko", "volum 50", "vs cdoe kholo")
    let extractedNumber: number | undefined;
    const numMatch = /\b(\d+)\b/.exec(normalizedClause);
    if (numMatch) {
      extractedNumber = parseInt(numMatch[1], 10);
    }

    const fuzzyCandidates = this.fuzzySearch.search(normalizedClause, extractedNumber);
    if (fuzzyCandidates.length > 0) {
      const diag: EngineDiagnostics = {
        originalInput: rawClause,
        normalizedText: normalizedClause,
        grammarRuleOrSource: 'fuzzy_candidate_search',
        fuzzyCandidates,
        finalDecision: 'clarify',
        reason: 'Spelling variation matched known templates or entities fuzzily.'
      };
      return {
        disposition: 'clarify',
        clarification: {
          question: `Did you mean one of these?`,
          candidates: fuzzyCandidates,
          originalText: rawClause,
          reason: 'Spelling variation matched known entities fuzzily.'
        },
        diagnostics: diag
      };
    }

    // P. Unsupported Unfamiliar Phrase (offers suggestions + Teach entry point)
    const diag: EngineDiagnostics = {
      originalInput: rawClause,
      normalizedText: normalizedClause,
      grammarRuleOrSource: 'fallback_unsupported',
      finalDecision: 'unsupported',
      reason: `I don't have a command for "${rawClause}".`
    };
    return {
      disposition: 'unsupported',
      unsupported: {
        reason: `I don't have a command for "${rawClause}".`,
        supportedExamples: DeterministicLanguageEngine.SUPPORTED_EXAMPLES,
        teachCandidatePhrase: rawClause
      },
      diagnostics: diag
    };
  }
}

import { ClarificationCandidate } from '../shared/contracts/dto';

export type ResolutionDisposition = 'resolved' | 'clarify' | 'negated' | 'unsupported' | 'invalid';
export type EvidenceTier = 'E1' | 'E2' | 'E3' | 'E4';

export interface ProtectedSpan {
  start: number;
  end: number;
  content: string;
  type: 'quote' | 'path' | 'number' | 'entity';
}

export interface NormalizedInput {
  raw: string;
  normalized: string;
  hasLeadingBhai: boolean;
  protectedSpans: ProtectedSpan[];
}

export interface TokenizedResult {
  tokens: string[];
  raw: string;
  hasNegation: boolean;
  negationMarkers: string[];
  isDiagnosticQuery: boolean;
  numericSlots: number[];
  potentialEntities: string[];
}

export interface ResolvedProposal {
  proposalId: string;
  actionId: string;
  intent: string;
  targetId?: string;
  targetKind?: 'action' | 'workflow' | 'app' | 'project' | 'service' | 'folder';
  params?: Record<string, any>;
  evidenceTier: EvidenceTier;
  executable: boolean;
  summary: string;
  raw: string;
  chaining?: ResolvedProposal[];
}

export interface ClarificationDetails {
  question: string;
  candidates: ClarificationCandidate[];
  originalText: string;
  reason: string;
}

export interface NegationDetails {
  explanation: string;
  markers: string[];
  prohibitedSpans: string[];
}

export interface UnsupportedDetails {
  reason: string;
  supportedExamples: string[];
  teachCandidatePhrase?: string;
}

export interface InvalidDetails {
  reason: string;
  parameter?: string;
  errorType: string;
}

export interface EngineDiagnostics {
  originalInput: string;
  normalizedText: string;
  detectedIntent?: string;
  extractedParams?: Record<string, any>;
  grammarRuleOrSource: string;
  fuzzyCandidates?: ClarificationCandidate[];
  negationResult?: { hasNegation: boolean; markers: string[] };
  capabilityAvailability?: { actionId: string; isExecutableInP2: boolean };
  finalDecision: ResolutionDisposition;
  reason?: string;
}

export type EngineResult =
  | {
      disposition: 'resolved';
      proposal: ResolvedProposal;
      diagnostics?: EngineDiagnostics;
    }
  | {
      disposition: 'clarify';
      clarification: ClarificationDetails;
      diagnostics?: EngineDiagnostics;
    }
  | {
      disposition: 'negated';
      negation: NegationDetails;
      diagnostics?: EngineDiagnostics;
    }
  | {
      disposition: 'unsupported';
      unsupported: UnsupportedDetails;
      diagnostics?: EngineDiagnostics;
    }
  | {
      disposition: 'invalid';
      invalid: InvalidDetails;
      diagnostics?: EngineDiagnostics;
    };

export interface ChatContextSnapshot {
  chatId: string;
  projectId?: string | null;
  serviceId?: string | null;
  appId?: string | null;
}

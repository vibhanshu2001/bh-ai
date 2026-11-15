export type CorpusLanguage = 'en' | 'hinglish';
export type CorpusDisposition = 'resolved' | 'clarify' | 'negated' | 'unsupported' | 'invalid';
export type CorpusSplit = 'dev' | 'holdout';
export type CorpusProvenance = 'spec-example' | 'authored' | 'observed-developer' | 'adversarial-probe';

export interface CorpusRecord {
  id: string;
  sourceType: CorpusProvenance;
  participantId?: string;
  consentReference?: string;
  taskStory: string;
  language: CorpusLanguage;
  verbatimText: string;
  chatContextFixture?: {
    projectId?: string;
    serviceId?: string;
    appId?: string;
  };
  goldIntent: string;
  goldTargetId?: string;
  goldSlots?: Record<string, any>;
  goldDisposition: CorpusDisposition;
  goldRiskClass: 'inspect' | 'safeEffect' | 'approvedCode' | 'highRisk';
  annotatorId: string;
  adjudicated: boolean;
  split: CorpusSplit;
  collectedAt: number;
}

export interface CorpusSummaryMetrics {
  totalRecords: number;
  distinctParticipants: number;
  englishCount: number;
  hinglishCount: number;
  negationAndAmbiguityCount: number;
  outOfScopeCount: number;
  holdoutCount: number;
  devCount: number;
  isHumanQuotaMet: boolean;
}

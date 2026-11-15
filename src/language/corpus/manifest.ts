import { CorpusRecord, CorpusSummaryMetrics } from './schema';
import { REGRESSION_DATASET_70 } from '../evaluator';

/**
 * Real Developer Language Corpus Manifest and Protocol
 * Per TESTING_STRATEGY.md:
 * - Minimum 600 collected phrases
 * - Minimum 12 developers (at least 6 native Romanized Hinglish users)
 * - 25% untouched holdout split
 * - Separate measurement of English and Romanized Hinglish
 * - Synthetic examples must retain provenance 'spec-example' / 'authored' and NEVER be mislabeled as 'observed-developer'.
 */
export class CorpusRegistry {
  private static readonly RECORDS: CorpusRecord[] = REGRESSION_DATASET_70.map((tc, index) => {
    const isHinglish = /[a-zA-Z]*(?:dekh|dikha|khol|kholo|chala|band|mat|nahi|nahin|kyu|aur)\b/i.test(tc.input);
    const isNegationOrAmbiguity = ['negated', 'clarify'].includes(tc.expectedDisposition);
    const isOutOfScope = tc.expectedDisposition === 'unsupported';

    return {
      id: tc.id,
      sourceType: 'spec-example' as const,
      taskStory: `Specification reference test ${tc.id}`,
      language: isHinglish ? 'hinglish' : 'en',
      verbatimText: tc.input,
      chatContextFixture: tc.chatContext,
      goldIntent: tc.expectedDisposition,
      goldTargetId: tc.expectedTarget,
      goldDisposition: tc.expectedDisposition,
      goldRiskClass: 'inspect',
      annotatorId: 'architect-review',
      adjudicated: true,
      split: index % 4 === 0 ? 'holdout' : 'dev',
      collectedAt: 1731600000000
    };
  });

  public static getRecords(): CorpusRecord[] {
    return this.RECORDS;
  }

  public static getMetrics(): CorpusSummaryMetrics {
    const records = this.RECORDS;
    const distinctParticipants = 0; // Real developer participant collection in progress
    const englishCount = records.filter((r) => r.language === 'en').length;
    const hinglishCount = records.filter((r) => r.language === 'hinglish').length;
    const negationAndAmbiguityCount = records.filter((r) => ['negated', 'clarify'].includes(r.goldDisposition)).length;
    const outOfScopeCount = records.filter((r) => r.goldDisposition === 'unsupported').length;
    const holdoutCount = records.filter((r) => r.split === 'holdout').length;
    const devCount = records.filter((r) => r.split === 'dev').length;

    // Requirement: >= 600 utterances, >= 12 real human developers
    const isHumanQuotaMet = records.length >= 600 && distinctParticipants >= 12;

    return {
      totalRecords: records.length,
      distinctParticipants,
      englishCount,
      hinglishCount,
      negationAndAmbiguityCount,
      outOfScopeCount,
      holdoutCount,
      devCount,
      isHumanQuotaMet
    };
  }
}

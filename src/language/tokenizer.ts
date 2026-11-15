import nlp from 'compromise';
import { TokenizedResult } from './types';

export interface ITokenizer {
  tokenize(raw: string, normalized: string): TokenizedResult;
}

export class LanguageTokenizer implements ITokenizer {
  private static readonly NEGATION_MARKERS = [
    'mat',
    'nahi',
    'nahin',
    "don't",
    'dont',
    'do not',
    'never',
    'cannot'
  ];

  public tokenize(raw: string, normalized: string): TokenizedResult {
    // 1. Compromise tokenizer subpath
    const doc = nlp.tokenize(normalized);
    const tokens: string[] = doc.terms().out('array').map((t: string) => t.toLowerCase());

    // 2. Scan for diagnostic query patterns (read-only diagnostic questions with "nahi")
    // e.g. "backend kyu nahi chal raha", "why is backend not running"
    const isDiagnosticQuery = this.checkDiagnosticQuery(normalized);

    // 3. Scan for negation markers
    const detectedNegations: string[] = [];
    let hasNegation = false;

    if (!isDiagnosticQuery) {
      for (const marker of LanguageTokenizer.NEGATION_MARKERS) {
        if (marker.includes(' ')) {
          if (normalized.includes(marker)) {
            detectedNegations.push(marker);
            hasNegation = true;
          }
        } else {
          if (tokens.includes(marker)) {
            detectedNegations.push(marker);
            hasNegation = true;
          }
        }
      }

      // Check for standalone "na" as negation marker (e.g. "kholna na", "na chalao")
      if (tokens.includes('na') && (tokens.includes('kholo') || tokens.includes('chalao') || tokens.includes('start'))) {
        detectedNegations.push('na');
        hasNegation = true;
      }
    }

    // 4. Extract numeric slots (preserving negative numbers like -10)
    const numericSlots: number[] = [];
    const numRegex = /(?:^|\s)([+-]?\d+(?:\.\d+)?)(?:\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = numRegex.exec(normalized)) !== null) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed)) {
        numericSlots.push(parsed);
      }
    }

    return {
      tokens,
      raw,
      hasNegation,
      negationMarkers: detectedNegations,
      isDiagnosticQuery,
      numericSlots,
      potentialEntities: []
    };
  }

  private checkDiagnosticQuery(normalized: string): boolean {
    const diagnosticPatterns = [
      /kyu[n]?\s+nahi\s+chal\s+raha/i,
      /kyu[n]?\s+nahi\s+chal/i,
      /why\s+is\s+.*not\s+running/i,
      /why\s+is\s+.*not\s+working/i,
      /why\s+not\s+running/i
    ];

    return diagnosticPatterns.some((p) => p.test(normalized));
  }
}

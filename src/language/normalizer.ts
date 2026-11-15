import { NormalizedInput, ProtectedSpan } from './types';

export class Normalizer {
  public static readonly MAX_LENGTH = 2048;

  public static normalize(input: string): NormalizedInput {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    if (input.length > Normalizer.MAX_LENGTH) {
      throw new Error(`Input exceeds maximum length of ${Normalizer.MAX_LENGTH} characters`);
    }

    // Check for NUL and unsafe control characters (except common whitespace \r, \n, \t)
    if (/[\0\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input)) {
      throw new Error('Input contains prohibited control characters or NUL bytes');
    }

    const raw = input;
    const protectedSpans: ProtectedSpan[] = [];

    // 1. Detect and protect quoted spans
    const quoteRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    let match: RegExpExecArray | null;
    while ((match = quoteRegex.exec(raw)) !== null) {
      protectedSpans.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1] ?? match[2] ?? match[0],
        type: 'quote'
      });
    }

    // 2. Detect and protect signed numbers (-10, +50, 3000)
    const numberRegex = /(?:\b|[+-])\d+(?:\.\d+)?\b/g;
    while ((match = numberRegex.exec(raw)) !== null) {
      // Don't overlap with existing quote spans
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = protectedSpans.some(p => (start >= p.start && start < p.end) || (end > p.start && end <= p.end));
      if (!overlaps) {
        protectedSpans.push({
          start,
          end,
          content: match[0],
          type: 'number'
        });
      }
    }

    // 3. Detect and protect path-like spans
    const pathRegex = /(?:\/[a-zA-Z0-9._~-]+)+/g;
    while ((match = pathRegex.exec(raw)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const overlaps = protectedSpans.some(p => (start >= p.start && start < p.end) || (end > p.start && end <= p.end));
      if (!overlaps) {
        protectedSpans.push({
          start,
          end,
          content: match[0],
          type: 'path'
        });
      }
    }

    // 4. Unicode normalization (NFKC)
    const unicodeNormalized = raw.normalize('NFKC').trim();

    // 5. Check and strip leading standalone "bhai" address token
    let hasLeadingBhai = false;
    let cleaned = unicodeNormalized;

    const leadingBhaiRegex = /^(?:bhai\b[,\s]*)/i;
    if (leadingBhaiRegex.test(cleaned)) {
      hasLeadingBhai = true;
      cleaned = cleaned.replace(leadingBhaiRegex, '').trim();
    }

    // 6. Whitespace collapse and lowercase for vocabulary matching
    const normalized = cleaned.replace(/\s+/g, ' ').toLowerCase();

    return {
      raw,
      normalized,
      hasLeadingBhai,
      protectedSpans
    };
  }
}

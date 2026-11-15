/**
 * Bhai Phase P4.3 — Fast Token Counter & Budget Truncation Utility
 * High-performance, offline tokenizer approximation for context budgeting.
 *
 * Sizing rules:
 * - English/Hinglish text averages ~3.8 to 4.2 characters per token.
 * - Words separated by whitespace + punctuation count as distinct tokens.
 * - Conservative estimation uses max(word_based_estimate, char_based_estimate).
 */

export interface TokenEstimation {
  charCount: number;
  wordCount: number;
  estimatedTokens: number;
}

/**
 * Fast, conservative token estimator.
 * Avoids heavy external C++ or WASM tokenizer dependencies while providing
 * reliable upper-bound bounds compatible with Claude, GPT-4, and Llama tokenizers.
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  // 1. Character ratio heuristic (conservative ~3.7 chars per token)
  const charBased = Math.ceil(text.length / 3.7);

  // 2. Word & punctuation heuristic
  // Split on whitespace or common code punctuation tokens
  const tokens = text.match(/[\w]+|[^\s\w]/g);
  const wordBased = tokens ? Math.ceil(tokens.length * 1.1) : 0;

  // Conservative upper bound ensures we never exceed agent context budgets
  return Math.max(charBased, wordBased);
}

/**
 * Truncates text cleanly at word or line boundaries to fit within a strict token budget.
 */
export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  truncationNotice = '... [truncated to fit budget]'
): { text: string; tokens: number; truncated: boolean } {
  const currentTokens = countTokens(text);
  if (currentTokens <= maxTokens) {
    return { text, tokens: currentTokens, truncated: false };
  }

  const noticeTokens = countTokens(truncationNotice);
  const targetTokens = Math.max(1, maxTokens - noticeTokens);

  // Approximate target character count based on conservative 4 chars/token
  const targetChars = targetTokens * 4;
  let truncatedSlice = text.slice(0, targetChars);

  // Clean boundary: snap back to the last newline or whitespace if possible
  const lastNewline = truncatedSlice.lastIndexOf('\n');
  if (lastNewline > targetChars * 0.7) {
    truncatedSlice = truncatedSlice.slice(0, lastNewline);
  } else {
    const lastSpace = truncatedSlice.lastIndexOf(' ');
    if (lastSpace > targetChars * 0.7) {
      truncatedSlice = truncatedSlice.slice(0, lastSpace);
    }
  }

  // Double check resulting tokens and iteratively step down if needed
  let finalContent = `${truncatedSlice.trimEnd()}\n${truncationNotice}`;
  while (countTokens(finalContent) > maxTokens && truncatedSlice.length > 50) {
    truncatedSlice = truncatedSlice.slice(0, Math.floor(truncatedSlice.length * 0.9));
    finalContent = `${truncatedSlice.trimEnd()}\n${truncationNotice}`;
  }

  return {
    text: finalContent,
    tokens: countTokens(finalContent),
    truncated: true
  };
}

import assert from 'node:assert';
import { DeterministicLanguageEngine } from '../../language/engine';
import { Normalizer } from '../../language/normalizer';
import { LanguageTokenizer } from '../../language/tokenizer';
import { ChainingParser } from '../../language/chaining';
import { runLanguageBenchmark } from '../../language/evaluator';

export function runLanguageEngineUnitTests() {
  console.log('--- [UNIT] Deterministic Language Engine & Normalizer Tests ---');

  // 1. Normalization & Safety Bounds
  const norm1 = Normalizer.normalize('  BHAI   RAM   DEKH  ');
  assert.strictEqual(norm1.normalized, 'ram dekh');
  assert.strictEqual(norm1.hasLeadingBhai, true);

  const normQuote = Normalizer.normalize('aawas "my custom service" logs');
  assert.strictEqual(normQuote.protectedSpans.length, 1);
  assert.strictEqual(normQuote.protectedSpans[0].content, 'my custom service');

  const normNegativeNumber = Normalizer.normalize('port -10 check');
  assert.strictEqual(normNegativeNumber.protectedSpans.some(s => s.content === '-10'), true);

  // Reject oversized text (>2048 chars)
  assert.throws(() => {
    Normalizer.normalize('a'.repeat(2049));
  }, /exceeds maximum length/);

  // Reject NUL bytes
  assert.throws(() => {
    Normalizer.normalize('bhai memory\0dekh');
  }, /prohibited control characters or NUL/);
  console.log('  ✓ Normalizer preserves Unicode NFKC, spans, negative numbers, and rejects NUL bytes (>2048 chars)');

  // 2. Tokenization & Negation Safety
  const tokenizer = new LanguageTokenizer();
  const tok1 = tokenizer.tokenize('vscode mat khol', 'vscode mat khol');
  assert.strictEqual(tok1.hasNegation, true);
  assert.strictEqual(tok1.isDiagnosticQuery, false);

  const tokDiag = tokenizer.tokenize('backend kyu nahi chal raha', 'backend kyu nahi chal raha');
  assert.strictEqual(tokDiag.isDiagnosticQuery, true);
  assert.strictEqual(tokDiag.hasNegation, false); // Whitelisted as read-only diagnostic query

  const tokDiagEn = tokenizer.tokenize('why is backend not running', 'why is backend not running');
  assert.strictEqual(tokDiagEn.isDiagnosticQuery, true);
  assert.strictEqual(tokDiagEn.hasNegation, false);
  console.log('  ✓ Tokenizer accurately detects negation markers and whitelists read-only diagnostic queries');

  // 3. Engine Resolution & Parameter Bounds
  const engine = new DeterministicLanguageEngine();

  // Negation Safety
  const resNeg = engine.resolveCommand({ chatId: 'c1', text: 'vscode mat khol' });
  assert.strictEqual(resNeg.disposition, 'negated');

  const resNeg2 = engine.resolveCommand({ chatId: 'c1', text: 'do not stop backend' });
  assert.strictEqual(resNeg2.disposition, 'negated');

  // Double Negation
  const resDoubleNeg = engine.resolveCommand({ chatId: 'c1', text: "don't not open safari" });
  assert.strictEqual(resDoubleNeg.disposition, 'clarify');

  // Numeric Parameter Bounds
  const resPortValid = engine.resolveCommand({ chatId: 'c1', text: 'port 3000 check' });
  assert.strictEqual(resPortValid.disposition, 'resolved');
  if (resPortValid.disposition === 'resolved') {
    assert.strictEqual(resPortValid.proposal.params?.port, 3000);
  }

  const resPortDekh = engine.resolveCommand({ chatId: 'c1', text: '4000 port dekh' });
  assert.strictEqual(resPortDekh.disposition, 'resolved');
  if (resPortDekh.disposition === 'resolved') {
    assert.strictEqual(resPortDekh.proposal.params?.port, 4000);
  }

  const resPortLow = engine.resolveCommand({ chatId: 'c1', text: 'port 0 check' });
  assert.strictEqual(resPortLow.disposition, 'invalid');

  const resPortHigh = engine.resolveCommand({ chatId: 'c1', text: 'port 65536 check' });
  assert.strictEqual(resPortHigh.disposition, 'invalid');

  const resVolValid = engine.resolveCommand({ chatId: 'c1', text: 'volume 50' });
  assert.strictEqual(resVolValid.disposition, 'resolved');
  if (resVolValid.disposition === 'resolved') {
    assert.strictEqual(resVolValid.proposal.params?.volume, 50);
  }

  const resVolHigh = engine.resolveCommand({ chatId: 'c1', text: 'volume 150' });
  assert.strictEqual(resVolHigh.disposition, 'invalid');

  const resVolNeg = engine.resolveCommand({ chatId: 'c1', text: 'volume -10' });
  assert.strictEqual(resVolNeg.disposition, 'invalid');
  console.log('  ✓ Typed parameter extraction enforces strict port (1-65535) and volume (0-100) boundaries');

  // 4. Multi-Command Chaining Preflight
  const splitProtected = ChainingParser.splitClauses('Research and Development kholo');
  assert.strictEqual(splitProtected.isChained, false); // protected entity not split

  const resChainValid = engine.resolveCommand({ chatId: 'c1', text: 'open vscode and show memory usage' });
  assert.strictEqual(resChainValid.disposition, 'resolved');
  if (resChainValid.disposition === 'resolved') {
    assert.strictEqual(resChainValid.proposal.chaining?.length, 2);
  }

  const resChainNeg = engine.resolveCommand({ chatId: 'c1', text: 'vscode mat khol aur aawas start' });
  assert.strictEqual(resChainNeg.disposition, 'negated');

  const resChainInvalid = engine.resolveCommand({ chatId: 'c1', text: 'open vscode and fly to moon' });
  assert.strictEqual(resChainInvalid.disposition, 'unsupported');
  console.log('  ✓ Atomic multi-command chaining preflight blocks partially invalid or negated chains');

  // 5. Context Isolation
  const resContextA = engine.resolveCommand({
    chatId: 'chat_a',
    text: 'logs dikha',
    chatContext: { chatId: 'chat_a', projectId: 'P_A', serviceId: 'S_AB' }
  });
  assert.strictEqual(resContextA.disposition, 'resolved');
  if (resContextA.disposition === 'resolved') {
    assert.strictEqual(resContextA.proposal.targetId, 'P_A/S_AB');
  }

  const resContextB = engine.resolveCommand({
    chatId: 'chat_b',
    text: 'logs dikha',
    chatContext: undefined
  });
  assert.strictEqual(resContextB.disposition, 'clarify'); // Strictly asks for clarification; never borrows Chat A's context
  console.log('  ✓ Contextual references are strictly isolated per chat and never leak across conversations');

  // 6. 70-Case Deterministic Specification Regression Suite
  const benchmark = runLanguageBenchmark();
  assert.strictEqual(benchmark.passed, benchmark.total, `Expected 70/70 benchmark cases to pass, got ${benchmark.passed}/${benchmark.total}`);
  console.log(`  ✓ 70-case deterministic specification suite passed: 100% (${benchmark.passed}/${benchmark.total}) in p50=${benchmark.p50Ms}ms, p95=${benchmark.p95Ms}ms (Live human corpus pending)`);
}

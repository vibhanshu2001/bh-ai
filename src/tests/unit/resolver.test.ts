import assert from 'node:assert';
import { ZodError } from 'zod';
import { ExactCommandResolver } from '../../utility/resolver/exact_resolver';
import {
  ChatDtoSchema,
  CommandSubmitRequestSchema,
  MemoryInspectResultSchema
} from '../../shared/contracts/dto';

export function runResolverTests() {
  console.log('--- [UNIT] ExactCommandResolver & Schema Validation Tests ---');
  const resolver = new ExactCommandResolver();

  // 1. Supported Aliases
  const supportedAliases = [
    'bhai memory dekh',
    'memory usage',
    'bhai ram dekh',
    'ram dekh',
    'memory',
    '  BHAI   MEMORY   DEKH  ',
    'Memory Usage'
  ];

  for (const alias of supportedAliases) {
    const res = resolver.resolve(alias);
    assert.strictEqual(res.disposition, 'resolved', `Expected '${alias}' to resolve`);
    assert.strictEqual(res.actionId, 'system.memory.inspect');
    assert.strictEqual(res.intent, 'system.memory_snapshot');
  }
  console.log(`  ✓ ${supportedAliases.length} exact memory command variants resolved cleanly`);

  // 2. Unsupported Commands
  const unsupportedCommands = [
    'bhai cpu dekh',
    'cpu usage',
    'open vscode',
    'safari band karo',
    'what is the weather',
    '',
    '   '
  ];

  for (const cmd of unsupportedCommands) {
    const res = resolver.resolve(cmd);
    assert.strictEqual(res.disposition, 'unsupported', `Expected '${cmd}' to be unsupported`);
    assert.ok(res.supportedExamples && res.supportedExamples.length > 0);
  }
  console.log(`  ✓ ${unsupportedCommands.length} out-of-scope commands rejected as unsupported with suggestions`);

  // 3. Schema Validation Failures
  assert.throws(() => {
    ChatDtoSchema.parse({ id: '', title: 'Test' }); // missing createdAt/updatedAt
  }, ZodError);

  assert.throws(() => {
    CommandSubmitRequestSchema.parse({ chatId: 'c1', text: '' }); // empty text
  }, ZodError);

  assert.throws(() => {
    MemoryInspectResultSchema.parse({ totalBytes: -1, usedBytes: 10, freeBytes: 10, usedPercent: 50, timestamp: 123 }); // negative bytes
  }, ZodError);
  console.log('  ✓ Zod validation schemas strictly enforce input bounds');
}

if (require.main === module) {
  runResolverTests();
}

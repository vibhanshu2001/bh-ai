/**
 * Bhai Phase P4.2 — Unit Tests: MCP Contract & Tool Vocabulary
 * Verifies public tool names (Romanized-Hinglish), descriptions,
 * parameter types, scope requirements, and size bounds against the specification.
 */

import assert from 'node:assert';
import {
  BHAI_TOOLS,
  PUBLIC_TOOL_NAMES,
  PublicToolName,
  YebataInputSchema,
  DhoondhInputSchema,
  KaamkahaInputSchema,
  KahantheInputSchema,
  ServicesbataInputSchema,
  KyabadlaInputSchema,
  YesavekarInputSchema,
  YaadrakhInputSchema,
  HandoffsavekarInputSchema
} from '../../shared/contracts/mcp_tools';
import {
  CHECKPOINT_MAX_PAYLOAD_BYTES,
  HANDOFF_MAX_DOCUMENT_BYTES,
  RECORD_MAX_CONTENT_BYTES
} from '../../shared/contracts/memory_dto';

export async function runMcpContractTests(): Promise<void> {
  console.log('\n--- [UNIT] Phase P4.2 MCP Tool Contract & Schema Tests ---');

  // 1. Tool Vocabulary Verification (9 Public Tools)
  const expectedTools: PublicToolName[] = [
    'yebata',
    'dhoondh',
    'kaamkaha',
    'kahanthe',
    'servicesbata',
    'kyabadla',
    'yesavekar',
    'yaadrakh',
    'handoffsavekar'
  ];

  assert.strictEqual(PUBLIC_TOOL_NAMES.length, 9, 'Must register exactly 9 public MCP tools');

  for (const tool of expectedTools) {
    assert.ok(BHAI_TOOLS[tool], `Tool '${tool}' must be present in BHAI_TOOLS`);
    assert.strictEqual(BHAI_TOOLS[tool].publicName, tool);
    assert.ok(BHAI_TOOLS[tool].description.length > 20, `Tool '${tool}' must have descriptive English guidance`);
    assert.ok(BHAI_TOOLS[tool].scope, `Tool '${tool}' must define required permission scope`);
    assert.ok(BHAI_TOOLS[tool].internalOperation, `Tool '${tool}' must map to internal TS operation`);
  }
  console.log('  ✓ 9 public Romanized-Hinglish MCP tools verified with English descriptions and scopes');

  // 2. Specific Tool Mappings
  assert.strictEqual(BHAI_TOOLS.yebata.internalOperation, 'getContextPack');
  assert.strictEqual(BHAI_TOOLS.yebata.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.dhoondh.internalOperation, 'searchMemory');
  assert.strictEqual(BHAI_TOOLS.dhoondh.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.kaamkaha.internalOperation, 'getTaskState');
  assert.strictEqual(BHAI_TOOLS.kaamkaha.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.kahanthe.internalOperation, 'getLatestHandoff');
  assert.strictEqual(BHAI_TOOLS.kahanthe.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.servicesbata.internalOperation, 'getProjectServices');
  assert.strictEqual(BHAI_TOOLS.servicesbata.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.kyabadla.internalOperation, 'getMemoryChanges');
  assert.strictEqual(BHAI_TOOLS.kyabadla.scope, 'read_memory');

  assert.strictEqual(BHAI_TOOLS.yesavekar.internalOperation, 'recordCheckpoint');
  assert.strictEqual(BHAI_TOOLS.yesavekar.scope, 'write_checkpoints');

  assert.strictEqual(BHAI_TOOLS.yaadrakh.internalOperation, 'proposeMemoryUpdate');
  assert.strictEqual(BHAI_TOOLS.yaadrakh.scope, 'propose_decisions');

  assert.strictEqual(BHAI_TOOLS.handoffsavekar.internalOperation, 'saveHandoff');
  assert.strictEqual(BHAI_TOOLS.handoffsavekar.scope, 'write_checkpoints');
  console.log('  ✓ Public-to-internal operation mappings and permission scopes verified');

  // 3. Input Schema Validation Tests
  // yebata
  const validYebata = YebataInputSchema.parse({ projectId: 'proj_123', mode: 'quick' });
  assert.strictEqual(validYebata.mode, 'quick');
  assert.throws(() => YebataInputSchema.parse({}), /(projectId|expected string)/);

  // dhoondh
  const validDhoondh = DhoondhInputSchema.parse({ projectId: 'proj_123', query: 'PostgreSQL' });
  assert.strictEqual(validDhoondh.limit, 10);
  assert.strictEqual(validDhoondh.category, 'all');

  // yesavekar (Checkpoint <= 2 KiB validation)
  const validYesavekar = YesavekarInputSchema.parse({
    projectId: 'proj_123',
    checkpointType: 'task.progress',
    summary: 'Migrated auth schema to v2',
    idempotencyKey: 'key_12345',
    payloadJson: { step: 1, changes: ['schema.sql'] }
  });
  assert.strictEqual(validYesavekar.checkpointType, 'task.progress');

  // Reject checkpoint payload > 2 KiB
  const oversizedPayload = { data: 'x'.repeat(CHECKPOINT_MAX_PAYLOAD_BYTES + 100) };
  assert.throws(() => {
    YesavekarInputSchema.parse({
      projectId: 'proj_123',
      checkpointType: 'task.progress',
      summary: 'Too large',
      idempotencyKey: 'key_large',
      payloadJson: oversizedPayload
    });
  }, /Checkpoint payload exceeds maximum allowed size/);
  console.log('  ✓ Checkpoint payload size boundary (<=2 KiB) enforced in Zod contract');

  // handoffsavekar (Handoff <= 16 KiB validation)
  const validHandoff = HandoffsavekarInputSchema.parse({
    projectId: 'proj_123',
    objective: 'Complete Phase 4.2',
    completedSummary: 'Built tool registry and schemas',
    remainingSummary: 'Run integration test suite',
    relevantFiles: ['src/mcp/stdio_bridge.ts']
  });
  assert.strictEqual(validHandoff.objective, 'Complete Phase 4.2');

  const oversizedHandoff = {
    projectId: 'proj_123',
    objective: 'Large handoff',
    completedSummary: 'x'.repeat(HANDOFF_MAX_DOCUMENT_BYTES + 100),
    remainingSummary: 'Remaining'
  };
  assert.throws(() => {
    HandoffsavekarInputSchema.parse(oversizedHandoff);
  }, /Handoff document exceeds maximum allowed size/);
  console.log('  ✓ Handoff document size boundary (<=16 KiB) enforced in Zod contract');

  // yaadrakh (Memory update proposal)
  const validYaadrakh = YaadrakhInputSchema.parse({
    projectId: 'proj_123',
    category: 'decision',
    title: 'Use SQLite WAL',
    content: 'We use SQLite in WAL mode for single writer concurrency.'
  });
  assert.strictEqual(validYaadrakh.category, 'decision');

  console.log('[PASS] MCP Contract and Tool Registry Tests Completed Successfully.\n');
}

if (require.main === module) {
  runMcpContractTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

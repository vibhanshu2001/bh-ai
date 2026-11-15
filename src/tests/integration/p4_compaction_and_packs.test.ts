/**
 * Bhai Phase P4.3 Integration Test Suite
 * Context Compaction & Token-Budgeted Context Packs
 *
 * Verifications:
 * 1. Token counter approximations & boundary truncation.
 * 2. Quick Pack (< 550 tokens) and Task Pack (< 1,600 tokens) budget adherence.
 * 3. Deterministic compaction of 100 artificial checkpoints with >= 60% token reduction.
 * 4. 100% preservation of indestructible invariants: ADR decisions and active blockers.
 * 5. Detection and explicit warning formatting of disputed claims (contradictions).
 * 6. Cache hit and automatic cache invalidation upon writing new checkpoints/records.
 * 7. Graceful fallback from Layer B to Layer A when local LLM endpoint is unreachable.
 * 8. Stale file reference detection and tagging (`(stale reference)`).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ProjectRepository } from '../../utility/storage/project_repository';
import { MemoryRepository } from '../../utility/storage/memory_repository';
import { DeterministicCompactor } from '../../utility/memory/deterministic_compactor';
import { LocalModelAdapter } from '../../utility/memory/local_model_adapter';
import { ContextPackGenerator } from '../../utility/memory/context_pack_generator';
import { countTokens, truncateToTokenBudget } from '../../utility/memory/token_counter';
import { MemoryCheckpoint } from '../../shared/contracts/memory_dto';

export async function runP4CompactionAndPacksTests(): Promise<void> {
  console.log('--- [INTEGRATION] Phase P4.3 Context Compaction & Context Packs Tests ---');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bhai_p4_compaction_test_'));
  const dbPath = path.join(tmpDir, 'test_memory.sqlite');
  const projectRoot = path.join(tmpDir, 'mock_repo');
  fs.mkdirSync(projectRoot, { recursive: true });

  // Create mock files in projectRoot to test stale vs valid reference detection
  fs.writeFileSync(path.join(projectRoot, 'src_index.ts'), 'console.log("hello");');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"mock"}');

  const connection = new DatabaseConnection(dbPath);
  const db = connection.open();
  const projectRepo = new ProjectRepository(db);
  const memoryRepo = new MemoryRepository(db);

  try {
    // ========================================================================
    // 1. Token Counter & Budget Truncation Tests
    // ========================================================================
    const sampleText = 'Bhai is an offline-first personal macOS assistant for developers.';
    const tokens = countTokens(sampleText);
    assert(tokens > 5 && tokens < 25, `Expected conservative token estimate, got ${tokens}`);

    const longText = 'Word '.repeat(500); // ~500 words = ~550 tokens
    const truncatedRes = truncateToTokenBudget(longText, 100);
    assert(truncatedRes.truncated === true, 'Expected truncation to occur');
    assert(truncatedRes.tokens <= 100, `Truncated tokens (${truncatedRes.tokens}) exceeded maxTokens 100`);
    assert(truncatedRes.text.includes('... [truncated to fit budget]'), 'Expected truncation notice');
    console.log('  ✓ Token counter and AST budget truncation verified');

    // ========================================================================
    // 2. Setup Project & Baseline Invariants (ADRs & Blockers)
    // ========================================================================
    const project = projectRepo.createProject({
      displayName: 'Kuber Payments Engine',
      canonicalRoot: projectRoot,
      detectedMetadata: { projectType: 'node', tags: ['fintech', 'p4.3'] }
    });

    // Create 3 Architectural Decisions (Must be 100% preserved)
    const adr1 = memoryRepo.createDecision({
      projectId: project.id,
      title: 'ADR-001: Offline SQLite Storage',
      context: 'Agents require persistent cross-session memory without cloud dependencies.',
      decision: 'Use single-writer SQLite with WAL mode in the Utility process.',
      consequences: 'Requires IPC serialization for concurrent writes.',
      authorType: 'user',
      authorId: 'architect_vibhanshu',
      status: 'accepted'
    });

    const adr2 = memoryRepo.createDecision({
      projectId: project.id,
      title: 'ADR-002: Stdio MCP Protocol Bridge',
      context: 'Coding agents communicate via standard input/output JSON-RPC 2.0.',
      decision: 'Spawn standalone bhai-mcp executable bridging to unix domain socket.',
      consequences: 'Sub-millisecond latency for agent requests.',
      authorType: 'user',
      authorId: 'architect_vibhanshu',
      status: 'accepted'
    });

    // Create tasks with 1 active blocker
    const task1 = memoryRepo.createTask({
      projectId: project.id,
      title: 'Implement Payment Gateway Webhook',
      description: 'Receive and verify webhook signatures from Stripe.',
      status: 'in_progress',
      priority: 1,
      blockersSummary: 'Missing sandbox API secret keys from partner team'
    });

    const task2 = memoryRepo.createTask({
      projectId: project.id,
      title: 'Setup Redis Session Store',
      description: 'Local session cache for high throughput transactions.',
      status: 'in_progress',
      priority: 2
    });

    console.log('  ✓ Invariants established: 2 ADRs, 1 Active Blocker');

    // ========================================================================
    // 3. 100 Checkpoint Compaction & >=60% Token Reduction Test
    // ========================================================================
    const compactor = new DeterministicCompactor();
    const artificialCheckpoints: MemoryCheckpoint[] = [];

    // Synthesize 100 sequential progress and file modification checkpoints
    for (let i = 1; i <= 100; i++) {
      const isBlocker = i === 45;
      const isResolved = i === 85;
      const cp = memoryRepo.recordCheckpoint({
        projectId: project.id,
        sessionId: `session_run_${Math.floor(i / 25)}`,
        clientName: i % 2 === 0 ? 'claude-code' : 'codex',
        taskId: task1.id,
        checkpointType: isBlocker
          ? 'blocker.discovered'
          : isResolved
          ? 'blocker.resolved'
          : i % 5 === 0
          ? 'files.modified'
          : 'task.progress',
        summary: isBlocker
          ? 'Database migration 007 lock timeout during index creation'
          : isResolved
          ? 'Database migration 007 lock timeout during index creation'
          : `Iterative progress checkpoint #${i}: validated webhook HMAC signatures step ${i}`,
        payloadJson: JSON.stringify({
          iteration: i,
          status: 'executing',
          details: `Verbose execution logging detailing step ${i} execution, parameters, stack traces, and local timestamps.`
        }),
        idempotencyKey: `chk_synthetic_${i}`,
        evidenceRefs: [
          { kind: 'file', reference: `src/webhook/step_${i}.ts`, summary: `Implementation step ${i}` }
        ]
      }).checkpoint;
      artificialCheckpoints.push(cp);
    }

    assert.strictEqual(artificialCheckpoints.length, 100, 'Should have created 100 checkpoints');

    // Ingest a contradiction into checkpoint payload
    memoryRepo.recordCheckpoint({
      projectId: project.id,
      sessionId: 'session_claude',
      clientName: 'claude-code',
      checkpointType: 'task.progress',
      summary: 'Auth service port assertion',
      payloadJson: JSON.stringify({
        disputedClaimKey: 'auth_service_port',
        statement: 'Auth service running on port 4000'
      }),
      idempotencyKey: 'dispute_claude_1'
    });

    memoryRepo.recordCheckpoint({
      projectId: project.id,
      sessionId: 'session_codex',
      clientName: 'codex',
      checkpointType: 'task.progress',
      summary: 'Auth service port assertion',
      payloadJson: JSON.stringify({
        disputedClaimKey: 'auth_service_port',
        statement: 'Auth service running on port 8080'
      }),
      idempotencyKey: 'dispute_codex_1'
    });

    const allCheckpoints = memoryRepo.listCheckpoints(project.id, { limit: 200 });

    const compactionResult = compactor.compact({
      checkpoints: allCheckpoints,
      decisions: [adr1, adr2],
      tasks: [task1, task2]
    });

    // Verify token reduction >= 60%
    assert(
      compactionResult.tokenReductionPercent >= 60,
      `Expected >=60% token reduction on 100 checkpoints, got ${compactionResult.tokenReductionPercent}% (Raw: ${compactionResult.rawEstimatedTokens}, Compacted: ${compactionResult.compactedEstimatedTokens})`
    );

    // Verify indestructible permanence of ADRs
    assert.strictEqual(
      compactionResult.preservedDecisionsCount,
      2,
      'Expected 100% of ADR decisions to be preserved'
    );
    assert(
      compactionResult.markdownSummary.includes('ADR-001: Offline SQLite Storage') &&
        compactionResult.markdownSummary.includes('ADR-002: Stdio MCP Protocol Bridge'),
      'Compacted summary must contain both ADR titles'
    );

    // Verify active blockers permanence
    assert(
      compactionResult.activeBlockersCount >= 1,
      'Active blockers must be preserved without loss'
    );
    assert(
      compactionResult.markdownSummary.includes('Missing sandbox API secret keys'),
      'Summary must contain the active task blocker'
    );

    // Verify contradiction detection
    assert.strictEqual(compactionResult.disputedClaims.length, 1, 'Expected 1 disputed claim');
    assert.strictEqual(compactionResult.disputedClaims[0].entityOrKey, 'auth_service_port');
    assert(
      compactionResult.markdownSummary.includes('Disputed Fact: auth_service_port'),
      'Summary must format disputed claims into warning'
    );

    console.log(
      `  ✓ Layer A Deterministic Compaction: ${compactionResult.tokenReductionPercent}% token reduction (${compactionResult.rawEstimatedTokens} -> ${compactionResult.compactedEstimatedTokens} tokens)`
    );
    console.log('  ✓ 100% Decisions (2/2) and Active Blockers preserved without loss');
    console.log('  ✓ Disputed claims detected and surfaced as explicit warning');

    // ========================================================================
    // 4. Stale File Reference Detection & Tagging Test
    // ========================================================================
    const packGenerator = new ContextPackGenerator(memoryRepo, projectRepo);

    // Record a handoff with 1 valid file and 1 missing file
    memoryRepo.saveHandoff({
      projectId: project.id,
      sessionId: 'session_handoff_1',
      authorClient: 'claude-code',
      objective: 'Finish webhook integration and Redis caching',
      completedSummary: 'Validated HMAC signature calculation and unit tests.',
      remainingSummary: 'Connect Redis cluster and add retry exponential backoff.',
      blockersSummary: 'Missing partner secrets',
      relevantFiles: ['src_index.ts', 'src/missing_ghost_file.ts']
    });

    const taskPackRes = await packGenerator.generatePack({
      projectId: project.id,
      mode: 'task',
      skipCache: true
    });

    assert(
      taskPackRes.content.includes('src_index.ts'),
      'Valid file reference should be preserved'
    );
    assert(
      taskPackRes.content.includes('src/missing_ghost_file.ts (stale reference)'),
      'Missing file must be tagged with (stale reference)'
    );
    console.log('  ✓ Stale file reference detection accurately tagged missing file');

    // ========================================================================
    // 5. Context Pack Budgets: Quick Pack (<550) & Task Pack (<1600)
    // ========================================================================
    // Quick Pack Generation
    const quickPack = await packGenerator.generatePack({
      projectId: project.id,
      mode: 'quick',
      skipCache: true
    });

    assert(
      quickPack.estimatedTokens <= 550,
      `Quick pack exceeded ceiling of 550 tokens! Got ${quickPack.estimatedTokens}`
    );
    assert(quickPack.content.includes('mode="quick"'), 'Quick pack XML tag mismatch');
    assert(quickPack.content.includes('Kuber Payments Engine'), 'Quick pack missing project name');
    console.log(`  ✓ Quick Pack verified within budget: ${quickPack.estimatedTokens} tokens (limit: 550)`);

    // Task Pack Generation
    const taskPack = await packGenerator.generatePack({
      projectId: project.id,
      mode: 'task',
      skipCache: true
    });

    assert(
      taskPack.estimatedTokens <= 1600,
      `Task pack exceeded ceiling of 1600 tokens! Got ${taskPack.estimatedTokens}`
    );
    assert(taskPack.content.includes('mode="task"'), 'Task pack XML tag mismatch');
    assert(
      taskPack.content.includes('ADR-001') && taskPack.content.includes('ADR-002'),
      'Task pack missing ADRs'
    );
    console.log(`  ✓ Task Pack verified within budget: ${taskPack.estimatedTokens} tokens (limit: 1600)`);

    // ========================================================================
    // 6. Context Cache Hit & Automatic Write Invalidation
    // ========================================================================
    // First retrieval caches the pack
    const cachedFirst = await packGenerator.generatePack({
      projectId: project.id,
      mode: 'quick',
      skipCache: false
    });
    assert.strictEqual(cachedFirst.cached, true, 'Subsequent retrieval should be served from cache');

    // Write a new checkpoint -> must invalidate context cache
    memoryRepo.recordCheckpoint({
      projectId: project.id,
      sessionId: 'session_new',
      clientName: 'claude-code',
      checkpointType: 'task.progress',
      summary: 'New progress triggering cache invalidation',
      idempotencyKey: 'chk_inval_1'
    });

    const cacheAfterWrite = memoryRepo.getCache(project.id, 'quick');
    assert.strictEqual(cacheAfterWrite, null, 'Cache must be invalidated upon writing a new checkpoint');

    // New generation should regenerate cache
    const regenerated = await packGenerator.generatePack({
      projectId: project.id,
      mode: 'quick',
      skipCache: false
    });
    assert.strictEqual(regenerated.cached, false, 'Regenerated pack should not be from cache');
    console.log('  ✓ Context cache hit and instant write invalidation verified');

    // ========================================================================
    // 7. Layer B Fallback Gracefulness Test
    // ========================================================================
    const offlineLocalModelAdapter = new LocalModelAdapter({
      enabled: true,
      endpointUrl: 'http://127.0.0.1:54321', // Non-existent offline port
      timeoutMs: 500
    });

    const fallbackRes = await offlineLocalModelAdapter.compact({
      checkpoints: allCheckpoints.slice(0, 10),
      decisions: [adr1],
      tasks: [task1]
    });

    assert.strictEqual(
      fallbackRes.usedLayer,
      'layer_a_deterministic',
      'Should fall back cleanly to Layer A deterministic compactor when Ollama is offline'
    );
    assert(fallbackRes.markdownSummary.length > 0, 'Fallback summary must be populated');
    console.log('  ✓ Layer B fallback to Layer A verified with offline endpoint (0 errors)');

    console.log('[PASS] All P4.3 Context Compaction & Context Pack Tests Passed Successfully.\n');
  } finally {
    connection.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runP4CompactionAndPacksTests().catch((err) => {
    console.error('[FATAL] P4.3 Test Suite Failure:', err);
    process.exit(1);
  });
}

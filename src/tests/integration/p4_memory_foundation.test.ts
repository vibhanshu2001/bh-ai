/**
 * Bhai Phase P4 — Memory Foundation Integration Tests (P4.1)
 * Validates Migrations 004 & 005, MemoryRepository CRUD, checkpoint deduplication,
 * session quota enforcement, handoff retention, FTS5 BM25 search, foreign key cascades,
 * 1,000-record benchmark (<10 ms), and cold restart recovery.
 */

import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ProjectRepository } from '../../utility/storage/project_repository';
import { MemoryRepository } from '../../utility/storage/memory_repository';
import { applyMigrations, P1_MIGRATIONS } from '../../utility/storage/migrations';
import { MEMORY_BOUNDS } from '../../shared/contracts/memory_dto';

export async function runP4MemoryFoundationIntegrationTests() {
  console.log('--- [INTEGRATION] P4.1 Memory Foundation & Storage Tests ---');
  const tempDbDir = path.join(os.tmpdir(), `bhai_test_p4_memory_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  const dbPath = path.join(tempDbDir, 'test_p4_bhai.sqlite');

  const conn = new DatabaseConnection(dbPath);
  const db = conn.open();
  const projectRepo = new ProjectRepository(db);
  const memoryRepo = new MemoryRepository(db);

  try {
    // ------------------------------------------------------------------------
    // 1. Migration Verification
    // ------------------------------------------------------------------------
    const migrations = db.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC').all() as Array<{
      version: number;
      name: string;
      checksum: string;
    }>;

    assert.strictEqual(migrations.length, 6, 'Must have exactly 6 migrations applied (001-006)');
    assert.strictEqual(migrations[3].name, '004_p4_memory_foundation');
    assert.strictEqual(migrations[4].name, '005_p4_fts5_indexing');
    assert.strictEqual(migrations[5].name, '006_p4_project_memory_lifecycle');

    // Verify migration checksum calculation integrity
    for (const mig of migrations) {
      const def = P1_MIGRATIONS.find((m) => m.version === mig.version);
      assert.ok(def, `Migration definition must exist for version ${mig.version}`);
      const expectedChecksum = crypto.createHash('sha256').update(def.sql.trim()).digest('hex');
      assert.strictEqual(mig.checksum, expectedChecksum, `Checksum for migration ${mig.version} must match`);
    }

    // Verify rollback on checksum mismatch
    assert.throws(
      () => {
        const fakeDb = new Database(':memory:');
        fakeDb.exec(`
          CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at INTEGER);
          INSERT INTO schema_migrations VALUES (1, '001', 'bad_corrupt_checksum', 123);
        `);
        applyMigrations(fakeDb);
      },
      /Migration checksum mismatch/,
      'Migration must reject startup if checksum does not match'
    );
    console.log('  ✓ Migrations 004 & 005 applied cleanly and verified with SHA-256 checksums');

    // ------------------------------------------------------------------------
    // 2. Project Provisioning
    // ------------------------------------------------------------------------
    const projectRoot = path.join(tempDbDir, 'mock_repo');
    fs.mkdirSync(projectRoot, { recursive: true });
    const project = projectRepo.createProject({
      displayName: 'Aawas Core',
      canonicalRoot: projectRoot,
      detectedMetadata: { framework: 'nextjs' }
    });
    const projectId = project.id;
    assert.ok(projectId.startsWith('proj_'));
    console.log('  ✓ Test project created with isolated root');

    // ------------------------------------------------------------------------
    // 3. Memory Records Lifecycle & Bounds Enforcement
    // ------------------------------------------------------------------------
    const rec1 = memoryRepo.createRecord({
      projectId,
      category: 'architecture',
      title: 'Authentication Strategy',
      content: 'We use stateless JWT with RS256 asymmetric signing.',
      authorType: 'user',
      authorId: 'usr_admin',
      tier: 'user_approved',
      confidence: 'approved'
    });
    assert.ok(rec1.id.startsWith('mem_rec_'));
    assert.strictEqual(rec1.revision, 1);
    assert.strictEqual(rec1.isActive, true);

    const rec2 = memoryRepo.createRecord({
      projectId,
      category: 'convention',
      title: 'Directory Structure',
      content: 'Services belong under src/services and share contracts.',
      authorType: 'agent',
      authorId: 'claude-code'
    });
    assert.ok(rec2.id.startsWith('mem_rec_'));

    // Verify bounds: title > 128 chars rejected
    assert.throws(
      () => {
        memoryRepo.createRecord({
          projectId,
          category: 'overview',
          title: 'A'.repeat(129),
          content: 'test',
          authorType: 'user',
          authorId: 'usr_admin'
        });
      },
      /Too big/,
      'Record title > 128 chars must be rejected'
    );

    // Verify listing and active counting
    const activeRecords = memoryRepo.listRecords(projectId, { isActive: true });
    assert.strictEqual(activeRecords.length, 2);
    assert.strictEqual(memoryRepo.countRecords(projectId, true), 2);

    // Update record and check monotonic revision increment
    const updatedRec1 = memoryRepo.updateRecord(rec1.id, {
      content: 'We use stateless JWT with RS256 asymmetric signing and Redis revocation check.'
    });
    assert.strictEqual(updatedRec1.revision, 2);
    assert.strictEqual(updatedRec1.content.includes('Redis'), true);

    // Soft delete
    memoryRepo.deleteRecord(rec2.id, false);
    const activeAfterDelete = memoryRepo.listRecords(projectId, { isActive: true });
    assert.strictEqual(activeAfterDelete.length, 1);
    const allRecords = memoryRepo.listRecords(projectId);
    assert.strictEqual(allRecords.length, 2);
    console.log('  ✓ Memory records CRUD, monotonic revisions, and bounds validation verified');

    // ------------------------------------------------------------------------
    // 4. Memory Tasks Lifecycle
    // ------------------------------------------------------------------------
    const task1 = memoryRepo.createTask({
      projectId,
      title: 'Implement Refresh Token Endpoint',
      description: 'Support /api/auth/refresh with rotation protection.',
      status: 'in_progress',
      assignedAgent: 'claude-code:session_1',
      priority: 1
    });
    assert.ok(task1.id.startsWith('mem_tsk_'));
    assert.strictEqual(task1.status, 'in_progress');

    // Update task status and add blockers
    const updatedTask1 = memoryRepo.updateTask(task1.id, {
      status: 'blocked',
      blockersSummary: 'Waiting for Redis staging port credentials'
    });
    assert.strictEqual(updatedTask1.status, 'blocked');
    assert.strictEqual(updatedTask1.blockersSummary, 'Waiting for Redis staging port credentials');

    const blockedTasks = memoryRepo.listTasks(projectId, { status: 'blocked' });
    assert.strictEqual(blockedTasks.length, 1);
    assert.strictEqual(blockedTasks[0].id, task1.id);
    console.log('  ✓ Memory tasks lifecycle and blocker tracking verified');

    // ------------------------------------------------------------------------
    // 5. Memory Decisions (ADRs) Lifecycle
    // ------------------------------------------------------------------------
    const decision1 = memoryRepo.createDecision({
      projectId,
      title: 'ADR-001: SQLite WAL Single Writer Architecture',
      status: 'accepted',
      context: 'Multiple processes accessing SQLite in WAL mode concurrently can encounter busy locks.',
      decision: 'Elect utility process as the single authoritative database writer.',
      consequences: 'Simplifies transactions and eliminates concurrency race conditions.',
      authorType: 'user',
      authorId: 'usr_architect',
      userApprovalStatus: 'approved'
    });
    assert.ok(decision1.id.startsWith('mem_dec_'));
    assert.strictEqual(decision1.status, 'accepted');

    const decisions = memoryRepo.listDecisions(projectId);
    assert.strictEqual(decisions.length, 1);
    console.log('  ✓ Memory decisions (ADRs) persistence verified');

    // ------------------------------------------------------------------------
    // 6. Checkpoints Ingestion, Idempotency Deduplication & Session Quota
    // ------------------------------------------------------------------------
    const checkpointInput = {
      projectId,
      taskId: task1.id,
      sessionId: 'sess_claude_101',
      clientName: 'claude-code',
      checkpointType: 'task.progress' as const,
      summary: 'Configured RS256 token verification middleware',
      payloadJson: JSON.stringify({ files: ['src/auth/jwt.ts'], testsPassed: 4 }),
      idempotencyKey: 'auth-jwt-step-1',
      clientSequence: 1
    };

    // 1st call -> inserted
    const res1 = memoryRepo.recordCheckpoint(checkpointInput);
    assert.strictEqual(res1.isDuplicate, false);
    assert.ok(res1.checkpoint.id.startsWith('mem_chk_'));

    // 2nd call with identical idempotencyKey -> returns existing row without inserting duplicate
    const res2 = memoryRepo.recordCheckpoint(checkpointInput);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(res2.checkpoint.id, res1.checkpoint.id);

    const checkpointList = memoryRepo.listCheckpoints(projectId);
    assert.strictEqual(checkpointList.length, 1, 'Idempotency must prevent duplicate rows in DB');

    // Verify 2 KiB payload cap
    assert.throws(
      () => {
        memoryRepo.recordCheckpoint({
          ...checkpointInput,
          idempotencyKey: 'auth-oversized-1',
          payloadJson: 'X'.repeat(2049) // > 2048 bytes
        });
      },
      /Too big/,
      'Checkpoint payload > 2 KiB must be rejected'
    );

    // Verify Session Quota Limit (max 200 per session)
    // Add 199 more checkpoints to hit the 200 quota
    for (let i = 2; i <= 200; i++) {
      memoryRepo.recordCheckpoint({
        projectId,
        sessionId: 'sess_claude_101',
        clientName: 'claude-code',
        checkpointType: 'task.progress',
        summary: `Progress step ${i}`,
        payloadJson: '{}',
        idempotencyKey: `auth-step-${i}`,
        clientSequence: i
      });
    }

    assert.strictEqual(memoryRepo.countSessionCheckpoints('sess_claude_101'), 200);

    // 201st checkpoint must throw SESSION_CHECKPOINT_QUOTA_EXCEEDED
    assert.throws(
      () => {
        memoryRepo.recordCheckpoint({
          projectId,
          sessionId: 'sess_claude_101',
          clientName: 'claude-code',
          checkpointType: 'task.progress',
          summary: 'Step 201',
          payloadJson: '{}',
          idempotencyKey: 'auth-step-201',
          clientSequence: 201
        });
      },
      /SESSION_CHECKPOINT_QUOTA_EXCEEDED/,
      'Checkpoint 201+ must be rejected with SESSION_CHECKPOINT_QUOTA_EXCEEDED'
    );
    console.log('  ✓ Checkpoint idempotency deduplication (0 duplicate rows) & 200/session quota verified');

    // ------------------------------------------------------------------------
    // 7. Memory Handoffs & Quota Pruning
    // ------------------------------------------------------------------------
    const handoff1 = memoryRepo.saveHandoff({
      projectId,
      taskId: task1.id,
      sessionId: 'sess_claude_101',
      authorClient: 'claude-code',
      objective: 'Implement JWT authentication and RBAC',
      completedSummary: '• RS256 token verification\n• JWT middleware unit tests',
      remainingSummary: '• Refresh token endpoint\n• Redis token blacklist',
      blockersSummary: 'Need staging Redis URL',
      relevantFiles: ['src/auth/jwt.ts', 'src/tests/auth.test.ts']
    });
    assert.ok(handoff1.id.startsWith('mem_hnd_'));

    const latestHandoff = memoryRepo.getLatestHandoff(projectId);
    assert.ok(latestHandoff);
    assert.strictEqual(latestHandoff?.id, handoff1.id);
    assert.strictEqual(latestHandoff?.objective, 'Implement JWT authentication and RBAC');

    // Add 14 more handoffs (total 15) to verify durable handoff history is preserved without pruning
    for (let i = 2; i <= 15; i++) {
      memoryRepo.saveHandoff({
        projectId,
        sessionId: `sess_${i}`,
        authorClient: 'codex',
        objective: `Handoff iteration ${i}`,
        completedSummary: `Completed step ${i}`,
        remainingSummary: `Next step ${i}`,
        relevantFiles: ['src/index.ts']
      });
    }

    // Verify all 15 handoffs are durably retained in SQLite
    const totalHandoffs = memoryRepo.countHandoffs(projectId);
    assert.strictEqual(totalHandoffs, 15, 'All 15 handoffs must be durably retained in SQLite without automatic pruning');

    // Verify retrieval output limits and pagination work separately from retention
    const defaultPage = memoryRepo.listHandoffs(projectId);
    assert.strictEqual(defaultPage.length, 10, 'Default retrieval limit must be 10');
    assert.strictEqual(defaultPage[0].sessionId, 'sess_15', 'Newest handoff must be returned first');

    const offsetPage = memoryRepo.listHandoffs(projectId, 10, 10);
    assert.strictEqual(offsetPage.length, 5, 'Offset pagination must return remaining 5 handoffs');

    const allHandoffs = memoryRepo.listHandoffs(projectId, 50);
    assert.strictEqual(allHandoffs.length, 15, 'Explicit limit 50 must retrieve all 15 handoffs');
    console.log('  ✓ Durable handoff history preserved (15 handoffs) and paginated retrieval verified');

    // ------------------------------------------------------------------------
    // 8. MCP Client Authorizations
    // ------------------------------------------------------------------------
    const tokenHash = crypto.createHash('sha256').update('bhai_sec_test_secret').digest('hex');
    const auth = memoryRepo.createAuthorization({
      clientName: 'claude-code',
      projectId,
      tokenHash,
      scopes: ['read_memory', 'write_checkpoints', 'propose_decisions']
    });
    assert.ok(auth.id.startsWith('mcp_auth_'));
    assert.strictEqual(auth.isRevoked, false);

    // Verify retrieval
    const retrievedAuth = memoryRepo.getAuthorization('claude-code', projectId);
    assert.ok(retrievedAuth);
    assert.strictEqual(retrievedAuth?.tokenHash, tokenHash);

    // Revocation
    const revoked = memoryRepo.revokeAuthorization('claude-code', projectId);
    assert.strictEqual(revoked, true);
    const afterRevoke = memoryRepo.getAuthorization('claude-code', projectId);
    assert.strictEqual(afterRevoke?.isRevoked, true);
    console.log('  ✓ MCP client authorizations and revocation verified');

    // ------------------------------------------------------------------------
    // 9. Context Cache & Automatic Invalidation
    // ------------------------------------------------------------------------
    memoryRepo.setCache({
      projectId,
      packMode: 'task',
      contentHash: 'hash_abc123',
      contextText: '# Project Aawas Context\n...',
      estimatedTokens: 1200,
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });

    const cached = memoryRepo.getCache(projectId, 'task');
    assert.ok(cached);
    assert.strictEqual(cached?.estimatedTokens, 1200);

    // Updating a record should invalidate the cache
    memoryRepo.createRecord({
      projectId,
      category: 'convention',
      title: 'Coding Standards',
      content: 'All API routes must use Zod validation schemas.',
      authorType: 'user',
      authorId: 'usr_admin'
    });

    const cacheAfterInvalidate = memoryRepo.getCache(projectId, 'task');
    assert.strictEqual(cacheAfterInvalidate, null, 'Cache must be invalidated upon new record creation');
    console.log('  ✓ Context cache storage and automatic write invalidation verified');

    // ------------------------------------------------------------------------
    // 10. FTS5 Full-Text Search with BM25 Ranking
    // ------------------------------------------------------------------------
    // Query for 'RS256'
    const ftsResults = memoryRepo.searchMemory({
      projectId,
      query: 'RS256',
      category: 'all'
    });
    assert.ok(ftsResults.length >= 1, 'FTS5 must find RS256 record');
    assert.strictEqual(ftsResults[0].title, 'Authentication Strategy');
    assert.ok(ftsResults[0].snippet.includes('<mark>RS256</mark>'));

    // Query for 'SQLite WAL'
    const decisionFts = memoryRepo.searchMemory({
      projectId,
      query: 'SQLite WAL',
      category: 'decisions'
    });
    assert.ok(decisionFts.length >= 1);
    assert.strictEqual(decisionFts[0].entityType, 'decision');
    assert.ok(decisionFts[0].title.includes('SQLite WAL'));

    // Query for 'Refresh Token'
    const taskFts = memoryRepo.searchMemory({
      projectId,
      query: 'Refresh Token',
      category: 'tasks'
    });
    assert.ok(taskFts.length >= 1);
    assert.strictEqual(taskFts[0].entityType, 'task');

    // Verify FTS update trigger
    const recordToUpdate = memoryRepo.createRecord({
      projectId,
      category: 'convention',
      title: 'Temporary Search Token',
      content: 'FindableTermAlphaBetaGamma',
      authorType: 'user',
      authorId: 'usr_admin'
    });
    let searchAlpha = memoryRepo.searchMemory({ projectId, query: 'FindableTermAlphaBetaGamma' });
    assert.strictEqual(searchAlpha.length, 1);

    memoryRepo.updateRecord(recordToUpdate.id, {
      content: 'UpdatedToTermDeltaEpsilonZeta'
    });
    searchAlpha = memoryRepo.searchMemory({ projectId, query: 'FindableTermAlphaBetaGamma' });
    assert.strictEqual(searchAlpha.length, 0, 'Old term must no longer match after update');

    const searchDelta = memoryRepo.searchMemory({ projectId, query: 'UpdatedToTermDeltaEpsilonZeta' });
    assert.strictEqual(searchDelta.length, 1, 'New term must match in FTS5');

    // Verify FTS delete trigger
    memoryRepo.deleteRecord(recordToUpdate.id, true);
    const searchAfterDelete = memoryRepo.searchMemory({ projectId, query: 'UpdatedToTermDeltaEpsilonZeta' });
    assert.strictEqual(searchAfterDelete.length, 0, 'Deleted record must be removed from FTS5');

    // Verify query sanitizer robustness with edge-case characters
    const safeResults = memoryRepo.searchMemory({
      projectId,
      query: '*** ::: (AND) OR NOT "broken??//'
    });
    assert.ok(Array.isArray(safeResults));
    console.log('  ✓ FTS5 BM25 search, category filtering, trigger sync, and query sanitization verified');

    // ------------------------------------------------------------------------
    // 11. Project Lifecycle: Safe Archival, Re-registration, RESTRICT, and Permanent Purge
    // ------------------------------------------------------------------------
    // Create a second project to test multi-project isolation
    const projectRoot2 = path.join(tempDbDir, 'mock_repo_2');
    fs.mkdirSync(projectRoot2, { recursive: true });
    const project2 = projectRepo.createProject({
      displayName: 'Beta App',
      canonicalRoot: projectRoot2
    });
    memoryRepo.createRecord({
      projectId: project2.id,
      category: 'overview',
      title: 'Beta App Overview',
      content: 'Beta app description',
      authorType: 'user',
      authorId: 'usr_admin'
    });

    // 11a. Safe Unregistration (Default Archival):
    // Calling projectRepo.deleteProject(projectId) must unregister/archive the project
    // but MUST NOT delete any accumulated memory records, ADRs, tasks, checkpoints, or handoffs!
    const unregResult = projectRepo.deleteProject(projectId);
    assert.strictEqual(unregResult.deleted, true);

    // Project should be omitted from active listProjects()
    const activeProjects = projectRepo.listProjects();
    assert.strictEqual(activeProjects.some((p) => p.id === projectId), false, 'Archived project must not be in active list');
    assert.strictEqual(projectRepo.getProject(projectId), null, 'getProject without includeArchived must return null');

    // But when requested with includeArchived=true, project exists and shows 'unregistered'
    const archivedProject = projectRepo.getProject(projectId, true);
    assert.ok(archivedProject);
    assert.strictEqual(archivedProject?.availability, 'unregistered');
    assert.ok(archivedProject?.archivedAt);

    // Memory rows MUST remain 100% intact during unregistration!
    assert.ok(memoryRepo.countRecords(projectId, false) > 0, 'Memory records must survive project unregistration');
    assert.ok(memoryRepo.listTasks(projectId).length > 0, 'Tasks must survive project unregistration');
    assert.ok(memoryRepo.listDecisions(projectId).length > 0, 'Decisions must survive project unregistration');
    assert.ok(memoryRepo.listCheckpoints(projectId).length > 0, 'Checkpoints must survive project unregistration');
    assert.strictEqual(memoryRepo.countHandoffs(projectId), 15, 'All 15 handoffs must survive project unregistration');
    console.log('  ✓ Safe archival / unregistration: project excluded from active registry while all memory rows stay intact');

    // 11b. Safe Re-registration:
    // Re-registering the project at the same canonicalRoot reactivates the project
    // with the exact same ID, immediately re-linking all historical memory!
    const reactivated = projectRepo.createProject({
      displayName: 'Aawas Financial Reactivated',
      canonicalRoot: projectRoot
    });
    assert.strictEqual(reactivated.id, projectId, 'Re-registering must reactivate the same project ID');
    assert.strictEqual(reactivated.availability, 'available');
    assert.strictEqual(reactivated.archivedAt, undefined);
    assert.strictEqual(projectRepo.listProjects().some((p) => p.id === projectId), true, 'Reactivated project must be in active list');

    // Verify all existing memory remains accessible under reactivated project
    assert.ok(memoryRepo.countRecords(projectId, false) > 0);
    assert.strictEqual(memoryRepo.countHandoffs(projectId), 15);
    console.log('  ✓ Safe re-registration: existing project ID reactivated and all historical memory re-linked');

    // 11c. Referential Integrity (ON DELETE RESTRICT):
    // Verify that accidental raw SQL DELETE on projects table is BLOCKED by SQLite foreign key constraint
    let rawDeleteBlocked = false;
    try {
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    } catch (err: any) {
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        rawDeleteBlocked = true;
      }
    }
    assert.strictEqual(rawDeleteBlocked, true, 'Raw SQL DELETE on projects must fail with FOREIGN KEY constraint failed');
    console.log('  ✓ Foreign key constraint verified: raw DELETE blocked by ON DELETE RESTRICT');

    // 11d. Explicit Permanent Deletion:
    // Calling projectRepo.deleteProject(projectId, { permanent: true }) explicitly purges
    // all memory entities, services, grants, and the project row itself.
    const permResult = projectRepo.deleteProject(projectId, { permanent: true });
    assert.strictEqual(permResult.deleted, true);

    // Verify all memory records for Project 1 were permanently purged
    assert.strictEqual(memoryRepo.countRecords(projectId, false), 0);
    assert.strictEqual(memoryRepo.listTasks(projectId).length, 0);
    assert.strictEqual(memoryRepo.listDecisions(projectId).length, 0);
    assert.strictEqual(memoryRepo.listCheckpoints(projectId).length, 0);
    assert.strictEqual(memoryRepo.listHandoffs(projectId).length, 0);
    assert.strictEqual(memoryRepo.listAuthorizations(projectId).length, 0);
    assert.strictEqual(memoryRepo.getCache(projectId, 'task'), null);
    assert.strictEqual(projectRepo.getProject(projectId, true), null, 'Project row must be completely removed');

    // Verify Project 2 data remained 100% intact
    assert.strictEqual(memoryRepo.countRecords(project2.id, true), 1);
    console.log('  ✓ Explicit permanent deletion: memory purged and multi-project isolation preserved');

    // ------------------------------------------------------------------------
    // 12. FTS5 1,000-Record Performance Benchmark (<10 ms Target)
    // ------------------------------------------------------------------------
    console.log('  ... Ingesting 1,000 synthetic records for FTS5 performance benchmark');
    const benchProjectId = project2.id;
    const vocab = ['Authentication', 'Database', 'Microservice', 'Caching', 'Kubernetes', 'Telemetry', 'GraphQL', 'Encryption', 'Pipeline', 'Compiler'];

    const insertTx = db.transaction(() => {
      for (let i = 1; i <= 1000; i++) {
        const v1 = vocab[i % vocab.length];
        const v2 = vocab[(i * 3) % vocab.length];
        const v3 = vocab[(i * 7) % vocab.length];
        db.prepare(`
          INSERT INTO memory_records (
            id, project_id, category, title, content, tier, confidence,
            author_type, author_id, revision, is_active, created_at, updated_at
          ) VALUES (?, ?, 'convention', ?, ?, 'observed_fact', 'verified', 'bhai_inspector', 'rule_engine', 1, 1, ?, ?)
        `).run(
          `bench_rec_${i}`,
          benchProjectId,
          `Record ${i}: ${v1} and ${v2} Architecture`,
          `This architectural convention details ${v1} subsystem integration with ${v2} and ${v3} protocols for enterprise resilience.`,
          Date.now(),
          Date.now()
        );
      }
    });
    insertTx();

    // Measure FTS5 search performance over 20 runs
    const latencies: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = process.hrtime.bigint();
      const results = memoryRepo.searchMemory({
        projectId: benchProjectId,
        query: 'Kubernetes Microservice',
        limit: 10
      });
      const end = process.hrtime.bigint();
      assert.ok(results.length > 0);
      latencies.push(Number(end - start) / 1_000_000); // ms
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    console.log(`  ✓ FTS5 1,000-record query performance: p50 = ${p50.toFixed(3)} ms, p95 = ${p95.toFixed(3)} ms (<10 ms target met)`);
    assert.ok(p95 < 10.0, `FTS5 query p95 must be < 10.0 ms (got ${p95.toFixed(3)} ms)`);

    // ------------------------------------------------------------------------
    // 13. Cold Restart Persistence Check
    // ------------------------------------------------------------------------
    conn.close();

    const connRestart = new DatabaseConnection(dbPath);
    const dbRestart = connRestart.open();
    const memoryRepoRestart = new MemoryRepository(dbRestart);

    // Verify integrity PRAGMA
    const integrity = connRestart.checkIntegrity();
    assert.strictEqual(integrity, 'ok', 'Database integrity check must return "ok"');

    // Verify benchmark records and FTS5 search work identically after restart
    const countAfterRestart = memoryRepoRestart.countRecords(benchProjectId, true);
    assert.strictEqual(countAfterRestart, 1001); // 1 initial + 1000 bench

    const ftsAfterRestart = memoryRepoRestart.searchMemory({
      projectId: benchProjectId,
      query: 'Kubernetes Microservice',
      limit: 5
    });
    assert.strictEqual(ftsAfterRestart.length, 5);
    connRestart.close();
    console.log('  ✓ Cold restart verification: database integrity="ok", 100% memory records and FTS5 indices intact');

    console.log('\n[PASS] All P4.1 Memory Foundation Integration Tests Completed Successfully.\n');
  } finally {
    conn.close();
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on temp dir
    }
  }
}

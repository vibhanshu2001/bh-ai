/**
 * Bhai Phase P4 — Project Memory Repository
 * Transactional CRUD operations, revision tracking, project isolation,
 * checkpoint idempotency deduplication, handoff persistence, and FTS5 BM25 search.
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import {
  MemoryRecord,
  MemoryTask,
  MemoryDecision,
  MemoryCheckpoint,
  MemoryHandoff,
  McpAuthorization,
  ContextCache,
  MemorySearchResult,
  CreateRecordInput,
  CreateRecordInputSchema,
  UpdateRecordInput,
  UpdateRecordInputSchema,
  CreateTaskInput,
  CreateTaskInputSchema,
  UpdateTaskInput,
  UpdateTaskInputSchema,
  CreateDecisionInput,
  CreateDecisionInputSchema,
  UpdateDecisionInput,
  UpdateDecisionInputSchema,
  RecordCheckpointInput,
  RecordCheckpointInputSchema,
  SaveHandoffInput,
  SaveHandoffInputSchema,
  SearchMemoryInput,
  SearchMemoryInputSchema,
  ContextPackMode,
  MemoryRecordCategory,
  TaskStatus,
  DecisionStatus,
  MEMORY_BOUNDS
} from '../../shared/contracts/memory_dto';

export class MemoryRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ==========================================================================
  // 1. Memory Records (Architectural Facts & Conventions)
  // ==========================================================================

  public createRecord(input: CreateRecordInput): MemoryRecord {
    const validated = CreateRecordInputSchema.parse(input);
    const id = `mem_rec_${crypto.randomUUID()}`;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO memory_records (
        id, project_id, category, title, content, tier, confidence,
        author_type, author_id, revision, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      stmt.run(
        id,
        validated.projectId,
        validated.category,
        validated.title.trim(),
        validated.content,
        validated.tier,
        validated.confidence,
        validated.authorType,
        validated.authorId,
        now,
        now
      );
      this.invalidateCache(validated.projectId);
    });

    tx();
    const record = this.getRecord(id);
    if (!record) throw new Error(`Failed to retrieve newly created record ${id}`);
    return record;
  }

  public getRecord(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT * FROM memory_records WHERE id = ?').get(id);
    return row ? this.mapRecordRow(row) : null;
  }

  public listRecords(
    projectId: string,
    filter?: { category?: MemoryRecordCategory; isActive?: boolean }
  ): MemoryRecord[] {
    let sql = 'SELECT * FROM memory_records WHERE project_id = ?';
    const params: any[] = [projectId];

    if (filter?.isActive !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filter.isActive ? 1 : 0);
    }

    if (filter?.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }

    sql += ' ORDER BY created_at ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.mapRecordRow(r));
  }

  public updateRecord(id: string, input: UpdateRecordInput): MemoryRecord {
    const validated = UpdateRecordInputSchema.parse(input);
    const existing = this.getRecord(id);
    if (!existing) throw new Error(`Memory record not found: ${id}`);

    const now = Date.now();
    const newTitle = validated.title !== undefined ? validated.title.trim() : existing.title;
    const newContent = validated.content !== undefined ? validated.content : existing.content;
    const newTier = validated.tier !== undefined ? validated.tier : existing.tier;
    const newConfidence = validated.confidence !== undefined ? validated.confidence : existing.confidence;
    const newIsActive = validated.isActive !== undefined ? (validated.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
    const nextRevision = existing.revision + 1;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE memory_records
        SET title = ?, content = ?, tier = ?, confidence = ?, is_active = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(newTitle, newContent, newTier, newConfidence, newIsActive, nextRevision, now, id);

      this.invalidateCache(existing.projectId);
    });

    tx();
    const updated = this.getRecord(id);
    if (!updated) throw new Error(`Failed to retrieve updated record ${id}`);
    return updated;
  }

  public deleteRecord(id: string, hard = false): boolean {
    const existing = this.getRecord(id);
    if (!existing) return false;

    const tx = this.db.transaction(() => {
      if (hard) {
        this.db.prepare('DELETE FROM memory_records WHERE id = ?').run(id);
      } else {
        this.db.prepare(`
          UPDATE memory_records
          SET is_active = 0, revision = revision + 1, updated_at = ?
          WHERE id = ?
        `).run(Date.now(), id);
      }
      this.invalidateCache(existing.projectId);
    });

    tx();
    return true;
  }

  public countRecords(projectId: string, activeOnly = true): number {
    let sql = 'SELECT COUNT(*) as count FROM memory_records WHERE project_id = ?';
    const params: any[] = [projectId];
    if (activeOnly) {
      sql += ' AND is_active = 1';
    }
    const res = this.db.prepare(sql).get(...params) as { count: number };
    return res.count;
  }

  // ==========================================================================
  // 2. Memory Tasks (Cross-Agent Work Units)
  // ==========================================================================

  public createTask(input: CreateTaskInput): MemoryTask {
    const validated = CreateTaskInputSchema.parse(input);
    const id = `mem_tsk_${crypto.randomUUID()}`;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memory_tasks (
          id, project_id, title, description, status, assigned_agent,
          priority, blockers_summary, completion_evidence, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        validated.projectId,
        validated.title.trim(),
        validated.description,
        validated.status,
        validated.assignedAgent || null,
        validated.priority,
        validated.blockersSummary || null,
        validated.completionEvidence || null,
        now,
        now
      );
      this.invalidateCache(validated.projectId);
    });

    tx();
    const task = this.getTask(id);
    if (!task) throw new Error(`Failed to retrieve newly created task ${id}`);
    return task;
  }

  public getTask(id: string): MemoryTask | null {
    const row = this.db.prepare('SELECT * FROM memory_tasks WHERE id = ?').get(id);
    return row ? this.mapTaskRow(row) : null;
  }

  public listTasks(projectId: string, filter?: { status?: TaskStatus }): MemoryTask[] {
    let sql = 'SELECT * FROM memory_tasks WHERE project_id = ?';
    const params: any[] = [projectId];

    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY priority ASC, updated_at DESC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.mapTaskRow(r));
  }

  public updateTask(id: string, input: UpdateTaskInput): MemoryTask {
    const validated = UpdateTaskInputSchema.parse(input);
    const existing = this.getTask(id);
    if (!existing) throw new Error(`Memory task not found: ${id}`);

    const now = Date.now();
    const newTitle = validated.title !== undefined ? validated.title.trim() : existing.title;
    const newDesc = validated.description !== undefined ? validated.description : existing.description;
    const newStatus = validated.status !== undefined ? validated.status : existing.status;
    const newAgent = validated.assignedAgent !== undefined ? validated.assignedAgent : existing.assignedAgent;
    const newPriority = validated.priority !== undefined ? validated.priority : existing.priority;
    const newBlockers = validated.blockersSummary !== undefined ? validated.blockersSummary : existing.blockersSummary;
    const newEvidence = validated.completionEvidence !== undefined ? validated.completionEvidence : existing.completionEvidence;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE memory_tasks
        SET title = ?, description = ?, status = ?, assigned_agent = ?,
            priority = ?, blockers_summary = ?, completion_evidence = ?, updated_at = ?
        WHERE id = ?
      `).run(
        newTitle,
        newDesc,
        newStatus,
        newAgent,
        newPriority,
        newBlockers,
        newEvidence,
        now,
        id
      );
      this.invalidateCache(existing.projectId);
    });

    tx();
    const updated = this.getTask(id);
    if (!updated) throw new Error(`Failed to retrieve updated task ${id}`);
    return updated;
  }

  public deleteTask(id: string): boolean {
    const existing = this.getTask(id);
    if (!existing) return false;

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_tasks WHERE id = ?').run(id);
      this.invalidateCache(existing.projectId);
    });

    tx();
    return true;
  }

  // ==========================================================================
  // 3. Memory Decisions (ADRs — Permanent Retention)
  // ==========================================================================

  public createDecision(input: CreateDecisionInput): MemoryDecision {
    const validated = CreateDecisionInputSchema.parse(input);
    const id = `mem_dec_${crypto.randomUUID()}`;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memory_decisions (
          id, project_id, title, status, context, decision, consequences,
          author_type, author_id, user_approval_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        validated.projectId,
        validated.title.trim(),
        validated.status,
        validated.context,
        validated.decision,
        validated.consequences,
        validated.authorType,
        validated.authorId,
        validated.userApprovalStatus,
        now,
        now
      );
      this.invalidateCache(validated.projectId);
    });

    tx();
    const dec = this.getDecision(id);
    if (!dec) throw new Error(`Failed to retrieve newly created decision ${id}`);
    return dec;
  }

  public getDecision(id: string): MemoryDecision | null {
    const row = this.db.prepare('SELECT * FROM memory_decisions WHERE id = ?').get(id);
    return row ? this.mapDecisionRow(row) : null;
  }

  public listDecisions(projectId: string, filter?: { status?: DecisionStatus }): MemoryDecision[] {
    let sql = 'SELECT * FROM memory_decisions WHERE project_id = ?';
    const params: any[] = [projectId];

    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }

    sql += ' ORDER BY created_at ASC';
    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.mapDecisionRow(r));
  }

  public updateDecision(id: string, input: UpdateDecisionInput): MemoryDecision {
    const validated = UpdateDecisionInputSchema.parse(input);
    const existing = this.getDecision(id);
    if (!existing) throw new Error(`Memory decision not found: ${id}`);

    const now = Date.now();
    const newTitle = validated.title !== undefined ? validated.title.trim() : existing.title;
    const newStatus = validated.status !== undefined ? validated.status : existing.status;
    const newContext = validated.context !== undefined ? validated.context : existing.context;
    const newDecision = validated.decision !== undefined ? validated.decision : existing.decision;
    const newConsequences = validated.consequences !== undefined ? validated.consequences : existing.consequences;
    const newApproval = validated.userApprovalStatus !== undefined ? validated.userApprovalStatus : existing.userApprovalStatus;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE memory_decisions
        SET title = ?, status = ?, context = ?, decision = ?, consequences = ?,
            user_approval_status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        newTitle,
        newStatus,
        newContext,
        newDecision,
        newConsequences,
        newApproval,
        now,
        id
      );
      this.invalidateCache(existing.projectId);
    });

    tx();
    const updated = this.getDecision(id);
    if (!updated) throw new Error(`Failed to retrieve updated decision ${id}`);
    return updated;
  }

  public deleteDecision(id: string): boolean {
    const existing = this.getDecision(id);
    if (!existing) return false;

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_decisions WHERE id = ?').run(id);
      this.invalidateCache(existing.projectId);
    });

    tx();
    return true;
  }

  // ==========================================================================
  // 4. Memory Checkpoints (Milestone Event Journal & Deduplication)
  // ==========================================================================

  public recordCheckpoint(
    input: RecordCheckpointInput
  ): { checkpoint: MemoryCheckpoint; isDuplicate: boolean } {
    const validated = RecordCheckpointInputSchema.parse(input);

    // 1. Idempotency Check: (projectId, clientName, sessionId, idempotencyKey)
    const existingRow = this.db.prepare(`
      SELECT * FROM memory_checkpoints
      WHERE project_id = ? AND client_name = ? AND session_id = ? AND idempotency_key = ?
    `).get(validated.projectId, validated.clientName, validated.sessionId, validated.idempotencyKey);

    if (existingRow) {
      return {
        checkpoint: this.mapCheckpointRow(existingRow),
        isDuplicate: true
      };
    }

    // 2. Session Quota Check (Max 200 per agent session)
    const countRes = this.db.prepare(`
      SELECT COUNT(*) as count FROM memory_checkpoints WHERE session_id = ?
    `).get(validated.sessionId) as { count: number };

    if (countRes.count >= MEMORY_BOUNDS.CHECKPOINT_MAX_SESSION_QUOTA) {
      throw new Error(
        `SESSION_CHECKPOINT_QUOTA_EXCEEDED: Session ${validated.sessionId} exceeded maximum quota of ${MEMORY_BOUNDS.CHECKPOINT_MAX_SESSION_QUOTA} checkpoints`
      );
    }

    const id = `mem_chk_${crypto.randomUUID()}`;
    const now = Date.now();
    const evidenceJson = validated.evidenceRefs ? JSON.stringify(validated.evidenceRefs) : null;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memory_checkpoints (
          id, project_id, task_id, session_id, client_name, checkpoint_type,
          summary, payload_json, idempotency_key, client_sequence, evidence_refs_json,
          tier, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        validated.projectId,
        validated.taskId || null,
        validated.sessionId,
        validated.clientName,
        validated.checkpointType,
        validated.summary.trim(),
        validated.payloadJson,
        validated.idempotencyKey,
        validated.clientSequence || null,
        evidenceJson,
        validated.tier,
        now
      );

      // Invalidate project context cache on new milestone
      this.invalidateCache(validated.projectId);
    });

    tx();
    const createdRow = this.db.prepare('SELECT * FROM memory_checkpoints WHERE id = ?').get(id);
    if (!createdRow) throw new Error(`Failed to retrieve newly created checkpoint ${id}`);

    return {
      checkpoint: this.mapCheckpointRow(createdRow),
      isDuplicate: false
    };
  }

  public listCheckpoints(
    projectId: string,
    filter?: { taskId?: string; limit?: number; sinceTimestamp?: number }
  ): MemoryCheckpoint[] {
    let sql = 'SELECT * FROM memory_checkpoints WHERE project_id = ?';
    const params: any[] = [projectId];

    if (filter?.taskId) {
      sql += ' AND task_id = ?';
      params.push(filter.taskId);
    }

    if (filter?.sinceTimestamp) {
      sql += ' AND created_at > ?';
      params.push(filter.sinceTimestamp);
    }

    sql += ' ORDER BY created_at DESC';

    if (filter?.limit && filter.limit > 0) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.mapCheckpointRow(r));
  }

  public countSessionCheckpoints(sessionId: string): number {
    const res = this.db.prepare(`
      SELECT COUNT(*) as count FROM memory_checkpoints WHERE session_id = ?
    `).get(sessionId) as { count: number };
    return res.count;
  }

  // ==========================================================================
  // 5. Memory Handoffs (Cross-Agent Continuation Documents)
  // ==========================================================================

  public saveHandoff(input: SaveHandoffInput): MemoryHandoff {
    const validated = SaveHandoffInputSchema.parse(input);
    const id = `mem_hnd_${crypto.randomUUID()}`;
    const now = Date.now();
    const filesJson = JSON.stringify(validated.relevantFiles || []);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO memory_handoffs (
          id, project_id, task_id, session_id, author_client, objective,
          completed_summary, remaining_summary, blockers_summary, decisions_summary,
          relevant_files_json, test_status_summary, known_uncertainties, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        validated.projectId,
        validated.taskId || null,
        validated.sessionId,
        validated.authorClient,
        validated.objective.trim(),
        validated.completedSummary.trim(),
        validated.remainingSummary.trim(),
        validated.blockersSummary || null,
        validated.decisionsSummary || null,
        filesJson,
        validated.testStatusSummary || null,
        validated.knownUncertainties || null,
        now
      );

      // Invalidate project context cache on new handoff
      this.invalidateCache(validated.projectId);
    });

    tx();
    const row = this.db.prepare('SELECT * FROM memory_handoffs WHERE id = ?').get(id);
    if (!row) throw new Error(`Failed to retrieve saved handoff ${id}`);
    return this.mapHandoffRow(row);
  }

  public getLatestHandoff(projectId: string, taskId?: string): MemoryHandoff | null {
    let sql = 'SELECT * FROM memory_handoffs WHERE project_id = ?';
    const params: any[] = [projectId];

    if (taskId) {
      sql += ' AND task_id = ?';
      params.push(taskId);
    }

    sql += ' ORDER BY created_at DESC, rowid DESC LIMIT 1';
    const row = this.db.prepare(sql).get(...params);
    return row ? this.mapHandoffRow(row) : null;
  }

  /**
   * Retrieves handoffs with separate pagination/retrieval limits.
   * All handoffs remain durably preserved in storage by default.
   */
  public listHandoffs(projectId: string, limit = 10, offset = 0): MemoryHandoff[] {
    const rows = this.db.prepare(`
      SELECT * FROM memory_handoffs
      WHERE project_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ? OFFSET ?
    `).all(projectId, limit, offset);
    return rows.map((r) => this.mapHandoffRow(r));
  }

  public countHandoffs(projectId: string): number {
    const res = this.db.prepare(`
      SELECT COUNT(*) as count FROM memory_handoffs WHERE project_id = ?
    `).get(projectId) as { count: number };
    return res.count;
  }

  /**
   * Explicitly purges all memory entities associated with a project.
   * Used strictly during explicit permanent project deletion.
   */
  public purgeProjectMemory(projectId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM context_cache WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM mcp_authorizations WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM memory_checkpoints WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM memory_handoffs WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM memory_tasks WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM memory_decisions WHERE project_id = ?').run(projectId);
      this.db.prepare('DELETE FROM memory_records WHERE project_id = ?').run(projectId);
    });
    tx();
  }

  // ==========================================================================
  // 6. MCP Authorizations (Project-Scoped Client Grants Storage)
  //
  // NOTE ON ARCHITECTURAL BOUNDARY (P4.1 vs P4.2):
  // The methods below implement AUTHORIZATION STORAGE in SQLite (persisting
  // provisioned client grants, token hashes, scopes, and revocation status).
  // Runtime request authorization (validating client handshake bearer tokens,
  // enforcing permission scopes per tool call, and checking capability broker
  // grants over Unix domain sockets) is implemented in Increment P4.2.
  // ==========================================================================

  public createAuthorization(params: {
    clientName: string;
    projectId: string;
    tokenHash: string;
    scopes: string[];
  }): McpAuthorization {
    const id = `mcp_auth_${crypto.randomUUID()}`;
    const now = Date.now();
    const scopesStr = params.scopes.join(',');

    this.db.prepare(`
      INSERT INTO mcp_authorizations (
        id, client_name, project_id, token_hash, scopes, is_revoked, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL)
      ON CONFLICT(client_name, project_id) DO UPDATE SET
        token_hash = excluded.token_hash,
        scopes = excluded.scopes,
        is_revoked = 0,
        created_at = excluded.created_at
    `).run(id, params.clientName, params.projectId, params.tokenHash, scopesStr, now);

    const row = this.db.prepare('SELECT * FROM mcp_authorizations WHERE client_name = ? AND project_id = ?').get(
      params.clientName,
      params.projectId
    );
    if (!row) throw new Error('Failed to create or retrieve authorization');
    return this.mapMcpAuthRow(row);
  }

  public getAuthorization(clientName: string, projectId: string): McpAuthorization | null {
    const row = this.db.prepare(`
      SELECT * FROM mcp_authorizations WHERE client_name = ? AND project_id = ?
    `).get(clientName, projectId);
    return row ? this.mapMcpAuthRow(row) : null;
  }

  public listAuthorizations(projectId: string): McpAuthorization[] {
    const rows = this.db.prepare(`
      SELECT * FROM mcp_authorizations WHERE project_id = ? ORDER BY created_at DESC
    `).all(projectId);
    return rows.map((r) => this.mapMcpAuthRow(r));
  }

  public revokeAuthorization(clientName: string, projectId: string): boolean {
    const res = this.db.prepare(`
      UPDATE mcp_authorizations SET is_revoked = 1 WHERE client_name = ? AND project_id = ?
    `).run(clientName, projectId);
    return res.changes > 0;
  }

  public touchAuthorization(id: string): void {
    this.db.prepare('UPDATE mcp_authorizations SET last_used_at = ? WHERE id = ?').run(Date.now(), id);
  }

  public recordAuthorizationUsage(clientName: string, projectId: string): void {
    this.db.prepare(
      'UPDATE mcp_authorizations SET last_used_at = ? WHERE client_name = ? AND project_id = ?'
    ).run(Date.now(), clientName, projectId);
  }

  // ==========================================================================
  // 7. Context Cache (Prebaked Pack Representation)
  // ==========================================================================

  public getCache(projectId: string, packMode: ContextPackMode): ContextCache | null {
    const row = this.db.prepare(`
      SELECT * FROM context_cache WHERE project_id = ? AND pack_mode = ? AND expires_at > ?
    `).get(projectId, packMode, Date.now());
    return row ? this.mapContextCacheRow(row) : null;
  }

  public setCache(cache: ContextCache): void {
    this.db.prepare(`
      INSERT INTO context_cache (
        project_id, pack_mode, content_hash, context_text, estimated_tokens, cached_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, pack_mode) DO UPDATE SET
        content_hash = excluded.content_hash,
        context_text = excluded.context_text,
        estimated_tokens = excluded.estimated_tokens,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `).run(
      cache.projectId,
      cache.packMode,
      cache.contentHash,
      cache.contextText,
      cache.estimatedTokens,
      cache.cachedAt,
      cache.expiresAt
    );
  }

  public invalidateCache(projectId: string, packMode?: ContextPackMode): void {
    if (packMode) {
      this.db.prepare('DELETE FROM context_cache WHERE project_id = ? AND pack_mode = ?').run(
        projectId,
        packMode
      );
    } else {
      this.db.prepare('DELETE FROM context_cache WHERE project_id = ?').run(projectId);
    }
  }

  // ==========================================================================
  // 8. FTS5 Full-Text Search (BM25 Ranking with Term Sanitization)
  // ==========================================================================

  public searchMemory(input: SearchMemoryInput): MemorySearchResult[] {
    const validated = SearchMemoryInputSchema.parse(input);
    const sanitizedQuery = this.sanitizeFtsQuery(validated.query);

    if (!sanitizedQuery || sanitizedQuery === '""') {
      return [];
    }

    let sql = `
      SELECT
        entity_id,
        project_id,
        entity_type,
        title,
        snippet(memory_fts, -1, '<mark>', '</mark>', '...', 16) as snippet,
        bm25(memory_fts) as rank
      FROM memory_fts
      WHERE memory_fts MATCH ? AND project_id = ?
    `;
    const params: any[] = [sanitizedQuery, validated.projectId];

    if (validated.category !== 'all') {
      const typeMap: Record<string, string> = {
        records: 'record',
        decisions: 'decision',
        tasks: 'task'
      };
      const entityType = typeMap[validated.category];
      if (entityType) {
        sql += ' AND entity_type = ?';
        params.push(entityType);
      }
    }

    // In SQLite FTS5 bm25(), lower values represent higher relevance
    sql += ' ORDER BY rank ASC LIMIT ?';
    params.push(validated.limit);

    try {
      const rows = this.db.prepare(sql).all(...params) as Array<{
        entity_id: string;
        project_id: string;
        entity_type: 'record' | 'decision' | 'task';
        title: string;
        snippet: string;
        rank: number;
      }>;

      return rows.map((r) => ({
        entityId: r.entity_id,
        projectId: r.project_id,
        entityType: r.entity_type,
        title: r.title,
        snippet: r.snippet,
        rank: r.rank
      }));
    } catch {
      // If FTS5 query parser fails on edge case, fail gracefully with empty results
      return [];
    }
  }

  /**
   * Sanitizes arbitrary search query terms for safe SQLite FTS5 MATCH execution.
   * Strips dangerous operators, quotes individual tokens, and appends prefix asterisks.
   */
  public sanitizeFtsQuery(raw: string): string {
    const clean = raw.trim().replace(/[^\w\s-]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '""';
    return tokens.map((t) => `"${t}"*`).join(' ');
  }

  // ==========================================================================
  // Row Mappers (Snake_case DB -> CamelCase Domain Models)
  // ==========================================================================

  private mapRecordRow(row: any): MemoryRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      category: row.category,
      title: row.title,
      content: row.content,
      tier: row.tier,
      confidence: row.confidence,
      authorType: row.author_type,
      authorId: row.author_id,
      revision: row.revision,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapTaskRow(row: any): MemoryTask {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      status: row.status,
      assignedAgent: row.assigned_agent || null,
      priority: row.priority,
      blockersSummary: row.blockers_summary || null,
      completionEvidence: row.completion_evidence || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapDecisionRow(row: any): MemoryDecision {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      context: row.context,
      decision: row.decision,
      consequences: row.consequences,
      authorType: row.author_type,
      authorId: row.author_id,
      userApprovalStatus: row.user_approval_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapCheckpointRow(row: any): MemoryCheckpoint {
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id || null,
      sessionId: row.session_id,
      clientName: row.client_name,
      checkpointType: row.checkpoint_type,
      summary: row.summary,
      payloadJson: row.payload_json,
      idempotencyKey: row.idempotency_key,
      clientSequence: row.client_sequence !== null ? row.client_sequence : null,
      evidenceRefsJson: row.evidence_refs_json || null,
      tier: row.tier,
      createdAt: row.created_at
    };
  }

  private mapHandoffRow(row: any): MemoryHandoff {
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id || null,
      sessionId: row.session_id,
      authorClient: row.author_client,
      objective: row.objective,
      completedSummary: row.completed_summary,
      remainingSummary: row.remaining_summary,
      blockersSummary: row.blockers_summary || null,
      decisionsSummary: row.decisions_summary || null,
      relevantFilesJson: row.relevant_files_json || '[]',
      testStatusSummary: row.test_status_summary || null,
      knownUncertainties: row.known_uncertainties || null,
      createdAt: row.created_at
    };
  }

  private mapMcpAuthRow(row: any): McpAuthorization {
    return {
      id: row.id,
      clientName: row.client_name,
      projectId: row.project_id,
      tokenHash: row.token_hash,
      scopes: row.scopes,
      isRevoked: Boolean(row.is_revoked),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at || null
    };
  }

  private mapContextCacheRow(row: any): ContextCache {
    return {
      projectId: row.project_id,
      packMode: row.pack_mode,
      contentHash: row.content_hash,
      contextText: row.context_text,
      estimatedTokens: row.estimated_tokens,
      cachedAt: row.cached_at,
      expiresAt: row.expires_at
    };
  }
}

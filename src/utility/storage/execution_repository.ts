import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface CommandRecord {
  id: string;
  chatId: string;
  commandSeq: number;
  originalText: string;
  resolutionStatus: 'resolved' | 'unsupported' | 'invalid';
  proposalSnapshotJson?: string;
  resolverVersion: string;
  createdAt: number;
}

export interface ExecutionRecord {
  id: string;
  originChatId: string;
  commandId: string;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  planHash: string;
  createdAt: number;
  endedAt?: number;
  summaryJson?: string;
}

export class ExecutionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public recordCommandIntent(params: {
    chatId: string;
    originalText: string;
    resolutionStatus: 'resolved' | 'unsupported' | 'invalid' | 'clarify' | 'negated';
    proposalSnapshot?: any;
    actionId?: string;
  }): { commandId: string; executionId?: string; stepId?: string; attemptId?: string } {
    const commandId = `cmd_${crypto.randomUUID()}`;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      // Monotonic command sequence in chat
      const chatRow = this.db.prepare(`
        SELECT next_command_seq as nextSeq
        FROM chats
        WHERE id = ?
      `).get(params.chatId) as { nextSeq: number } | undefined;

      if (!chatRow) {
        throw new Error(`Chat '${params.chatId}' not found`);
      }

      const seq = chatRow.nextSeq;
      this.db.prepare('UPDATE chats SET next_command_seq = next_command_seq + 1, updated_at = ? WHERE id = ?')
        .run(now, params.chatId);

      this.db.prepare(`
        INSERT INTO commands (id, chat_id, command_seq, original_text, resolution_status, proposal_snapshot_json, resolver_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '1.0.0-p1', ?)
      `).run(
        commandId,
        params.chatId,
        seq,
        params.originalText,
        params.resolutionStatus,
        params.proposalSnapshot ? JSON.stringify(params.proposalSnapshot) : null,
        now
      );

      if (params.resolutionStatus !== 'resolved' || !params.actionId) {
        return { commandId };
      }

      // Record execution intent
      const executionId = `exec_${crypto.randomUUID()}`;
      const stepId = 'step_0';
      const attemptId = `att_${crypto.randomUUID()}`;

      this.db.prepare(`
        INSERT INTO executions (id, workflow_id, origin_chat_id, command_id, state, plan_hash, created_at)
        VALUES (?, 'builtin.direct_command', ?, ?, 'running', 'plan_p1_memory', ?)
      `).run(executionId, params.chatId, commandId, now);

      this.db.prepare(`
        INSERT INTO execution_steps (execution_id, step_id, ordinal, state, action_id, started_at)
        VALUES (?, ?, 0, 'running', ?, ?)
      `).run(executionId, stepId, params.actionId, now);

      this.db.prepare(`
        INSERT INTO step_attempts (id, execution_id, step_id, attempt_no, intent_at, outcome)
        VALUES (?, ?, ?, 1, ?, 'running')
      `).run(attemptId, executionId, stepId, now);

      this.db.prepare(`
        INSERT INTO execution_events (execution_id, seq, kind, summary_json, created_at)
        VALUES (?, 1, 'step_intent_recorded', ?, ?)
      `).run(executionId, JSON.stringify({ action: params.actionId }), now);

      return { commandId, executionId, stepId, attemptId };
    });

    return tx();
  }

  public completeExecution(params: {
    executionId: string;
    stepId: string;
    attemptId: string;
    output: any;
    state: 'completed' | 'failed';
  }): void {
    const now = Date.now();
    const outputJson = JSON.stringify(params.output);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE step_attempts
        SET finished_at = ?, outcome = ?
        WHERE id = ?
      `).run(now, params.state, params.attemptId);

      this.db.prepare(`
        UPDATE execution_steps
        SET state = ?, output_json = ?, ended_at = ?
        WHERE execution_id = ? AND step_id = ?
      `).run(params.state, outputJson, now, params.executionId, params.stepId);

      this.db.prepare(`
        UPDATE executions
        SET state = ?, ended_at = ?, summary_json = ?
        WHERE id = ?
      `).run(params.state, now, outputJson, params.executionId);

      this.db.prepare(`
        INSERT INTO execution_events (execution_id, seq, kind, summary_json, created_at)
        VALUES (?, 2, 'execution_completed', ?, ?)
      `).run(params.executionId, outputJson, now);
    });

    tx();
  }
}

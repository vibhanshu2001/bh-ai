import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ChatRecord,
  ChatContextRecord,
  CommandRecord,
  RunRecord,
  StepRecord,
  AttemptRecord,
  EventRecord
} from '../shared/types';

export class StorageEngine {
  private db: Database.Database | null = null;
  public dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public initialize(): { binding: string; wal: string; synchronous: number; fk: number } {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Apply strict PRAGMAs
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');

    const fk = this.db.pragma('foreign_keys', { simple: true }) as number;
    const wal = this.db.pragma('journal_mode', { simple: true }) as string;
    const synchronous = this.db.pragma('synchronous', { simple: true }) as number;

    this.createSchema();

    return {
      binding: 'better-sqlite3',
      wal,
      synchronous,
      fk
    };
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_context (
        chat_id TEXT PRIMARY KEY,
        project_id TEXT,
        service_id TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        raw_input TEXT NOT NULL,
        disposition TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        UNIQUE (chat_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        status TEXT NOT NULL,
        intent_recorded_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (command_id) REFERENCES commands(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_index INTEGER NOT NULL,
        action_id TEXT NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
        UNIQUE (run_id, step_index)
      );

      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        exit_code INTEGER,
        status TEXT NOT NULL,
        FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
        UNIQUE (step_id, attempt_number)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      );
    `);
  }

  public createChat(id: string, title: string): ChatRecord {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO chats (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, title, now, now);

    const ctxStmt = this.db.prepare(`
      INSERT INTO chat_context (chat_id, project_id, service_id, updated_at)
      VALUES (?, NULL, NULL, ?)
    `);
    ctxStmt.run(id, now);

    return { id, title, createdAt: now, updatedAt: now };
  }

  public getChat(id: string): ChatRecord | null {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chats WHERE id = ?').get(id);
    return (row as ChatRecord) || null;
  }

  public getChatContext(chatId: string): ChatContextRecord | null {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db.prepare('SELECT chat_id as chatId, project_id as projectId, service_id as serviceId, updated_at as updatedAt FROM chat_context WHERE chat_id = ?').get(chatId);
    return (row as ChatContextRecord) || null;
  }

  public updateChatContext(chatId: string, projectId: string | null, serviceId: string | null): void {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    this.db.prepare('UPDATE chat_context SET project_id = ?, service_id = ?, updated_at = ? WHERE chat_id = ?')
      .run(projectId, serviceId, now, chatId);
  }

  public executeCommandWithRun(params: {
    commandId: string;
    chatId: string;
    sequence: number;
    rawInput: string;
    disposition: CommandRecord['disposition'];
    runId: string;
    actionId: string;
  }): { command: CommandRecord; run: RunRecord } {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(() => {
      const now = Date.now();
      // 1. Insert command
      this.db!.prepare(`
        INSERT INTO commands (id, chat_id, sequence, raw_input, disposition, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(params.commandId, params.chatId, params.sequence, params.rawInput, params.disposition, now);

      // 2. Insert run intent
      this.db!.prepare(`
        INSERT INTO runs (id, chat_id, command_id, status, intent_recorded_at, completed_at)
        VALUES (?, ?, ?, 'running', ?, NULL)
      `).run(params.runId, params.chatId, params.commandId, now);

      // 3. Insert initial step
      this.db!.prepare(`
        INSERT INTO steps (id, run_id, step_index, action_id, status)
        VALUES (?, ?, 0, ?, 'running')
      `).run(`${params.runId}_step_0`, params.runId, params.actionId);

      // 4. Insert attempt
      this.db!.prepare(`
        INSERT INTO attempts (id, step_id, attempt_number, started_at, ended_at, exit_code, status)
        VALUES (?, ?, 1, ?, NULL, NULL, 'running')
      `).run(`${params.runId}_att_0`, `${params.runId}_step_0`, now);

      // 5. Insert event
      this.db!.prepare(`
        INSERT INTO events (id, run_id, event_type, payload_json, created_at)
        VALUES (?, ?, 'step_started', ?, ?)
      `).run(`${params.runId}_evt_0`, params.runId, JSON.stringify({ action: params.actionId }), now);

      return {
        command: {
          id: params.commandId,
          chatId: params.chatId,
          sequence: params.sequence,
          rawInput: params.rawInput,
          disposition: params.disposition,
          createdAt: now
        },
        run: {
          id: params.runId,
          chatId: params.chatId,
          commandId: params.commandId,
          status: 'running' as const,
          intentRecordedAt: now,
          completedAt: null
        }
      };
    });

    return tx();
  }

  public completeRun(runId: string, status: 'completed' | 'failed' | 'cancelled'): void {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    this.db.prepare('UPDATE runs SET status = ?, completed_at = ? WHERE id = ?').run(status, now, runId);
  }

  public testRollback(failAtStep: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const testChatId = 'chat_rollback_test';
    const tx = this.db.transaction(() => {
      this.db!.prepare('INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(testChatId, 'Rollback Chat', Date.now(), Date.now());

      if (failAtStep === 2) {
        throw new Error('Simulated failure during transaction to force rollback');
      }

      this.db!.prepare('INSERT INTO chat_context (chat_id, project_id, service_id, updated_at) VALUES (?, NULL, NULL, ?)')
        .run(testChatId, Date.now());
    });

    try {
      tx();
      return true;
    } catch (err) {
      // Check if chat exists after exception
      const exists = this.getChat(testChatId);
      return exists === null; // true means properly rolled back
    }
  }

  public checkIntegrity(): string {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.pragma('integrity_check', { simple: true }) as string;
    return result;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { ChatDto, MessageDto } from '../../shared/contracts/dto';

export class ChatRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public createChat(title?: string): ChatDto {
    const id = `chat_${crypto.randomUUID()}`;
    const now = Date.now();
    const chatTitle = title?.trim() || `Chat ${new Date(now).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO chats (id, title, created_at, updated_at, revision, next_command_seq, state)
        VALUES (?, ?, ?, ?, 1, 1, 'active')
      `).run(id, chatTitle, now, now);

      this.db.prepare(`
        INSERT INTO chat_contexts (chat_id, schema_version, revision, last_command_seq, project_id, service_id, app_id, updated_at)
        VALUES (?, 1, 1, 0, NULL, NULL, NULL, ?)
      `).run(id, now);
    });

    tx();

    return {
      id,
      title: chatTitle,
      createdAt: now,
      updatedAt: now
    };
  }

  public listChats(): ChatDto[] {
    const rows = this.db.prepare(`
      SELECT id, title, created_at as createdAt, updated_at as updatedAt
      FROM chats
      WHERE state = 'active'
      ORDER BY updated_at DESC
    `).all() as ChatDto[];

    return rows;
  }

  public getChat(id: string): ChatDto | null {
    const row = this.db.prepare(`
      SELECT id, title, created_at as createdAt, updated_at as updatedAt
      FROM chats
      WHERE id = ? AND state = 'active'
    `).get(id) as ChatDto | undefined;

    return row || null;
  }

  public renameChat(id: string, title: string): ChatDto {
    const now = Date.now();
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('Chat title cannot be empty');

    const result = this.db.prepare(`
      UPDATE chats
      SET title = ?, updated_at = ?, revision = revision + 1
      WHERE id = ? AND state = 'active'
    `).run(cleanTitle, now, id);

    if (result.changes === 0) {
      throw new Error(`Chat '${id}' not found`);
    }

    const updated = this.getChat(id);
    if (!updated) throw new Error(`Chat '${id}' not found after update`);
    return updated;
  }

  public deleteChat(id: string): void {
    const tx = this.db.transaction(() => {
      // Cascades to chat_contexts and messages
      const res = this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
      if (res.changes === 0) {
        throw new Error(`Chat '${id}' not found`);
      }
    });

    tx();
  }

  public getMessages(chatId: string, limit = 50, beforeSeq?: number): MessageDto[] {
    let query = `
      SELECT id, chat_id as chatId, chat_seq as chatSeq, role, kind, body, payload_json as payloadJson, created_at as createdAt
      FROM messages
      WHERE chat_id = ?
    `;
    const params: any[] = [chatId];

    if (beforeSeq !== undefined) {
      query += ' AND chat_seq < ?';
      params.push(beforeSeq);
    }

    query += ' ORDER BY chat_seq ASC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      chatId: string;
      chatSeq: number;
      role: 'user' | 'assistant' | 'system';
      kind: 'text' | 'result' | 'unsupported' | 'error' | 'clarify' | 'negated';
      body: string;
      payloadJson: string | null;
      createdAt: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      chatSeq: r.chatSeq,
      role: r.role,
      kind: r.kind,
      body: r.body,
      payload: r.payloadJson ? JSON.parse(r.payloadJson) : undefined,
      createdAt: r.createdAt
    }));
  }

  public appendMessage(params: {
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    kind: 'text' | 'result' | 'unsupported' | 'error' | 'clarify' | 'negated';
    body: string;
    payload?: any;
    commandId?: string;
    executionId?: string;
  }): MessageDto {
    const id = `msg_${crypto.randomUUID()}`;
    const now = Date.now();

    const tx = this.db.transaction(() => {
      // Get next chatSeq atomically
      const lastMsg = this.db.prepare(`
        SELECT COALESCE(MAX(chat_seq), 0) + 1 as nextSeq
        FROM messages
        WHERE chat_id = ?
      `).get(params.chatId) as { nextSeq: number };

      const chatSeq = lastMsg.nextSeq;
      const payloadJson = params.payload ? JSON.stringify(params.payload) : null;

      this.db.prepare(`
        INSERT INTO messages (id, chat_id, chat_seq, role, kind, body, payload_json, command_id, execution_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.chatId,
        chatSeq,
        params.role,
        params.kind,
        params.body,
        payloadJson,
        params.commandId || null,
        params.executionId || null,
        now
      );

      // Update chat's updated_at
      this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, params.chatId);

      return {
        id,
        chatId: params.chatId,
        chatSeq,
        role: params.role,
        kind: params.kind,
        body: params.body,
        payload: params.payload,
        createdAt: now
      };
    });

    return tx();
  }

  public getChatContext(chatId: string): {
    chatId: string;
    projectId: string | null;
    serviceId: string | null;
    updatedAt: number;
  } | null {
    const row = this.db.prepare(`
      SELECT chat_id as chatId, project_id as projectId, service_id as serviceId, updated_at as updatedAt
      FROM chat_contexts
      WHERE chat_id = ?
    `).get(chatId) as {
      chatId: string;
      projectId: string | null;
      serviceId: string | null;
      updatedAt: number;
    } | undefined;

    return row || null;
  }

  public updateChatContext(chatId: string, projectId: string | null, serviceId: string | null): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE chat_contexts
      SET project_id = ?, service_id = ?, updated_at = ?, revision = revision + 1
      WHERE chat_id = ?
    `).run(projectId, serviceId, now, chatId);
  }
}

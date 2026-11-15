import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { ClarificationDraftDto, ClarificationCandidate } from '../../shared/contracts/dto';

export class ClarificationRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public createDraft(params: {
    chatId: string;
    commandId?: string;
    originalText: string;
    question: string;
    candidates: ClarificationCandidate[];
  }): ClarificationDraftDto {
    const id = `draft_${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

    const tx = this.db.transaction(() => {
      // Invalidate any existing pending draft for this chat
      this.db.prepare(`
        UPDATE clarification_drafts
        SET status = 'invalidated'
        WHERE chat_id = ? AND status = 'pending'
      `).run(params.chatId);

      // Insert new draft
      this.db.prepare(`
        INSERT INTO clarification_drafts (
          id, chat_id, command_id, original_text, question, candidates_json, config_revision, expires_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'pending', ?)
      `).run(
        id,
        params.chatId,
        params.commandId || null,
        params.originalText,
        params.question,
        JSON.stringify(params.candidates),
        expiresAt,
        now
      );
    });

    tx();

    return {
      id,
      chatId: params.chatId,
      commandId: params.commandId,
      originalText: params.originalText,
      question: params.question,
      candidates: params.candidates,
      expiresAt,
      status: 'pending'
    };
  }

  public getPendingDraft(chatId: string): ClarificationDraftDto | null {
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT 
        id, 
        chat_id as chatId, 
        command_id as commandId, 
        original_text as originalText, 
        question, 
        candidates_json as candidatesJson, 
        expires_at as expiresAt, 
        status
      FROM clarification_drafts
      WHERE chat_id = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(chatId) as any;

    if (!row) return null;

    // Check expiry
    if (row.expiresAt <= now) {
      this.db.prepare(`
        UPDATE clarification_drafts
        SET status = 'expired'
        WHERE id = ?
      `).run(row.id);
      return null;
    }

    return {
      id: row.id,
      chatId: row.chatId,
      commandId: row.commandId || undefined,
      originalText: row.originalText,
      question: row.question,
      candidates: JSON.parse(row.candidatesJson),
      expiresAt: row.expiresAt,
      status: 'pending'
    };
  }

  public getDraftById(id: string): ClarificationDraftDto | null {
    const row = this.db.prepare(`
      SELECT 
        id, 
        chat_id as chatId, 
        command_id as commandId, 
        original_text as originalText, 
        question, 
        candidates_json as candidatesJson, 
        expires_at as expiresAt, 
        status
      FROM clarification_drafts
      WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      chatId: row.chatId,
      commandId: row.commandId || undefined,
      originalText: row.originalText,
      question: row.question,
      candidates: JSON.parse(row.candidatesJson),
      expiresAt: row.expiresAt,
      status: row.status
    };
  }

  public resolveDraft(draftId: string, candidateId: string): ClarificationDraftDto {
    const draft = this.getDraftById(draftId);
    if (!draft) {
      throw new Error(`Clarification draft '${draftId}' not found`);
    }

    if (draft.status !== 'pending') {
      throw new Error(`Clarification draft '${draftId}' is already ${draft.status}`);
    }

    if (draft.expiresAt <= Date.now()) {
      this.db.prepare(`UPDATE clarification_drafts SET status = 'expired' WHERE id = ?`).run(draftId);
      throw new Error(`Clarification draft '${draftId}' has expired (limit 10 minutes)`);
    }

    const candidateExists = draft.candidates.some((c) => c.id === candidateId);
    if (!candidateExists) {
      throw new Error(`Candidate '${candidateId}' is not valid for clarification draft '${draftId}'`);
    }

    this.db.prepare(`
      UPDATE clarification_drafts
      SET status = 'resolved'
      WHERE id = ?
    `).run(draftId);

    draft.status = 'resolved';
    return draft;
  }

  public invalidateDraftsForChat(chatId: string): void {
    this.db.prepare(`
      UPDATE clarification_drafts
      SET status = 'invalidated'
      WHERE chat_id = ? AND status = 'pending'
    `).run(chatId);
  }
}

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { AliasDto, AliasCreateRequest } from '../../shared/contracts/dto';

export class AliasRepository {
  private db: Database.Database;

  private static readonly RESERVED_WORDS = [
    'mat', 'nahi', 'nahin', "don't", 'dont', 'do not', 'never',
    'rm', 'sudo', 'chmod', 'chown', 'eval', 'exec'
  ];

  private static readonly RESERVED_PHRASES = [
    'memory dekh',
    'bhai memory dekh',
    'memory usage',
    'bhai ram dekh',
    'ram dekh',
    'memory',
    'ram',
    'cpu usage',
    'cpu dekh',
    'disk space',
    'battery status',
    'port 3000 check',
    'volume 50'
  ];

  constructor(db: Database.Database) {
    this.db = db;
  }

  public normalizePhrase(phrase: string): string {
    return phrase
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/^bhai\s+/, '')
      .replace(/\s+/g, ' ');
  }

  public validatePhrase(phrase: string): { ok: boolean; reason?: string; normalized: string } {
    const rawTrimmed = phrase.trim();
    if (!rawTrimmed) {
      return { ok: false, reason: 'Alias phrase cannot be empty', normalized: '' };
    }
    if (rawTrimmed.length > 128) {
      return { ok: false, reason: 'Alias phrase cannot exceed 128 characters', normalized: '' };
    }

    // Check for dangerous metacharacters
    if (/[;&|><$`\\]/.test(rawTrimmed)) {
      return { ok: false, reason: 'Alias phrase contains prohibited shell metacharacters', normalized: '' };
    }

    const normalized = this.normalizePhrase(rawTrimmed);
    if (!normalized) {
      return { ok: false, reason: 'Alias phrase normalizes to empty string', normalized: '' };
    }

    // Check for negation words
    const tokens = normalized.split(' ');
    for (const rw of AliasRepository.RESERVED_WORDS) {
      if (tokens.includes(rw) || normalized.includes(rw)) {
        return {
          ok: false,
          reason: `Alias cannot contain reserved or negation keyword: "${rw}"`,
          normalized
        };
      }
    }

    // Check for reserved built-in system phrases
    if (AliasRepository.RESERVED_PHRASES.includes(normalized)) {
      return {
        ok: false,
        reason: `Alias "${normalized}" collides with a core built-in command or reserved phrase`,
        normalized
      };
    }

    return { ok: true, normalized };
  }

  public listAliases(): AliasDto[] {
    const rows = this.db.prepare(`
      SELECT 
        id, 
        phrase, 
        normalized_phrase as normalizedPhrase, 
        target_kind as targetKind, 
        target_id as targetId, 
        bindings_json as bindingsJson, 
        enabled, 
        revision, 
        created_at as createdAt, 
        updated_at as updatedAt
      FROM aliases
      ORDER BY updated_at DESC
    `).all() as Array<{
      id: string;
      phrase: string;
      normalizedPhrase: string;
      targetKind: 'action' | 'workflow' | 'app' | 'project';
      targetId: string;
      bindingsJson: string | null;
      enabled: number;
      revision: number;
      createdAt: number;
      updatedAt: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      phrase: r.phrase,
      normalizedPhrase: r.normalizedPhrase,
      targetKind: r.targetKind,
      targetId: r.targetId,
      bindings: r.bindingsJson ? JSON.parse(r.bindingsJson) : undefined,
      enabled: r.enabled === 1,
      revision: r.revision,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  public getAlias(id: string): AliasDto | null {
    const r = this.db.prepare(`
      SELECT 
        id, 
        phrase, 
        normalized_phrase as normalizedPhrase, 
        target_kind as targetKind, 
        target_id as targetId, 
        bindings_json as bindingsJson, 
        enabled, 
        revision, 
        created_at as createdAt, 
        updated_at as updatedAt
      FROM aliases
      WHERE id = ?
    `).get(id) as any;

    if (!r) return null;

    return {
      id: r.id,
      phrase: r.phrase,
      normalizedPhrase: r.normalizedPhrase,
      targetKind: r.targetKind,
      targetId: r.targetId,
      bindings: r.bindingsJson ? JSON.parse(r.bindingsJson) : undefined,
      enabled: r.enabled === 1,
      revision: r.revision,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  public getAliasByPhrase(phrase: string): AliasDto | null {
    const normalized = this.normalizePhrase(phrase);
    const r = this.db.prepare(`
      SELECT 
        id, 
        phrase, 
        normalized_phrase as normalizedPhrase, 
        target_kind as targetKind, 
        target_id as targetId, 
        bindings_json as bindingsJson, 
        enabled, 
        revision, 
        created_at as createdAt, 
        updated_at as updatedAt
      FROM aliases
      WHERE normalized_phrase = ? AND enabled = 1
      LIMIT 1
    `).get(normalized) as any;

    if (!r) return null;

    return {
      id: r.id,
      phrase: r.phrase,
      normalizedPhrase: r.normalizedPhrase,
      targetKind: r.targetKind,
      targetId: r.targetId,
      bindings: r.bindingsJson ? JSON.parse(r.bindingsJson) : undefined,
      enabled: r.enabled === 1,
      revision: r.revision,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  public createAlias(req: AliasCreateRequest): AliasDto {
    const validation = this.validatePhrase(req.phrase);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    // Check count limit
    const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM aliases').get() as { cnt: number };
    if (countRow.cnt >= 10000) {
      throw new Error('Maximum alias limit (10,000) reached');
    }

    // Collision check
    const existing = this.getAliasByPhrase(req.phrase);
    if (existing) {
      throw new Error(`Alias collision: phrase "${req.phrase}" is already mapped to ${existing.targetKind}:${existing.targetId}`);
    }

    const id = `alias_${crypto.randomUUID()}`;
    const now = Date.now();
    const bindingsJson = req.bindings ? JSON.stringify(req.bindings) : null;

    this.db.prepare(`
      INSERT INTO aliases (id, phrase, normalized_phrase, target_kind, target_id, bindings_json, enabled, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    `).run(
      id,
      req.phrase.trim(),
      validation.normalized,
      req.targetKind,
      req.targetId,
      bindingsJson,
      now,
      now
    );

    return {
      id,
      phrase: req.phrase.trim(),
      normalizedPhrase: validation.normalized,
      targetKind: req.targetKind,
      targetId: req.targetId,
      bindings: req.bindings,
      enabled: true,
      revision: 1,
      createdAt: now,
      updatedAt: now
    };
  }

  public updateAlias(id: string, updates: {
    phrase?: string;
    targetKind?: 'action' | 'workflow' | 'app' | 'project';
    targetId?: string;
    enabled?: boolean;
    bindings?: Record<string, any>;
  }): AliasDto {
    const existing = this.getAlias(id);
    if (!existing) {
      throw new Error(`Alias '${id}' not found`);
    }

    const now = Date.now();
    let newPhrase = existing.phrase;
    let newNormalized = existing.normalizedPhrase;

    if (updates.phrase && updates.phrase !== existing.phrase) {
      const validation = this.validatePhrase(updates.phrase);
      if (!validation.ok) {
        throw new Error(validation.reason);
      }
      newPhrase = updates.phrase.trim();
      newNormalized = validation.normalized;

      const coll = this.getAliasByPhrase(newPhrase);
      if (coll && coll.id !== id) {
        throw new Error(`Alias collision: phrase "${newPhrase}" is already mapped to ${coll.targetKind}:${coll.targetId}`);
      }
    }

    const newTargetKind = updates.targetKind || existing.targetKind;
    const newTargetId = updates.targetId || existing.targetId;
    const newEnabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
    const newBindingsJson = updates.bindings !== undefined ? JSON.stringify(updates.bindings) : (existing.bindings ? JSON.stringify(existing.bindings) : null);

    this.db.prepare(`
      UPDATE aliases
      SET phrase = ?, normalized_phrase = ?, target_kind = ?, target_id = ?, enabled = ?, bindings_json = ?, updated_at = ?, revision = revision + 1
      WHERE id = ?
    `).run(newPhrase, newNormalized, newTargetKind, newTargetId, newEnabled, newBindingsJson, now, id);

    const updated = this.getAlias(id);
    if (!updated) throw new Error(`Alias '${id}' not found after update`);
    return updated;
  }

  public deleteAlias(id: string): void {
    const res = this.db.prepare('DELETE FROM aliases WHERE id = ?').run(id);
    if (res.changes === 0) {
      throw new Error(`Alias '${id}' not found`);
    }
  }
}

/**
 * Bhai Phase P4.2 — Continuous Checkpoint Ingestion Pipeline
 * Validates, deduplicates, redacts secrets, and transactionally commits
 * agent milestone checkpoints and session handoffs.
 */

import crypto from 'node:crypto';
import { MemoryRepository } from '../storage/memory_repository';
import {
  CHECKPOINT_MAX_PAYLOAD_BYTES,
  CHECKPOINT_MAX_SESSION_QUOTA,
  HANDOFF_MAX_DOCUMENT_BYTES,
  MemoryCheckpoint,
  MemoryHandoff
} from '../../shared/contracts/memory_dto';
import { YesavekarInput, HandoffsavekarInput } from '../../shared/contracts/mcp_tools';

export class SecretRedactor {
  private static readonly PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
    // Bearer / Token
    { regex: /bearer\s+[a-zA-Z0-9_\-\.=:_+/]{16,}/gi, replacement: 'bearer [REDACTED_TOKEN]' },
    // API Keys (e.g. sk-..., ak-..., api_key)
    { regex: /(sk-[a-zA-Z0-9]{20,})/gi, replacement: '[REDACTED_API_KEY]' },
    { regex: /(api[_-]?key\s*[:=]\s*["']?)[a-zA-Z0-9_\-]{16,}(["']?)/gi, replacement: '$1[REDACTED_API_KEY]$2' },
    // Passwords / Secrets in JSON or URI
    { regex: /(password\s*[:=]\s*["']?)[^"'\s\n]{6,}(["']?)/gi, replacement: '$1[REDACTED_PASSWORD]$2' },
    { regex: /(secret\s*[:=]\s*["']?)[a-zA-Z0-9_\-]{8,}(["']?)/gi, replacement: '$1[REDACTED_SECRET]$2' },
    // PEM private keys
    { regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z0-9_-]*PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
    // Generic high-entropy hex strings >= 32 chars (potential tokens)
    { regex: /\b[a-f0-9]{32,64}\b/gi, replacement: '[REDACTED_HASH_OR_KEY]' }
  ];

  public static redactText(text: string): string {
    let result = text;
    for (const { regex, replacement } of SecretRedactor.PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result;
  }

  public static redactObject<T>(obj: T): T {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return SecretRedactor.redactText(obj) as any;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => SecretRedactor.redactObject(item)) as any;
    }
    if (typeof obj === 'object') {
      const copy: Record<string, any> = {};
      for (const [key, val] of Object.entries(obj)) {
        copy[key] = SecretRedactor.redactObject(val);
      }
      return copy as any;
    }
    return obj;
  }
}

export interface IngestionResult {
  checkpointId: string;
  status: 'recorded' | 'duplicate';
  isDuplicate: boolean;
}

export class CheckpointPipeline {
  private memoryRepo: MemoryRepository;

  constructor(memoryRepo: MemoryRepository) {
    this.memoryRepo = memoryRepo;
  }

  public processCheckpoint(
    clientName: string,
    sessionId: string,
    input: YesavekarInput
  ): IngestionResult {
    // 1. Validate payload size bound
    const payloadStr = input.payloadJson ? JSON.stringify(input.payloadJson) : '{}';
    const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
    if (payloadBytes > CHECKPOINT_MAX_PAYLOAD_BYTES) {
      throw new Error(`PAYLOAD_TOO_LARGE: Checkpoint payload size ${payloadBytes}B exceeds maximum allowed ${CHECKPOINT_MAX_PAYLOAD_BYTES}B (2 KiB)`);
    }

    // 2. Validate session quota
    const currentCount = this.memoryRepo.countSessionCheckpoints(sessionId);
    if (currentCount >= CHECKPOINT_MAX_SESSION_QUOTA) {
      throw new Error(`SESSION_CHECKPOINT_QUOTA_EXCEEDED: Exceeded maximum quota of ${CHECKPOINT_MAX_SESSION_QUOTA} checkpoints per session`);
    }

    // 3. Secret Redaction
    const cleanSummary = SecretRedactor.redactText(input.summary.trim());
    const cleanPayload = input.payloadJson ? SecretRedactor.redactObject(input.payloadJson) : {};

    // 4. Ingest via repository
    const record = this.memoryRepo.recordCheckpoint({
      projectId: input.projectId,
      taskId: input.taskId,
      sessionId,
      clientName,
      checkpointType: input.checkpointType,
      summary: cleanSummary,
      payloadJson: JSON.stringify(cleanPayload),
      idempotencyKey: input.idempotencyKey,
      evidenceRefs: input.evidenceRefs
    });

    return {
      checkpointId: record.checkpoint.id,
      status: record.isDuplicate ? 'duplicate' : 'recorded',
      isDuplicate: record.isDuplicate
    };
  }

  public processHandoff(
    clientName: string,
    sessionId: string,
    input: HandoffsavekarInput
  ): MemoryHandoff {
    const docStr = JSON.stringify(input);
    const docBytes = Buffer.byteLength(docStr, 'utf8');
    if (docBytes > HANDOFF_MAX_DOCUMENT_BYTES) {
      throw new Error(`PAYLOAD_TOO_LARGE: Handoff document size ${docBytes}B exceeds maximum allowed ${HANDOFF_MAX_DOCUMENT_BYTES}B (16 KiB)`);
    }

    const cleanObjective = SecretRedactor.redactText(input.objective.trim());
    const cleanCompleted = SecretRedactor.redactText(input.completedSummary.trim());
    const cleanRemaining = SecretRedactor.redactText(input.remainingSummary.trim());
    const cleanBlockers = input.blockersSummary ? SecretRedactor.redactText(input.blockersSummary.trim()) : undefined;
    const cleanDecisions = input.decisionsSummary ? SecretRedactor.redactText(input.decisionsSummary.trim()) : undefined;
    const cleanUncertainties = input.knownUncertainties ? SecretRedactor.redactText(input.knownUncertainties.trim()) : undefined;
    const cleanTestStatus = input.testStatusSummary ? SecretRedactor.redactText(input.testStatusSummary.trim()) : undefined;

    return this.memoryRepo.saveHandoff({
      projectId: input.projectId,
      taskId: input.taskId,
      sessionId,
      authorClient: clientName,
      objective: cleanObjective,
      completedSummary: cleanCompleted,
      remainingSummary: cleanRemaining,
      blockersSummary: cleanBlockers,
      decisionsSummary: cleanDecisions,
      relevantFiles: input.relevantFiles,
      testStatusSummary: cleanTestStatus,
      knownUncertainties: cleanUncertainties
    });
  }
}

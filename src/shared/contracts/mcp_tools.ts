/**
 * Bhai Phase P4.2 — Tool Registry & Schema Contracts
 * Mappings between public Romanized-Hinglish tool names and internal TypeScript operations,
 * with strict Zod argument validation schemas, English descriptions, and scope requirements.
 */

import { z } from 'zod';
import {
  CHECKPOINT_MAX_PAYLOAD_BYTES,
  HANDOFF_MAX_DOCUMENT_BYTES,
  RECORD_MAX_CONTENT_BYTES,
  CheckpointTypeSchema,
  EvidenceRefSchema
} from '../contracts/memory_dto';

export type PublicToolName =
  | 'yebata'
  | 'dhoondh'
  | 'kaamkaha'
  | 'kahanthe'
  | 'servicesbata'
  | 'kyabadla'
  | 'yesavekar'
  | 'yaadrakh'
  | 'handoffsavekar';

export type InternalOperationName =
  | 'getContextPack'
  | 'searchMemory'
  | 'getTaskState'
  | 'getLatestHandoff'
  | 'getProjectServices'
  | 'getMemoryChanges'
  | 'recordCheckpoint'
  | 'proposeMemoryUpdate'
  | 'saveHandoff';

export type RequiredScope = 'read_memory' | 'write_checkpoints' | 'propose_decisions';

// ----------------------------------------------------------------------------
// 1. Tool Input Schemas
// ----------------------------------------------------------------------------

export const YebataInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  mode: z.enum(['quick', 'task', 'deep']).default('task'),
  taskId: z.string().optional(),
  maxTokens: z.number().int().positive().max(8000).optional()
});
export type YebataInput = z.infer<typeof YebataInputSchema>;

export const DhoondhInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  query: z.string().min(1).max(128),
  category: z.enum(['all', 'decisions', 'tasks', 'records']).default('all'),
  limit: z.number().int().positive().max(25).default(10)
});
export type DhoondhInput = z.infer<typeof DhoondhInputSchema>;

export const KaamkahaInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  taskId: z.string().min(1, 'Task ID is required')
});
export type KaamkahaInput = z.infer<typeof KaamkahaInputSchema>;

export const KahantheInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  taskId: z.string().optional()
});
export type KahantheInput = z.infer<typeof KahantheInputSchema>;

export const ServicesbataInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required')
});
export type ServicesbataInput = z.infer<typeof ServicesbataInputSchema>;

export const KyabadlaInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  sinceTimestamp: z.number().int().nonnegative()
});
export type KyabadlaInput = z.infer<typeof KyabadlaInputSchema>;

export const YesavekarInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  taskId: z.string().optional(),
  checkpointType: CheckpointTypeSchema.default('task.progress'),
  summary: z.string().min(1).max(256),
  payloadJson: z.record(z.string(), z.any()).optional().refine((val) => {
    if (!val) return true;
    const str = JSON.stringify(val);
    return Buffer.byteLength(str, 'utf8') <= CHECKPOINT_MAX_PAYLOAD_BYTES;
  }, `Checkpoint payload exceeds maximum allowed size of ${CHECKPOINT_MAX_PAYLOAD_BYTES} bytes (2 KiB)`),
  idempotencyKey: z.string().min(1).max(128).default(() => `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
  evidenceRefs: z.array(EvidenceRefSchema).max(10).optional()
});
export type YesavekarInput = z.infer<typeof YesavekarInputSchema>;

export const YaadrakhInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  category: z.enum(['architecture', 'convention', 'decision']),
  title: z.string().min(1).max(256),
  content: z.string().min(1).max(RECORD_MAX_CONTENT_BYTES),
  rationale: z.string().optional()
});
export type YaadrakhInput = z.infer<typeof YaadrakhInputSchema>;

export const HandoffsavekarInputSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  taskId: z.string().optional(),
  objective: z.string().min(1).max(1024),
  completedSummary: z.string().min(1).max(4096),
  remainingSummary: z.string().min(1).max(4096),
  blockersSummary: z.string().max(2048).optional(),
  decisionsSummary: z.string().max(2048).optional(),
  relevantFiles: z.array(z.string()).default([]),
  testStatusSummary: z.string().optional(),
  knownUncertainties: z.string().optional()
}).refine((data) => {
  const json = JSON.stringify(data);
  return Buffer.byteLength(json, 'utf8') <= HANDOFF_MAX_DOCUMENT_BYTES;
}, `Handoff document exceeds maximum allowed size of ${HANDOFF_MAX_DOCUMENT_BYTES} bytes (16 KiB)`);
export type HandoffsavekarInput = z.infer<typeof HandoffsavekarInputSchema>;

// ----------------------------------------------------------------------------
// 2. Tool Definition Registry
// ----------------------------------------------------------------------------

export interface ToolDefinition {
  publicName: PublicToolName;
  internalOperation: InternalOperationName;
  scope: RequiredScope;
  description: string;
  inputSchema: z.ZodType<any>;
}

export const BHAI_TOOLS: Record<PublicToolName, ToolDefinition> = {
  yebata: {
    publicName: 'yebata',
    internalOperation: 'getContextPack',
    scope: 'read_memory',
    description: '[START SESSION / MANDATORY FIRST STEP] get_project_context: Call IMMEDIATELY at the start of every session or task resumption to retrieve active tasks, architectural decisions, conventions, and blockers before reading files. (projectId is optional).',
    inputSchema: YebataInputSchema
  },
  dhoondh: {
    publicName: 'dhoondh',
    internalOperation: 'searchMemory',
    scope: 'read_memory',
    description: '[SEARCH MEMORY & DECISIONS] search_memory: Search project memory, architectural decisions, and tasks using SQLite FTS5 full-text search with BM25 ranking. (projectId is optional).',
    inputSchema: DhoondhInputSchema
  },
  kaamkaha: {
    publicName: 'kaamkaha',
    internalOperation: 'getTaskState',
    scope: 'read_memory',
    description: '[INSPECT TASK PROGRESS] get_task_progress: Inspect current progress, subtasks, blockers, and recent checkpoint history for a specific task. (projectId is optional).',
    inputSchema: KaamkahaInputSchema
  },
  kahanthe: {
    publicName: 'kahanthe',
    internalOperation: 'getLatestHandoff',
    scope: 'read_memory',
    description: '[CHECK PREVIOUS AGENT WORK] get_latest_handoff: Retrieve the most recent structured session handoff document saved by any coding agent for this project. (projectId is optional).',
    inputSchema: KahantheInputSchema
  },
  servicesbata: {
    publicName: 'servicesbata',
    internalOperation: 'getProjectServices',
    scope: 'read_memory',
    description: '[DISCOVER SERVICES & PORTS] list_project_services: Retrieve registered project dev services, ports, and package scripts configured in Phase P3. (projectId is optional).',
    inputSchema: ServicesbataInputSchema
  },
  kyabadla: {
    publicName: 'kyabadla',
    internalOperation: 'getMemoryChanges',
    scope: 'read_memory',
    description: '[SYNC RECENT CHANGES] get_memory_changes: Incremental context sync; fetch checkpoints, task changes, and decisions recorded since a given timestamp or revision. (projectId is optional).',
    inputSchema: KyabadlaInputSchema
  },
  yesavekar: {
    publicName: 'yesavekar',
    internalOperation: 'recordCheckpoint',
    scope: 'write_checkpoints',
    description: '[RECORD PROGRESS / MILESTONE] save_checkpoint: Call after completing any task phase, implementing a component, passing tests, or uncovering a blocker (<=2 KB). (projectId and idempotencyKey are optional).',
    inputSchema: YesavekarInputSchema
  },
  yaadrakh: {
    publicName: 'yaadrakh',
    internalOperation: 'proposeMemoryUpdate',
    scope: 'propose_decisions',
    description: '[PROPOSE ARCHITECTURAL DECISION] propose_decision: Propose a durable architectural rule, coding convention, or ADR candidate for developer review in Bhai UI. (projectId is optional).',
    inputSchema: YaadrakhInputSchema
  },
  handoffsavekar: {
    publicName: 'handoffsavekar',
    internalOperation: 'saveHandoff',
    scope: 'write_checkpoints',
    description: '[END SESSION / HANDOFF] save_handoff: Persist a comprehensive structured session handoff (<=16 KB) capturing completed work, pending tasks, dirty files, and test commands for the next agent. (projectId is optional).',
    inputSchema: HandoffsavekarInputSchema
  }
};

export const PUBLIC_TOOL_NAMES = Object.keys(BHAI_TOOLS) as PublicToolName[];

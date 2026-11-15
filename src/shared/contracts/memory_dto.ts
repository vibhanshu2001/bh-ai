/**
 * Bhai Phase P4 — Project Memory & Context Engine Domain Contracts
 * Typed interfaces and strict Zod validation schemas for memory entities,
 * checkpoints, handoffs, authorizations, and FTS5 search results.
 */

import { z } from 'zod';

// ============================================================================
// Enums & Primitive Literals
// ============================================================================

export const MemoryRecordCategorySchema = z.enum([
  'overview',
  'architecture',
  'convention',
  'directory_pointer',
  'constraint'
]);
export type MemoryRecordCategory = z.infer<typeof MemoryRecordCategorySchema>;

export const EpistemicTierSchema = z.enum([
  'observed_fact',
  'agent_claim',
  'user_approved',
  'historical'
]);
export type EpistemicTier = z.infer<typeof EpistemicTierSchema>;

export const ConfidenceLevelSchema = z.enum([
  'verified',
  'unverified',
  'approved',
  'disputed'
]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const AuthorTypeSchema = z.enum(['user', 'bhai_inspector', 'agent']);
export type AuthorType = z.infer<typeof AuthorTypeSchema>;

export const TaskStatusSchema = z.enum([
  'backlog',
  'in_progress',
  'blocked',
  'completed',
  'abandoned'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const DecisionStatusSchema = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'deprecated'
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const UserApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected'
]);
export type UserApprovalStatus = z.infer<typeof UserApprovalStatusSchema>;

export const CheckpointTypeSchema = z.enum([
  'task.started',
  'task.progress',
  'decision.proposed',
  'discovery.recorded',
  'files.modified',
  'evidence.recorded',
  'blocker.discovered',
  'blocker.resolved',
  'assumption.invalidated',
  'task.completed',
  'handoff.prepared'
]);
export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

export const ContextPackModeSchema = z.enum(['quick', 'task', 'deep']);
export type ContextPackMode = z.infer<typeof ContextPackModeSchema>;

export const EvidenceRefSchema = z.object({
  kind: z.enum(['file', 'commit', 'test_command', 'url']),
  reference: z.string().min(1).max(1024),
  summary: z.string().max(250).optional()
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ============================================================================
// Sizing Constants (Hard Enforceable Limits)
// ============================================================================

export const MEMORY_BOUNDS = {
  RECORD_MAX_TITLE: 128,
  RECORD_MAX_CONTENT_BYTES: 16 * 1024, // 16 KiB
  TASK_MAX_TITLE: 256,
  TASK_MAX_DESCRIPTION_BYTES: 4 * 1024, // 4 KiB
  DECISION_MAX_TITLE: 256,
  DECISION_MAX_CONTENT_BYTES: 16 * 1024, // 16 KiB combined
  CHECKPOINT_MAX_SUMMARY: 256,
  CHECKPOINT_MAX_PAYLOAD_BYTES: 2 * 1024, // 2 KiB strict payload cap
  CHECKPOINT_MAX_EVIDENCE_REFS: 10,
  CHECKPOINT_MAX_SESSION_QUOTA: 200,
  HANDOFF_MAX_DOCUMENT_BYTES: 16 * 1024, // 16 KiB total document
  CONTEXT_PACK_MAX_TOKENS_CEILING: 4000,
  FTS_MAX_QUERY_LENGTH: 128
} as const;

export const RECORD_MAX_CONTENT_BYTES = MEMORY_BOUNDS.RECORD_MAX_CONTENT_BYTES;
export const CHECKPOINT_MAX_PAYLOAD_BYTES = MEMORY_BOUNDS.CHECKPOINT_MAX_PAYLOAD_BYTES;
export const CHECKPOINT_MAX_SESSION_QUOTA = MEMORY_BOUNDS.CHECKPOINT_MAX_SESSION_QUOTA;
export const HANDOFF_MAX_DOCUMENT_BYTES = MEMORY_BOUNDS.HANDOFF_MAX_DOCUMENT_BYTES;

// ============================================================================
// Entity Schemas & Types
// ============================================================================

// 1. Memory Record
export const MemoryRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  category: MemoryRecordCategorySchema,
  title: z.string().min(1).max(MEMORY_BOUNDS.RECORD_MAX_TITLE),
  content: z.string().max(MEMORY_BOUNDS.RECORD_MAX_CONTENT_BYTES),
  tier: EpistemicTierSchema.default('agent_claim'),
  confidence: ConfidenceLevelSchema.default('unverified'),
  authorType: AuthorTypeSchema,
  authorId: z.string().min(1),
  revision: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

// 2. Memory Task
export const MemoryTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(MEMORY_BOUNDS.TASK_MAX_TITLE),
  description: z.string().max(MEMORY_BOUNDS.TASK_MAX_DESCRIPTION_BYTES),
  status: TaskStatusSchema.default('backlog'),
  assignedAgent: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(3).default(2),
  blockersSummary: z.string().nullable().optional(),
  completionEvidence: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type MemoryTask = z.infer<typeof MemoryTaskSchema>;

// 3. Memory Decision (ADR)
export const MemoryDecisionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(MEMORY_BOUNDS.DECISION_MAX_TITLE),
  status: DecisionStatusSchema.default('proposed'),
  context: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES),
  decision: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES),
  consequences: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES),
  authorType: AuthorTypeSchema,
  authorId: z.string().min(1),
  userApprovalStatus: UserApprovalStatusSchema.default('pending'),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type MemoryDecision = z.infer<typeof MemoryDecisionSchema>;

// 4. Memory Checkpoint
export const MemoryCheckpointSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  sessionId: z.string().min(1),
  clientName: z.string().min(1),
  checkpointType: CheckpointTypeSchema,
  summary: z.string().min(1).max(MEMORY_BOUNDS.CHECKPOINT_MAX_SUMMARY),
  payloadJson: z.string().max(MEMORY_BOUNDS.CHECKPOINT_MAX_PAYLOAD_BYTES),
  idempotencyKey: z.string().min(1),
  clientSequence: z.number().int().nullable().optional(),
  evidenceRefsJson: z.string().nullable().optional(),
  tier: z.enum(['agent_claim', 'observed_fact']).default('agent_claim'),
  createdAt: z.number().int()
});
export type MemoryCheckpoint = z.infer<typeof MemoryCheckpointSchema>;

// 5. Memory Handoff
export const MemoryHandoffSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  sessionId: z.string().min(1),
  authorClient: z.string().min(1),
  objective: z.string().min(1).max(4096),
  completedSummary: z.string().min(1).max(8192),
  remainingSummary: z.string().min(1).max(8192),
  blockersSummary: z.string().nullable().optional(),
  decisionsSummary: z.string().nullable().optional(),
  relevantFilesJson: z.string().default('[]'),
  testStatusSummary: z.string().nullable().optional(),
  knownUncertainties: z.string().nullable().optional(),
  createdAt: z.number().int()
});
export type MemoryHandoff = z.infer<typeof MemoryHandoffSchema>;

// 6. MCP Authorization
export const McpAuthorizationSchema = z.object({
  id: z.string().min(1),
  clientName: z.string().min(1),
  projectId: z.string().min(1),
  tokenHash: z.string().min(1),
  scopes: z.string().min(1), // comma-separated scopes: 'read_memory,write_checkpoints,propose_decisions'
  isRevoked: z.boolean().default(false),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable().optional()
});
export type McpAuthorization = z.infer<typeof McpAuthorizationSchema>;

// 7. Context Cache
export const ContextCacheSchema = z.object({
  projectId: z.string().min(1),
  packMode: ContextPackModeSchema,
  contentHash: z.string().min(1),
  contextText: z.string(),
  estimatedTokens: z.number().int().nonnegative(),
  cachedAt: z.number().int(),
  expiresAt: z.number().int()
});
export type ContextCache = z.infer<typeof ContextCacheSchema>;

// ============================================================================
// Input / Mutation Schemas
// ============================================================================

export const CreateRecordInputSchema = z.object({
  projectId: z.string().min(1),
  category: MemoryRecordCategorySchema,
  title: z.string().min(1).max(MEMORY_BOUNDS.RECORD_MAX_TITLE),
  content: z.string().max(MEMORY_BOUNDS.RECORD_MAX_CONTENT_BYTES),
  tier: EpistemicTierSchema.optional().default('agent_claim'),
  confidence: ConfidenceLevelSchema.optional().default('unverified'),
  authorType: AuthorTypeSchema,
  authorId: z.string().min(1)
});
export type CreateRecordInput = z.input<typeof CreateRecordInputSchema>;

export const UpdateRecordInputSchema = z.object({
  title: z.string().min(1).max(MEMORY_BOUNDS.RECORD_MAX_TITLE).optional(),
  content: z.string().max(MEMORY_BOUNDS.RECORD_MAX_CONTENT_BYTES).optional(),
  tier: EpistemicTierSchema.optional(),
  confidence: ConfidenceLevelSchema.optional(),
  isActive: z.boolean().optional()
});
export type UpdateRecordInput = z.input<typeof UpdateRecordInputSchema>;

export const CreateTaskInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(MEMORY_BOUNDS.TASK_MAX_TITLE),
  description: z.string().max(MEMORY_BOUNDS.TASK_MAX_DESCRIPTION_BYTES).optional().default(''),
  status: TaskStatusSchema.optional().default('backlog'),
  assignedAgent: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(3).optional().default(2),
  blockersSummary: z.string().nullable().optional(),
  completionEvidence: z.string().nullable().optional()
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).max(MEMORY_BOUNDS.TASK_MAX_TITLE).optional(),
  description: z.string().max(MEMORY_BOUNDS.TASK_MAX_DESCRIPTION_BYTES).optional(),
  status: TaskStatusSchema.optional(),
  assignedAgent: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  blockersSummary: z.string().nullable().optional(),
  completionEvidence: z.string().nullable().optional()
});
export type UpdateTaskInput = z.input<typeof UpdateTaskInputSchema>;

export const CreateDecisionInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(MEMORY_BOUNDS.DECISION_MAX_TITLE),
  status: DecisionStatusSchema.optional().default('proposed'),
  context: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES),
  decision: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES),
  consequences: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES).optional().default(''),
  authorType: AuthorTypeSchema,
  authorId: z.string().min(1),
  userApprovalStatus: UserApprovalStatusSchema.optional().default('pending')
});
export type CreateDecisionInput = z.input<typeof CreateDecisionInputSchema>;

export const UpdateDecisionInputSchema = z.object({
  title: z.string().min(1).max(MEMORY_BOUNDS.DECISION_MAX_TITLE).optional(),
  status: DecisionStatusSchema.optional(),
  context: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES).optional(),
  decision: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES).optional(),
  consequences: z.string().max(MEMORY_BOUNDS.DECISION_MAX_CONTENT_BYTES).optional(),
  userApprovalStatus: UserApprovalStatusSchema.optional()
});
export type UpdateDecisionInput = z.input<typeof UpdateDecisionInputSchema>;

export const RecordCheckpointInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  sessionId: z.string().min(1),
  clientName: z.string().min(1),
  checkpointType: CheckpointTypeSchema,
  summary: z.string().min(1).max(MEMORY_BOUNDS.CHECKPOINT_MAX_SUMMARY),
  payloadJson: z.string().max(MEMORY_BOUNDS.CHECKPOINT_MAX_PAYLOAD_BYTES).optional().default('{}'),
  idempotencyKey: z.string().min(1),
  clientSequence: z.number().int().nullable().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).max(MEMORY_BOUNDS.CHECKPOINT_MAX_EVIDENCE_REFS).optional(),
  tier: z.enum(['agent_claim', 'observed_fact']).optional().default('agent_claim')
});
export type RecordCheckpointInput = z.input<typeof RecordCheckpointInputSchema>;

export const SaveHandoffInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().nullable().optional(),
  sessionId: z.string().min(1),
  authorClient: z.string().min(1),
  objective: z.string().min(1),
  completedSummary: z.string().min(1),
  remainingSummary: z.string().min(1),
  blockersSummary: z.string().nullable().optional(),
  decisionsSummary: z.string().nullable().optional(),
  relevantFiles: z.array(z.string()).optional().default([]),
  testStatusSummary: z.string().nullable().optional(),
  knownUncertainties: z.string().nullable().optional()
}).refine(
  (data) => {
    // Total document size check (<= 16 KiB)
    const jsonStr = JSON.stringify(data);
    return Buffer.byteLength(jsonStr, 'utf8') <= MEMORY_BOUNDS.HANDOFF_MAX_DOCUMENT_BYTES;
  },
  {
    message: `Total handoff document size exceeds ${MEMORY_BOUNDS.HANDOFF_MAX_DOCUMENT_BYTES} bytes cap`
  }
);
export type SaveHandoffInput = z.input<typeof SaveHandoffInputSchema>;

export const SearchMemoryInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1).max(MEMORY_BOUNDS.FTS_MAX_QUERY_LENGTH),
  category: z.enum(['all', 'records', 'decisions', 'tasks']).optional().default('all'),
  limit: z.number().int().min(1).max(25).optional().default(10)
});
export type SearchMemoryInput = z.input<typeof SearchMemoryInputSchema>;

export interface MemorySearchResult {
  entityId: string;
  projectId: string;
  entityType: 'record' | 'decision' | 'task';
  title: string;
  snippet: string;
  rank: number;
}

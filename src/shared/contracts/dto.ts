import { z } from 'zod';

export const ChatDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(128),
  createdAt: z.number(),
  updatedAt: z.number()
});
export type ChatDto = z.infer<typeof ChatDtoSchema>;

export const MessageDtoSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  chatSeq: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant', 'system']),
  kind: z.enum(['text', 'result', 'unsupported', 'error', 'clarify', 'negated']),
  body: z.string().max(65536),
  payload: z.any().optional(),
  createdAt: z.number()
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const ClarificationCandidateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: z.string().optional()
});
export type ClarificationCandidate = z.infer<typeof ClarificationCandidateSchema>;

export const ClarificationDraftDtoSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  commandId: z.string().optional(),
  originalText: z.string(),
  question: z.string().min(1),
  candidates: z.array(ClarificationCandidateSchema),
  expiresAt: z.number(),
  status: z.enum(['pending', 'resolved', 'expired', 'invalidated'])
});
export type ClarificationDraftDto = z.infer<typeof ClarificationDraftDtoSchema>;

export const ClarificationSelectRequestSchema = z.object({
  chatId: z.string().min(1),
  draftId: z.string().min(1),
  candidateId: z.string().min(1)
});
export type ClarificationSelectRequest = z.infer<typeof ClarificationSelectRequestSchema>;

export const AliasDtoSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().min(1).max(128),
  normalizedPhrase: z.string().min(1).max(128),
  targetKind: z.enum(['action', 'workflow', 'app', 'project']),
  targetId: z.string().min(1),
  bindings: z.record(z.string(), z.any()).optional(),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number()
});
export type AliasDto = z.infer<typeof AliasDtoSchema>;

export const AliasCreateRequestSchema = z.object({
  phrase: z.string().min(1).max(128),
  targetKind: z.enum(['action', 'workflow', 'app', 'project']),
  targetId: z.string().min(1),
  bindings: z.record(z.string(), z.any()).optional()
});
export type AliasCreateRequest = z.infer<typeof AliasCreateRequestSchema>;

export const AliasDeleteRequestSchema = z.object({
  id: z.string().min(1)
});
export type AliasDeleteRequest = z.infer<typeof AliasDeleteRequestSchema>;

export const AliasUpdateRequestSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().min(1).max(128).optional(),
  targetKind: z.enum(['action', 'workflow', 'app', 'project']).optional(),
  targetId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  bindings: z.record(z.string(), z.any()).optional()
});
export type AliasUpdateRequest = z.infer<typeof AliasUpdateRequestSchema>;

export const MemoryInspectResultSchema = z.object({
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
  activeBytes: z.number().nonnegative().optional(),
  inactiveBytes: z.number().nonnegative().optional(),
  wiredBytes: z.number().nonnegative().optional(),
  usedPercent: z.number().min(0).max(100),
  timestamp: z.number()
});
export type MemoryInspectResult = z.infer<typeof MemoryInspectResultSchema>;

export const CommandSubmitRequestSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1).max(2048)
});
export type CommandSubmitRequest = z.infer<typeof CommandSubmitRequestSchema>;

export const CommandSubmitResponseSchema = z.object({
  ok: z.boolean(),
  userMessage: MessageDtoSchema,
  assistantMessage: MessageDtoSchema,
  disposition: z.enum(['resolved', 'clarify', 'negated', 'unsupported', 'invalid']).optional(),
  result: MemoryInspectResultSchema.optional(),
  clarification: ClarificationDraftDtoSchema.optional(),
  diagnostics: z.record(z.string(), z.any()).optional(),
  error: z.string().optional()
});
export type CommandSubmitResponse = z.infer<typeof CommandSubmitResponseSchema>;

export const ChatCreateRequestSchema = z.object({
  title: z.string().min(1).max(128).optional()
});
export type ChatCreateRequest = z.infer<typeof ChatCreateRequestSchema>;

export const ChatRenameRequestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(128)
});
export type ChatRenameRequest = z.infer<typeof ChatRenameRequestSchema>;

export const ChatDeleteRequestSchema = z.object({
  id: z.string().min(1)
});
export type ChatDeleteRequest = z.infer<typeof ChatDeleteRequestSchema>;

export const ChatGetMessagesRequestSchema = z.object({
  chatId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(50),
  beforeSeq: z.number().int().nonnegative().optional()
});
export type ChatGetMessagesRequest = z.infer<typeof ChatGetMessagesRequestSchema>;

// --- Phase P3 Project Registry & Developer Context DTOs ---

export const ServiceDefinitionDtoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(64),
  serviceType: z.string().min(1).max(32).default('custom'),
  relativeCwd: z.string().min(1).default('.'),
  packageScript: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  readinessJson: z.record(z.string(), z.any()).optional().nullable(),
  portConfidence: z.enum(['configured', 'inferred']).optional()
});
export type ServiceDefinitionDto = z.infer<typeof ServiceDefinitionDtoSchema>;

export const ServiceDtoSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1).max(64),
  serviceType: z.string().min(1).max(32),
  relativeCwd: z.string().min(1),
  packageScript: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  readiness: z.record(z.string(), z.any()).optional().nullable(),
  portConfidence: z.enum(['configured', 'inferred']).optional(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number()
});
export type ServiceDto = z.infer<typeof ServiceDtoSchema>;

export const ProjectInspectionResultSchema = z.object({
  canonicalPath: z.string().min(1),
  displayName: z.string().min(1),
  isGitRepo: z.boolean(),
  gitBranch: z.string().optional().nullable(),
  technologies: z.array(z.string()),
  packageManager: z.string().optional().nullable(),
  isMonorepo: z.boolean(),
  services: z.array(ServiceDefinitionDtoSchema),
  rawMetadata: z.record(z.string(), z.any()).optional()
});
export type ProjectInspectionResult = z.infer<typeof ProjectInspectionResultSchema>;

export const ProjectDtoSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(128),
  canonicalRoot: z.string().min(1),
  rootGrantId: z.string().optional().nullable(),
  availability: z.enum(['available', 'missing', 'moved', 'removed', 'unregistered', 'archived']),
  archivedAt: z.number().optional().nullable(),
  detectedMetadata: z.record(z.string(), z.any()).optional().nullable(),
  services: z.array(ServiceDtoSchema).optional(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number()
});
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const ProjectCreateRequestSchema = z.object({
  displayName: z.string().min(1).max(128),
  canonicalRoot: z.string().min(1),
  detectedMetadata: z.record(z.string(), z.any()).optional(),
  services: z.array(ServiceDefinitionDtoSchema).optional()
});
export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;

export const ProjectUpdateRequestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(128).optional(),
  services: z.array(ServiceDefinitionDtoSchema).optional()
});
export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequestSchema>;

export const ProjectDeleteRequestSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().optional()
});
export type ProjectDeleteRequest = z.infer<typeof ProjectDeleteRequestSchema>;

export const ProjectInspectRequestSchema = z.object({
  directoryPath: z.string().min(1)
});
export type ProjectInspectRequest = z.infer<typeof ProjectInspectRequestSchema>;

export const ProjectGitInfoRequestSchema = z.object({
  projectId: z.string().min(1)
});
export type ProjectGitInfoRequest = z.infer<typeof ProjectGitInfoRequestSchema>;

export const ProjectGitInfoDtoSchema = z.object({
  isGitRepo: z.boolean(),
  root: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  isClean: z.boolean(),
  modifiedCount: z.number().int().nonnegative(),
  untrackedCount: z.number().int().nonnegative(),
  isDetachedHead: z.boolean().optional()
});
export type ProjectGitInfoDto = z.infer<typeof ProjectGitInfoDtoSchema>;

export const ProjectOpenEditorRequestSchema = z.object({
  projectId: z.string().min(1)
});
export type ProjectOpenEditorRequest = z.infer<typeof ProjectOpenEditorRequestSchema>;

export const ProjectOpenTerminalRequestSchema = z.object({
  projectId: z.string().min(1)
});
export type ProjectOpenTerminalRequest = z.infer<typeof ProjectOpenTerminalRequestSchema>;


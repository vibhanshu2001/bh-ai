/**
 * Bhai Phase P4.2 — Tool Registry & Execution Broker
 * Maps public MCP tool calls to utility process repositories,
 * checking permissions and enforcing size boundaries.
 */

import { MemoryRepository } from '../storage/memory_repository';
import { ProjectRepository } from '../storage/project_repository';
import { CheckpointPipeline } from './checkpoint_pipeline';
import { ContextPackGenerator } from '../memory/context_pack_generator';
import {
  BHAI_TOOLS,
  PublicToolName,
  YebataInputSchema,
  DhoondhInputSchema,
  KaamkahaInputSchema,
  KahantheInputSchema,
  ServicesbataInputSchema,
  KyabadlaInputSchema,
  YesavekarInputSchema,
  YaadrakhInputSchema,
  HandoffsavekarInputSchema
} from '../../shared/contracts/mcp_tools';

export interface ToolExecutionContext {
  clientName: string;
  projectId: string;
  scopes: string[];
  sessionId?: string;
}

export class ToolRegistry {
  private memoryRepo: MemoryRepository;
  private projectRepo: ProjectRepository;
  private checkpointPipeline: CheckpointPipeline;
  private contextPackGenerator: ContextPackGenerator;

  constructor(memoryRepo: MemoryRepository, projectRepo: ProjectRepository) {
    this.memoryRepo = memoryRepo;
    this.projectRepo = projectRepo;
    this.checkpointPipeline = new CheckpointPipeline(memoryRepo);
    this.contextPackGenerator = new ContextPackGenerator(memoryRepo, projectRepo);
  }

  public async executeTool(
    toolName: string,
    args: any,
    context: ToolExecutionContext
  ): Promise<any> {
    const ALIAS_MAP: Record<string, PublicToolName> = {
      get_project_context: 'yebata',
      get_context_pack: 'yebata',
      save_checkpoint: 'yesavekar',
      record_milestone: 'yesavekar',
      save_handoff: 'handoffsavekar',
      record_handoff: 'handoffsavekar',
      search_memory: 'dhoondh',
      find_memory: 'dhoondh',
      propose_decision: 'yaadrakh',
      save_memory: 'yaadrakh',
      get_task_progress: 'kaamkaha',
      get_latest_handoff: 'kahanthe',
      list_project_services: 'servicesbata',
      list_services: 'servicesbata',
      get_memory_changes: 'kyabadla'
    };
    const resolvedName = (ALIAS_MAP[toolName] || toolName) as PublicToolName;
    const def = BHAI_TOOLS[resolvedName];
    if (!def) {
      throw new Error(`UNKNOWN_TOOL: Tool '${toolName}' is not registered under Bhai MCP`);
    }

    // 1. Auto-fill omitted projectId and checkpoint defaults
    if (!args) args = {};
    if (!args.projectId && context.projectId) {
      args.projectId = context.projectId;
    }
    if (resolvedName === 'yesavekar') {
      if (!args.checkpointType) args.checkpointType = 'task.progress';
      if (!args.idempotencyKey) {
        args.idempotencyKey = `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }
    }

    // 2. Verify Scope
    if (!context.scopes.includes(def.scope)) {
      throw new Error(
        `PERMISSION_DENIED: Client '${context.clientName}' lacks required scope '${def.scope}' for tool '${toolName}'`
      );
    }

    // 3. Verify Target Project Matches Authorization Context
    if (args?.projectId && args.projectId !== context.projectId) {
      throw new Error(
        `PERMISSION_DENIED: Client token authorized for project '${context.projectId}' cannot access '${args.projectId}'`
      );
    }

    // 3. Dispatch to operation
    switch (def.publicName) {
      case 'yebata': {
        const validated = YebataInputSchema.parse(args);
        return this.getContextPack(validated, context);
      }

      case 'dhoondh': {
        const validated = DhoondhInputSchema.parse(args);
        return this.searchMemory(validated, context);
      }

      case 'kaamkaha': {
        const validated = KaamkahaInputSchema.parse(args);
        return this.getTaskState(validated, context);
      }

      case 'kahanthe': {
        const validated = KahantheInputSchema.parse(args);
        return this.getLatestHandoff(validated, context);
      }

      case 'servicesbata': {
        const validated = ServicesbataInputSchema.parse(args);
        return this.getProjectServices(validated, context);
      }

      case 'kyabadla': {
        const validated = KyabadlaInputSchema.parse(args);
        return this.getMemoryChanges(validated, context);
      }

      case 'yesavekar': {
        const validated = YesavekarInputSchema.parse(args);
        const sessionId = context.sessionId || 'default_session';
        return this.checkpointPipeline.processCheckpoint(context.clientName, sessionId, validated);
      }

      case 'yaadrakh': {
        const validated = YaadrakhInputSchema.parse(args);
        return this.proposeMemoryUpdate(validated, context);
      }

      case 'handoffsavekar': {
        const validated = HandoffsavekarInputSchema.parse(args);
        const sessionId = context.sessionId || 'default_session';
        const handoff = this.checkpointPipeline.processHandoff(context.clientName, sessionId, validated);
        return {
          handoffId: handoff.id,
          status: 'saved',
          createdAt: handoff.createdAt
        };
      }

      default:
        throw new Error(`UNIMPLEMENTED_TOOL: Tool '${toolName}' handler not found`);
    }
  }

  // --------------------------------------------------------------------------
  // Internal Operations
  // --------------------------------------------------------------------------

  private async getContextPack(input: any, context: ToolExecutionContext): Promise<any> {
    const packResult = await this.contextPackGenerator.generatePack({
      projectId: input.projectId,
      mode: input.mode,
      taskId: input.taskId,
      maxTokens: input.maxTokens
    });

    return {
      projectId: packResult.projectId,
      mode: packResult.mode,
      estimatedTokens: packResult.estimatedTokens,
      content: packResult.content,
      freshnessTimestamp: packResult.freshnessTimestamp,
      cached: packResult.cached
    };
  }

  private async searchMemory(input: any, context: ToolExecutionContext): Promise<any> {
    const results = this.memoryRepo.searchMemory({
      projectId: input.projectId,
      query: input.query,
      category: input.category,
      limit: input.limit
    });

    return {
      query: input.query,
      count: results.length,
      results: results.map((r) => ({
        id: r.entityId,
        type: r.entityType,
        title: r.title,
        snippet: r.snippet,
        rank: r.rank
      }))
    };
  }

  private async getTaskState(input: any, context: ToolExecutionContext): Promise<any> {
    const task = this.memoryRepo.getTask(input.taskId);
    if (!task || task.projectId !== input.projectId) {
      throw new Error(`Task '${input.taskId}' not found for project '${input.projectId}'`);
    }

    const checkpoints = this.memoryRepo.listCheckpoints(input.projectId, {
      taskId: input.taskId,
      limit: 10
    });

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        assignedAgent: task.assignedAgent,
        priority: task.priority,
        blockersSummary: task.blockersSummary,
        completionEvidence: task.completionEvidence,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        recentCheckpoints: checkpoints.map((c) => ({
          id: c.id,
          type: c.checkpointType,
          summary: c.summary,
          clientName: c.clientName,
          timestamp: c.createdAt
        }))
      }
    };
  }

  private async getLatestHandoff(input: any, context: ToolExecutionContext): Promise<any> {
    const handoff = this.memoryRepo.getLatestHandoff(input.projectId, input.taskId);
    if (!handoff) {
      return { handoff: null };
    }

    let relevantFiles: string[] = [];
    try {
      relevantFiles = JSON.parse(handoff.relevantFilesJson);
    } catch {
      relevantFiles = [];
    }

    return {
      handoff: {
        id: handoff.id,
        sessionId: handoff.sessionId,
        authorClient: handoff.authorClient,
        objective: handoff.objective,
        completedSummary: handoff.completedSummary,
        remainingSummary: handoff.remainingSummary,
        blockersSummary: handoff.blockersSummary,
        decisionsSummary: handoff.decisionsSummary,
        relevantFiles,
        testStatusSummary: handoff.testStatusSummary,
        knownUncertainties: handoff.knownUncertainties,
        createdAt: handoff.createdAt
      }
    };
  }

  private async getProjectServices(input: any, context: ToolExecutionContext): Promise<any> {
    const services = this.projectRepo.listServicesForProject(input.projectId);
    return {
      projectId: input.projectId,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        serviceType: s.serviceType,
        relativeCwd: s.relativeCwd,
        port: s.port,
        packageScript: s.packageScript
      }))
    };
  }

  private async getMemoryChanges(input: any, context: ToolExecutionContext): Promise<any> {
    const checkpoints = this.memoryRepo.listCheckpoints(input.projectId, {
      sinceTimestamp: input.sinceTimestamp,
      limit: 50
    });

    const tasks = this.memoryRepo.listTasks(input.projectId).filter((t) => t.updatedAt > input.sinceTimestamp);
    const records = this.memoryRepo.listRecords(input.projectId).filter((r) => r.updatedAt > input.sinceTimestamp);
    const decisions = this.memoryRepo.listDecisions(input.projectId).filter((d) => d.updatedAt > input.sinceTimestamp);

    const changes = [
      ...checkpoints.map((c) => ({
        entity: 'checkpoint',
        id: c.id,
        type: c.checkpointType,
        summary: c.summary,
        timestamp: c.createdAt
      })),
      ...tasks.map((t) => ({
        entity: 'task',
        id: t.id,
        title: t.title,
        status: t.status,
        timestamp: t.updatedAt
      })),
      ...records.map((r) => ({
        entity: 'record',
        id: r.id,
        category: r.category,
        title: r.title,
        timestamp: r.updatedAt
      })),
      ...decisions.map((d) => ({
        entity: 'decision',
        id: d.id,
        title: d.title,
        status: d.status,
        timestamp: d.updatedAt
      }))
    ];

    changes.sort((a, b) => b.timestamp - a.timestamp);

    return {
      projectId: input.projectId,
      sinceTimestamp: input.sinceTimestamp,
      count: changes.length,
      changes,
      hasMore: false
    };
  }

  private async proposeMemoryUpdate(input: any, context: ToolExecutionContext): Promise<any> {
    if (input.category === 'decision') {
      const decision = this.memoryRepo.createDecision({
        projectId: input.projectId,
        title: input.title,
        status: 'proposed',
        context: input.rationale || 'Proposed by AI coding agent via yaadrakh tool',
        decision: input.content,
        consequences: 'Pending developer review',
        authorType: 'agent',
        authorId: context.clientName
      });
      return {
        proposalId: decision.id,
        category: 'decision',
        status: 'pending_user_approval',
        message: 'Architectural decision proposal submitted for review in Bhai Memory UI'
      };
    }

    const record = this.memoryRepo.createRecord({
      projectId: input.projectId,
      category: input.category === 'architecture' ? 'architecture' : 'convention',
      title: input.title,
      content: input.content,
      tier: 'agent_claim',
      confidence: 'unverified',
      authorType: 'agent',
      authorId: context.clientName
    });

    return {
      proposalId: record.id,
      category: record.category,
      status: 'pending_user_approval',
      message: 'Memory update proposal submitted for review in Bhai Memory UI'
    };
  }
}

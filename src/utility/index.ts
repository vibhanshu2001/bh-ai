import { DatabaseConnection } from './storage/connection';
import { ChatRepository } from './storage/chat_repository';
import { ExecutionRepository } from './storage/execution_repository';
import { AliasRepository } from './storage/alias_repository';
import { ClarificationRepository } from './storage/clarification_repository';
import { ProjectRepository } from './storage/project_repository';
import { MemoryRepository } from './storage/memory_repository';
import { ToolRegistry } from './mcp/tool_registry';
import { SafeProjectInspector } from './inspector/project_inspector';
import { GitInspector } from './inspector/git_inspector';
import { SafeLauncher } from './launcher/safe_launcher';
import { MinimalCommandExecutor } from './engine/executor';
import { MemoryInspectAction } from './actions/memory_action';
import { IpcRequest, IpcResponse } from '../shared/types';

let dbConn: DatabaseConnection | null = null;
let chatRepo: ChatRepository | null = null;
let execRepo: ExecutionRepository | null = null;
let aliasRepo: AliasRepository | null = null;
let clarificationRepo: ClarificationRepository | null = null;
let projectRepo: ProjectRepository | null = null;
let memoryRepo: MemoryRepository | null = null;
let toolRegistry: ToolRegistry | null = null;
let projectInspector: SafeProjectInspector | null = null;
let safeLauncher: SafeLauncher | null = null;
let executor: MinimalCommandExecutor | null = null;
const memoryAction = new MemoryInspectAction();

export function initializeEngine(dbPath: string): void {
  dbConn = new DatabaseConnection(dbPath);
  const db = dbConn.open();
  chatRepo = new ChatRepository(db);
  execRepo = new ExecutionRepository(db);
  aliasRepo = new AliasRepository(db);
  clarificationRepo = new ClarificationRepository(db);
  projectRepo = new ProjectRepository(db);
  memoryRepo = new MemoryRepository(db);
  toolRegistry = new ToolRegistry(memoryRepo, projectRepo);
  projectInspector = new SafeProjectInspector();
  safeLauncher = new SafeLauncher(projectRepo);
  executor = new MinimalCommandExecutor(chatRepo, execRepo, aliasRepo, clarificationRepo, projectRepo);
}

export function getMemoryRepository(): MemoryRepository {
  if (!memoryRepo) throw new Error('Engine not initialized');
  return memoryRepo;
}

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistry) throw new Error('Engine not initialized');
  return toolRegistry;
}

export function getChatRepository(): ChatRepository {
  if (!chatRepo) throw new Error('Engine not initialized');
  return chatRepo;
}

export function getAliasRepository(): AliasRepository {
  if (!aliasRepo) throw new Error('Engine not initialized');
  return aliasRepo;
}

export function getClarificationRepository(): ClarificationRepository {
  if (!clarificationRepo) throw new Error('Engine not initialized');
  return clarificationRepo;
}

export function getProjectRepository(): ProjectRepository {
  if (!projectRepo) throw new Error('Engine not initialized');
  return projectRepo;
}

export function getProjectInspector(): SafeProjectInspector {
  if (!projectInspector) throw new Error('Engine not initialized');
  return projectInspector;
}

export function getSafeLauncher(): SafeLauncher {
  if (!safeLauncher) throw new Error('Engine not initialized');
  return safeLauncher;
}

export function getExecutor(): MinimalCommandExecutor {
  if (!executor) throw new Error('Engine not initialized');
  return executor;
}

async function handleRequest(req: IpcRequest): Promise<IpcResponse> {
  try {
    switch (req.channel) {
      case 'ping':
        return {
          id: req.id,
          ok: true,
          data: {
            pong: true,
            pid: process.pid,
            versions: process.versions,
            arch: process.arch,
            platform: process.platform
          }
        };

      case 'engine.init': {
        const { dbPath } = req.payload;
        initializeEngine(dbPath);
        return {
          id: req.id,
          ok: true,
          data: {
            initialized: true,
            dbPath,
            integrity: dbConn?.checkIntegrity()
          }
        };
      }

      case 'chat.list': {
        const repo = getChatRepository();
        let chats = repo.listChats();
        if (chats.length === 0) {
          const defaultChat = repo.createChat('General');
          chats = [defaultChat];
        }
        return { id: req.id, ok: true, data: chats };
      }

      case 'chat.create': {
        const repo = getChatRepository();
        const chat = repo.createChat(req.payload?.title);
        return { id: req.id, ok: true, data: chat };
      }

      case 'chat.rename': {
        const repo = getChatRepository();
        const chat = repo.renameChat(req.payload.id, req.payload.title);
        return { id: req.id, ok: true, data: chat };
      }

      case 'chat.delete': {
        const repo = getChatRepository();
        repo.deleteChat(req.payload.id);
        return { id: req.id, ok: true, data: { deleted: true } };
      }

      case 'chat.get': {
        const repo = getChatRepository();
        const chat = repo.getChat(req.payload.id);
        return { id: req.id, ok: true, data: chat };
      }

      case 'chat.messages': {
        const repo = getChatRepository();
        const messages = repo.getMessages(req.payload.chatId, req.payload.limit, req.payload.beforeSeq);
        return { id: req.id, ok: true, data: messages };
      }

      case 'command.submit': {
        const exec = getExecutor();
        const response = await exec.executeCommand(req.payload.chatId, req.payload.text);
        return { id: req.id, ok: true, data: response };
      }

      case 'clarify.select': {
        const exec = getExecutor();
        const response = await exec.selectClarification(
          req.payload.chatId,
          req.payload.draftId,
          req.payload.candidateId
        );
        return { id: req.id, ok: true, data: response };
      }

      case 'alias.list': {
        const repo = getAliasRepository();
        const aliases = repo.listAliases();
        return { id: req.id, ok: true, data: aliases };
      }

      case 'alias.create': {
        const repo = getAliasRepository();
        const alias = repo.createAlias(req.payload);
        return { id: req.id, ok: true, data: alias };
      }

      case 'alias.update': {
        const repo = getAliasRepository();
        const alias = repo.updateAlias(req.payload.id, req.payload);
        return { id: req.id, ok: true, data: alias };
      }

      case 'alias.delete': {
        const repo = getAliasRepository();
        repo.deleteAlias(req.payload.id);
        return { id: req.id, ok: true, data: { deleted: true } };
      }

      // --- Phase P3 Project Registry & Developer Context Handlers ---

      case 'project.inspect': {
        const inspector = getProjectInspector();
        const inspection = await inspector.inspectDirectory(req.payload.directoryPath);
        return { id: req.id, ok: true, data: inspection };
      }

      case 'project.list': {
        const repo = getProjectRepository();
        const projects = repo.listProjects();
        return { id: req.id, ok: true, data: projects };
      }

      case 'project.get': {
        const repo = getProjectRepository();
        const project = repo.getProject(req.payload.id);
        return { id: req.id, ok: true, data: project };
      }

      case 'project.create': {
        const repo = getProjectRepository();
        const project = repo.createProject(req.payload);
        return { id: req.id, ok: true, data: project };
      }

      case 'project.update': {
        const repo = getProjectRepository();
        const project = repo.updateProject(req.payload.id, req.payload);
        return { id: req.id, ok: true, data: project };
      }

      case 'project.delete': {
        const repo = getProjectRepository();
        const result = repo.deleteProject(req.payload.id, req.payload.chatId);
        return { id: req.id, ok: true, data: result };
      }

      case 'project.git-info': {
        const repo = getProjectRepository();
        const project = repo.getProject(req.payload.projectId);
        if (!project) throw new Error(`Project '${req.payload.projectId}' not found`);
        const gitInfo = GitInspector.inspectRepository(project.canonicalRoot);
        return { id: req.id, ok: true, data: gitInfo };
      }

      case 'project.open-editor': {
        const launcher = getSafeLauncher();
        const result = await launcher.openInEditor(req.payload.projectId);
        return { id: req.id, ok: true, data: result };
      }

      case 'project.open-terminal': {
        const launcher = getSafeLauncher();
        const result = await launcher.openInTerminal(req.payload.projectId);
        return { id: req.id, ok: true, data: result };
      }

      case 'project.reveal-in-finder': {
        const launcher = getSafeLauncher();
        const result = await launcher.revealInFinder(req.payload.projectId);
        return { id: req.id, ok: true, data: result };
      }

      case 'system.memory': {
        const mem = await memoryAction.execute();
        return { id: req.id, ok: true, data: mem };
      }

      // --- Phase P4.2 MCP Integration & Tool Execution Handlers ---

      case 'mcp.tool-call': {
        const registry = getToolRegistry();
        const { toolName, args, context } = req.payload;
        const result = await registry.executeTool(toolName, args, context);
        return { id: req.id, ok: true, data: result };
      }

      case 'mcp.auth-verify': {
        const mem = getMemoryRepository();
        const { clientName, projectId, tokenHash } = req.payload;
        const auth = mem.getAuthorization(clientName, projectId);
        if (!auth || auth.isRevoked || auth.tokenHash !== tokenHash) {
          return { id: req.id, ok: true, data: { authorized: false } };
        }
        mem.recordAuthorizationUsage(clientName, projectId);
        return {
          id: req.id,
          ok: true,
          data: {
            authorized: true,
            clientName: auth.clientName,
            projectId: auth.projectId,
            scopes: auth.scopes
          }
        };
      }

      case 'mcp.auth-create': {
        const mem = getMemoryRepository();
        const auth = mem.createAuthorization(req.payload);
        return { id: req.id, ok: true, data: auth };
      }

      case 'mcp.auth-list': {
        const mem = getMemoryRepository();
        const auths = mem.listAuthorizations(req.payload.projectId);
        return { id: req.id, ok: true, data: auths };
      }

      case 'mcp.auth-revoke': {
        const mem = getMemoryRepository();
        const revoked = mem.revokeAuthorization(req.payload.clientName, req.payload.projectId);
        return { id: req.id, ok: true, data: { revoked } };
      }

      // --- Phase P4.4 Memory Hub Operations ---

      case 'memory.overview': {
        const mem = getMemoryRepository();
        const proj = getProjectRepository();
        const { projectId } = req.payload;
        const project = proj.getProject(projectId);
        const recordsCount = mem.listRecords(projectId).length;
        const decisions = mem.listDecisions(projectId);
        const tasks = mem.listTasks(projectId);
        const handoffsCount = mem.countHandoffs(projectId);
        const latestHandoff = mem.getLatestHandoff(projectId);
        const auths = mem.listAuthorizations(projectId);

        return {
          id: req.id,
          ok: true,
          data: {
            project,
            recordsCount,
            decisionsCount: decisions.length,
            pendingDecisionsCount: decisions.filter((d) => d.userApprovalStatus === 'pending').length,
            tasksCount: tasks.length,
            activeTasksCount: tasks.filter((t) => t.status === 'in_progress').length,
            blockedTasksCount: tasks.filter((t) => t.status === 'blocked').length,
            handoffsCount,
            latestHandoff,
            activeAgentsCount: auths.filter((a) => !a.isRevoked).length
          }
        };
      }

      case 'memory.records.list': {
        const mem = getMemoryRepository();
        const records = mem.listRecords(req.payload.projectId, req.payload.filter);
        return { id: req.id, ok: true, data: records };
      }

      case 'memory.record.save': {
        const mem = getMemoryRepository();
        const { id, ...data } = req.payload;
        let record;
        if (id) {
          record = mem.updateRecord(id, data);
        } else {
          record = mem.createRecord(data);
        }
        return { id: req.id, ok: true, data: record };
      }

      case 'memory.record.delete': {
        const mem = getMemoryRepository();
        const deleted = mem.deleteRecord(req.payload.id);
        return { id: req.id, ok: true, data: { deleted } };
      }

      case 'memory.decisions.list': {
        const mem = getMemoryRepository();
        const decisions = mem.listDecisions(req.payload.projectId, req.payload.status);
        return { id: req.id, ok: true, data: decisions };
      }

      case 'memory.decision.save': {
        const mem = getMemoryRepository();
        const { id, ...data } = req.payload;
        let decision;
        if (id) {
          decision = mem.updateDecision(id, data);
        } else {
          decision = mem.createDecision(data);
        }
        return { id: req.id, ok: true, data: decision };
      }

      case 'memory.decision.approve': {
        const mem = getMemoryRepository();
        const { id, approved } = req.payload;
        const decision = mem.updateDecision(id, {
          userApprovalStatus: approved ? 'approved' : 'rejected',
          status: approved ? 'accepted' : 'rejected'
        });
        return { id: req.id, ok: true, data: decision };
      }

      case 'memory.tasks.list': {
        const mem = getMemoryRepository();
        const tasks = mem.listTasks(req.payload.projectId, req.payload.filter);
        return { id: req.id, ok: true, data: tasks };
      }

      case 'memory.task.save': {
        const mem = getMemoryRepository();
        const { id, ...data } = req.payload;
        let task;
        if (id) {
          task = mem.updateTask(id, data);
        } else {
          task = mem.createTask(data);
        }
        return { id: req.id, ok: true, data: task };
      }

      case 'memory.handoffs.list': {
        const mem = getMemoryRepository();
        const handoffs = mem.listHandoffs(req.payload.projectId, req.payload.limit ?? 20, req.payload.offset ?? 0);
        const total = mem.countHandoffs(req.payload.projectId);
        return { id: req.id, ok: true, data: { handoffs, total } };
      }

      case 'memory.checkpoints.list': {
        const mem = getMemoryRepository();
        const checkpoints = mem.listCheckpoints(req.payload.projectId, req.payload.filter);
        return { id: req.id, ok: true, data: checkpoints };
      }

      case 'memory.compaction.run': {
        const mem = getMemoryRepository();
        const proj = getProjectRepository();
        const { projectId } = req.payload;
        const compactor = new (require('./memory/deterministic_compactor').DeterministicCompactor)();
        const checkpoints = mem.listCheckpoints(projectId, { limit: 200 });
        const decisions = mem.listDecisions(projectId);
        const tasks = mem.listTasks(projectId);

        const startTime = Date.now();
        const result = compactor.compact({ checkpoints, decisions, tasks });
        const durationMs = Date.now() - startTime;

        // Invalidate pack cache
        mem.invalidateCache(projectId);

        return {
          id: req.id,
          ok: true,
          data: {
            ...result,
            durationMs
          }
        };
      }

      case 'memory.storage.metrics': {
        const mem = getMemoryRepository();
        const { projectId } = req.payload;
        const checkpointsCount = mem.listCheckpoints(projectId).length;
        const handoffsCount = mem.countHandoffs(projectId);
        const recordsCount = mem.listRecords(projectId).length;
        const decisionsCount = mem.listDecisions(projectId).length;
        const tasksCount = mem.listTasks(projectId).length;

        return {
          id: req.id,
          ok: true,
          data: {
            checkpointsCount,
            handoffsCount,
            recordsCount,
            decisionsCount,
            tasksCount
          }
        };
      }

      default:
        return {
          id: req.id,
          ok: false,
          error: { code: 'UNKNOWN_CHANNEL', message: `Unknown channel: ${req.channel}` }
        };
    }
  } catch (err: any) {
    return {
      id: req.id,
      ok: false,
      error: { code: 'ENGINE_ERROR', message: err?.message || String(err) }
    };
  }
}

// Wire up parentPort for Electron utilityProcess
if (process.parentPort) {
  process.parentPort.on('message', async (event) => {
    const req = event.data as IpcRequest;
    const res = await handleRequest(req);
    process.parentPort.postMessage(res);
  });
}

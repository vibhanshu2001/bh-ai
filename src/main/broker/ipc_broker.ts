import { ipcMain, BrowserWindow, dialog } from 'electron';
import { UtilityProcessManager } from './utility_manager';
import { IPC_CHANNELS } from '../../shared/contracts/channels';
import { AgentInstaller } from '../mcp/agent_installer';
import { createHash, randomBytes } from 'node:crypto';
import {
  ChatCreateRequestSchema,
  ChatRenameRequestSchema,
  ChatDeleteRequestSchema,
  ChatGetMessagesRequestSchema,
  CommandSubmitRequestSchema,
  ClarificationSelectRequestSchema,
  AliasCreateRequestSchema,
  AliasUpdateRequestSchema,
  AliasDeleteRequestSchema,
  ProjectCreateRequestSchema,
  ProjectUpdateRequestSchema,
  ProjectDeleteRequestSchema,
  ProjectInspectRequestSchema,
  ProjectGitInfoRequestSchema,
  ProjectOpenEditorRequestSchema,
  ProjectOpenTerminalRequestSchema
} from '../../shared/contracts/dto';

export class IpcBroker {
  private utilityManager: UtilityProcessManager;
  private allowedWindowGetter: () => BrowserWindow | null;

  constructor(utilityManager: UtilityProcessManager, allowedWindowGetter: () => BrowserWindow | null) {
    this.utilityManager = utilityManager;
    this.allowedWindowGetter = allowedWindowGetter;
  }

  public register(): void {
    // Helper to validate sender frame and origin
    const validateSender = (event: Electron.IpcMainInvokeEvent) => {
      const allowedWin = this.allowedWindowGetter();
      if (!allowedWin || event.sender !== allowedWin.webContents) {
        throw new Error('Unauthorized sender: IPC request from untrusted frame');
      }
    };

    // Chat List
    ipcMain.handle(IPC_CHANNELS.CHAT_LIST, async (event) => {
      validateSender(event);
      return this.utilityManager.send('chat.list');
    });

    // Chat Create
    ipcMain.handle(IPC_CHANNELS.CHAT_CREATE, async (event, payload) => {
      validateSender(event);
      const parsed = ChatCreateRequestSchema.safeParse(payload || {});
      if (!parsed.success) throw new Error(`Invalid create chat payload: ${parsed.error.message}`);
      return this.utilityManager.send('chat.create', parsed.data);
    });

    // Chat Rename
    ipcMain.handle(IPC_CHANNELS.CHAT_RENAME, async (event, payload) => {
      validateSender(event);
      const parsed = ChatRenameRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid rename chat payload: ${parsed.error.message}`);
      return this.utilityManager.send('chat.rename', parsed.data);
    });

    // Chat Delete
    ipcMain.handle(IPC_CHANNELS.CHAT_DELETE, async (event, payload) => {
      validateSender(event);
      const parsed = ChatDeleteRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid delete chat payload: ${parsed.error.message}`);
      return this.utilityManager.send('chat.delete', parsed.data);
    });

    // Chat Get
    ipcMain.handle(IPC_CHANNELS.CHAT_GET, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('chat.get', { id: payload.id });
    });

    // Chat Messages
    ipcMain.handle(IPC_CHANNELS.CHAT_MESSAGES, async (event, payload) => {
      validateSender(event);
      const parsed = ChatGetMessagesRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid get messages payload: ${parsed.error.message}`);
      return this.utilityManager.send('chat.messages', parsed.data);
    });

    // Command Submit
    ipcMain.handle(IPC_CHANNELS.COMMAND_SUBMIT, async (event, payload) => {
      validateSender(event);
      const parsed = CommandSubmitRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid submit command payload: ${parsed.error.message}`);
      return this.utilityManager.send('command.submit', parsed.data);
    });

    // Direct Memory Query
    ipcMain.handle(IPC_CHANNELS.SYSTEM_MEMORY, async (event) => {
      validateSender(event);
      return this.utilityManager.send('system.memory');
    });

    // Clarification Select
    ipcMain.handle(IPC_CHANNELS.CLARIFY_SELECT, async (event, payload) => {
      validateSender(event);
      const parsed = ClarificationSelectRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid clarify select payload: ${parsed.error.message}`);
      return this.utilityManager.send('clarify.select', parsed.data);
    });

    // Alias List
    ipcMain.handle(IPC_CHANNELS.ALIAS_LIST, async (event) => {
      validateSender(event);
      return this.utilityManager.send('alias.list');
    });

    // Alias Create
    ipcMain.handle(IPC_CHANNELS.ALIAS_CREATE, async (event, payload) => {
      validateSender(event);
      const parsed = AliasCreateRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid create alias payload: ${parsed.error.message}`);
      return this.utilityManager.send('alias.create', parsed.data);
    });

    // Alias Update
    ipcMain.handle(IPC_CHANNELS.ALIAS_UPDATE, async (event, payload) => {
      validateSender(event);
      const parsed = AliasUpdateRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid update alias payload: ${parsed.error.message}`);
      return this.utilityManager.send('alias.update', parsed.data);
    });

    // Alias Delete
    ipcMain.handle(IPC_CHANNELS.ALIAS_DELETE, async (event, payload) => {
      validateSender(event);
      const parsed = AliasDeleteRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid delete alias payload: ${parsed.error.message}`);
      return this.utilityManager.send('alias.delete', parsed.data);
    });

    // --- Phase P3 Project Onboarding, Registry, Git & Launcher Handlers ---

    // Native macOS Directory Picker
    ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_DIRECTORY, async (event) => {
      validateSender(event);
      const allowedWin = this.allowedWindowGetter();
      const res = await dialog.showOpenDialog(allowedWin || undefined as any, {
        title: 'Select Project Directory to Onboard',
        properties: ['openDirectory', 'createDirectory']
      });

      if (res.canceled || res.filePaths.length === 0) {
        return { canceled: true, directoryPath: null };
      }

      return { canceled: false, directoryPath: res.filePaths[0] };
    });

    // Project Inspect
    ipcMain.handle(IPC_CHANNELS.PROJECT_INSPECT, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectInspectRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project inspect payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.inspect', parsed.data);
    });

    // Project List
    ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async (event) => {
      validateSender(event);
      return this.utilityManager.send('project.list');
    });

    // Project Get
    ipcMain.handle(IPC_CHANNELS.PROJECT_GET, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('project.get', { id: payload.id });
    });

    // Project Create
    ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectCreateRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project create payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.create', parsed.data);
    });

    // Project Update
    ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectUpdateRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project update payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.update', parsed.data);
    });

    // Project Delete
    ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectDeleteRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project delete payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.delete', parsed.data);
    });

    // Project Git Info
    ipcMain.handle(IPC_CHANNELS.PROJECT_GIT_INFO, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectGitInfoRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project git info payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.git-info', parsed.data);
    });

    // Project Open Editor
    ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_EDITOR, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectOpenEditorRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project open editor payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.open-editor', parsed.data);
    });

    // Project Open Terminal
    ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_TERMINAL, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectOpenTerminalRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project open terminal payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.open-terminal', parsed.data);
    });

    // Project Reveal in Finder
    ipcMain.handle(IPC_CHANNELS.PROJECT_REVEAL_IN_FINDER, async (event, payload) => {
      validateSender(event);
      const parsed = ProjectOpenEditorRequestSchema.safeParse(payload);
      if (!parsed.success) throw new Error(`Invalid project reveal payload: ${parsed.error.message}`);
      return this.utilityManager.send('project.reveal-in-finder', parsed.data);
    });

    // --- Phase P4.4 Memory Hub Handlers ---

    ipcMain.handle(IPC_CHANNELS.MEMORY_OVERVIEW, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.overview', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_RECORDS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.records.list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_RECORD_SAVE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.record.save', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_RECORD_DELETE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.record.delete', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_DECISIONS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.decisions.list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_DECISION_SAVE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.decision.save', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_DECISION_APPROVE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.decision.approve', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_TASKS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.tasks.list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_TASK_SAVE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.task.save', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_HANDOFFS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.handoffs.list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_CHECKPOINTS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.checkpoints.list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_AUTHS_LIST, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('mcp.auth-list', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_AUTH_REVOKE, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('mcp.auth-revoke', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_COMPACTION_RUN, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.compaction.run', payload);
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_STORAGE_METRICS, async (event, payload) => {
      validateSender(event);
      return this.utilityManager.send('memory.storage.metrics', payload);
    });

    // --- Phase P4 Agent Integration & Guiding Skill Handlers ---
    ipcMain.handle(IPC_CHANNELS.AGENT_INSTALL_SKILL, async (event, payload) => {
      validateSender(event);
      const installer = new AgentInstaller();
      return installer.installGuidingSkill({
        projectRoot: payload?.projectRoot !== undefined ? payload.projectRoot : process.cwd(),
        global: payload?.global !== false,
        projectId: payload?.projectId || 'default',
        targets: payload?.targets || ['antigravity', 'codex', 'claude-code', 'cursor']
      });
    });

    ipcMain.handle(IPC_CHANNELS.AGENT_STATUS, async (event) => {
      validateSender(event);
      const installer = new AgentInstaller();
      return installer.discoverInstalledAgents();
    });

    ipcMain.handle(IPC_CHANNELS.AGENT_CONNECT_PROJECT, async (event, payload) => {
      validateSender(event);
      if (!payload?.projectRoot || !payload?.projectId) {
        throw new Error('projectRoot and projectId are required');
      }

      const projectId = payload.projectId;
      const token = payload.token || randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      // Auto-provision authorizations in SQLite for all 4 clients
      const clients = ['antigravity', 'codex', 'claude-code', 'cursor'];
      for (const clientName of clients) {
        try {
          await this.utilityManager.send('mcp.auth-create', {
            clientName,
            projectId,
            tokenHash,
            scopes: ['read_memory', 'write_checkpoints', 'propose_decisions', 'read', 'write']
          });
        } catch (e) {
          console.error(`Failed to provision MCP auth for ${clientName}:`, e);
        }
      }

      const installer = new AgentInstaller();
      return installer.installAllToProject({
        projectRoot: payload.projectRoot,
        projectId: payload.projectId,
        token
      });
    });
  }
}


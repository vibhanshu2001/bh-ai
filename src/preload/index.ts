import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/contracts/channels';
import {
  ChatDto,
  MessageDto,
  CommandSubmitResponse,
  MemoryInspectResult
} from '../shared/contracts/dto';

const bhaiApi = {
  chat: {
    list: (): Promise<ChatDto[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_LIST);
    },
    create: (title?: string): Promise<ChatDto> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_CREATE, { title });
    },
    rename: (id: string, title: string): Promise<ChatDto> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_RENAME, { id, title });
    },
    delete: (id: string): Promise<{ deleted: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_DELETE, { id });
    },
    get: (id: string): Promise<ChatDto> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_GET, { id });
    },
    getMessages: (chatId: string, limit = 50, beforeSeq?: number): Promise<MessageDto[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CHAT_MESSAGES, { chatId, limit, beforeSeq });
    }
  },
  command: {
    submit: (chatId: string, text: string): Promise<CommandSubmitResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS.COMMAND_SUBMIT, { chatId, text });
    }
  },
  clarify: {
    select: (chatId: string, draftId: string, candidateId: string): Promise<CommandSubmitResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CLARIFY_SELECT, { chatId, draftId, candidateId });
    }
  },
  alias: {
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ALIAS_LIST);
    },
    create: (req: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ALIAS_CREATE, req);
    },
    update: (req: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ALIAS_UPDATE, req);
    },
    delete: (id: string): Promise<{ deleted: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ALIAS_DELETE, { id });
    }
  },
  project: {
    selectDirectory: (): Promise<{ canceled: boolean; directoryPath: string | null }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SELECT_DIRECTORY);
    },
    inspect: (directoryPath: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_INSPECT, { directoryPath });
    },
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST);
    },
    get: (id: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, { id });
    },
    create: (req: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, req);
    },
    update: (req: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, req);
    },
    delete: (id: string, chatId?: string): Promise<{ deleted: boolean; projectName?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, { id, chatId });
    },
    getGitInfo: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GIT_INFO, { projectId });
    },
    openEditor: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_EDITOR, { projectId });
    },
    openTerminal: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_TERMINAL, { projectId });
    },
    revealInFinder: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REVEAL_IN_FINDER, { projectId });
    }
  },
  memory: {
    overview: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_OVERVIEW, { projectId });
    },
    listRecords: (projectId: string, filter?: any): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RECORDS_LIST, { projectId, filter });
    },
    saveRecord: (record: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RECORD_SAVE, record);
    },
    deleteRecord: (id: string): Promise<{ deleted: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_RECORD_DELETE, { id });
    },
    listDecisions: (projectId: string, status?: string): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DECISIONS_LIST, { projectId, status });
    },
    saveDecision: (decision: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DECISION_SAVE, decision);
    },
    approveDecision: (id: string, approved: boolean): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DECISION_APPROVE, { id, approved });
    },
    listTasks: (projectId: string, filter?: any): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_TASKS_LIST, { projectId, filter });
    },
    saveTask: (task: any): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_TASK_SAVE, task);
    },
    listHandoffs: (projectId: string, limit?: number, offset?: number): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_HANDOFFS_LIST, { projectId, limit, offset });
    },
    listCheckpoints: (projectId: string, filter?: any): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CHECKPOINTS_LIST, { projectId, filter });
    },
    listAuthorizations: (projectId: string): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_AUTHS_LIST, { projectId });
    },
    revokeAuthorization: (clientName: string, projectId: string): Promise<{ revoked: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_AUTH_REVOKE, { clientName, projectId });
    },
    runCompaction: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_COMPACTION_RUN, { projectId });
    },
    getStorageMetrics: (projectId: string): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_STORAGE_METRICS, { projectId });
    }
  },
  agent: {
    installSkill: (opts?: { projectRoot?: string; global?: boolean; projectId?: string; targets?: string[] }): Promise<{ installedTargets: string[]; installedFiles: string[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_INSTALL_SKILL, opts);
    },
    getStatus: (): Promise<any[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_STATUS);
    },
    connectProject: (opts: { projectRoot: string; projectId: string; token?: string }): Promise<{ installedTargets: string[]; installedFiles: string[]; mcpConfigsUpdated: string[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AGENT_CONNECT_PROJECT, opts);
    }
  },
  system: {
    getMemory: (): Promise<MemoryInspectResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_MEMORY);
    }
  },
  app: {
    hide: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.APP_HIDE);
    },
    quit: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT);
    },
    setHeight: (height: number): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE, { height });
    },
    setDimensions: (width: number, height: number): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE, { width, height });
    }
  },
  onChatCreated: (callback: (chat: ChatDto) => void) => {
    const handler = (_event: any, chat: ChatDto) => callback(chat);
    ipcRenderer.on('bhai:chat:created', handler);
    return () => ipcRenderer.removeListener('bhai:chat:created', handler);
  }
};

contextBridge.exposeInMainWorld('bhaiApi', Object.freeze(bhaiApi));

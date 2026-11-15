import { ChatDto, MessageDto, CommandSubmitResponse, MemoryInspectResult } from '../shared/contracts/dto';

export interface BhaiApiBridge {
  chat: {
    list: () => Promise<ChatDto[]>;
    create: (title?: string) => Promise<ChatDto>;
    rename: (id: string, title: string) => Promise<ChatDto>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
    get: (id: string) => Promise<ChatDto>;
    getMessages: (chatId: string, limit?: number, beforeSeq?: number) => Promise<MessageDto[]>;
  };
  command: {
    submit: (chatId: string, text: string) => Promise<CommandSubmitResponse>;
  };
  clarify: {
    select: (chatId: string, draftId: string, candidateId: string) => Promise<CommandSubmitResponse>;
  };
  alias: {
    list: () => Promise<any[]>;
    create: (req: any) => Promise<any>;
    update?: (req: any) => Promise<any>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
  };
  project: {
    selectDirectory: () => Promise<{ canceled: boolean; directoryPath: string | null }>;
    inspect: (directoryPath: string) => Promise<any>;
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (req: any) => Promise<any>;
    update: (req: any) => Promise<any>;
    delete: (id: string, chatId?: string) => Promise<{ deleted: boolean; projectName?: string }>;
    getGitInfo: (projectId: string) => Promise<any>;
    openEditor: (projectId: string) => Promise<any>;
    openTerminal: (projectId: string) => Promise<any>;
    revealInFinder: (projectId: string) => Promise<{ success: boolean; message: string }>;
  };
  memory: {
    overview: (projectId: string) => Promise<any>;
    listRecords: (projectId: string, filter?: any) => Promise<any[]>;
    saveRecord: (record: any) => Promise<any>;
    deleteRecord: (id: string) => Promise<{ deleted: boolean }>;
    listDecisions: (projectId: string, status?: string) => Promise<any[]>;
    saveDecision: (decision: any) => Promise<any>;
    approveDecision: (id: string, approved: boolean) => Promise<any>;
    listTasks: (projectId: string, filter?: any) => Promise<any[]>;
    saveTask: (task: any) => Promise<any>;
    listHandoffs: (projectId: string, limit?: number, offset?: number) => Promise<any>;
    listCheckpoints: (projectId: string, filter?: any) => Promise<any[]>;
    listAuthorizations: (projectId: string) => Promise<any[]>;
    revokeAuthorization: (clientName: string, projectId: string) => Promise<{ revoked: boolean }>;
    runCompaction: (projectId: string) => Promise<any>;
    getStorageMetrics: (projectId: string) => Promise<any>;
  };
  agent: {
    installSkill: (opts?: { projectRoot?: string; global?: boolean; projectId?: string; targets?: string[] }) => Promise<{ installedTargets: string[]; installedFiles: string[] }>;
    getStatus: () => Promise<any[]>;
    connectProject: (opts: { projectRoot: string; projectId: string; token?: string }) => Promise<{ installedTargets: string[]; installedFiles: string[]; mcpConfigsUpdated: string[] }>;
  };
  system: {
    getMemory: () => Promise<MemoryInspectResult>;
  };
  app: {
    hide: () => Promise<void>;
    quit: () => Promise<void>;
    setHeight: (height: number) => Promise<void>;
    setDimensions?: (width: number, height: number) => Promise<void>;
  };
  onChatCreated: (callback: (chat: ChatDto) => void) => () => void;
}

declare global {
  interface Window {
    bhaiApi: BhaiApiBridge;
  }
}

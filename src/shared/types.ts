export interface ChatRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatContextRecord {
  chatId: string;
  projectId: string | null;
  serviceId: string | null;
  updatedAt: number;
}

export interface CommandRecord {
  id: string;
  chatId: string;
  sequence: number;
  rawInput: string;
  disposition: 'resolved' | 'clarify' | 'negated' | 'unsupported' | 'invalid';
  createdAt: number;
}

export interface RunRecord {
  id: string;
  chatId: string;
  commandId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'unknown';
  intentRecordedAt: number;
  completedAt: number | null;
}

export interface StepRecord {
  id: string;
  runId: string;
  stepIndex: number;
  actionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface AttemptRecord {
  id: string;
  stepId: string;
  attemptNumber: number;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  status: 'running' | 'succeeded' | 'failed' | 'timed_out';
}

export interface EventRecord {
  id: string;
  runId: string;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

export interface IpcRequest {
  id: string;
  channel: string;
  payload: any;
}

export interface IpcResponse {
  id: string;
  ok: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
}

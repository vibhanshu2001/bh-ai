import { utilityProcess, UtilityProcess, app } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';
import { IpcRequest, IpcResponse } from '../../shared/types';

export class UtilityProcessManager {
  private engineProcess: UtilityProcess | null = null;
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private isInitialized = false;

  public start(): UtilityProcess {
    if (this.engineProcess) {
      return this.engineProcess;
    }

    const utilityPath = path.join(__dirname, '../../utility/index.js');
    this.engineProcess = utilityProcess.fork(utilityPath, [], {
      serviceName: 'bhai-engine'
    });

    this.engineProcess.on('message', (res: IpcResponse) => {
      if (res && res.id && this.pendingRequests.has(res.id)) {
        const { resolve, reject, timer } = this.pendingRequests.get(res.id)!;
        clearTimeout(timer);
        this.pendingRequests.delete(res.id);

        if (res.ok) {
          resolve(res.data);
        } else {
          reject(new Error(res.error?.message || 'Utility process error'));
        }
      }
    });

    this.engineProcess.on('exit', (code) => {
      this.engineProcess = null;
      this.isInitialized = false;

      // Fail all pending requests
      for (const [id, req] of this.pendingRequests.entries()) {
        clearTimeout(req.timer);
        req.reject(new Error(`Utility engine exited with code ${code}`));
        this.pendingRequests.delete(id);
      }
    });

    return this.engineProcess;
  }

  public async initializeStorage(): Promise<void> {
    if (this.isInitialized) return;

    const dbPath = path.join(app.getPath('userData'), 'bhai.sqlite');
    await this.send('engine.init', { dbPath });
    this.isInitialized = true;
  }

  public send(channel: string, payload: any = {}): Promise<any> {
    const proc = this.start();
    const id = `req_${crypto.randomUUID()}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout waiting for utility response on channel: ${channel}`));
        }
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: IpcRequest = { id, channel, payload };
      proc.postMessage(request);
    });
  }

  public stop(): void {
    if (this.engineProcess) {
      this.engineProcess.kill();
      this.engineProcess = null;
      this.isInitialized = false;
    }
  }
}

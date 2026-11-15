/**
 * Bhai Phase P4.2 — MCP Capability Broker
 * Listens on a restricted local Unix domain socket (/tmp/bhai-<uid>/broker.sock, mode 0600),
 * authenticates client handshake tokens against SQLite via UtilityProcess,
 * and routes JSON-RPC tool calls to the UtilityProcess ToolRegistry.
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { UtilityProcessManager } from './utility_manager';

export function getBrokerSocketPath(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  const sockDir = path.join(os.tmpdir(), `bhai-${uid}`);
  if (!fs.existsSync(sockDir)) {
    fs.mkdirSync(sockDir, { mode: 0o700, recursive: true });
  }
  return path.join(sockDir, 'broker.sock');
}

export class McpBroker {
  private utilityManager: UtilityProcessManager;
  private server: net.Server | null = null;
  private socketPath: string;

  constructor(utilityManager: UtilityProcessManager, socketPath?: string) {
    this.utilityManager = utilityManager;
    this.socketPath = socketPath || getBrokerSocketPath();
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up stale socket file if any
      try {
        if (fs.existsSync(this.socketPath)) {
          fs.unlinkSync(this.socketPath);
        }
      } catch {
        // ignore
      }

      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch {
          // ignore
        }
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        try {
          if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
          }
        } catch {
          // ignore
        }
        this.server = null;
        resolve();
      });
    });
  }

  private handleClient(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line);
          const res = await this.dispatch(req);
          socket.write(JSON.stringify(res) + '\n');
        } catch (err: any) {
          socket.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message: err?.message || 'Internal broker error' }
            }) + '\n'
          );
        }
      }
    });
  }

  public async dispatch(req: any): Promise<any> {
    // 1. Verify Handshake / Bearer Token
    const { token, clientName, projectId, action, payload } = req;

    if (action === 'ping') {
      return { ok: true, pong: true, time: Date.now() };
    }

    if (!token || !clientName || !projectId) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing token, clientName, or projectId' }
      };
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const authVerifyRes: any = await this.utilityManager.send('mcp.auth-verify', {
      clientName,
      projectId,
      tokenHash
    });

    if (!authVerifyRes || !authVerifyRes.authorized) {
      return {
        ok: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `Client '${clientName}' is not authorized for project '${projectId}' or token is revoked`
        }
      };
    }

    const context = {
      clientName: authVerifyRes.clientName,
      projectId: authVerifyRes.projectId,
      scopes: authVerifyRes.scopes,
      sessionId: req.sessionId
    };

    if (action === 'tool-call') {
      try {
        const result: any = await this.utilityManager.send('mcp.tool-call', {
          toolName: payload.toolName,
          args: payload.args,
          context
        });
        return { ok: true, data: result };
      } catch (err: any) {
        return {
          ok: false,
          error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || String(err) }
        };
      }
    }

    return {
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: `Action '${action}' is not supported by MCP broker` }
    };
  }
}

#!/usr/bin/env node
/**
 * Bhai Phase P4.2 — Local Stdio MCP Bridge
 * Standard JSON-RPC 2.0 stdio server spawned by coding agents (Claude Code, Codex, Cursor).
 * Exposes the 9 public Romanized-Hinglish tools under server namespace "bhai".
 * Communicates with Bhai Engine over local domain socket (/tmp/bhai-<uid>/broker.sock).
 */

import readline from 'node:readline';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { BHAI_TOOLS, PUBLIC_TOOL_NAMES, PublicToolName } from '../shared/contracts/mcp_tools';

export function getBrokerSocketPath(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
  return path.join(os.tmpdir(), `bhai-${uid}`, 'broker.sock');
}

export interface StdioBridgeOptions {
  clientName?: string;
  projectId?: string;
  token?: string;
  sessionId?: string;
  socketPath?: string;
}

export class StdioBridge {
  private clientName: string;
  private projectId: string;
  private token: string;
  private sessionId: string;
  private socketPath: string;

  constructor(options: StdioBridgeOptions = {}) {
    this.clientName = options.clientName || process.env.BHAI_CLIENT_NAME || 'generic-agent';
    this.projectId = options.projectId || process.env.BHAI_PROJECT_ID || '';
    this.token = options.token || process.env.BHAI_MCP_TOKEN || '';
    this.sessionId = options.sessionId || process.env.BHAI_SESSION_ID || `sess_${Date.now()}`;
    this.socketPath = options.socketPath || getBrokerSocketPath();
  }

  public setProject(projectId: string): void {
    this.projectId = projectId;
  }

  public setToken(token: string): void {
    this.token = token;
  }

  public setClientName(clientName: string): void {
    this.clientName = clientName;
  }

  public start(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const req = JSON.parse(line);
        const res = await this.handleJsonRpc(req);
        if (res) {
          process.stdout.write(JSON.stringify(res) + '\n');
        }
      } catch (err: any) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: Invalid JSON' }
          }) + '\n'
        );
      }
    });
  }

  public async handleJsonRpc(req: any): Promise<any> {
    const { id, method, params } = req;

    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'bhai',
              version: '0.1.0'
            },
            capabilities: {
              tools: {
                listChanged: false
              }
            }
          }
        };
      }

      case 'notifications/initialized': {
        // Notification, no response
        return null;
      }

      case 'ping': {
        return {
          jsonrpc: '2.0',
          id,
          result: {}
        };
      }

      case 'tools/list': {
        const tools = PUBLIC_TOOL_NAMES.map((name) => {
          const def = BHAI_TOOLS[name];
          return {
            name: def.publicName,
            description: def.description,
            inputSchema: this.getJsonSchema(def.publicName)
          };
        });

        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools
          }
        };
      }

      case 'tools/call': {
        const rawToolName = params?.name;
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
        const toolName = (ALIAS_MAP[rawToolName] || rawToolName) as PublicToolName;
        const args = params?.arguments || {};

        // Merge projectId if omitted in arguments
        if (!args.projectId && this.projectId) {
          args.projectId = this.projectId;
        }

        // Auto-fill defaults for yesavekar
        if (toolName === 'yesavekar') {
          if (!args.checkpointType) {
            args.checkpointType = 'task.progress';
          }
          if (!args.idempotencyKey) {
            args.idempotencyKey = `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          }
        }

        try {
          const brokerRes = await this.callBroker('tool-call', {
            toolName,
            args
          });

          if (!brokerRes.ok) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: brokerRes.error?.message || 'Tool execution failed'
              }
            };
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof brokerRes.data === 'string' ? brokerRes.data : JSON.stringify(brokerRes.data, null, 2)
                }
              ]
            }
          };
        } catch (err: any) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Bhai broker connection error: ${err?.message || String(err)}`
            }
          };
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method '${method}' not found`
          }
        };
    }
  }

  public callBroker(action: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ path: this.socketPath });

      let responseData = '';

      socket.on('connect', () => {
        const msg = JSON.stringify({
          action,
          clientName: this.clientName,
          projectId: this.projectId,
          token: this.token,
          sessionId: this.sessionId,
          payload
        });
        socket.write(msg + '\n');
      });

      socket.on('data', (chunk) => {
        responseData += chunk.toString('utf8');
        if (responseData.includes('\n')) {
          socket.end();
        }
      });

      socket.on('end', () => {
        try {
          const res = JSON.parse(responseData.trim());
          resolve(res);
        } catch (err) {
          reject(new Error(`Failed to parse broker response: ${responseData}`));
        }
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  private getJsonSchema(toolName: PublicToolName): any {
    switch (toolName) {
      case 'yebata':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected from connection)' },
            mode: { type: 'string', enum: ['quick', 'task', 'deep'], default: 'task', description: 'Context granularity' },
            taskId: { type: 'string', description: 'Optional active task ID' },
            maxTokens: { type: 'integer', maximum: 8000, description: 'Token budget for context pack' }
          },
          required: []
        };

      case 'dhoondh':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' },
            query: { type: 'string', minLength: 1, maxLength: 128, description: 'Search keywords or phrases' },
            category: { type: 'string', enum: ['all', 'decisions', 'tasks', 'records'], default: 'all' },
            limit: { type: 'integer', default: 10, maximum: 25 }
          },
          required: ['query']
        };

      case 'kaamkaha':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' },
            taskId: { type: 'string', description: 'Target task ID to inspect' }
          },
          required: ['taskId']
        };

      case 'kahanthe':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' },
            taskId: { type: 'string', description: 'Optional task ID' }
          },
          required: []
        };

      case 'servicesbata':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' }
          },
          required: []
        };

      case 'kyabadla':
        return {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' },
            sinceTimestamp: { type: 'integer', description: 'Fetch changes recorded since epoch millisecond timestamp' }
          },
          required: []
        };

      case 'yesavekar':
        return {
          type: 'object',
          properties: {
            summary: { type: 'string', maxLength: 256, description: 'Concise 1-2 sentence description of progress or milestone' },
            checkpointType: {
              type: 'string',
              enum: [
                'task.started', 'task.progress', 'decision.proposed', 'discovery.recorded',
                'files.modified', 'evidence.recorded', 'blocker.discovered',
                'blocker.resolved', 'assumption.invalidated', 'task.completed', 'handoff.prepared'
              ],
              default: 'task.progress',
              description: 'Milestone category (defaults to task.progress)'
            },
            taskId: { type: 'string', description: 'Optional active task ID' },
            payloadJson: { type: 'object', description: 'Optional extra milestone JSON data (<=2 KB)' },
            idempotencyKey: { type: 'string', description: 'Optional idempotency key (auto-generated if omitted)' },
            evidenceRefs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['file', 'git_commit', 'test', 'command'] },
                  reference: { type: 'string' }
                },
                required: ['kind', 'reference']
              },
              description: 'Optional file or commit references e.g. [{ kind: "file", reference: "src/auth.ts#L40" }]'
            },
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' }
          },
          required: ['summary']
        };

      case 'yaadrakh':
        return {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['architecture', 'convention', 'decision'], description: 'Category of rule or decision' },
            title: { type: 'string', maxLength: 256, description: 'Title of architectural convention or rule' },
            content: { type: 'string', maxLength: 16384, description: 'Markdown content and rationale' },
            rationale: { type: 'string', description: 'Context and trade-offs' },
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' }
          },
          required: ['category', 'title', 'content']
        };

      case 'handoffsavekar':
        return {
          type: 'object',
          properties: {
            objective: { type: 'string', maxLength: 1024, description: 'Task or session goal' },
            completedSummary: { type: 'string', maxLength: 4096, description: 'Summary of what was completed' },
            remainingSummary: { type: 'string', maxLength: 4096, description: 'Summary of what is remaining or next steps' },
            blockersSummary: { type: 'string', maxLength: 2048, description: 'Unresolved blockers or hazards' },
            decisionsSummary: { type: 'string', maxLength: 2048, description: 'Key decisions made during session' },
            relevantFiles: { type: 'array', items: { type: 'string' }, description: 'Modified or relevant file paths' },
            testStatusSummary: { type: 'string', description: 'Test suite status' },
            knownUncertainties: { type: 'string', description: 'Questions or uncertainties for next agent' },
            taskId: { type: 'string', description: 'Optional task ID' },
            projectId: { type: 'string', description: 'Target project ID (optional, auto-injected)' }
          },
          required: ['objective', 'completedSummary', 'remainingSummary']
        };
    }
  }
}

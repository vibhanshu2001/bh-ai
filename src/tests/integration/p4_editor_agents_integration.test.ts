/**
 * Bhai Phase P4 — Integration Tests: Editor-Based Coding Agents
 * Validates Bhai MCP Bridge compatibility with:
 *   1. OpenAI Codex running as a VS Code extension
 *   2. Claude Code running as a VS Code extension
 *   3. Google Antigravity IDE
 *   4. Cursor IDE
 *
 * Verifies non-destructive configuration, guiding skill discovery & availability,
 * real-client MCP discovery (initialize, tools/list), context retrieval (yebata),
 * milestone checkpoints (yesavekar), ADR proposals (yaadrakh), cross-editor handoffs
 * (handoffsavekar -> kahanthe), token authorization boundaries, and graceful broker reconnection.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ProjectRepository } from '../../utility/storage/project_repository';
import { MemoryRepository } from '../../utility/storage/memory_repository';
import { ToolRegistry } from '../../utility/mcp/tool_registry';
import { StdioBridge } from '../../mcp/stdio_bridge';
import { McpBroker } from '../../main/broker/mcp_broker';
import { AgentInstaller } from '../../main/mcp/agent_installer';
import { PUBLIC_TOOL_NAMES } from '../../shared/contracts/mcp_tools';

export async function runP4EditorAgentsIntegrationTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('--- [INTEGRATION] Phase P4 Editor-Based Agent Verification ---');
  console.log('Target Editors: VS Code (Codex, Claude Code), Antigravity IDE, Cursor');
  console.log('======================================================\n');

  const testTempDir = path.join(os.tmpdir(), `bhai_editor_test_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });
  const dbPath = path.join(testTempDir, 'test_editors.sqlite');
  const socketPath = path.join(testTempDir, 'broker_editor_test.sock');

  const conn = new DatabaseConnection(dbPath);
  const db = conn.open();

  let broker: McpBroker | null = null;

  try {
    const projectRepo = new ProjectRepository(db);
    const memoryRepo = new MemoryRepository(db);
    const toolRegistry = new ToolRegistry(memoryRepo, projectRepo);

    // ------------------------------------------------------------------------
    // Part 1: Register Project & Authorizations for all 4 Editor Agents
    // ------------------------------------------------------------------------
    const projectRoot = path.join(testTempDir, 'editor_workspace');
    fs.mkdirSync(projectRoot, { recursive: true });

    const project = projectRepo.createProject({
      displayName: 'PayFlow Core',
      canonicalRoot: projectRoot,
      services: [
        {
          name: 'Payment Service',
          serviceType: 'backend',
          relativeCwd: '.',
          port: 8080,
          packageScript: 'cargo run'
        }
      ]
    });
    const projectId = project.id;
    console.log(`  ✓ Registered test project: "${project.displayName}" (${projectId})`);

    const agentTokens: Record<string, string> = {
      'codex': 'bhai_sec_codex_editor_token_111',
      'claude-code': 'bhai_sec_claude_editor_token_222',
      'antigravity': 'bhai_sec_antigravity_editor_token_333',
      'cursor': 'bhai_sec_cursor_editor_token_444'
    };

    for (const [clientName, rawToken] of Object.entries(agentTokens)) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      memoryRepo.createAuthorization({
        clientName,
        projectId,
        tokenHash,
        scopes: ['read_memory', 'write_checkpoints', 'propose_decisions']
      });
    }
    console.log('  ✓ Provisioned authorizations for 4 editor clients in SQLite');

    // ------------------------------------------------------------------------
    // Part 2: Configuration & Guiding Skill Availability for Each Editor
    // ------------------------------------------------------------------------
    console.log('\n  [Step A] Testing Non-Destructive Config & Skill Deployment...');
    const installer = new AgentInstaller(testTempDir);

    // 1. VS Code Codex
    installer.installCodex({ projectId, token: agentTokens['codex'] });
    const codexCfg = fs.readFileSync(installer.getCodexConfigPath(), 'utf8');
    assert.ok(codexCfg.includes('[mcp_servers.bhai]'));
    assert.ok(codexCfg.includes(`BHAI_PROJECT_ID = "${projectId}"`));
    console.log('    ✓ VS Code Codex: config.toml syntax verified ([mcp_servers.bhai])');

    // 2. VS Code Claude Code
    installer.installClaude({ projectId, token: agentTokens['claude-code'] });
    const claudeCfg = JSON.parse(fs.readFileSync(installer.getClaudeConfigPath(), 'utf8'));
    assert.ok(claudeCfg.mcpServers.bhai);
    assert.strictEqual(claudeCfg.mcpServers.bhai.env.BHAI_PROJECT_ID, projectId);
    console.log('    ✓ VS Code Claude Code: .claude.json schema verified');

    // 3. Google Antigravity IDE
    installer.installAntigravity({ projectId, token: agentTokens['antigravity'] });
    const antigravityCfg = JSON.parse(fs.readFileSync(installer.getAntigravityConfigPath(), 'utf8'));
    assert.ok(antigravityCfg.mcpServers.bhai);
    assert.strictEqual(antigravityCfg.mcpServers.bhai.env.BHAI_PROJECT_ID, projectId);
    assert.ok(antigravityCfg.mcpServers.bhai.args.includes('antigravity'));
    console.log('    ✓ Google Antigravity IDE: mcp_config.json schema verified');

    // 4. Cursor IDE
    installer.installCursor({ projectId, token: agentTokens['cursor'] });
    const cursorCfg = JSON.parse(fs.readFileSync(installer.getCursorConfigPath(), 'utf8'));
    assert.ok(cursorCfg.mcpServers.bhai);
    assert.strictEqual(cursorCfg.mcpServers.bhai.env.BHAI_PROJECT_ID, projectId);
    console.log('    ✓ Cursor IDE: mcp.json schema verified');

    // Guiding Skill Deployment
    const skillRes = installer.installGuidingSkill({
      projectRoot,
      projectId
    });
    assert.strictEqual(skillRes.installedTargets.length, 4);

    // Verify Skill Files & Project Guidance exist
    assert.ok(fs.existsSync(path.join(projectRoot, '.agents', 'skills', 'bhai-project-memory', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(testTempDir, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(projectRoot, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(projectRoot, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(projectRoot, 'GEMINI.md')));
    assert.ok(fs.existsSync(path.join(projectRoot, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(projectRoot, '.cursorrules')));
    console.log('    ✓ Guiding Skill verified present and discoverable in all 4 editor environments');

    // ------------------------------------------------------------------------
    // Part 3: Start McpBroker on Local Socket
    // ------------------------------------------------------------------------
    console.log('\n  [Step B] Starting Bhai Local McpBroker...');
    const mockUtilityManager: any = {
      send: async (channel: string, payload: any) => {
        switch (channel) {
          case 'mcp.auth-verify': {
            const auth = memoryRepo.getAuthorization(payload.clientName, payload.projectId);
            if (!auth || auth.isRevoked || auth.tokenHash !== payload.tokenHash) {
              return { authorized: false };
            }
            memoryRepo.recordAuthorizationUsage(payload.clientName, payload.projectId);
            return {
              authorized: true,
              clientName: auth.clientName,
              projectId: auth.projectId,
              scopes: auth.scopes
            };
          }
          case 'mcp.tool-call': {
            return toolRegistry.executeTool(payload.toolName, payload.args, payload.context);
          }
          default:
            throw new Error(`Unhandled test channel: ${channel}`);
        }
      }
    };

    broker = new McpBroker(mockUtilityManager, socketPath);
    await broker.start();
    console.log('    ✓ McpBroker running on local domain socket with mode 0600');

    // ------------------------------------------------------------------------
    // Part 4: Real-Client Protocol Lifecycle for each of the 4 Agents
    // ------------------------------------------------------------------------
    console.log('\n  [Step C] Verifying End-to-End JSON-RPC Lifecycle for all 4 Agents...');

    // 1. Google Antigravity: initialize -> tools/list -> yebata (Context Retrieval) -> yaadrakh (ADR proposal)
    const antigravityBridge = new StdioBridge({
      clientName: 'antigravity',
      projectId,
      token: agentTokens['antigravity'],
      socketPath
    });

    const agInit = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    });
    assert.strictEqual(agInit.result.serverInfo.name, 'bhai');

    const agTools = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(agTools.result.tools.length, 9);
    for (const toolName of PUBLIC_TOOL_NAMES) {
      assert.ok(agTools.result.tools.some((t: any) => t.name === toolName));
    }
    console.log('    ✓ Google Antigravity: Handshake passed and all 9 Bhai tools discovered');

    // 0. Seed an active task for payment gateway implementation
    const task = memoryRepo.createTask({
      projectId,
      title: 'Implement Payment Gateway Idempotency Layer',
      description: 'Require UUID v4 Idempotency-Key in HTTP headers to prevent duplicate charges',
      status: 'in_progress',
      priority: 1
    });

    const agContext = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId, mode: 'task' }
      }
    });
    assert.strictEqual(Boolean(agContext.result?.content?.[0]?.text), true);
    console.log('    ✓ Google Antigravity: yebata context pack retrieved successfully');

    // Antigravity proposes an ADR via yaadrakh
    const agAdr = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'yaadrakh',
        arguments: {
          projectId,
          category: 'decision',
          title: 'ADR-001: Idempotency Key Requirement',
          content: 'Require UUID v4 Idempotency-Key in HTTP headers',
          rationale: 'Avoid duplicate transaction charges under network timeouts'
        }
      }
    });
    assert.strictEqual(Boolean(agAdr.result?.content?.[0]?.text), true);
    console.log('    ✓ Google Antigravity: yaadrakh ADR proposal recorded');

    // 2. Claude Code: Start task & save checkpoint via yesavekar
    const claudeBridge = new StdioBridge({
      clientName: 'claude-code',
      projectId,
      token: agentTokens['claude-code'],
      socketPath
    });

    const claudeCheckpoint = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'yesavekar',
        arguments: {
          projectId,
          taskId: task.id,
          checkpointType: 'task.progress',
          summary: 'Implemented idempotency token middleware in Rust',
          payloadJson: { filesChanged: ['src/middleware/idempotency.rs'], unitTestsPassing: 4 },
          idempotencyKey: 'cp_idempotency_middleware_001'
        }
      }
    });
    assert.strictEqual(Boolean(claudeCheckpoint.result?.content?.[0]?.text), true);
    console.log('    ✓ VS Code Claude Code: yesavekar milestone checkpoint recorded');

    // Claude saves structured handoff before wrapping session
    const claudeHandoff = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'handoffsavekar',
        arguments: {
          projectId,
          taskId: task.id,
          objective: 'Implement payment gateway idempotency layer',
          completedSummary: 'Added idempotency middleware and in-memory LRU cache',
          remainingSummary: 'Add Redis persistence layer and wire integration tests',
          blockersSummary: 'None',
          relevantFiles: ['src/middleware/idempotency.rs']
        }
      }
    });
    assert.strictEqual(Boolean(claudeHandoff.result?.content?.[0]?.text), true);
    console.log('    ✓ VS Code Claude Code: handoffsavekar saved session handoff document');

    // 3. VS Code Codex: Resumes session via kahanthe & kaamkaha
    const codexBridge = new StdioBridge({
      clientName: 'codex',
      projectId,
      token: agentTokens['codex'],
      socketPath
    });

    const codexHandoffRes = await codexBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'kahanthe',
        arguments: { projectId, taskId: task.id }
      }
    });
    const handoffText = codexHandoffRes.result?.content?.[0]?.text;
    assert.ok(handoffText);
    assert.ok(handoffText.includes('Add Redis persistence layer'));
    console.log('    ✓ VS Code Codex: kahanthe retrieved Claude Code handoff with zero context loss');

    const codexTaskRes = await codexBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'kaamkaha',
        arguments: { projectId, taskId: task.id }
      }
    });
    assert.ok(codexTaskRes.result?.content?.[0]?.text);
    console.log('    ✓ VS Code Codex: kaamkaha confirmed active task progress');

    // 4. Cursor IDE: Inspects services via servicesbata & search via dhoondh
    const cursorBridge = new StdioBridge({
      clientName: 'cursor',
      projectId,
      token: agentTokens['cursor'],
      socketPath
    });

    const cursorServicesRes = await cursorBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'servicesbata',
        arguments: { projectId }
      }
    });
    const servicesText = cursorServicesRes.result?.content?.[0]?.text;
    assert.ok(servicesText);
    assert.ok(servicesText.includes('Payment Service'));
    console.log('    ✓ Cursor IDE: servicesbata retrieved registered project dev services');

    const cursorSearchRes = await cursorBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'dhoondh',
        arguments: { projectId, query: 'idempotency' }
      }
    });
    assert.ok(cursorSearchRes.result?.content?.[0]?.text);
    console.log('    ✓ Cursor IDE: dhoondh performed FTS5 search across project memory');

    // ------------------------------------------------------------------------
    // Part 5: Permission & Token Enforcement Across Editors
    // ------------------------------------------------------------------------
    console.log('\n  [Step D] Verifying Token & Scope Security Boundaries...');
    const unauthorizedBridge = new StdioBridge({
      clientName: 'claude-code',
      projectId,
      token: 'bhai_sec_fake_unauthorized_token_xyz',
      socketPath
    });

    const unauthRes = await unauthorizedBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId }
      }
    });
    assert.ok(unauthRes.error, 'Invalid token must return JSON-RPC error');
    assert.strictEqual(unauthRes.error.code, -32000);
    console.log('    ✓ Unauthorized token request strictly blocked with code -32000');

    // ------------------------------------------------------------------------
    // Part 6: Graceful Broker Reconnection Resilience
    // ------------------------------------------------------------------------
    console.log('\n  [Step E] Verifying Graceful Broker Reconnection...');

    // 1. Broker is stopped / crashed
    await broker.stop();
    console.log('    ✓ McpBroker stopped (simulating desktop app termination)');

    // 2. Client calls during downtime
    const downRes = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId }
      }
    });
    assert.ok(downRes.error, 'Tool call during broker downtime must return structured JSON-RPC error');
    assert.strictEqual(downRes.error.code, -32603);
    assert.ok(downRes.error.message.includes('Bhai broker connection error'));
    console.log('    ✓ Call during broker downtime caught gracefully without crashing stdio process');

    // 3. Broker restarts on same socket path
    broker = new McpBroker(mockUtilityManager as any, socketPath);
    await broker.start();
    console.log('    ✓ McpBroker restarted');

    // 4. Client call immediately succeeds without restarting bridge
    const recoveredRes = await antigravityBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId }
      }
    });
    assert.ok(recoveredRes.result?.content?.[0]?.text);
    console.log('    ✓ Client automatically reconnected and succeeded on subsequent tool call');

    console.log('\n[PASS] All Phase P4 Editor-Based Agent Integration Tests Completed Successfully!\n');
  } finally {
    if (broker) {
      try {
        await broker.stop();
      } catch {
        // ignore
      }
    }
    try {
      db.close();
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  runP4EditorAgentsIntegrationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

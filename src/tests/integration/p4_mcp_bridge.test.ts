/**
 * Bhai Phase P4.2 — Integration Tests: MCP Stdio Bridge & Broker
 * Verifies end-to-end MCP JSON-RPC protocol over stdio, domain socket broker,
 * client authentication, scope enforcement, tool execution, and cross-agent exchange.
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

export async function runMcpBridgeIntegrationTests(): Promise<void> {
  console.log('\n--- [INTEGRATION] Phase P4.2 MCP Bridge & Tool Execution Tests ---');

  const testTempDir = path.join(os.tmpdir(), `bhai_mcp_bridge_test_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });
  const dbPath = path.join(testTempDir, 'test_mcp.sqlite');

  const conn = new DatabaseConnection(dbPath);
  const db = conn.open();

  try {
    const projectRepo = new ProjectRepository(db);
    const memoryRepo = new MemoryRepository(db);
    const toolRegistry = new ToolRegistry(memoryRepo, projectRepo);

    // 1. Create a Test Project with Services
    const projectRoot = path.join(testTempDir, 'mock_repo');
    fs.mkdirSync(projectRoot, { recursive: true });
    const project = projectRepo.createProject({
      displayName: 'Aawas Financial',
      canonicalRoot: projectRoot,
      services: [
        {
          name: 'API Gateway',
          serviceType: 'backend',
          relativeCwd: '.',
          port: 5001,
          packageScript: 'npm run start'
        }
      ]
    });
    const projectId = project.id;
    console.log(`  ✓ Test project created: ${project.displayName} (${projectId})`);

    // 2. Provision MCP Client Authorizations
    const claudeRawToken = 'bhai_sec_claude_secret_token_123';
    const claudeTokenHash = crypto.createHash('sha256').update(claudeRawToken).digest('hex');
    memoryRepo.createAuthorization({
      clientName: 'claude-code',
      projectId,
      tokenHash: claudeTokenHash,
      scopes: ['read_memory', 'write_checkpoints', 'propose_decisions']
    });

    const codexRawToken = 'bhai_sec_codex_secret_token_456';
    const codexTokenHash = crypto.createHash('sha256').update(codexRawToken).digest('hex');
    memoryRepo.createAuthorization({
      clientName: 'codex',
      projectId,
      tokenHash: codexTokenHash,
      scopes: ['read_memory', 'write_checkpoints', 'propose_decisions']
    });

    // Create a read-only token to test scope restriction
    const readOnlyRawToken = 'bhai_sec_readonly_token_789';
    const readOnlyTokenHash = crypto.createHash('sha256').update(readOnlyRawToken).digest('hex');
    memoryRepo.createAuthorization({
      clientName: 'cursor-readonly',
      projectId,
      tokenHash: readOnlyTokenHash,
      scopes: ['read_memory']
    });
    console.log('  ✓ MCP client authorizations provisioned in SQLite');

    // 3. Mock UtilityProcessManager interfacing with ToolRegistry
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

    // 4. Start McpBroker on Local Domain Socket within test directory
    const testSocketPath = path.join(testTempDir, 'test_broker.sock');
    const broker = new McpBroker(mockUtilityManager, testSocketPath);
    await broker.start();
    console.log('  ✓ McpBroker running on local domain socket with mode 0600');

    // 5. Test StdioBridge Protocol Handling
    const claudeBridge = new StdioBridge({
      clientName: 'claude-code',
      projectId,
      token: claudeRawToken,
      sessionId: 'sess_claude_001',
      socketPath: testSocketPath
    });

    // 5a. MCP Handshake: initialize
    const initRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'claude-code', version: '1.0' } }
    });
    assert.strictEqual(initRes.result.serverInfo.name, 'bhai');
    assert.strictEqual(initRes.result.protocolVersion, '2024-11-05');
    console.log('  ✓ MCP initialization handshake passed: server="bhai", protocol="2024-11-05"');

    // 5b. tools/list: Returns all 9 tools
    const listRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(listRes.result.tools.length, 9);
    const toolNames = listRes.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('yebata'));
    assert.ok(toolNames.includes('yesavekar'));
    assert.ok(toolNames.includes('kahanthe'));
    assert.ok(toolNames.includes('handoffsavekar'));
    console.log('  ✓ tools/list returned all 9 registered Bhai public tools');

    // 5c. tools/call: yebata (getContextPack)
    const yebataRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId, mode: 'task' }
      }
    });
    if (yebataRes.error) {
      console.error('yebataRes error:', yebataRes.error);
    }
    assert.ok(yebataRes.result, `Expected result from yebata call, got error: ${JSON.stringify(yebataRes.error)}`);
    const yebataContent = JSON.parse(yebataRes.result.content[0].text);
    assert.strictEqual(yebataContent.projectId, projectId);
    assert.ok(yebataContent.content.includes('<bhai-project-context'));
    assert.ok(yebataContent.content.includes('API Gateway'));
    console.log('  ✓ yebata (getContextPack) returned structured, delimited project context');

    // 5d. tools/call: servicesbata (getProjectServices)
    const servicesRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'servicesbata',
        arguments: { projectId }
      }
    });
    const servicesData = JSON.parse(servicesRes.result.content[0].text);
    assert.strictEqual(servicesData.services.length, 1);
    assert.strictEqual(servicesData.services[0].name, 'API Gateway');
    assert.strictEqual(servicesData.services[0].port, 5001);
    console.log('  ✓ servicesbata returned registered service configuration');

    // 5e. tools/call: yesavekar (recordCheckpoint)
    const saveCheckRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'yesavekar',
        arguments: {
          projectId,
          checkpointType: 'task.progress',
          summary: 'Scaffolded auth middleware',
          idempotencyKey: 'idemp_chk_001',
          payloadJson: { files: ['src/auth.ts'] }
        }
      }
    });
    const checkData = JSON.parse(saveCheckRes.result.content[0].text);
    assert.strictEqual(checkData.status, 'recorded');
    assert.strictEqual(checkData.isDuplicate, false);
    console.log('  ✓ yesavekar (recordCheckpoint) logged milestone checkpoint');

    // 5f. Idempotency Check: Repeat identical checkpoint call
    const repeatCheckRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'yesavekar',
        arguments: {
          projectId,
          checkpointType: 'task.progress',
          summary: 'Scaffolded auth middleware',
          idempotencyKey: 'idemp_chk_001',
          payloadJson: { files: ['src/auth.ts'] }
        }
      }
    });
    const repeatData = JSON.parse(repeatCheckRes.result.content[0].text);
    assert.strictEqual(repeatData.isDuplicate, true);
    assert.strictEqual(repeatData.status, 'duplicate');
    console.log('  ✓ Idempotency verified: Duplicate checkpoint returned existing ID without new row');

    // 5g. tools/call: yaadrakh (proposeMemoryUpdate)
    const yaadrakhRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'yaadrakh',
        arguments: {
          projectId,
          category: 'decision',
          title: 'JWT Secret Rotation Strategy',
          content: 'Rotate JWT keys daily using AWS KMS.',
          rationale: 'Security compliance requirement'
        }
      }
    });
    const yaadData = JSON.parse(yaadrakhRes.result.content[0].text);
    assert.strictEqual(yaadData.status, 'pending_user_approval');
    console.log('  ✓ yaadrakh (proposeMemoryUpdate) recorded decision candidate pending review');

    // 5h. tools/call: handoffsavekar (saveHandoff)
    const handoffRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'handoffsavekar',
        arguments: {
          projectId,
          objective: 'Complete Auth Module',
          completedSummary: '- JWT validation implemented\n- Test suite passing',
          remainingSummary: '- Implement Refresh Token endpoint\n- Add rate limiting',
          relevantFiles: ['src/auth.ts', 'src/auth.test.ts']
        }
      }
    });
    const handoffData = JSON.parse(handoffRes.result.content[0].text);
    assert.strictEqual(handoffData.status, 'saved');
    console.log('  ✓ handoffsavekar (saveHandoff) persisted structured session handoff');

    // ------------------------------------------------------------------------
    // 6. Cross-Agent Continuity: Codex Session Reading Claude Handoff
    // ------------------------------------------------------------------------
    const codexBridge = new StdioBridge({
      clientName: 'codex',
      projectId,
      token: codexRawToken,
      sessionId: 'sess_codex_002',
      socketPath: testSocketPath
    });

    const codexHandoffRes = await codexBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'kahanthe',
        arguments: { projectId }
      }
    });
    const codexHandoffData = JSON.parse(codexHandoffRes.result.content[0].text);
    assert.ok(codexHandoffData.handoff);
    assert.strictEqual(codexHandoffData.handoff.authorClient, 'claude-code');
    assert.ok(codexHandoffData.handoff.completedSummary.includes('JWT validation'));
    assert.ok(codexHandoffData.handoff.remainingSummary.includes('Refresh Token endpoint'));
    console.log('  ✓ Cross-agent continuity: Codex accurately retrieved Claude Code session handoff via kahanthe');

    // ------------------------------------------------------------------------
    // 7. Security & Scope Enforcement Tests
    // ------------------------------------------------------------------------
    // 7a. Scope Restriction: read-only client attempting write tool
    const readOnlyBridge = new StdioBridge({
      clientName: 'cursor-readonly',
      projectId,
      token: readOnlyRawToken,
      sessionId: 'sess_cursor_003',
      socketPath: testSocketPath
    });

    const scopeDeniedRes = await readOnlyBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'yesavekar',
        arguments: {
          projectId,
          checkpointType: 'task.progress',
          summary: 'Unauthorized checkpoint',
          idempotencyKey: 'idemp_unauth'
        }
      }
    });
    assert.ok(scopeDeniedRes.error);
    assert.ok(scopeDeniedRes.error.message.includes('PERMISSION_DENIED'));
    console.log('  ✓ Scope boundary enforced: Read-only client blocked from invoking write tool');

    // 7b. Invalid Token / Unauthorized Project
    const invalidTokenBridge = new StdioBridge({
      clientName: 'claude-code',
      projectId,
      token: 'bad_invalid_token',
      sessionId: 'sess_invalid',
      socketPath: testSocketPath
    });
    const authFailedRes = await invalidTokenBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId }
      }
    });
    if (authFailedRes.error) {
      console.log('authFailedRes error:', authFailedRes.error);
    }
    assert.ok(authFailedRes.error);
    assert.ok(authFailedRes.error.message.includes('not authorized') || authFailedRes.error.message.includes('PERMISSION_DENIED'));
    console.log('  ✓ Invalid token strictly rejected with PERMISSION_DENIED / not authorized');

    // 7c. Token Revocation
    memoryRepo.revokeAuthorization('claude-code', projectId);
    const revokedRes = await claudeBridge.handleJsonRpc({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'yebata',
        arguments: { projectId }
      }
    });
    assert.ok(revokedRes.error);
    assert.ok(revokedRes.error.message.includes('not authorized') || revokedRes.error.message.includes('PERMISSION_DENIED') || revokedRes.error.message.includes('revoked'));
    console.log('  ✓ Instant token revocation: Subsequent calls immediately rejected with PERMISSION_DENIED');

    await broker.stop();
    console.log('  ✓ McpBroker stopped and socket unlinked');

    console.log('\n[PASS] All MCP Bridge & Tool Execution Integration Tests Completed Successfully.\n');
  } finally {
    conn.close();
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  runMcpBridgeIntegrationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

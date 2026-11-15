/**
 * Bhai Phase P4.2 — Integration Tests: Agent Integration Kit
 * Verifies non-destructive discovery, configuration generation, instruction injection,
 * and surgical removal for Claude Code, Codex, and Cursor IDE.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  AgentInstaller,
  BHAI_INSTRUCTION_START,
  BHAI_INSTRUCTION_END
} from '../../main/mcp/agent_installer';

export async function runAgentIntegrationKitTests(): Promise<void> {
  console.log('\n--- [INTEGRATION] Phase P4.2 Agent Integration Kit Tests ---');

  const testTempDir = path.join(os.tmpdir(), `bhai_agent_kit_test_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  try {
    const installer = new AgentInstaller(testTempDir);
    const projectId = 'proj_test_alpha_123';
    const token = 'bhai_sec_test_secret_grant_token';

    // ------------------------------------------------------------------------
    // 1. Claude Code (~/.claude.json)
    // ------------------------------------------------------------------------
    // Pre-populate with existing unrelated user configs to verify non-destructive merge
    const claudePath = installer.getClaudeConfigPath();
    const existingClaudeConfig = {
      theme: 'dark',
      mcpServers: {
        other_tool: {
          command: 'other-cli',
          args: ['run']
        }
      }
    };
    fs.writeFileSync(claudePath, JSON.stringify(existingClaudeConfig, null, 2), 'utf8');

    // Install
    installer.installClaude({ projectId, token });
    assert.strictEqual(fs.existsSync(claudePath), true);

    const afterClaudeInstall = JSON.parse(fs.readFileSync(claudePath, 'utf8'));
    assert.strictEqual(afterClaudeInstall.theme, 'dark', 'Unrelated settings must be preserved');
    assert.ok(afterClaudeInstall.mcpServers.other_tool, 'Existing MCP servers must not be deleted');
    assert.ok(afterClaudeInstall.mcpServers.bhai, 'Bhai MCP server must be registered');
    assert.strictEqual(afterClaudeInstall.mcpServers.bhai.env.BHAI_PROJECT_ID, projectId);
    assert.strictEqual(afterClaudeInstall.mcpServers.bhai.env.BHAI_MCP_TOKEN, token);
    console.log('  ✓ Claude Code: Non-destructive installation merged into ~/.claude.json');

    // Discover
    const agents1 = installer.discoverInstalledAgents();
    const claudeAgent = agents1.find((a) => a.agent === 'claude-code');
    assert.ok(claudeAgent);
    assert.strictEqual(claudeAgent?.isConfigured, true);
    console.log('  ✓ Claude Code: Discovered and verified configured');

    // Uninstall
    const uninstalledClaude = installer.uninstallClaude();
    assert.strictEqual(uninstalledClaude, true);
    const afterClaudeUninstall = JSON.parse(fs.readFileSync(claudePath, 'utf8'));
    assert.strictEqual(afterClaudeUninstall.theme, 'dark', 'Unrelated settings preserved on uninstall');
    assert.ok(afterClaudeUninstall.mcpServers.other_tool, 'Other tools preserved on uninstall');
    assert.strictEqual(afterClaudeUninstall.mcpServers.bhai, undefined, 'Bhai surgically removed');
    console.log('  ✓ Claude Code: Surgical removal verified without deleting other settings');

    // ------------------------------------------------------------------------
    // 2. OpenAI Codex (~/.codex/config.toml)
    // ------------------------------------------------------------------------
    const codexPath = installer.getCodexConfigPath();
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    const existingCodexToml = `
# Existing user codex settings
model = "gpt-4o"
temperature = 0.2

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
`.trim();
    fs.writeFileSync(codexPath, existingCodexToml, 'utf8');

    // Install
    installer.installCodex({ projectId, token });
    assert.strictEqual(fs.existsSync(codexPath), true);

    const afterCodexInstall = fs.readFileSync(codexPath, 'utf8');
    assert.ok(afterCodexInstall.includes('model = "gpt-4o"'), 'Existing TOML settings preserved');
    assert.ok(afterCodexInstall.includes('[mcp_servers.github]'), 'Existing MCP servers preserved');
    assert.ok(afterCodexInstall.includes('[mcp_servers.bhai]'), 'Bhai TOML server section installed');
    assert.ok(afterCodexInstall.includes('[mcp_servers.bhai.env]'), 'Bhai TOML env section installed');
    assert.ok(afterCodexInstall.includes(`BHAI_PROJECT_ID = "${projectId}"`));
    console.log('  ✓ Codex: Non-destructive installation into ~/.codex/config.toml (TOML format)');

    // Discover
    const agents2 = installer.discoverInstalledAgents();
    const codexAgent = agents2.find((a) => a.agent === 'codex');
    assert.ok(codexAgent);
    assert.strictEqual(codexAgent?.isConfigured, true);
    console.log('  ✓ Codex: Discovered and verified configured');

    // Uninstall
    const uninstalledCodex = installer.uninstallCodex();
    assert.strictEqual(uninstalledCodex, true);
    const afterCodexUninstall = fs.readFileSync(codexPath, 'utf8');
    assert.ok(afterCodexUninstall.includes('model = "gpt-4o"'), 'TOML settings preserved on uninstall');
    assert.ok(afterCodexUninstall.includes('[mcp_servers.github]'), 'Github MCP server preserved on uninstall');
    assert.strictEqual(afterCodexUninstall.includes('[mcp_servers.bhai]'), false, 'Bhai surgically removed from TOML');
    console.log('  ✓ Codex: Surgical removal verified without touching other TOML blocks');

    // ------------------------------------------------------------------------
    // 3. Cursor IDE (~/.cursor/mcp.json)
    // ------------------------------------------------------------------------
    const cursorPath = installer.getCursorConfigPath();
    fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
    const existingCursorJson = {
      mcpServers: {
        sqlite: {
          command: 'mcp-sqlite'
        }
      }
    };
    fs.writeFileSync(cursorPath, JSON.stringify(existingCursorJson, null, 2), 'utf8');

    // Install
    installer.installCursor({ projectId, token });
    const afterCursorInstall = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    assert.ok(afterCursorInstall.mcpServers.sqlite);
    assert.ok(afterCursorInstall.mcpServers.bhai);
    console.log('  ✓ Cursor IDE: Non-destructive installation into ~/.cursor/mcp.json');

    // Uninstall
    const uninstalledCursor = installer.uninstallCursor();
    assert.strictEqual(uninstalledCursor, true);
    const afterCursorUninstall = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    assert.ok(afterCursorUninstall.mcpServers.sqlite);
    assert.strictEqual(afterCursorUninstall.mcpServers.bhai, undefined);
    console.log('  ✓ Cursor IDE: Surgical removal verified');

    // ------------------------------------------------------------------------
    // 4. Google Antigravity IDE (~/.gemini/config/mcp_config.json)
    // ------------------------------------------------------------------------
    const antigravityPath = installer.getAntigravityConfigPath();
    fs.mkdirSync(path.dirname(antigravityPath), { recursive: true });
    const existingAntigravityJson = {
      mcpServers: {
        'sqlite-helper': {
          command: 'sqlite-mcp-server',
          args: ['/path/to/db.db']
        }
      }
    };
    fs.writeFileSync(antigravityPath, JSON.stringify(existingAntigravityJson, null, 2), 'utf8');

    // Install
    installer.installAntigravity({ projectId, token });
    assert.strictEqual(fs.existsSync(antigravityPath), true);
    const afterAntigravityInstall = JSON.parse(fs.readFileSync(antigravityPath, 'utf8'));
    assert.ok(afterAntigravityInstall.mcpServers['sqlite-helper'], 'Existing Antigravity MCP servers preserved');
    assert.ok(afterAntigravityInstall.mcpServers.bhai, 'Bhai MCP server registered for Antigravity');
    assert.strictEqual(afterAntigravityInstall.mcpServers.bhai.args.includes('antigravity'), true);
    console.log('  ✓ Antigravity IDE: Non-destructive installation into ~/.gemini/config/mcp_config.json');

    // Discover
    const agents4 = installer.discoverInstalledAgents();
    const antigravityAgent = agents4.find((a) => a.agent === 'antigravity');
    assert.ok(antigravityAgent);
    assert.strictEqual(antigravityAgent?.isConfigured, true);
    console.log('  ✓ Antigravity IDE: Discovered and verified configured');

    // Uninstall
    const uninstalledAntigravity = installer.uninstallAntigravity();
    assert.strictEqual(uninstalledAntigravity, true);
    const afterAntigravityUninstall = JSON.parse(fs.readFileSync(antigravityPath, 'utf8'));
    assert.ok(afterAntigravityUninstall.mcpServers['sqlite-helper']);
    assert.strictEqual(afterAntigravityUninstall.mcpServers.bhai, undefined);
    console.log('  ✓ Antigravity IDE: Surgical removal verified');

    // ------------------------------------------------------------------------
    // 5. Project-Level Instruction Injection (CLAUDE.md / AGENTS.md)
    // ------------------------------------------------------------------------
    const claudeMdPath = path.join(testTempDir, 'mock_repo', 'CLAUDE.md');
    fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
    const existingInstructions = `# Project Guidelines\n- Run tests with npm test\n- Follow TypeScript strict mode`;
    fs.writeFileSync(claudeMdPath, existingInstructions, 'utf8');

    // Inject
    installer.injectProjectInstructions(claudeMdPath, projectId);
    const afterInject = fs.readFileSync(claudeMdPath, 'utf8');
    assert.ok(afterInject.includes('# Project Guidelines'), 'Existing instructions preserved');
    assert.ok(afterInject.includes(BHAI_INSTRUCTION_START), 'Start marker present');
    assert.ok(afterInject.includes(BHAI_INSTRUCTION_END), 'End marker present');
    assert.ok(afterInject.includes(projectId), 'Project ID injected in instruction block');
    console.log('  ✓ Project instruction injection: Demarcated block cleanly injected into CLAUDE.md');

    // Remove
    const removedInstructions = installer.removeProjectInstructions(claudeMdPath);
    assert.strictEqual(removedInstructions, true);
    const afterRemove = fs.readFileSync(claudeMdPath, 'utf8');
    assert.ok(afterRemove.includes('# Project Guidelines'), 'Existing instructions preserved after removal');
    assert.strictEqual(afterRemove.includes(BHAI_INSTRUCTION_START), false, 'Markers removed');
    assert.strictEqual(afterRemove.includes(BHAI_INSTRUCTION_END), false);
    console.log('  ✓ Project instruction removal: Demarcated block removed without touching original text');

    // ------------------------------------------------------------------------
    // 6. Guiding Skill Multi-Editor Availability (Antigravity, Codex, Claude, Cursor)
    // ------------------------------------------------------------------------
    const mockRepoRoot = path.join(testTempDir, 'mock_repo_skills');
    fs.mkdirSync(mockRepoRoot, { recursive: true });

    const skillResult = installer.installGuidingSkill({
      projectRoot: mockRepoRoot,
      projectId: 'proj_skills_test_456'
    });

    assert.strictEqual(skillResult.installedTargets.length, 4);

    // Verify Antigravity skill & rules
    const antigravitySkillFile = path.join(mockRepoRoot, '.agents', 'skills', 'bhai-project-memory', 'SKILL.md');
    assert.ok(fs.existsSync(antigravitySkillFile), 'Antigravity workspace skill must exist');
    assert.ok(fs.readFileSync(antigravitySkillFile, 'utf8').includes('name: bhai-project-memory'));
    assert.ok(fs.existsSync(path.join(mockRepoRoot, 'AGENTS.md')), 'AGENTS.md rule file created');
    assert.ok(fs.existsSync(path.join(mockRepoRoot, 'GEMINI.md')), 'GEMINI.md rule file created');

    // Verify Codex global and project skills
    const codexGlobalSkill = path.join(testTempDir, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md');
    assert.ok(fs.existsSync(codexGlobalSkill), 'Codex global skill directory must exist');

    // Verify Claude Code instructions
    const claudeMdSkills = path.join(mockRepoRoot, 'CLAUDE.md');
    assert.ok(fs.existsSync(claudeMdSkills), 'CLAUDE.md instructions exist');
    assert.ok(fs.readFileSync(claudeMdSkills, 'utf8').includes('proj_skills_test_456'));

    // Verify Cursor skill & rules
    const cursorSkillFile = path.join(mockRepoRoot, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md');
    assert.ok(fs.existsSync(cursorSkillFile), 'Cursor skills-cursor directory must exist');
    assert.ok(fs.existsSync(path.join(mockRepoRoot, '.cursorrules')), 'Cursorrules file created');

    console.log('  ✓ Guiding Skill deployment verified across Antigravity, Codex, Claude, and Cursor');

    // Uninstall Guiding Skill
    const uninstalledSkills = installer.uninstallGuidingSkill({ projectRoot: mockRepoRoot });
    assert.strictEqual(uninstalledSkills.removedTargets.length, 4);
    assert.strictEqual(fs.existsSync(antigravitySkillFile), false, 'Antigravity skill uninstalled');
    assert.strictEqual(fs.existsSync(codexGlobalSkill), false, 'Codex global skill uninstalled');
    assert.strictEqual(fs.existsSync(cursorSkillFile), false, 'Cursor skill uninstalled');
    assert.strictEqual(fs.readFileSync(path.join(mockRepoRoot, 'CLAUDE.md'), 'utf8').includes(BHAI_INSTRUCTION_START), false);
    console.log('  ✓ Guiding Skill surgical uninstallation verified without leaving stale files');

    // Default credentials must not be derived from public project identifiers.
    const connectionOptions = {
      projectRoot: mockRepoRoot,
      projectId,
      binaryPath: '/demo/bin/bhai-mcp'
    };
    installer.installAllToProject(connectionOptions);
    const firstConfig = JSON.parse(fs.readFileSync(installer.getClaudeConfigPath(), 'utf8'));
    const firstToken = firstConfig.mcpServers.bhai.env.BHAI_MCP_TOKEN;
    assert.match(firstToken, /^[a-f0-9]{64}$/, 'Default token must contain 32 random bytes');
    assert.notStrictEqual(firstToken, `token_${projectId}`, 'Project ID must not determine credentials');
    const cursorConfig = JSON.parse(fs.readFileSync(installer.getCursorConfigPath(), 'utf8'));
    assert.strictEqual(cursorConfig.mcpServers.bhai.env.BHAI_MCP_TOKEN, firstToken,
      'Clients installed together must receive the same provisioned credential');
    installer.installAllToProject(connectionOptions);
    const secondConfig = JSON.parse(fs.readFileSync(installer.getClaudeConfigPath(), 'utf8'));
    assert.notStrictEqual(secondConfig.mcpServers.bhai.env.BHAI_MCP_TOKEN, firstToken,
      'Reconnecting without an explicit token must generate a fresh credential');
    installer.installAllToProject({ ...connectionOptions, token });
    const explicitConfig = JSON.parse(fs.readFileSync(installer.getClaudeConfigPath(), 'utf8'));
    assert.strictEqual(explicitConfig.mcpServers.bhai.env.BHAI_MCP_TOKEN, token,
      'Explicitly provisioned credentials must be preserved');
    console.log('  ✓ Project connection credentials: Random defaults, rotation, and explicit tokens verified');

    console.log('[PASS] All Agent Integration Kit Tests Completed Successfully.\n');
  } finally {
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  runAgentIntegrationKitTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

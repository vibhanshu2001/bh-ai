/**
 * Bhai Phase P4.2 — Agent Integration Kit
 * Safe, non-destructive discovery, configuration injection, and surgical removal
 * for Claude Code, OpenAI Codex, and Cursor IDE.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

export interface InstalledAgentInfo {
  agent: 'claude-code' | 'codex' | 'cursor' | 'antigravity';
  name: string;
  category: 'cli' | 'ide' | 'agent';
  configPath: string;
  isConfigured: boolean;
  appInstalled: boolean;
  cliInstalled: boolean;
  globalSkillInstalled?: boolean;
}

export const BHAI_INSTRUCTION_START = '<!-- BHAI_PROJECT_MEMORY_START -->';
export const BHAI_INSTRUCTION_END = '<!-- BHAI_PROJECT_MEMORY_END -->';

export interface GuidingSkillInstallOptions {
  projectRoot?: string;
  global?: boolean;
  targets?: Array<'claude-code' | 'codex' | 'cursor' | 'antigravity'>;
  sourceSkillPath?: string;
  projectId?: string;
}

export class AgentInstaller {
  private homeDir: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir || os.homedir();
  }

  public getClaudeConfigPath(): string {
    return path.join(this.homeDir, '.claude.json');
  }

  public getCodexConfigPath(): string {
    return path.join(this.homeDir, '.codex', 'config.toml');
  }

  public getCursorConfigPath(): string {
    return path.join(this.homeDir, '.cursor', 'mcp.json');
  }

  public getAntigravityConfigPath(): string {
    return path.join(this.homeDir, '.gemini', 'config', 'mcp_config.json');
  }

  public discoverInstalledAgents(): InstalledAgentInfo[] {
    const agents: InstalledAgentInfo[] = [];

    // Helper to check for command / binary existence
    const checkCli = (cmdNames: string[]): boolean => {
      const paths = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', path.join(this.homeDir, '.local/bin'), path.join(this.homeDir, '.cargo/bin')];
      for (const p of paths) {
        for (const cmd of cmdNames) {
          if (fs.existsSync(path.join(p, cmd))) return true;
        }
      }
      return false;
    };

    // 1. Google Antigravity IDE
    const antigravityPath = this.getAntigravityConfigPath();
    const geminiDir = path.join(this.homeDir, '.gemini');
    const antigravityApp = fs.existsSync('/Applications/Antigravity.app') || fs.existsSync('/Applications/Antigravity IDE.app');
    const antigravityCli = checkCli(['agy', 'antigravity']);
    const antigravityGlobalSkill = fs.existsSync(path.join(geminiDir, 'antigravity', 'skills', 'bhai-project-memory', 'SKILL.md')) ||
      fs.existsSync(path.join(geminiDir, 'skills', 'bhai-project-memory', 'SKILL.md'));

    if (fs.existsSync(antigravityPath) || fs.existsSync(geminiDir) || antigravityApp || antigravityCli) {
      const isConfigured = fs.existsSync(antigravityPath) ? this.checkAntigravityConfigured(antigravityPath) : false;
      agents.push({
        agent: 'antigravity',
        name: 'Google Antigravity',
        category: 'ide',
        configPath: antigravityPath,
        isConfigured,
        appInstalled: antigravityApp,
        cliInstalled: antigravityCli,
        globalSkillInstalled: antigravityGlobalSkill
      });
    }

    // 2. Claude Code & Desktop
    const claudePath = this.getClaudeConfigPath();
    const claudeApp = fs.existsSync('/Applications/Claude.app');
    const claudeCli = checkCli(['claude']);
    const claudeDir = fs.existsSync(path.join(this.homeDir, '.claude'));
    const claudeGlobalSkill = fs.existsSync(path.join(this.homeDir, '.claude', 'skills', 'bhai-project-memory', 'SKILL.md'));

    if (fs.existsSync(claudePath) || claudeApp || claudeCli || claudeDir) {
      const isConfigured = fs.existsSync(claudePath) ? this.checkClaudeConfigured(claudePath) : false;
      agents.push({
        agent: 'claude-code',
        name: 'Claude Code',
        category: 'cli',
        configPath: claudePath,
        isConfigured,
        appInstalled: claudeApp,
        cliInstalled: claudeCli,
        globalSkillInstalled: claudeGlobalSkill
      });
    }

    // 3. Cursor IDE
    const cursorPath = this.getCursorConfigPath();
    const cursorApp = fs.existsSync('/Applications/Cursor.app');
    const cursorCli = checkCli(['cursor']);
    const cursorDir = fs.existsSync(path.join(this.homeDir, '.cursor'));
    const cursorGlobalSkill = fs.existsSync(path.join(this.homeDir, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md'));

    if (fs.existsSync(cursorPath) || cursorApp || cursorCli || cursorDir) {
      const isConfigured = fs.existsSync(cursorPath) ? this.checkCursorConfigured(cursorPath) : false;
      agents.push({
        agent: 'cursor',
        name: 'Cursor IDE',
        category: 'ide',
        configPath: cursorPath,
        isConfigured,
        appInstalled: cursorApp,
        cliInstalled: cursorCli,
        globalSkillInstalled: cursorGlobalSkill
      });
    }

    // 4. OpenAI Codex / VS Code
    const codexPath = this.getCodexConfigPath();
    const codexCli = checkCli(['codex']);
    const codexDir = fs.existsSync(path.join(this.homeDir, '.codex'));
    const vscodeApp = fs.existsSync('/Applications/Visual Studio Code.app');
    const codexGlobalSkill = fs.existsSync(path.join(this.homeDir, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md'));

    if (fs.existsSync(codexPath) || codexCli || codexDir || vscodeApp) {
      const isConfigured = fs.existsSync(codexPath) ? this.checkCodexConfigured(codexPath) : false;
      agents.push({
        agent: 'codex',
        name: 'OpenAI Codex (VS Code)',
        category: 'agent',
        configPath: codexPath,
        isConfigured,
        appInstalled: vscodeApp,
        cliInstalled: codexCli,
        globalSkillInstalled: codexGlobalSkill
      });
    }

    return agents;
  }

  // --------------------------------------------------------------------------
  // Claude Code Configuration (~/.claude.json)
  // --------------------------------------------------------------------------

  public installClaude(options: { projectId: string; token: string; binaryPath?: string }): void {
    const configPath = this.getClaudeConfigPath();
    let config: any = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers) config.mcpServers = {};

    const bin = options.binaryPath || '/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp';

    config.mcpServers.bhai = {
      command: bin,
      args: ['--project', options.projectId, '--client', 'claude-code'],
      env: {
        BHAI_MCP_TOKEN: options.token,
        BHAI_PROJECT_ID: options.projectId
      }
    };

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  public uninstallClaude(): boolean {
    const configPath = this.getClaudeConfigPath();
    if (!fs.existsSync(configPath)) return false;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.mcpServers && config.mcpServers.bhai) {
        delete config.mcpServers.bhai;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  private checkClaudeConfigured(configPath: string): boolean {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Boolean(config?.mcpServers?.bhai);
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Codex Configuration (~/.codex/config.toml)
  // --------------------------------------------------------------------------

  public installCodex(options: { projectId: string; token: string; binaryPath?: string }): void {
    const configPath = this.getCodexConfigPath();
    let content = '';

    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, 'utf8');
    }

    // Strip existing [mcp_servers.bhai] section if present
    content = this.removeCodexSection(content);

    const bin = options.binaryPath || '/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp';

    const codexBlock = `
[mcp_servers.bhai]
command = "${bin}"
args = ["--project", "${options.projectId}", "--client", "codex"]

[mcp_servers.bhai.env]
BHAI_MCP_TOKEN = "${options.token}"
BHAI_PROJECT_ID = "${options.projectId}"
`.trim();

    content = content ? `${content.trim()}\n\n${codexBlock}\n` : `${codexBlock}\n`;

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, content, 'utf8');
  }

  public uninstallCodex(): boolean {
    const configPath = this.getCodexConfigPath();
    if (!fs.existsSync(configPath)) return false;

    const content = fs.readFileSync(configPath, 'utf8');
    if (!content.includes('[mcp_servers.bhai]')) return false;

    const cleaned = this.removeCodexSection(content);
    fs.writeFileSync(configPath, cleaned, 'utf8');
    return true;
  }

  private removeCodexSection(content: string): string {
    const regex = /\[mcp_servers\.bhai\][\s\S]*?(?=(\n\[|$))/g;
    return content.replace(regex, '').trim();
  }

  private checkCodexConfigured(configPath: string): boolean {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return content.includes('[mcp_servers.bhai]');
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Cursor IDE Configuration (~/.cursor/mcp.json)
  // --------------------------------------------------------------------------

  public installCursor(options: { projectId: string; token: string; binaryPath?: string }): void {
    const configPath = this.getCursorConfigPath();
    let config: any = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers) config.mcpServers = {};

    const bin = options.binaryPath || '/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp';

    config.mcpServers.bhai = {
      command: bin,
      args: ['--project', options.projectId, '--client', 'cursor'],
      env: {
        BHAI_MCP_TOKEN: options.token,
        BHAI_PROJECT_ID: options.projectId
      }
    };

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  public uninstallCursor(): boolean {
    const configPath = this.getCursorConfigPath();
    if (!fs.existsSync(configPath)) return false;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.mcpServers && config.mcpServers.bhai) {
        delete config.mcpServers.bhai;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  private checkCursorConfigured(configPath: string): boolean {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Boolean(config?.mcpServers?.bhai);
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Google Antigravity IDE Configuration (~/.gemini/config/mcp_config.json)
  // --------------------------------------------------------------------------

  public installAntigravity(options: { projectId: string; token: string; binaryPath?: string }): void {
    const configPath = this.getAntigravityConfigPath();
    let config: any = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers) config.mcpServers = {};

    const bin = options.binaryPath || '/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp';

    config.mcpServers.bhai = {
      command: bin,
      args: ['--project', options.projectId, '--client', 'antigravity'],
      env: {
        BHAI_MCP_TOKEN: options.token,
        BHAI_PROJECT_ID: options.projectId
      }
    };

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Also write server instructions into Antigravity MCP directory
    const instructionsPath = path.join(this.homeDir, '.gemini', 'antigravity', 'mcp', 'bhai', 'instructions.md');
    try {
      fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });
      fs.writeFileSync(
        instructionsPath,
        `# Bhai Project Memory Server Guidelines

You have access to Bhai's local project memory tools. Bhai stores persistent architectural decisions, task checkpoints, and session handoffs on this Mac.

## Proactive Tool Usage Policy
- **On Session Start / First Turn**: You MUST call \`yebata\` (or \`get_project_context\`) with \`{}\` before inspecting files or running search commands. This loads the current task status, conventions, and blockers.
- **On Milestone Completion**: Call \`yesavekar\` (or \`save_checkpoint\`) with \`{ summary: "..." }\` when completing subtasks, passing tests, or discovering blockers.
- **On Session Conclusion**: Call \`handoffsavekar\` (or \`save_handoff\`) to leave structured handoff notes for the next agent.
- **Optional Arguments**: \`projectId\` is automatically resolved by the server connection; you can call \`yebata\` with \`{}\` without providing a project ID.
`,
        'utf8'
      );
    } catch {}
  }

  public uninstallAntigravity(): boolean {
    const configPath = this.getAntigravityConfigPath();
    if (!fs.existsSync(configPath)) return false;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.mcpServers && config.mcpServers.bhai) {
        delete config.mcpServers.bhai;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  private checkAntigravityConfigured(configPath: string): boolean {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Boolean(config?.mcpServers?.bhai);
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Project-Level Instructions Injection (CLAUDE.md, AGENTS.md, .cursorrules)
  // --------------------------------------------------------------------------

  public injectProjectInstructions(filePath: string, projectId: string, prefixHeader?: string): void {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    // Remove old block if present
    content = this.removeInstructionBlock(content);

    const block = `
${BHAI_INSTRUCTION_START}
## CRITICAL WORKFLOW DIRECTIVE: BHAI PERSISTENT MEMORY
This repository is connected to Bhai offline memory for project \`${projectId}\`.
The AI agent MUST follow this protocol on EVERY coding session without being prompted:

1. **SESSION INITIALIZATION (MANDATORY FIRST STEP)**:
   - On the very first turn of any task or session, you MUST call \`yebata\` (or \`get_project_context\`) with \`{}\` BEFORE performing file searches, grep, or code edits.
   - Review active tasks, established conventions, and unresolved blockers from the returned context pack.

2. **RECORDING PROGRESS & MILESTONES**:
   - When completing a task phase, implementing a component, passing tests, or discovering a blocker, you MUST call \`yesavekar\` (or \`save_checkpoint\`) with \`{ summary: "..." }\`. Keep payloads concise (<=2 KB).

3. **ARCHITECTURAL DECISIONS**:
   - When deciding on a new pattern, schema, dependency, or project invariant, call \`yaadrakh\` (or \`propose_decision\`) to preserve it for future sessions.

4. **SESSION CONCLUSION / HANDOFF**:
   - When concluding work or before context window compacts, you MUST call \`handoffsavekar\` (or \`save_handoff\`) so the next agent can resume without context loss.
${BHAI_INSTRUCTION_END}
`.trim();

    const base = content.trim();
    let updated = '';
    if (base) {
      updated = `${base}\n\n${block}\n`;
    } else if (prefixHeader) {
      updated = `${prefixHeader.trim()}\n\n${block}\n`;
    } else {
      updated = `${block}\n`;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, updated, 'utf8');
  }

  public removeProjectInstructions(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(BHAI_INSTRUCTION_START)) return false;

    const cleaned = this.removeInstructionBlock(content);
    fs.writeFileSync(filePath, cleaned, 'utf8');
    return true;
  }

  private removeInstructionBlock(content: string): string {
    const regex = new RegExp(`${BHAI_INSTRUCTION_START}[\\s\\S]*?${BHAI_INSTRUCTION_END}`, 'g');
    return content.replace(regex, '').trim();
  }

  // --------------------------------------------------------------------------
  // Guiding Skill Deployment & Multi-Editor Availability
  // --------------------------------------------------------------------------

  public installGuidingSkill(options: GuidingSkillInstallOptions): {
    installedTargets: string[];
    installedFiles: string[];
  } {
    const targets = options.targets || ['antigravity', 'codex', 'claude-code', 'cursor'];
    const installedTargets: string[] = [];
    const installedFiles: string[] = [];

    let skillContent = '';
    if (options.sourceSkillPath && fs.existsSync(options.sourceSkillPath)) {
      skillContent = fs.readFileSync(options.sourceSkillPath, 'utf8');
    } else {
      const candidates = [
        path.resolve(__dirname, '../../../skills/bhai-project-memory/SKILL.md'),
        path.resolve(process.cwd(), 'skills/bhai-project-memory/SKILL.md')
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          skillContent = fs.readFileSync(cand, 'utf8');
          break;
        }
      }
    }

    if (!skillContent) {
      skillContent = `---
name: bhai-project-memory
description: Guides AI coding agents to retrieve, update, and hand off local project context and architecture decisions using Bhai's local MCP memory engine.
---

# Bhai Project Memory Guide
Use Bhai MCP tools (yebata, yesavekar, yaadrakh, handoffsavekar, kahanthe) to maintain project continuity offline.
`.trim();
    }

    const isGlobal = options.global !== false;
    const projectRoot = options.projectRoot;
    const projectId = options.projectId || 'default';

    // 1. Google Antigravity IDE:
    // Global: ~/.gemini/antigravity/skills/bhai-project-memory/SKILL.md & ~/.gemini/skills/bhai-project-memory/SKILL.md
    if (targets.includes('antigravity')) {
      if (isGlobal) {
        const globalSkillPaths = [
          path.join(this.homeDir, '.gemini', 'antigravity', 'skills', 'bhai-project-memory', 'SKILL.md'),
          path.join(this.homeDir, '.gemini', 'skills', 'bhai-project-memory', 'SKILL.md')
        ];
        for (const gPath of globalSkillPaths) {
          try {
            fs.mkdirSync(path.dirname(gPath), { recursive: true });
            fs.writeFileSync(gPath, skillContent, 'utf8');
            installedFiles.push(gPath);
          } catch {}
        }
      }

      if (projectRoot) {
        const skillPath = path.join(projectRoot, '.agents', 'skills', 'bhai-project-memory', 'SKILL.md');
        fs.mkdirSync(path.dirname(skillPath), { recursive: true });
        fs.writeFileSync(skillPath, skillContent, 'utf8');
        installedFiles.push(skillPath);

        const agentsMd = path.join(projectRoot, 'AGENTS.md');
        this.injectProjectInstructions(agentsMd, projectId);
        installedFiles.push(agentsMd);

        const geminiMd = path.join(projectRoot, 'GEMINI.md');
        this.injectProjectInstructions(geminiMd, projectId);
        installedFiles.push(geminiMd);
      }

      installedTargets.push('antigravity');
    }

    // 2. OpenAI Codex & VS Code:
    // Global: ~/.codex/skills/bhai-project-memory/SKILL.md
    if (targets.includes('codex')) {
      if (isGlobal) {
        try {
          const codexSkillPath = path.join(this.homeDir, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md');
          fs.mkdirSync(path.dirname(codexSkillPath), { recursive: true });
          fs.writeFileSync(codexSkillPath, skillContent, 'utf8');
          installedFiles.push(codexSkillPath);
        } catch {}
      }

      if (projectRoot) {
        const projectCodexSkill = path.join(projectRoot, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md');
        fs.mkdirSync(path.dirname(projectCodexSkill), { recursive: true });
        fs.writeFileSync(projectCodexSkill, skillContent, 'utf8');
        installedFiles.push(projectCodexSkill);

        const agentsMd = path.join(projectRoot, 'AGENTS.md');
        this.injectProjectInstructions(agentsMd, projectId);
        installedFiles.push(agentsMd);
      }

      installedTargets.push('codex');
    }

    // 3. Claude Code:
    // Global: ~/.claude/skills/bhai-project-memory/SKILL.md & ~/.claude/CLAUDE.md
    if (targets.includes('claude-code')) {
      if (isGlobal) {
        const claudeGlobalSkill = path.join(this.homeDir, '.claude', 'skills', 'bhai-project-memory', 'SKILL.md');
        try {
          fs.mkdirSync(path.dirname(claudeGlobalSkill), { recursive: true });
          fs.writeFileSync(claudeGlobalSkill, skillContent, 'utf8');
          installedFiles.push(claudeGlobalSkill);
        } catch {}

        const claudeHomeMd = path.join(this.homeDir, '.claude', 'CLAUDE.md');
        try {
          this.injectProjectInstructions(claudeHomeMd, projectId);
          installedFiles.push(claudeHomeMd);
        } catch {}
      }

      if (projectRoot) {
        const claudeMd = path.join(projectRoot, 'CLAUDE.md');
        this.injectProjectInstructions(claudeMd, projectId);
        installedFiles.push(claudeMd);
      }

      installedTargets.push('claude-code');
    }

    // 4. Cursor IDE:
    // Global: ~/.cursor/skills-cursor/bhai-project-memory/SKILL.md & ~/.cursor/rules/bhai.md
    if (targets.includes('cursor')) {
      if (isGlobal) {
        const cursorGlobalSkill = path.join(this.homeDir, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md');
        try {
          fs.mkdirSync(path.dirname(cursorGlobalSkill), { recursive: true });
          fs.writeFileSync(cursorGlobalSkill, skillContent, 'utf8');
          installedFiles.push(cursorGlobalSkill);
        } catch {}

        const cursorGlobalRules = path.join(this.homeDir, '.cursor', 'rules', 'bhai.md');
        try {
          fs.mkdirSync(path.dirname(cursorGlobalRules), { recursive: true });
          this.injectProjectInstructions(cursorGlobalRules, projectId);
          installedFiles.push(cursorGlobalRules);
        } catch {}
      }

      if (projectRoot) {
        const cursorSkillPath = path.join(projectRoot, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md');
        fs.mkdirSync(path.dirname(cursorSkillPath), { recursive: true });
        fs.writeFileSync(cursorSkillPath, skillContent, 'utf8');
        installedFiles.push(cursorSkillPath);

        const cursorrules = path.join(projectRoot, '.cursorrules');
        this.injectProjectInstructions(cursorrules, projectId);
        installedFiles.push(cursorrules);

        const cursorRulesMdc = path.join(projectRoot, '.cursor', 'rules', 'bhai.mdc');
        try {
          fs.mkdirSync(path.dirname(cursorRulesMdc), { recursive: true });
          const mdcHeader = `---
description: Critical workflow directive to use Bhai offline memory for persistent context and progress tracking
globs: *
alwaysApply: true
---
`;
          this.injectProjectInstructions(cursorRulesMdc, projectId, mdcHeader);
          installedFiles.push(cursorRulesMdc);
        } catch {}
      }

      installedTargets.push('cursor');
    }

    return { installedTargets, installedFiles };
  }

  /**
   * Connect all detected AI agents (Codex, Cursor, Claude, Antigravity) to a specific project.
   * Installs the MCP transport into each agent config AND injects the project memory rules & skills.
   */
  public installAllToProject(options: {
    projectRoot: string;
    projectId: string;
    token?: string;
    binaryPath?: string;
  }): { installedTargets: string[]; installedFiles: string[]; mcpConfigsUpdated: string[] } {
    const mcpConfigsUpdated: string[] = [];
    const token = options.token || randomBytes(32).toString('hex');

    // Resolve binary path: use packaged path if app exists, otherwise use local development script
    let binary = options.binaryPath;
    if (!binary) {
      const appBin = '/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp';
      if (fs.existsSync(appBin)) {
        binary = appBin;
      } else {
        const localCandidates = [
          path.resolve(__dirname, '../../../bin/bhai-mcp'),
          path.resolve(process.cwd(), 'bin/bhai-mcp')
        ];
        for (const cand of localCandidates) {
          if (fs.existsSync(cand)) {
            binary = cand;
            break;
          }
        }
        if (!binary) binary = appBin;
      }
    }

    // 1. Install MCP transport into each agent's config
    try {
      this.installCodex({ projectId: options.projectId, token, binaryPath: binary });
      mcpConfigsUpdated.push(this.getCodexConfigPath());
    } catch {}

    try {
      this.installClaude({ projectId: options.projectId, token, binaryPath: binary });
      mcpConfigsUpdated.push(this.getClaudeConfigPath());
    } catch {}

    try {
      this.installCursor({ projectId: options.projectId, token, binaryPath: binary });
      mcpConfigsUpdated.push(this.getCursorConfigPath());
    } catch {}

    try {
      this.installAntigravity({ projectId: options.projectId, token, binaryPath: binary });
      mcpConfigsUpdated.push(this.getAntigravityConfigPath());
    } catch {}

    // 2. Deploy the guiding skill & instruction files directly into the project repository
    const skillResult = this.installGuidingSkill({
      projectRoot: options.projectRoot,
      projectId: options.projectId,
      global: false,
      targets: ['antigravity', 'codex', 'claude-code', 'cursor']
    });

    return {
      installedTargets: skillResult.installedTargets,
      installedFiles: skillResult.installedFiles,
      mcpConfigsUpdated
    };
  }

  public uninstallGuidingSkill(options: {
    projectRoot: string;
    targets?: Array<'claude-code' | 'codex' | 'cursor' | 'antigravity'>;
  }): { removedTargets: string[]; removedFiles: string[] } {
    const targets = options.targets || ['antigravity', 'codex', 'claude-code', 'cursor'];
    const removedTargets: string[] = [];
    const removedFiles: string[] = [];

    if (targets.includes('antigravity')) {
      const skillPath = path.join(options.projectRoot, '.agents', 'skills', 'bhai-project-memory', 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        fs.unlinkSync(skillPath);
        removedFiles.push(skillPath);
      }
      this.removeProjectInstructions(path.join(options.projectRoot, 'AGENTS.md'));
      this.removeProjectInstructions(path.join(options.projectRoot, 'GEMINI.md'));
      removedTargets.push('antigravity');
    }

    if (targets.includes('codex')) {
      const codexSkillPath = path.join(this.homeDir, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md');
      if (fs.existsSync(codexSkillPath)) {
        fs.unlinkSync(codexSkillPath);
        removedFiles.push(codexSkillPath);
      }
      const projectCodexSkill = path.join(options.projectRoot, '.codex', 'skills', 'bhai-project-memory', 'SKILL.md');
      if (fs.existsSync(projectCodexSkill)) {
        fs.unlinkSync(projectCodexSkill);
        removedFiles.push(projectCodexSkill);
      }
      this.removeProjectInstructions(path.join(options.projectRoot, 'AGENTS.md'));
      removedTargets.push('codex');
    }

    if (targets.includes('claude-code')) {
      this.removeProjectInstructions(path.join(options.projectRoot, 'CLAUDE.md'));
      removedTargets.push('claude-code');
    }

    if (targets.includes('cursor')) {
      const cursorSkillPath = path.join(options.projectRoot, '.cursor', 'skills-cursor', 'bhai-project-memory', 'SKILL.md');
      if (fs.existsSync(cursorSkillPath)) {
        fs.unlinkSync(cursorSkillPath);
        removedFiles.push(cursorSkillPath);
      }
      this.removeProjectInstructions(path.join(options.projectRoot, '.cursorrules'));
      removedTargets.push('cursor');
    }

    return { removedTargets, removedFiles };
  }
}

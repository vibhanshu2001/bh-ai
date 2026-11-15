import React, { useState } from 'react';
import { Cpu, Copy, Check, Shield, AlertCircle } from 'lucide-react';

interface AgentConnectionsProps {
  authorizations: any[];
  projectId: string;
  onRevoke: (clientName: string) => Promise<void>;
}

export const AgentConnections: React.FC<AgentConnectionsProps> = ({
  authorizations,
  projectId,
  onRevoke
}) => {
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'antigravity' | 'codex' | 'claude' | 'cursor'>('antigravity');

  const copySnippet = (client: string, snippet: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedClient(client);
    setTimeout(() => setCopiedClient(null), 2000);
  };

  const antigravitySnippet = `// ~/.gemini/config/mcp_config.json
{
  "mcpServers": {
    "bhai": {
      "command": "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp",
      "args": ["--project", "${projectId}", "--client", "antigravity"],
      "env": {
        "BHAI_PROJECT_ID": "${projectId}"
      }
    }
  }
}`;

  const codexSnippet = `# ~/.codex/config.toml
[mcp_servers.bhai]
command = "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp"
args = ["--project", "${projectId}", "--client", "codex"]

[mcp_servers.bhai.env]
BHAI_PROJECT_ID = "${projectId}"
`;

  const claudeSnippet = `// ~/.claude.json
{
  "mcpServers": {
    "bhai": {
      "command": "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp",
      "args": ["--project", "${projectId}", "--client", "claude-code"],
      "env": {
        "BHAI_PROJECT_ID": "${projectId}"
      }
    }
  }
}`;

  const cursorSnippet = `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "bhai": {
      "command": "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp",
      "args": ["--project", "${projectId}", "--client", "cursor"],
      "env": {
        "BHAI_PROJECT_ID": "${projectId}"
      }
    }
  }
}`;

  const getSnippet = () => {
    switch (activeTab) {
      case 'antigravity':
        return antigravitySnippet;
      case 'codex':
        return codexSnippet;
      case 'claude':
        return claudeSnippet;
      case 'cursor':
        return cursorSnippet;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Active Connected Agents Table */}
      <div className="memory-card">
        <div className="memory-card-header">
          <div>
            <h3 className="memory-card-title">Connected AI Coding Agents</h3>
            <span className="memory-card-subtitle">
              Agents granted local MCP broker authorization to retrieve context and record milestones
            </span>
          </div>
          <span className="memory-hub-badge">
            {authorizations.filter((a) => !a.isRevoked).length} Active
          </span>
        </div>

        {authorizations.length === 0 ? (
          <div className="p3-empty-services" style={{ padding: '24px 16px' }}>
            <Cpu size={24} style={{ color: 'var(--text-tertiary)', marginBottom: '8px' }} />
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              No agents have connected to this project yet
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Use the configuration guides below to connect Google Antigravity, OpenAI Codex, Claude Code, or Cursor.
            </div>
          </div>
        ) : (
          <div className="memory-table-wrap">
            <table className="memory-table">
              <thead>
                <tr>
                  <th>Agent Client</th>
                  <th>Granted Scopes</th>
                  <th>Status</th>
                  <th>Last Used</th>
                  <th style={{ textAlign: 'right' }}>Authorization</th>
                </tr>
              </thead>
              <tbody>
                {authorizations.map((auth) => {
                  const rawScopes = auth.scopes || (auth as any).permissions || 'read,write';
                  const scopesList = Array.isArray(rawScopes)
                    ? rawScopes
                    : String(rawScopes).split(',').map((s) => s.trim()).filter(Boolean);

                  return (
                    <tr key={auth.id || auth.clientName}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            className={`p3-status-dot ${auth.isRevoked ? 'removed' : 'available'}`}
                            title={auth.isRevoked ? 'Revoked' : 'Authorized'}
                          />
                          <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                            {auth.clientName}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {scopesList.map((s: string) => (
                            <span
                              key={s}
                              className="p3-tech-pill"
                              style={{ fontSize: '9.5px', fontFamily: 'ui-monospace, Menlo, monospace' }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                    <td>
                      <span className={`memory-status-pill ${auth.isRevoked ? 'rejected' : 'accepted'}`}>
                        {auth.isRevoked ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                      {auth.lastUsedAt ? new Date(auth.lastUsedAt).toLocaleTimeString() : 'Never'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!auth.isRevoked ? (
                        <button
                          onClick={() => onRevoke(auth.clientName)}
                          className="p3-btn danger"
                          style={{ padding: '3px 8px', fontSize: '10.5px' }}
                          title="Instantly revoke this agent's authorization token"
                        >
                          Revoke Access
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          Revoked
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guided Agent Setup Section */}
      <div className="memory-card">
        <div className="memory-card-header">
          <div>
            <h3 className="memory-card-title">Agent Configuration Guide</h3>
            <span className="memory-card-subtitle">
              Configure your local coding agents to seamlessly connect to Bhai's offline MCP Context Engine
            </span>
          </div>
          <Shield size={16} style={{ color: 'var(--accent)' }} />
        </div>

        {/* 4-Editor Segmented Bar */}
        <div className="agent-segmented-bar">
          <button
            onClick={() => setActiveTab('antigravity')}
            className={`agent-segmented-btn ${activeTab === 'antigravity' ? 'active' : ''}`}
          >
            Google Antigravity
          </button>
          <button
            onClick={() => setActiveTab('codex')}
            className={`agent-segmented-btn ${activeTab === 'codex' ? 'active' : ''}`}
          >
            OpenAI Codex (VS Code)
          </button>
          <button
            onClick={() => setActiveTab('claude')}
            className={`agent-segmented-btn ${activeTab === 'claude' ? 'active' : ''}`}
          >
            Claude Code
          </button>
          <button
            onClick={() => setActiveTab('cursor')}
            className={`agent-segmented-btn ${activeTab === 'cursor' ? 'active' : ''}`}
          >
            Cursor IDE
          </button>
        </div>

        {/* Snippet Display */}
        <div style={{ position: 'relative' }}>
          <pre className="memory-code-block" style={{ margin: 0 }}>
            {getSnippet()}
          </pre>
          <button
            onClick={() => copySnippet(activeTab, getSnippet())}
            className="p3-btn secondary"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '3px 8px',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {copiedClient === activeTab ? (
              <>
                <Check size={12} style={{ color: '#34c759' }} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

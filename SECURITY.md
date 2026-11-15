# Security policy

bh-ai is an early-stage local desktop application. Security fixes currently target
the latest source on the default branch; older snapshots have no separate
maintenance commitment.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** option on GitHub when
available. If private reporting is unavailable, open an issue containing only a
request for a private reporting channel. Wait for that channel before sharing
exploit steps or sensitive details.

In a private report, include the affected commit, macOS and Node.js versions,
reproduction steps, expected impact, and a minimal synthetic example. Do not
attach real MCP tokens, local databases, private project paths, or credentials.

## Local security boundaries

- The renderer accesses local operations through the preload/IPC bridge.
- Coding agents connect through a local Unix domain socket with project-scoped
  token authorization. Keep the desktop app and agent process on the same trusted Mac.
- Agent configuration files contain MCP credentials. Keep them private and revoke
  the relevant connection in Bhai if credentials are exposed.
- Project memory and chat history are stored locally in SQLite. The database is
  not encrypted by Bhai and may contain sensitive project information.
- Secret redaction reduces accidental exposure; it cannot guarantee that all
  private information is removed. Review data before sharing it.
- An external coding agent can send retrieved context to its own model provider.
  Review that agent's settings before granting it access to private project memory.

See the [security design](docs/architecture/SECURITY_DESIGN.md) for architectural
intent. Planning documents may describe safeguards beyond the current implementation.

# Bhai — Phase P4 Architecture: Local MCP Context Bridge

**Document ID:** P4-ARCH-002  
**Phase:** P4 — Project Memory & Context Engine  
**Status:** Architectural Design  
**Target Platform:** macOS 14+ (Sonoma, Sequoia), Apple Silicon (`arm64`)  

---

## 1. Architectural Philosophy & Boundaries

The **Local MCP Context Bridge** provides a standard, typed Model Context Protocol (MCP) interface for AI coding agents such as Claude Code, Codex, and Cursor.

### Core Non-Negotiables
1. **No Direct SQLite Writes:** The MCP bridge does **not** link directly to SQLite or run as an independent database writer. Doing so would violate Bhai's single-writer ownership model and risk WAL corruption or lock contention.
2. **Local Stdio Adapter:** The adapter runs locally as a child process of the invoking coding agent, reading JSON-RPC over `stdin` and writing responses to `stdout`.
3. **No Public Network Listener:** Bhai does **not** expose an unauthenticated HTTP or WebSocket port in Phase P4. Communication between the stdio adapter and Bhai's Engine occurs over a local Unix domain socket (`/tmp/bhai-<uid>/broker.sock`) or typed MessagePort.
4. **Project Scoped Authorization:** Agents cannot query arbitrary project data. Each connection is authenticated and authorized for a specific `projectId`.

```
+--------------------------------------------------------------------------------+
|                         AI Coding Agent (e.g. Claude Code)                     |
|                                                                                |
|  Calls MCP tool: yebata({ projectId: "proj_123", mode: "task" })               |
+---------------------------------------+----------------------------------------+
                                        |
                             stdio (JSON-RPC 2.0)
                                        v
+--------------------------------------------------------------------------------+
|                   Bhai MCP Stdio Adapter (bin/bhai-mcp)                        |
|                                                                                |
|  - Reads tool call from stdin, validates schema                                |
|  - Attaches local client token: BHAI_MCP_TOKEN                                 |
|  - Relays request to local Bhai broker over domain socket                      |
+---------------------------------------+----------------------------------------+
                                        |
                         Unix Domain Socket / Local IPC
                                        v
+--------------------------------------------------------------------------------+
|                      Bhai Main Process Capability Broker                       |
|                                                                                |
|  - Authenticates client token against mcp_authorizations                        |
|  - Verifies project grant and requested scopes                                  |
|  - Routes authorized request to Utility Process via MessagePort                |
+---------------------------------------+----------------------------------------+
                                        |
                             Utility MessagePort
                                        v
+--------------------------------------------------------------------------------+
|                   Utility Process: Memory Repository & Engine                  |
|                                                                                |
|  - Executes transactional SQLite query or ingestion                             |
|  - Returns formatted, token-budgeted response                                   |
+--------------------------------------------------------------------------------+
```

---

## 2. Authentication & Local Trust Boundary

### 2.1 OS-User Trust Realities
On macOS, processes running under the same user account have identical filesystem and Unix permission boundaries. A malicious same-user script could inspect other processes. 

Bhai mitigates accidental leakage and agent confusion by enforcing:
1. **Explicit Project Grant Tokens:** When an agent integration is configured, Bhai provisions a cryptographic grant token (`bhai_sec_<random_bytes>`). The token is stored as a SHA-256 hash in SQLite's `mcp_authorizations` table.
2. **Project Scoping:** The token is bound to a single `project_id`. If an agent uses a token for Project A to access Project B, the request is immediately rejected with `PERMISSION_DENIED`.
3. **Revocability:** Users can revoke an agent's access with one click in the Bhai Memory UI, invalidating the token immediately.

---

## 3. Complete Specification of Required MCP Tools (Namespace: `bhai`)

Public tool names follow a friendly Romanized-Hinglish vocabulary that reflects Bhai's personal-assistant identity, mapped to stable internal TypeScript operations. All tools provide explicit English descriptions so LLMs discover and invoke them accurately without requiring Hindi knowledge.

| Public Tool Name | Internal TS Operation | Scope / Permission | Description |
|---|---|---|---|
| `yebata` | `getContextPack` | `read_memory` | Retrieve bounded (<4000 tokens) markdown project context pack. |
| `dhoondh` | `searchMemory` | `read_memory` | Search project memory, decisions, and tasks using SQLite FTS5 BM25. |
| `kaamkaha` | `getTaskState` | `read_memory` | Fetch full details, progress history, and blockers for a specific task. |
| `kahanthe` | `getLatestHandoff` | `read_memory` | Retrieve the most recent structured handoff document saved by any agent. |
| `servicesbata` | `getProjectServices` | `read_memory` | Retrieve registered project services, configured ports, and scripts. |
| `kyabadla` | `getMemoryChanges` | `read_memory` | Incremental context sync; fetch updates since timestamp/revision. |
| `yesavekar` | `recordCheckpoint` | `write_checkpoints` | Submit an atomic milestone checkpoint (<=2 KB). |
| `yaadrakh` | `proposeMemoryUpdate` | `propose_decisions` | Submit a durable architectural convention or ADR for user review. |
| `handoffsavekar` | `saveHandoff` | `write_checkpoints` | Save structured multi-task session handoff state (<=16 KB). |

---

### Read Tools

#### 1. `yebata` (internal: `getContextPack`)
- **Purpose:** Retrieves a prebaked, token-budgeted context pack for the project.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string", "description": "Target project ID" },
      "mode": { "type": "string", "enum": ["quick", "task", "deep"], "default": "task" },
      "taskId": { "type": "string", "description": "Optional active task ID for task-focused context" },
      "maxTokens": { "type": "integer", "description": "Optional custom budget cap", "maximum": 8000 }
    },
    "required": ["projectId"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "projectId": "proj_123",
    "mode": "task",
    "estimatedTokens": 1420,
    "content": "# Project Context: Aawas\n...",
    "freshnessTimestamp": 1731628800000,
    "activeTask": { "id": "mem_tsk_456", "title": "JWT Auth" },
    "truncated": false
  }
  ```
- **Permission:** Requires `read_memory` scope.
- **Security:** Injected context is wrapped in protective delimiters instructing the agent that memory represents data, not overriding instructions.

---

#### 2. `dhoondh` (internal: `searchMemory`)
- **Purpose:** Full-text keyword search across project memory, decisions, and tasks using SQLite FTS5.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "query": { "type": "string", "minLength": 2, "maxLength": 128 },
      "category": { "type": "string", "enum": ["all", "decisions", "tasks", "records"], "default": "all" },
      "limit": { "type": "integer", "default": 10, "maximum": 25 }
    },
    "required": ["projectId", "query"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "results": [
      {
        "id": "mem_dec_789",
        "type": "decision",
        "title": "Use RS256 for JWT Verification",
        "snippet": "...selected RS256 due to public key distribution requirements...",
        "status": "accepted",
        "updatedAt": 1731620000000
      }
    ]
  }
  ```
- **Permission:** Requires `read_memory` scope.

---

#### 3. `kaamkaha` (internal: `getTaskState`)
- **Purpose:** Fetches full details, progress history, and blockers for a specific task.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "taskId": { "type": "string" }
    },
    "required": ["projectId", "taskId"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "task": {
      "id": "mem_tsk_456",
      "title": "Implement JWT Middleware",
      "status": "in_progress",
      "description": "Add token validation with public key rotation",
      "blockers": [],
      "recentCheckpoints": [
        { "type": "files.modified", "summary": "Created src/auth/verifier.ts", "timestamp": 1731625000000 }
      ]
    }
  }
  ```
- **Permission:** Requires `read_memory` scope.

---

#### 4. `kahanthe` (internal: `getLatestHandoff`)
- **Purpose:** Retrieves the most recent structured handoff document left by an agent.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "taskId": { "type": "string", "description": "Optional task filter" }
    },
    "required": ["projectId"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "handoff": {
      "id": "mem_hnd_001",
      "authorClient": "claude-code",
      "objective": "Setup auth middleware",
      "completedSummary": "- Middleware scaffolding\n- RS256 verification tests",
      "remainingSummary": "- Refresh token route\n- Redis blacklist check",
      "relevantFiles": ["src/auth/jwt.ts", "src/auth/jwt.test.ts"],
      "knownUncertainties": "Redis cluster connection URL in dev",
      "createdAt": 1731627000000
    }
  }
  ```
- **Permission:** Requires `read_memory` scope.

---

#### 5. `servicesbata` (internal: `getProjectServices`)
- **Purpose:** Retrieves registered project services, configured ports, and package scripts.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" }
    },
    "required": ["projectId"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "services": [
      {
        "id": "srv_api",
        "name": "API Gateway",
        "serviceType": "backend",
        "relativeCwd": "backend",
        "port": 5001,
        "packageScript": "npm run dev"
      }
    ]
  }
  ```
- **Permission:** Requires `read_memory` scope.

---

#### 6. `kyabadla` (internal: `getMemoryChanges`)
- **Purpose:** Incremental context sync; returns checkpoints and updates since a given timestamp or revision.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "sinceTimestamp": { "type": "integer" }
    },
    "required": ["projectId", "sinceTimestamp"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "changes": [
      { "entity": "checkpoint", "id": "mem_chk_101", "type": "task.progress", "timestamp": 1731628000000 }
    ],
    "hasMore": false
  }
  ```
- **Permission:** Requires `read_memory` scope.

---

### Write Tools

#### 7. `yesavekar` (internal: `recordCheckpoint`)
- **Purpose:** Submits an event checkpoint during active coding.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "taskId": { "type": "string" },
      "checkpointType": {
        "type": "string",
        "enum": [
          "task.started", "task.progress", "decision.proposed", "discovery.recorded",
          "files.modified", "evidence.recorded", "blocker.discovered",
          "blocker.resolved", "assumption.invalidated", "task.completed", "handoff.prepared"
        ]
      },
      "summary": { "type": "string", "maxLength": 256 },
      "payloadJson": { "type": "object" },
      "idempotencyKey": { "type": "string" },
      "evidenceRefs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "kind": { "type": "string", "enum": ["file", "git_commit", "test", "command"] },
            "reference": { "type": "string" }
          },
          "required": ["kind", "reference"]
        }
      }
    },
    "required": ["projectId", "checkpointType", "summary", "idempotencyKey"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "checkpointId": "mem_chk_102",
    "status": "recorded",
    "idempotent": true
  }
  ```
- **Permission:** Requires `write_checkpoints` scope.
- **Tiered Sizing Limits & Rationale:**
  - `payloadJson` is strictly capped at **2 KiB**. Payloads exceeding 2 KiB are rejected with `PAYLOAD_TOO_LARGE`.
  - Monotonic session quota: Capped at **200 checkpoints** per session (`SESSION_CHECKPOINT_QUOTA_EXCEEDED`).
  - *Architectural Rationale:* Routine checkpoints are frequent, atomic event-journal entries (milestones, decisions, status transitions). Keeping them $\le 2\text{ KiB}$ prevents journal bloat, preserves high-throughput WAL transactions, and stops agents from dumping uncompacted raw diffs. Larger data payloads belong in dedicated entities (`memory_handoffs` capped at 16 KiB; evidence summaries capped at 8 KiB).
- **Guiding Skill Integration:** Agents should only submit checkpoints at meaningful milestones as instructed by the canonical `bhai-project-memory` skill (see [P4_AGENT_INTEGRATION.md](P4_AGENT_INTEGRATION.md)). Routine file edits, intermediate shell commands, and raw transcripts are strictly forbidden.

---

#### 8. `yaadrakh` (internal: `proposeMemoryUpdate`)
- **Purpose:** Submits a durable architectural convention or decision candidate for user review.
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "category": { "type": "string", "enum": ["architecture", "convention", "decision"] },
      "title": { "type": "string", "maxLength": 256 },
      "content": { "type": "string", "maxLength": 4096 },
      "rationale": { "type": "string" }
    },
    "required": ["projectId", "category", "title", "content"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "proposalId": "mem_rec_201",
    "status": "pending_user_approval",
    "message": "Update submitted for user approval in Bhai Memory UI"
  }
  ```
- **Permission:** Requires `propose_decisions` scope.

---

#### 9. `handoffsavekar` (internal: `saveHandoff`)
- **Purpose:** Saves a structured session handoff for the next agent (capped at 16 KiB).
- **Input Schema:**
  ```json
  {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" },
      "taskId": { "type": "string" },
      "objective": { "type": "string", "maxLength": 1024 },
      "completedSummary": { "type": "string", "maxLength": 4096 },
      "remainingSummary": { "type": "string", "maxLength": 4096 },
      "blockersSummary": { "type": "string", "maxLength": 2048 },
      "decisionsSummary": { "type": "string", "maxLength": 2048 },
      "relevantFiles": { "type": "array", "items": { "type": "string" } },
      "testStatusSummary": { "type": "string" },
      "knownUncertainties": { "type": "string" }
    },
    "required": ["projectId", "objective", "completedSummary", "remainingSummary"]
  }
  ```
- **Output Schema:**
  ```json
  {
    "handoffId": "mem_hnd_002",
    "status": "saved",
    "createdAt": 1731629000000
  }
  ```
- **Permission:** Requires `write_checkpoints` scope.
- **Limits:** Entire handoff document is capped at 16 KiB.

---

## 4. Agent Configuration & Discovery

### 4.1 Claude Code Configuration
Claude Code supports MCP servers via `~/.claude.json` or `claude mcp add`:
```json
{
  "mcpServers": {
    "bhai": {
      "command": "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp",
      "args": ["--project", "proj_aawas_uuid"],
      "env": {
        "BHAI_KEYCHAIN_ACCOUNT": "bhai.project.proj_aawas_uuid"
      }
    }
  }
}
```

### 4.2 Codex Configuration (`~/.codex/config.toml` — TOML Format)
OpenAI Codex CLI uses TOML configuration located at `~/.codex/config.toml` under `[mcp_servers]`:
```toml
[mcp_servers.bhai]
command = "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp"
args = ["--project", "proj_aawas_uuid"]

[mcp_servers.bhai.env]
BHAI_KEYCHAIN_ACCOUNT = "bhai.project.proj_aawas_uuid"
```

### 4.3 Cursor IDE Configuration (`~/.cursor/mcp.json` or `.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "bhai": {
      "command": "/Applications/Bhai.app/Contents/Resources/bin/bhai-mcp",
      "args": ["--project", "proj_aawas_uuid"],
      "env": {
        "BHAI_KEYCHAIN_ACCOUNT": "bhai.project.proj_aawas_uuid"
      }
    }
  }
}
```

### 4.4 Automated, Reversible Setup Wizard in Bhai UI (Agent Integration Kit)
In the Bhai Memory UI ("Connections" tab), clicking **"Connect Claude Code"**, **"Connect Codex"**, or **"Connect Cursor"**:
1. **Keychain-Backed Credential Security:** Generates a fresh project grant token and securely provisions it inside the **macOS Keychain** using `Electron.safeStorage` (encrypted via OS Keychain keys, service `com.bhai.mcp`, account `bhai.project.<projectId>`). Generated client configs reference `BHAI_KEYCHAIN_ACCOUNT` rather than raw bearer tokens. Tokens are **NEVER** written to tracked project repository files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) to prevent accidental Git leaks.
2. **Non-Destructive Project Instructions:** Injects the Guiding Skill reference into project instruction files using explicit demarcated blocks (`<!-- BHAI_PROJECT_MEMORY_START --> ... <!-- BHAI_PROJECT_MEMORY_END -->`), preserving all existing user instructions outside the markers.
3. **Surgical Removal (No Blind `.bak` Overwrite):** Clicking "Disconnect" performs an in-place AST modification deleting only the `bhai` MCP server entry and the delimited instruction block. It **never** restores an old whole-file backup, ensuring user modifications made after installation remain safe.
4. **Episodic Handshake Verification:** Pings `/tmp/bhai-<uid>/broker.sock` to confirm socket readiness before activating the UI badge.

---

## 5. Performance Targets vs. Acceptance Guarantees

Bhai strictly separates deterministic code guarantees from engineering performance targets:
- **Hard Guarantees (Enforced by Bhai Code):**
  - SQLite single-writer transactional consistency and WAL mode integrity.
  - Context Pack token budgets strictly capped ($\le$ requested budget, max 4,000 tokens).
  - Indestructible preservation of approved ADRs and active blockers.
  - Idempotent deduplication of checkpoints by `(project_id, idempotency_key)`.
  - Project-scoped access enforcement and automatic secret redaction.
- **Engineering Targets (Measured in Automated Test Harness):**
  - Target checkpoint ingestion latency: p95 $< 25$ ms.
  - Target Context Pack generation latency: p95 $< 100$ ms.
- **Empirical Benchmark Hypotheses (Evaluated in Benchmark Scenarios):**
  - Estimated $50\%\text{--}80\%$ reduction in initial exploratory discovery tool calls.
  - Net token savings ratio (ROI) $\ge 4.0\times$ across multi-session tasks.

# Bhai — Phase P4 Implementation Plan: Project Memory & Context Engine

**Document ID:** P4-PLAN-001  
**Phase:** P4 — Project Memory & Context Engine  
**Status:** Implementation Roadmap  
**Target Platform:** macOS 14+ (Sonoma, Sequoia), Apple Silicon (`arm64`)  

---

## 1. Incremental Execution Strategy

Phase P4 is divided into four independently testable and verifiable increments:
- **P4.1 — Memory Foundation:** SQLite schema, migrations, domain models, repositories, and FTS5 search.
- **P4.2 — Local MCP Bridge & Checkpoints:** Stdio MCP adapter, client authentication, read/write tools, and agent handoffs.
- **P4.3 — Context Compaction & Context Packs:** Deterministic compaction, token-budgeted Context Packs, and cache invalidation.
- **P4.4 — Project Memory UI & Final Validation:** Native macOS memory UI, visual curation, benchmarking, and end-to-end regression.

---

## 2. Increment P4.1 — Memory Foundation

### 2.1 Scope & Objectives
Establish the relational and full-text search persistence layer for project memory in Bhai's SQLite database, preserving the single-writer Utility Process architecture.

### 2.2 Detailed Work Breakdown
1. **Migration 004 & 005 Implementation:**
   - Add `004_p4_memory_foundation` to `src/utility/storage/migrations.ts` (`memory_records`, `memory_tasks`, `memory_decisions`, `memory_checkpoints`, `memory_handoffs`, `mcp_authorizations`, `context_cache`).
   - Add `005_p4_fts5_indexing` for SQLite FTS5 search and synchronization triggers.
2. **Domain DTOs & Validation Schemas:**
   - Define strict Zod contracts in `src/shared/contracts/memory_dto.ts` for all entities, ensuring payloads cannot exceed bounds (2 KB for checkpoints, 16 KB for records).
3. **Memory Repository:**
   - Implement `src/utility/storage/memory_repository.ts` managing transactional CRUD operations, revision increments, and project-scoped isolation.
4. **FTS5 Search Adapter:**
   - Implement fast keyword and phrase queries in `MemoryRepository` using BM25 ranking.

### 2.3 File Modification & Creation List
- `src/utility/storage/migrations.ts` (Modified: add migrations 4 & 5)
- `src/shared/contracts/memory_dto.ts` (Created: Zod schemas & TypeScript types)
- `src/utility/storage/memory_repository.ts` (Created: repository implementation)
- `src/tests/integration/p4_memory_foundation.test.ts` (Created: integration test suite)

### 2.4 Acceptance Checks & Completion Gate
- [ ] Migrations 004 and 005 apply cleanly on fresh and existing databases.
- [ ] Checksum verification passes; rollback restores previous state on migration error.
- [ ] Unregistering a project (`projects.delete`) cascades cleanly to all memory records, checkpoints, and tasks via foreign keys.
- [ ] FTS5 queries return relevant records in <10 ms on a 1,000-record dataset.
- [ ] Application cold restart preserves all memory records and indices intact.

---

## 3. Increment P4.2 — Local MCP Bridge & Continuous Checkpoints

### 3.1 Scope & Objectives
Implement the local MCP stdio bridge allowing Claude Code, Codex, and Cursor to read project context and submit milestone checkpoints over local IPC.

### 3.2 Detailed Work Breakdown
1. **Local Stdio Adapter (`bin/bhai-mcp` & `src/mcp/stdio_bridge.ts`):**
   - Standard JSON-RPC 2.0 stdio listener complying with the Model Context Protocol specification.
   - Forwards tool calls to Bhai's IPC Broker via local domain socket (`/tmp/bhai-<uid>/broker.sock`).
2. **Canonical Guiding Skill (`skills/bhai-project-memory/SKILL.md`):**
   - Authoritative multi-agent guiding skill instructing models when to retrieve context, how to submit milestones, how to avoid routine chatter, and when to save handoffs (see [P4_AGENT_INTEGRATION.md](../architecture/P4_AGENT_INTEGRATION.md)).
3. **Agent Integration Kit (`src/main/mcp/agent_installer.ts`):**
   - Automatic detection of installed Claude Code (`~/.claude.json`), Codex (`~/.codex/config.toml` — TOML), and Cursor (`~/.cursor/mcp.json`).
   - Non-destructive configuration injection, project grant token generation, and reversible uninstallation without blind `.bak` overwriting.
   - Project-level instruction synchronization (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) using delimited HTML comment blocks.
4. **Broker Authorization & Grant Management:**
   - Implement `McpAuthManager` in `src/main/broker/mcp_broker.ts` to validate client grant tokens against `mcp_authorizations`.
   - Strictly reject requests where `token.projectId !== request.projectId`.
5. **Public MCP Tool Registry & Execution Handlers (Utility Process):**
   - Implement read tools under server namespace `bhai`: `yebata` (`getContextPack`), `dhoondh` (`searchMemory`), `kaamkaha` (`getTaskState`), `kahanthe` (`getLatestHandoff`), `servicesbata` (`getProjectServices`), `kyabadla` (`getMemoryChanges`).
   - Implement write tools: `yesavekar` (`recordCheckpoint`), `yaadrakh` (`proposeMemoryUpdate`), `handoffsavekar` (`saveHandoff`).
   - Provide clear English descriptions and JSON Schemas for each tool.
6. **Continuous Checkpoint Ingestion Pipeline:**
   - Enforce tiered sizing: Checkpoint `payloadJson` <= 2 KiB (max 200/session quota), evidence summaries <= 8 KiB, handoff documents <= 16 KiB.
   - Implement secret redaction, idempotency key caching, and transaction commits.
7. **Automated MCP Contract Test Suite:**
   - Create `src/tests/unit/p4_mcp_contract.test.ts` to verify public tool names, descriptions, input schemas, and permission mappings against the specification.

### 3.3 File Modification & Creation List
- `skills/bhai-project-memory/SKILL.md` (Created: canonical guiding skill)
- `bin/bhai-mcp` (Created: standalone stdio CLI executable)
- `src/mcp/stdio_bridge.ts` (Created: CLI stdio MCP server)
- `src/main/mcp/agent_installer.ts` (Created: Agent Integration Kit installer/uninstaller)
- `src/main/broker/mcp_broker.ts` (Created: broker auth & socket listener)
- `src/utility/mcp/tool_registry.ts` (Created: public-to-internal tool executors)
- `src/utility/mcp/checkpoint_pipeline.ts` (Created: validation & continuous ingestion)
- `src/tests/unit/p4_mcp_contract.test.ts` (Created: public tool contract and schema test)
- `src/tests/integration/p4_mcp_bridge.test.ts` (Created: tool and bridge integration tests)
- `src/tests/integration/p4_agent_integration_kit.test.ts` (Created: agent discovery and install tests)

### 3.4 Acceptance Checks & Completion Gate
- [ ] Automated contract tests in `p4_mcp_contract.test.ts` pass 100%, verifying all 9 public tool names, descriptions, and schemas.
- [ ] Local stdio adapter launches and passes MCP initialization handshake.
- [ ] Agent Integration Kit discovers installed agents, safely modifies config without clobbering existing settings, and cleanly uninstalls.
- [ ] Duplicate checkpoint submissions with identical idempotency keys return the existing ID (no duplicate rows).
- [ ] Payloads >2 KiB are rejected with `PAYLOAD_TOO_LARGE`.
- [ ] Claude Code submits a checkpoint via `yesavekar`, and Codex reads that checkpoint in a separate subsequent session.
- [ ] Access without a valid project grant token is rejected with `PERMISSION_DENIED`.
- [ ] If Bhai is offline, the agent continues development normally without blocking or looping.

---

## 4. Increment P4.3 — Context Compaction & Context Packs

### 4.1 Scope & Objectives
Implement the two-layer compaction engine (Layer A deterministic; Layer B optional local model) and the token-budgeted Context Pack retrieval engine.

### 4.2 Detailed Work Breakdown
1. **Deterministic Compactor (`src/utility/memory/deterministic_compactor.ts`):**
   - Merges sequential task progress checkpoints into consolidated progress states.
   - Enforces indestructible invariants: 100% of decisions and active blockers are preserved.
   - Formats contradictions into explicit disputed claims.
2. **Context Pack Generator (`src/utility/memory/context_pack_generator.ts`):**
   - Implements Quick (~500 tokens), Task (~1,500 tokens), and Deep (~4,000 tokens) formats.
   - AST-based token budgeting with progressive truncation and conservative token accounting.
   - Caches packs in `context_cache` with revision-based invalidation.
3. **Optional Local Model Runner (Layer B):**
   - Implement `src/utility/memory/local_model_adapter.ts` interfacing with local Ollama (`/api/generate`) or llama.cpp if running.
   - Strict 5-second timeout, feature-flag gated (`preferences.enable_local_ai_compaction`).
   - Graceful fallback: defaults silently to Layer A if model is missing or slow.
4. **Stale File Reference Detection:**
   - Cross-checks file references in context packs against the local filesystem, tagging missing files as `(stale reference)`.

### 4.3 File Modification & Creation List
- `src/utility/memory/deterministic_compactor.ts` (Created: Layer A compactor)
- `src/utility/memory/local_model_adapter.ts` (Created: Layer B inference adapter)
- `src/utility/memory/context_pack_generator.ts` (Created: context pack builder)
- `src/utility/memory/token_counter.ts` (Created: heuristic & exact token counters)
- `src/tests/integration/p4_compaction_and_packs.test.ts` (Created: compaction tests)

### 4.4 Acceptance Checks & Completion Gate
- [ ] Quick Pack is generated under 550 tokens; Task Pack is generated under 1,600 tokens.
- [ ] Compaction reduces an artificial 100-checkpoint history by >=60% token volume while keeping all decisions and blockers intact.
- [ ] Disabling or terminating Ollama causes Layer B to fall back to Layer A without throwing errors.
- [ ] Writing a new checkpoint instantly invalidates the cached context pack.

---

## 5. Increment P4.4 — Project Memory UI & Final Validation

### 5.1 Scope & Objectives
Provide an expanded macOS-native interface for inspecting, editing, and managing project memory, and execute full end-to-end validation including cross-agent handoffs and token efficiency benchmarking.

### 5.2 Detailed Work Breakdown
1. **Expanded Memory Window / View:**
   - Build `src/renderer/components/memory/MemoryHub.tsx` inside Bhai's expanded window shell.
   - Implement the 8 required sections: Overview, Knowledge, Decisions, Tasks, Handoffs, Activity, Connections, Storage.
2. **Visual Editing & Curation:**
   - Inline Markdown editor for architecture conventions and decisions.
   - User approval / rejection sheet for agent-proposed memory updates (`yaadrakh`, internal: `proposeMemoryUpdate`).
3. **Connections & Access Control:**
   - Active MCP clients view with one-click revocation button.
   - Guided agent configuration modal (copy-pasteable snippets for Claude Code and Codex).
4. **End-to-End Cross-Agent Validation:**
   - Execute the real Claude Code -> Codex handoff scenario.
5. **Token Efficiency & Storage Benchmarking:**
   - Implement and execute the 6-scenario benchmark suite in `scripts/run_p4_benchmarks.js`.
6. **P1–P3 Regression Suite Execution:**
   - Ensure 0 regressions in Assistant chat, deterministic language engine, and Phase P3 project registry.

### 5.3 File Modification & Creation List
- `src/renderer/components/memory/MemoryHub.tsx` (Created: primary memory management UI)
- `src/renderer/components/memory/DecisionEditor.tsx` (Created: ADR editor)
- `src/renderer/components/memory/AgentConnections.tsx` (Created: MCP client manager)
- `src/renderer/components/memory/StorageMetrics.tsx` (Created: compaction & disk usage view)
- `scripts/run_p4_benchmarks.js` (Created: automated benchmark runner)
- `src/tests/integration/p4_cross_agent_handoff.test.ts` (Created: E2E handoff test)

### 5.4 Acceptance Checks & Completion Gate
- [ ] User can view, edit, and approve agent-proposed decisions in the Memory UI.
- [ ] User can revoke an MCP client's token, and subsequent agent tool calls are rejected immediately.
- [ ] Claude Code records a session handoff; Codex reads the handoff and completes the remaining task.
- [ ] All P1, P2, and P3 unit and integration tests pass at 100% with 0 regressions.
- [ ] Benchmark report generated documenting token savings across all test scenarios.

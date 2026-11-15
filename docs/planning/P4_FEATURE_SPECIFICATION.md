# Bhai — Phase P4 Feature Specification: Project Memory & Context Engine

**Document ID:** P4-SPEC-001  
**Phase:** P4 — Project Memory & Context Engine  
**Product Pillar:** Bhai Memory (Pillar 1.2)  
**Status:** Finalized Feature Specification  
**Target Platform:** macOS 14+ (Sonoma, Sequoia), Apple Silicon (`arm64`)  
**AI Requirement:** Fully offline-first; 0 cloud dependencies; optional local model (Layer B) strictly non-blocking.  

---

## 1. Executive Summary & Product Alignment

Bhai is an offline-first personal macOS assistant that remembers useful context, performs approved local actions, and automates repetitive work.

**Product Positioning:**  
> *Bhai — Your Mac. Your routines. Your context.*

**Developer Value Proposition:**  
> *Your AI agents start informed, and every meaningful iteration makes the next one easier.*

Bhai stands on three permanent pillars:
1. **Bhai Assistant:** Natural-language Mac assistance, deterministic English/Hinglish command understanding, project awareness, system inspection, and safe local operations.
2. **Bhai Memory:** Persistent project knowledge, technical decisions, task progress, cross-agent context, session handoffs, and token-efficient Context Packs.
3. **Bhai Workflows:** Visual, reusable automation for everyday Mac tasks and developer routines, using a shared permission-controlled action engine.

### Phase P4 Mission
Phase P4 implements the core of the **Bhai Memory** pillar. It provides a local, high-fidelity **Project Memory & Context Engine** allowing external AI coding agents (such as Claude Code, GitHub Copilot CLI / Codex, Cursor, and custom tools) to share structured, persistent, local project context.

P4 does **not** turn Bhai into a generic cloud or HTTP MCP server, nor does it replace Bhai's primary personal-assistant identity. The compact menu-bar Quick Panel remains the primary interface for everyday assistance, while rich project memory management is exposed through the expanded application window.

---

## 2. Feature Inventory: P4-F01 Through P4-F09

| Feature ID | Feature Name | Core Mission | Key Boundaries |
| :--- | :--- | :--- | :--- |
| **P4-F01** | **Persistent Project Memory** | Durable, structured project knowledge store scoped by canonical project ID. | Stores overview, conventions, decisions, tasks, blockers, handoffs, and revisions. Never duplicates project registration. |
| **P4-F02** | **Continuous Agent Checkpoints** | Milestone-driven checkpoint ingestion from coding agents via local MCP. | Structured events (<=2 KB), deduplicated, idempotent, with source attribution. Not a keylogger or transcript recorder. |
| **P4-F03** | **Offline Hybrid Context Compaction** | Two-layer memory reduction (Layer A deterministic; Layer B optional local LLM). | Layer A has 0 AI dependency. Preserves decisions and open blockers indefinitely. Contradictions surfaced explicitly. |
| **P4-F04** | **Prebaked Context Packs** | Tiered, token-bounded context generation (Quick ~500, Task ~1,500, Deep ~4,000 tokens). | Fast local FTS5/relational retrieval, stable ordering, provenance badges, progressive disclosure, cache invalidation. |
| **P4-F05** | **Local MCP Context Bridge** | Local stdio adapter for Model Context Protocol clients. | Communicates exclusively with Bhai Utility/Main broker over local IPC. Single-writer SQLite invariant preserved. No public HTTP. |
| **P4-F06** | **Project Memory Management UI** | Dedicated macOS-native UI in Bhai's expanded window. | 8 clear views: Overview, Knowledge, Decisions, Tasks, Handoffs, Activity, Connections, Storage. |
| **P4-F07** | **Cross-Agent Session Handoffs** | Structured task continuation packets between different agents (e.g., Claude Code -> Codex). | Untrusted previous claims flagged for re-verification. No access to private agent reasoning or transcripts required. |
| **P4-F08** | **Security, Privacy & Permissions** | Project-scoped authorization, local credential exchange, prompt-injection defense. | Offline-first, secret redaction, audit logging, separate read/write grants, user review for durable knowledge updates. |
| **P4-F09** | **Context Efficiency & Reliability Benchmarking** | Empirical benchmarking against Baseline A (raw discovery) and Baseline B (static AGENTS.md). | Measures token savings, tool calls, latency, memory growth, and task continuation correctness across 6 scenarios. |

---

## 3. Detailed Feature Specifications

### P4-F01 — Persistent Project Memory

#### 3.1 Description
Durable local repository storing structured, versioned project context in SQLite. Records are linked to stable project UUIDs established in Phase P3 (`projects.id`).

#### 3.2 Epistemological Taxonomy (Strict Separation of Evidence Tiers)
Bhai Memory strictly classifies all records into four epistemological tiers:
1. **Observed Facts (`observed_fact`):** Information independently verified by Bhai through approved local inspection (e.g. Git branch, detected frameworks, active ports, directory layout). Confidence: `verified`.
2. **Agent-Reported Claims (`agent_claim`):** Context submitted by coding agents via MCP that Bhai has not independently verified. Confidence: `unverified` or `disputed`.
3. **User-Approved Knowledge (`user_approved`):** Architectural guidelines, conventions, or decisions authored or explicitly reviewed and approved by the developer. Confidence: `approved`.
4. **Historical Information (`historical`):** Superseded checkpoints, completed task revisions, or deprecated decisions retained for auditability and session backtracking.

#### 3.3 Durable Memory Entities
- **Project Overview & Purpose:** High-level problem statement, stack summary, key repository paths.
- **Architecture & Conventions:** File organization patterns, coding styles, testing patterns, error-handling conventions.
- **Technical Decisions (ADRs):** Title, status (`proposed`, `accepted`, `rejected`, `deprecated`), rationale, trade-offs, author agent/user, decision timestamp.
- **Tasks & Work Items:** Title, description, status (`backlog`, `in_progress`, `blocked`, `completed`), priority, assigned agent session, blockers list.
- **Blockers & Impediments:** Open technical obstacles, affected tasks, discovery session, resolution criteria, status (`active`, `resolved`).
- **Source References & Evidence:** File paths, Git commit hashes, line ranges, test execution references.
- **Session Handoffs:** Structured continuation documents bridging sessions.

---

### P4-F02 — Continuous Agent Checkpoints & Guiding Skill

#### 3.1 Description
Ingests milestone-driven context updates from connected coding agents during development, guided by an official Bhai Guiding Skill (`bhai-project-memory`). Checkpoints capture meaningful architectural and progress shifts without flooding the database with keystroke-level logs or complete tool outputs. Checkpoint ingestion is bidirectional: agents pull context at startup and actively contribute structured deltas as development unfolds.

#### 3.2 Canonical Guiding Skill (`bhai-project-memory`)
- **Repository Location:** `skills/bhai-project-memory/SKILL.md`
- **Purpose:** Guides compatible coding agents (Claude Code, Codex, Cursor) when to query Bhai context, what events constitute a milestone checkpoint, how to preserve state before compaction, and when to save session handoffs.
- **Specification:** Fully detailed in [P4_AGENT_INTEGRATION.md](../architecture/P4_AGENT_INTEGRATION.md).

#### 3.3 Agent Interaction Lifecycle (Stages A–F)
1. **Stage A (Session Startup):** Agent identifies project via cwd, pulls the smallest appropriate Context Pack (`yebata`, internal: `getContextPack`), and verifies stale data before coding.
2. **Stage B (Task Initialization):** Agent records task objective via `yesavekar(checkpointType="task.started")` or reuses an existing active task ID.
3. **Stage C (Active Development):** Agent records milestone events (decisions, discoveries, test evidence, blockers) via `yesavekar` while strictly avoiding routine file read/edit chatter.
4. **Stage D (Context Pressure / Pre-Compaction):** Agent preserves in-flight task state via `yesavekar(checkpointType="handoff.prepared")` before conversation compaction or restarts.
5. **Stage E (Session Completion):** Agent saves structured handoff (`handoffsavekar`, internal: `saveHandoff`) with completed/pending work, dirty files, and verification commands.
6. **Stage F (Next-Agent Continuation):** Subsequent agents (e.g. Codex after Claude) resume directly from the saved handoff via `kahanthe` without repeated discovery.

#### 3.4 Supported Checkpoint Categories
- `task.started`: Agent initiated work on a defined task.
- `task.progress`: Agent reached a significant intermediate step or milestone.
- `decision.proposed`: Agent identified an architectural or technical fork and proposed an option.
- `discovery.recorded`: Agent discovered a non-obvious codebase quirk, undocumented constraint, or bug.
- `files.modified`: Agent modified or created specific files (records relative paths and semantic roles).
- `evidence.recorded`: Test execution results, benchmark outputs, or verification traces.
- `blocker.discovered`: Task progress is halted by an obstacle or missing dependency.
- `blocker.resolved`: An existing blocker was resolved with supporting rationale.
- `assumption.invalidated`: An earlier assumption proved false upon testing or inspection.
- `task.completed`: Agent finished implementation and verified acceptance criteria.
- `handoff.prepared`: Agent finished its session or prepared pre-compaction state.

#### 3.5 Checkpoint Data Contract
```typescript
interface AgentCheckpointPayload {
  projectId: string;                // FK to projects.id
  taskId?: string;                  // FK to memory_tasks.id
  agentIdentity: {
    clientName: string;             // e.g. "claude-code", "codex", "cursor"
    clientVersion?: string;         // e.g. "1.0.12"
    sessionId: string;              // Client session UUID
  };
  checkpointType: CheckpointType;   // Enum of 11 categories above
  summary: string;                  // Brief description (<= 256 chars)
  payloadJson: Record<string, any>; // Structured metadata (strictly <= 2 KB, capped)
  idempotencyKey: string;           // Client-generated unique hash/UUID
  baseRevision?: number;            // Monotonic revision for optimistic concurrency
  clientSequence?: number;          // Monotonic sequence within agent session
  timestamp: number;                // UTC millisecond timestamp
  evidenceRefs?: Array<{            // Supporting evidence references (<= 8 KB summary)
    kind: 'file' | 'git_commit' | 'test' | 'command';
    reference: string;
    details?: string;
  }>;
}
```

#### 3.6 Ingestion Guarantees & Tiered Sizing
- **Tier 1 (Atomic Checkpoints):** Checkpoint `payloadJson` strictly capped at **2 KiB**. Payloads exceeding 2 KiB are rejected with `PAYLOAD_TOO_LARGE`.
- **Session Cap:** Capped at **200 checkpoints** per agent session (`SESSION_CHECKPOINT_QUOTA_EXCEEDED`).
- **Tier 2 (Evidence References):** Evidence logs stored as references or bounded summaries capped at **8 KiB**.
- **Tier 3 (Session Handoffs):** Comprehensive multi-task continuation handoffs capped at **16 KiB**.
- **Idempotency:** Checked via `(project_id, idempotency_key)`. Duplicate submissions return the existing checkpoint ID without duplicating state.
- **Process Crash Recovery:** Ingestion occurs within an immediate SQLite transaction. Crash during ingestion results in complete rollback.
- **Offline / Non-Interference Invariant:** If Bhai is offline, the agent continues development normally without blocking, looping, or failing.

---

### P4-F03 — Offline Hybrid Context Compaction

#### 3.1 Description
Offline, two-tiered compaction pipeline that prevents memory bloat while preserving architectural knowledge, open blockers, and session continuity.

#### 3.2 Architectural Three-Layer Model
1. **Event Journal (Layer A):** Attributed, immutable event stream of raw checkpoints, handoffs, and revisions.
2. **Current Knowledge (Layer B):** Synthesized, deduplicated relational state of active tasks, decisions, open blockers, and verified conventions.
3. **Context Packs (Layer C):** Materialized, token-budgeted views generated on-demand or cached for immediate agent retrieval.

#### 3.3 Compaction Layers
- **Layer A — Deterministic Compaction (Mandatory, 0 LLM Dependency):**
  - Deduplicates identical claims and merges successive progress checkpoints for the same task.
  - Supersedes outdated task states (`in_progress` -> `completed`).
  - Preserves 100% of technical decisions and active blockers regardless of age.
  - Retains the last 20 checkpoints per active task and the last 50 per project.
  - Enforces strict token budgets using structural AST pruning and token accounting.
- **Layer B — Local Model-Assisted Compaction (Optional, Feature-Flagged):**
  - Optional local runner (e.g. Ollama or Apple MLX/llama.cpp running `qwen2.5-coder:1.5b` or `llama3.2:1b`).
  - Condenses verbose session logs and multi-checkpoint narratives into structured bullet summaries.
  - Generates candidate cross-task linkages for user review.
  - Bounded CPU, memory (<1 GB), and strict 5-second execution timeout.
  - If unavailable or disabled, Layer A continues without degradation of core functionality.

#### 3.4 Indestructible Memory Invariants
- An active or unresolved blocker **never** disappears during compaction.
- An approved technical decision **never** gets purged by quota or age pruning.
- Contradictory agent claims are stored as `disputed` with both viewpoints recorded; they are **never** resolved silently by last-write-wins.

---

### P4-F04 — Prebaked Context Packs

#### 3.1 Description
Generates tailored, token-bounded context packages for coding agents, minimizing input token consumption and eliminating repetitive exploratory file scans.

#### 3.2 Context Pack Modes & Token Budgets
| Pack Mode | Target Budget | Target Contents | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Quick Context** | ~500 tokens | Project identity, tech stack, 3-5 core module paths, active task title/status, latest handoff summary. | Initial agent initialization; quick CLI questions. |
| **Task Context** | ~1,500 tokens | Architecture conventions, current task details, task decisions, active blockers, relevant modified files, recent progress checkpoints. | Active coding session continuation. |
| **Deep Context** | ~4,000 tokens | Full architecture, all related decisions with rationale, task history, complete blocker resolutions, verification evidence, project constraints. | Complex refactors, architectural audits, root-cause investigations. |

#### 3.3 Generation & Retrieval Rules
- **Progressive Disclosure:** Packs provide summaries with stable entity IDs. Agents can fetch supporting details on-demand using specific read tools (`kaamkaha`, `dhoondh`).
- **Token Accounting:** Uses conservative heuristic estimators (4 characters = 1 token for code/text) with explicit reporting of `estimatedTokens` vs `measuredTokens`.
- **Cache Invalidation:** Materialized packs are cached in `context_cache` with a `content_hash` and `config_revision`. Any new checkpoint, decision, or task update invalidates the affected project's cache immediately.
- **Stale Reference Warning:** Files referenced in memory that no longer exist on disk (checked via lightweight `fs.existsSync` or Git status) are flagged with `(stale reference: file moved or deleted)`.

---

### P4-F05 — Local MCP Context Bridge

#### 3.1 Description
A standards-compliant Model Context Protocol (MCP) server providing local access for Claude Code, Codex, Cursor, and other tools.

#### 3.2 Transport Architecture
- Transport: **Local stdio adapter** (`bhai-mcp` CLI or binary wrapper).
- Communication: The adapter runs as a child process of the AI agent, communicating with Bhai's background Utility/Main broker over a local Unix domain socket (`/tmp/bhai-<uid>/broker.sock`) or typed MessagePort.
- Single-Writer Preservation: The stdio adapter **never** opens SQLite directly. All requests pass through Bhai's IPC Broker for validation, permission checks, and transactional database writes.

#### 3.3 Public Tool Registry (Namespace: `bhai`)
1. `yebata` (internal: `getContextPack`): Retrieve Quick, Task, or Deep Context Pack for a project.
2. `dhoondh` (internal: `searchMemory`): Full-text and keyword search across project memory entities using SQLite FTS5 BM25.
3. `kaamkaha` (internal: `getTaskState`): Retrieve full structured state, progress, and blockers for a specific task.
4. `kahanthe` (internal: `getLatestHandoff`): Retrieve the most recent session handoff for the project or task.
5. `servicesbata` (internal: `getProjectServices`): Retrieve registered services, ports, and package scripts.
6. `kyabadla` (internal: `getMemoryChanges`): Retrieve memory changes and checkpoints since a specified revision/timestamp.
7. `yesavekar` (internal: `recordCheckpoint`): Submit an atomic milestone checkpoint (<=2 KB).
8. `yaadrakh` (internal: `proposeMemoryUpdate`): Propose a durable architecture convention or decision for user review.
9. `handoffsavekar` (internal: `saveHandoff`): Save a structured session handoff (<=16 KB) for subsequent agents.

---

### P4-F06 — Project Memory Management UI

#### 3.1 Description
A dedicated, high-density macOS-native interface in Bhai's expanded window for visualizing, editing, curating, and auditing project memory.

#### 3.2 UI Structure & Navigation
1. **Overview:** Project summary, technology stack, current active task, latest handoff card, memory utilization meter.
2. **Knowledge:** Categorized cards for architecture rules, engineering conventions, and key directory paths. Inline editing with diff review.
3. **Decisions:** Decision log (ADRs) with status badges (`Proposed`, `Accepted`, `Rejected`, `Deprecated`), rationale, author, and date.
4. **Tasks:** Kanban or structured list of tasks, current progress, assigned agents, and attached evidence.
5. **Handoffs:** Historical chronological feed of agent-to-agent session handoffs.
6. **Activity:** Checkpoint timeline with filterable categories, agent badges, and payload inspection sheets.
7. **Connections:** Authorized MCP clients, granted project scopes, active sessions, and one-click revocation buttons.
8. **Storage:** Memory footprint metrics, retention controls, manual compaction trigger, and database vacuum status.

---

### P4-F07 — Cross-Agent Session Handoffs

#### 3.1 Description
Structured, agent-agnostic state handoff mechanism that allows seamless continuation of development across different AI coding tools.

#### 3.2 Continuation Workflow Example
1. **Agent A (Claude Code):** Implements JWT authentication middleware.
2. **Milestone Checkpoints:** Submits checkpoints for files modified (`auth.ts`), test results, and an accepted decision to use RS256.
3. **Session Handoff:** Claude prepares a structured handoff document:
   - *Objective:* Complete JWT auth and role-based access control.
   - *Completed:* RS256 token verification middleware and unit tests.
   - *Remaining:* Refresh token endpoint and Redis revocation check.
   - *Blockers:* None currently.
   - *Uncertainties:* Need confirmation on Redis cluster configuration.
4. **Session Closes.**
5. **Agent B (Codex):** Starts in a new terminal session.
6. **Retrieval:** Codex calls `kahanthe(projectId)`.
7. **Immediate Continuation:** Codex continues directly from the remaining tasks and uncertainties without scanning the repository or repeating prior discoveries.

---

### P4-F08 — Security, Privacy & Permissions

#### 3.1 Security Invariants
- **100% Offline:** Zero external network communication, zero telemetry, zero cloud accounts.
- **Project Isolation:** MCP tokens and authorizations are strictly scoped per project. A client authorized for Project A cannot read or write memory for Project B.
- **Separate Read/Write Permissions:** Read tools (`yebata`, `kaamkaha`, etc.) and write tools (`yesavekar`, `handoffsavekar`, etc.) have distinct authorization scopes.
- **Prompt Injection Defense:** All retrieved memory content in Context Packs is wrapped in protective untrusted data delimiters (`<bhai-project-context tier="..." ...>`) with explicit instructions to the consuming agent that stored context represents project data, not overriding system instructions.
- **Secret Minimization:** Automatic regex-based redaction of common API keys, passwords, bearer tokens, and private keys before persisting checkpoint payloads.

---

### P4-F09 — Context Efficiency & Reliability Benchmarking

#### 3.1 Benchmark Framework
Rigorous, reproducible empirical benchmark measuring the quantitative and qualitative advantages of Bhai Memory over unassisted agent workflows.

#### 3.2 Compared Baselines
- **Baseline A (Unassisted Agent):** Fresh agent session exploring the project using raw tool calls (`ls`, `grep`, `cat`, directory scans).
- **Baseline B (Static Documentation):** Agent provided with a static `AGENTS.md` or `README.md` file.
- **Baseline C (Bhai Context Engine):** Agent initialized with Bhai's Quick or Task Context Pack via MCP.

#### 3.3 Core Evaluation Metrics
- Input tokens consumed during initial discovery.
- Total tool calls before first productive code edit.
- Time to first productive change (latency in seconds).
- Fact recovery accuracy (% of architectural rules and constraints respected).
- Stale fact rejection rate.
- SQLite storage growth per agent session.

---

## 4. User Stories & Acceptance Criteria

### User Story 1: Effortless Agent Context Bootstrapping
> *As a software engineer using Claude Code, I want Claude to immediately understand my monorepo's architecture and active tasks without burning thousands of tokens scanning the repo every time.*

**Acceptance Criteria:**
1. Claude Code calls `yebata` upon startup and receives a structured Task Context Pack under 1,500 tokens.
2. The pack accurately reflects current registered services, ports, and architectural conventions.
3. Discovery tool calls (`find_by_name`, `grep_search`, `read_multiple_files`) target an empirical reduction of 50% to 80% as measured by the benchmark harness (Hypothesis 1).

### User Story 2: Seamless Cross-Agent Handoff
> *As a developer switching from Claude Code to Codex, I want Codex to know exactly what Claude finished and what remains without manual copy-pasting.*

**Acceptance Criteria:**
1. Claude Code submits a handoff via `handoffsavekar`.
2. Codex queries `kahanthe` and recovers the objective, completed files, and next steps.
3. Codex identifies unverified claims and continues work without repeating completed tasks.

### User Story 3: Durable Architecture Governance
> *As a technical lead, I want key decisions to remain permanently in project memory so that future coding agents never propose previously rejected patterns.*

**Acceptance Criteria:**
1. Decisions recorded in Bhai Memory persist across restarts and compaction cycles.
2. Compacted Context Packs prioritize active decisions and architectural constraints.
3. A user can review, edit, approve, or deprecate decisions in the Bhai Memory UI.

---

## 5. Explicit Exclusions & Non-Goals for Phase P4

To maintain architectural focus and avoid scope creep:
1. **No Process Execution:** P4 does not start, stop, monitor, or manage child daemons (deferred to P5).
2. **No Visual Workflow Studio:** P4 does not build workflow step graphs or runners (deferred to P6).
3. **No Cloud Sync or Remote Storage:** No cloud databases, remote sync, or hosted MCP servers.
4. **No Mandatory LLM:** Core P4 functionality operates with 0 AI dependencies. Optional local inference is strictly non-critical.
5. **No Full Keystroke or Transcript Ingestion:** Bhai does not record raw conversation logs or every individual bash tool call.
6. **No File Mutation by Bhai:** Bhai never writes or modifies project source files on disk.

---

## 6. Phase Completion Gates

Phase P4 is complete and accepted only when:
1. **P4.1 Gate:** Memory schema migrations 004 & 005 apply cleanly, maintain transactional rollback, pass FTS5 indexing tests, and survive cold application restart.
2. **P4.2 Gate:** Local MCP stdio adapter connects cleanly to Claude Code and Codex, enforces project-scoped grants, and handles duplicate checkpoint retries idempotently.
3. **P4.3 Gate:** Deterministic compaction enforces token budgets accurately, preserves 100% of decisions/blockers, and generates valid Quick/Task/Deep Context Packs.
4. **P4.4 Gate:** Memory UI allows full inspection, editing, and client revocation; Claude -> Codex handoff succeeds end-to-end; automated benchmark suite executes reproducibly.

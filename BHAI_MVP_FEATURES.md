# Bhai — MVP Feature Specification

**Version:** 1.0  
**Status:** Feature scope finalized  
**Platform:** macOS  
**Desktop framework:** Electron  
**AI requirement:** None in MVP  
**Current phase:** Feature definition (technical design and implementation planning follow separately)

## 1. Product Vision & Three Permanent Pillars

**Bhai** is an offline-first personal macOS assistant that remembers useful context, performs approved local actions, and automates repetitive work.

**Product Positioning:**  
> **Bhai — Your Mac. Your routines. Your context.**

**Developer-Focused Value Proposition:**  
> **Your AI agents start informed, and every meaningful iteration makes the next one easier.**

Bhai is built on three permanent product pillars:

### 1.1 Bhai Assistant
Natural-language Mac assistance, deterministic English/Hinglish command understanding, project awareness, system inspection, and safe local operations.

### 1.2 Bhai Memory
Persistent project knowledge, technical decisions, task progress, cross-agent context, session handoffs, and token-efficient Context Packs.

### 1.3 Bhai Workflows
Visual, reusable automation for everyday Mac tasks and developer routines, using a shared permission-controlled action engine.

**Primary users:** Developers with recurring office, terminal, and coding-agent workflows.  
**Secondary users:** Everyday macOS users wanting local, private automation.

**Core promise:** Configure once, speak naturally, execute useful actions reliably, and keep coding agents informed without burning tokens or compromising privacy.

### Product principles

- **Useful without AI:** Core assistance and Phase P4 deterministic memory operate with 0 LLM dependency; no accounts, cloud sync, or external AI APIs.
- **Fast and unobtrusive:** Menu-bar access and a global hotkey for common tasks; expanded application window for rich memory curation.
- **Local-first:** Chats, projects, routines, memory, and checkpoints stay strictly on device.
- **Predictable:** Supported language patterns map to deterministic actions; no hallucinated executions.
- **Personalizable:** Users save projects, aliases, actions, conventions, and workflow templates once.
- **Isolated chats & scoped projects:** Conversational context is chat-scoped; memory is project-scoped.
- **Safe:** Confirm risky actions; inspectable attribution for all agent-reported claims and evidence.

## 2. Confirmed Product Decisions

| Topic | Decision |
|---|---|
| Desktop technology | Electron |
| Operating system | macOS only for MVP |
| Entry point | Menu-bar icon + global keyboard shortcut |
| Interface | Compact chat/command panel; larger settings/workflow editor as needed |
| Command input | Text; short English and Hinglish phrases; `bhai` prefix optional |
| AI | No AI in MVP |
| Conversations | Multiple persistent chats; create, rename, switch, revisit, delete |
| Context | Per-chat context preserved across visits; isolated across chats |
| Shared persistent configuration | Projects, services, workflows, aliases, settings |
| Workflows | Ready-made templates + visual step builder |
| Project registration | Guided folder selection and metadata detection, with user confirmation |
| Monitoring | On-demand checks only; proactive background monitoring later |
| Storage | Local persistence; no cloud account required |
| Future AI | Optional bring-your-own-key workflow planning, not required for routine execution |

## 3. Final MVP Feature Inventory

### F01 — Menu-Bar Assistant and Persistent Chats

- Display a compact Bhai icon in the macOS menu bar.
- Open/close a compact assistant interface by clicking the icon or using a global hotkey.
- Create, rename, switch, revisit, and delete conversations.
- Persist conversation messages, results, and context for future visits.
- Keep contextual references scoped to the selected chat.
- Associate workflow execution results with their originating chat.
- Closing the popup does not delete the chat or automatically terminate an ongoing workflow.
- Treat saved projects, aliases, and workflows as shared **configuration**, not shared chat memory.

**Example:** In Chat A, `bhai aawas status` followed by `logs dikha` resolves the logs request to Aawas. In a new Chat B, `logs dikha` asks which project unless Chat B has its own relevant context.

### F02 — Offline Command Understanding

- Recognize a curated list of short English and Hinglish commands.
- Accept the optional `bhai` prefix.
- Normalize common spelling and spacing variants.
- Use established offline language and fuzzy-matching libraries where useful, rather than reinventing every text-processing primitive.
- Support aliases for applications, projects, actions, and workflows.
- Extract basic parameters such as application/project names, numeric ports, volume levels, and simple durations.
- Support limited same-chat follow-ups using unambiguous context.
- Support limited multi-command chaining (`aur`, `and`, `then`) when both actions resolve safely.
- Present candidates or ask for clarification when the input is ambiguous.
- Detect negation and avoid accidental execution (`vscode mat khol` must **not** open VS Code).
- Do not claim to understand unrestricted natural language.

**Examples:** `bhai ram dekh`, `memory usage`, `vs code kholo`, `port 3000 check`, `aawas logs dikha`, `office start`.

### F03 — Everyday macOS Assistance

- Launch known applications.
- Check if an application is running.
- Quit applications with appropriate confirmation when necessary.
- Open known folders and registered paths.
- Show CPU, memory, disk, battery, and basic system health details.
- Inspect running processes and significant resource consumers.
- Inspect local ports and their listening processes, subject to permissions.
- Check basic network connectivity and DNS resolution.
- Control supported safe system settings such as audio volume.
- Explain observed metrics without inventing diagnoses.

### F04 — Project Awareness

- Register a project using a guided folder picker.
- Detect recognizable project/repository metadata without executing scripts.
- Allow user-confirmed project names, aliases, directories, and preferred editor/terminal.
- Store project identity in a local registry for fast command matching.
- Allow one project to contain multiple configured services (frontend, backend, database, etc.).
- Configure service start/stop actions, ports, readiness/health endpoints, and log sources.
- Support project operations: open, start, stop, restart, test, status, logs, and read-only Git inspection when configured and permitted.
- Offer useful limited actions for partially configured projects (e.g., open folder and inspect Git).
- Resolve explicit project names and same-chat references without scanning the full filesystem for each request.
- Ask for disambiguation when project aliases conflict.

**Examples:** `bhai aawas khol`, `aawas backend logs`, `office payments status`.

### F05 — Developer Diagnostics

- Inspect processes, process existence/exit status, CPU/memory consumption, and port listeners.
- Test configured service ports and HTTP health endpoints on demand.
- Inspect recent logs from registered and accessible log sources.
- Support initial adapters for local log files and Bhai-launched subprocess stdout/stderr; selected local developer tools where feasible.
- Show read-only Git status, branch, changed files, and recent commits.
- Check availability of configured development tools such as Git, Node, and Docker.
- Match a curated collection of common errors (e.g., `EADDRINUSE`, `ECONNREFUSED`, missing executable, permission errors, process exits, memory-related failures).
- Explain findings with supporting evidence and suggest safe predefined next steps.
- State when the cause cannot be determined.
- Do not promise access to internal logs of arbitrary macOS applications.
- Bound diagnostic output and avoid unnecessarily retaining secrets from logs.

**Example:** `bhai backend kyu nahi chal raha` checks the registered process, port, health endpoint, and available logs, then offers evidence-backed next actions.

### F06 — Visual Workflow Automation

- Include a predefined workflow template library (see Section 4).
- Allow users to create routines through a visual step builder without writing code.
- Support editing, duplicating, enabling/disabling, and deleting user workflows.
- Allow workflow trigger phrases and multiple aliases.
- Support ordered action steps with typed parameters.
- Support simple conditions (e.g., open app only if not already running).
- Support readiness/wait steps, basic timeouts, safe retries, and skipped steps.
- Show step-level execution progress, results, and errors.
- Support cancellation where an operation safely permits it.
- Keep workflow execution lifecycle separate from the chat popup lifecycle.
- Require explicit setup and approval for any user-configured arbitrary shell commands; never infer or silently execute them from free text.
- Confirm potentially destructive actions, especially process termination and file deletion.

### F07 — Teach Bhai

- When a command is unsupported, show plausible supported actions or workflows.
- Let a user attach an unfamiliar phrase to an existing action or saved workflow.
- Persist new aliases globally for future chats.
- Permit review, editing, and deletion of taught aliases.
- Warn about ambiguous or conflicting aliases.
- Do not interpret teaching an alias as permission to run arbitrary unapproved commands.

**Example:** Teach `mera usual setup chala` as an alias for the saved **Office Start** workflow.

### F08 — Local Persistence and Preferences

- Persist chats, messages, per-chat context, registered projects and services, workflows, aliases, and settings locally.
- Save workflow execution summaries and associate them with initiating chats when applicable.
- Support deleting conversations without deleting shared projects or routines.
- Offer preferences for global hotkey, launch at login, appearance, and other supported controls.
- Provide basic export/import of saved configuration; exclude credentials/secrets by default.
- Require no user account or cloud synchronization.
- Provide explicit controls for data deletion and diagnostic-history retention.

---

### P4 Features — Bhai Memory Pillar (Finalized Scope)

#### P4-F01 — Persistent Project Memory
- Scoped, durable project storage linked to stable project UUIDs (`projects.id`).
- Stores project overview, architecture, engineering conventions, active/completed tasks, unresolved blockers, technical decisions (ADRs), checkpoints, evidence references, and session handoffs.
- Strict epistemological separation of four memory tiers:
  1. **Observed Facts (`observed_fact`):** Verified by Bhai from approved local inspection.
  2. **Agent-Reported Claims (`agent_claim`):** Submitted by coding agents; unverified by Bhai.
  3. **User-Approved Knowledge (`user_approved`):** Confirmed or authored directly by the developer.
  4. **Historical Information (`historical`):** Superseded checkpoints and audit logs.
- Retains revision tracking, monotonic revisions, and source attribution.
- Stored in SQLite via the Utility Process single-writer model.

#### P4-F02 — Continuous Agent Checkpoints
- Milestone-driven context ingestion from coding agents via local MCP tool calls.
- Categories: task started, progress updated, decision proposed, discovery recorded, files modified, test evidence recorded, blocker discovered/resolved, assumption invalidated, task completed, handoff prepared.
- Structured payloads strictly bounded to <=2 KB; capped at 200 checkpoints per agent session.
- Client idempotency enforced via `(project_id, client_name, session_id, idempotency_key)`.
- Crash-safe transactional persistence; automated secret redaction before writing to disk.

#### P4-F03 — Offline Hybrid Context Compaction
- Two-tiered offline compaction pipeline:
  - **Layer A (Deterministic, Mandatory):** 0 LLM dependency. Deduplicates repeated claims, merges task progress, supersedes outdated status, tracks revisions, enforces token budgets, updates FTS5 search index.
  - **Layer B (Local Model-Assisted, Optional):** Feature-flagged on-device model (Ollama / MLX / llama.cpp) for narrative synthesis. Strictly non-blocking with 5s timeout; falls back gracefully to Layer A if model is missing or slow.
- Indestructible preservation invariants: decisions and active blockers are **never** automatically purged. Contradictions are preserved explicitly as disputed claims, never resolved by silent last-write-wins.

#### P4-F04 — Prebaked Context Packs
- Token-budgeted context packages generated on demand or cached:
  - **Quick Context (~500 tokens):** Project identity, purpose, stack, key module locations, current task, latest handoff.
  - **Task Context (~1,500 tokens):** Relevant architecture, task decisions, current progress, open blockers, file references, recent checkpoints.
  - **Deep Context (~4,000 tokens):** Full architecture, related decisions/rationale, task history, supporting evidence, project constraints.
- Token accounting, cache invalidation on memory updates, progressive disclosure via stable IDs, and stale file reference tagging.

#### P4-F05 — Local MCP Context Bridge
- Standards-compliant Model Context Protocol local stdio adapter (`bin/bhai-mcp` or `stdio_bridge.ts`).
- Bridges Claude Code, Codex, and Cursor to Bhai without direct SQLite access; routes all operations through Bhai's IPC Broker.
- Server namespace: `bhai`. Public tool registry:
  - *Read:* `yebata` (`getContextPack`), `dhoondh` (`searchMemory`), `kaamkaha` (`getTaskState`), `kahanthe` (`getLatestHandoff`), `servicesbata` (`getProjectServices`), `kyabadla` (`getMemoryChanges`).
  - *Write:* `yesavekar` (`recordCheckpoint`), `yaadrakh` (`proposeMemoryUpdate`), `handoffsavekar` (`saveHandoff`).
- Client configuration support for `~/.claude.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json` with user review and one-click revocation.

#### P4-F06 — Project Memory Management UI
- Dedicated macOS-native interface in Bhai's expanded window shell.
- 8 primary sections: Overview, Knowledge, Decisions, Tasks, Handoffs, Activity, Connections, Storage.
- Full inspection of source attribution, inline editing of conventions/decisions, user approval sheet for proposed updates, MCP token revocation, and storage/compaction controls.

#### P4-F07 — Cross-Agent Session Handoffs
- Structured continuation handoffs bridging separate agent sessions (e.g. Claude Code -> Codex).
- Includes task objective, completed work, remaining work, open blockers, decisions made, touched file references, test evidence, and known uncertainties.
- Zero requirement for private reasoning or transcript access; unverified claims flagged for re-verification.

#### P4-F08 — Security, Privacy & Permissions
- 100% offline, zero cloud communication, zero telemetry.
- Project-scoped authorization tokens; separate read and write grants.
- Automatic secret redaction for checkpoint payloads.
- Prompt injection defense: memory records wrapped in explicit untrusted data delimiters.

#### P4-F09 — Context Efficiency & Reliability Benchmarking
- Empirical evaluation comparing Baseline A (unassisted agent), Baseline B (static AGENTS.md), and Baseline C (Bhai Context Engine).
- Measures input tokens, tool calls, time-to-first-edit, task correctness, fact recovery, compaction overhead, and SQLite storage growth across 6 representative scenarios.

---

## 4. Seven Included Workflow Templates

1. **Office Start:** Launch daily editor, project, terminal, selected local services, and saved tabs.
2. **Open Project:** Open a selected registered project in preferred tools.
3. **Start Dev Stack:** Start configured project services in dependency order.
4. **Project Health:** Inspect configured services, processes, ports, and health endpoints.
5. **Debug Localhost:** Investigate port conflicts, processes, and accessible logs.
6. **Standup Prep:** Summarize local Git branch, status, changed files, and recent commits.
7. **Wrap Up:** Review pending work and offer safe, explicitly approved cleanup or shutdown actions.

Templates may require one-time setup. Users may modify and duplicate templates, assign trigger phrases, and build additional routines with supported actions.

## 5. UX and Behavioral Rules

### 5.1 Session Isolation

- A new chat begins with empty conversational context.
- Reopening a previous chat restores only that chat's context.
- No other chat is consulted implicitly for resolving a command.
- Projects, workflows, and aliases are globally available because users saved them explicitly.
- If the current chat lacks context, Bhai asks for a project/service rather than borrowing one from another chat.

### 5.2 Safe Actions

- Read-only inspection can proceed within applicable permissions.
- Ambiguous commands never trigger potentially harmful actions.
- Destructive changes, risky process termination, and unknown scripts require explicit confirmation/approval.
- Log access is limited by macOS permissions and configured sources.
- Diagnostics show observed evidence and distinguish known causes from hypotheses.

### 5.3 Responsiveness

- Common command resolution and project matching should feel immediate.
- Long-running actions should not block the UI.
- Workflow execution remains trackable after the compact assistant is dismissed.
- No continuous background health polling in the MVP.

## 6. MVP Acceptance Criteria

### Assistant and Chat
- [ ] Menu-bar icon opens and closes the assistant reliably.
- [ ] Global shortcut opens the assistant.
- [ ] Users can create, rename, switch, revisit, and delete chats.
- [ ] Restarting Bhai preserves chats and data.
- [ ] Switching chats does not leak context between conversations.
- [ ] Closing the panel does not unintentionally stop active workflows.

### Language
- [ ] Supported English/Hinglish phrases resolve to the correct intent.
- [ ] Common spelling variants and saved aliases are recognized.
- [ ] Basic parameters and project names are correctly extracted.
- [ ] Same-chat follow-up commands resolve when unambiguous.
- [ ] Ambiguous or negated commands cannot trigger unintended actions.
- [ ] An unsupported command gives helpful supported alternatives.

### macOS and Projects
- [ ] Basic app, system, network, and port commands work offline.
- [ ] Users can register a project via guided setup.
- [ ] The project is usable with incomplete optional configuration.
- [ ] Registered project names/aliases resolve without repeated filesystem scans.
- [ ] Multiple services can be configured under one project.

### Project Memory (Phase P4)
- [ ] Memory records, decisions, tasks, checkpoints, and handoffs persist across restarts in SQLite.
- [ ] Local MCP stdio adapter connects to Claude Code and Codex, enforcing project scopes.
- [ ] Checkpoints are ingested idempotently, bounded to <=2 KB, with automatic secret redaction.
- [ ] Context Packs (Quick, Task, Deep) generate within defined token budgets without LLM dependency.
- [ ] Compaction preserves 100% of decisions and active blockers indefinitely.
- [ ] Cross-agent session handoff transfers verified context between Claude Code and Codex.
- [ ] Memory UI provides discoverable curation, editing, approval, and client revocation.
- [ ] Benchmark suite executes reproducibly across 6 scenarios.

### Diagnostics
- [ ] Process, port, accessible log, and configured health checks report factual results.
- [ ] Read-only Git details are available for configured projects.
- [ ] Recognized error signatures result in evidence-backed guidance.
- [ ] Unknown causes are reported honestly, without fabricated explanations.

### Workflows
- [ ] Users can create and save a workflow through the visual builder, without code.
- [ ] Included templates can be configured and reused.
- [ ] Execution progress, failures, and available retries are visible.
- [ ] Ongoing workflows remain trackable after the popup closes.
- [ ] Users can teach Bhai new trigger aliases.
- [ ] Risky actions cannot execute without the appropriate confirmation.

### Privacy and Reliability
- [ ] Core features and Memory Engine work without internet or cloud AI services.
- [ ] Chats, projects, workflows, memory, and settings persist locally.
- [ ] Deleting a chat does not delete globally saved configurations or project memory.
- [ ] Credentials and secrets are excluded from configuration exports and redacted from checkpoints.
- [ ] The interface remains responsive during long diagnostics, compaction, or workflows.

## 7. Proposed Performance Goals

| Metric | Target |
|---|---|
| Common command resolution | Under 100 ms |
| Indexed project-name matching | Under 50 ms |
| Warm command-panel display | Under 300 ms |
| Context Pack generation latency | Under 50 ms |
| FTS5 memory search latency | Under 25 ms |
| Required external AI/API calls | 0 |

## 8. Explicitly Excluded from Phase P4

- Cloud sync, user accounts, and cross-device data sharing.
- Mandatory external AI APIs or cloud LLM dependencies.
- Autonomous coding or source-file writing by Bhai.
- Process supervision, daemon lifecycle, or service start/stop (Phase P5).
- Visual workflow creation and multi-step execution (Phase P6).
- Broad OS background monitoring, keyboard/mouse replay, or voice recognition.
- Unbounded ingestion of entire chat transcripts or secret keys.

## 9. Comprehensive Product Roadmap (P1–P9)

- **P1 — Secure Persistent Vertical Slice:** Completed. Persistent chat, exact memory inspection, utility process.
- **P2 — Deterministic Language & Context Safety:** Completed. Normalization, Hinglish, aliases, chaining, clarification.
- **P3 — Guided Project Onboarding & Registry:** Completed / Remediation Verified. Project detection, service config, read-only Git, safe unregistration, service editing.
- **P4 — Project Memory & Context Engine (Current Phase):** Persistent memory, continuous checkpoints, hybrid compaction, Context Packs, local MCP bridge, memory UI, cross-agent handoffs, and benchmarking.
- **P5 — Local Actions & Managed Runtime:** Registered service control, local Mac actions, health checks, process ownership, logs, and permission-controlled execution.
- **P6 — Visual Workflow Studio:** Visual no-code workflow creation, reusable routines, conditions, confirmations, execution history, and manual/natural-language triggers.
- **P7 — Context-Aware Automation & Environment Intelligence:** Desired-state environments, dependencies, drift detection, verified workflow outcomes, and approved recovery.
- **P8 — Agent Collaboration & Secure Action Bridge:** Agent invocation of approved Bhai actions and workflows, permission scopes, execution auditing, and conflict management.
- **P9 — Product Hardening & Public Beta:** Security audit, performance, usability, accessibility, installation, Developer ID signing, notarization, and external validation.

## 10. Phase P4 Next Steps

Implementation begins with **P4.1 (Memory Foundation)** upon explicit authorization, following the verified remediation of Phase P3.

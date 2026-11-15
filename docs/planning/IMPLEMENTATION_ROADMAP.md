# Dependency-ordered implementation roadmap

Review status: **core conditionally approved; implementation and P0 experiments not started**. This revision prepares design and experiments only. A separately scoped instruction is needed to execute the P0 harness, initialize or install dependencies; P1 additionally needs explicit product acceptance and the evidence gate below. Scope: F01–F08 and seven templates in [BHAI_MVP_FEATURES.md](../../BHAI_MVP_FEATURES.md). Relative complexity: S = contained module, M = multiple interacting modules, L = cross-process/platform work, XL = high-risk integration. These are comparisons, not deadlines.

Read [technical design](../architecture/TECHNICAL_DESIGN.md), [security](../architecture/SECURITY_DESIGN.md), [UX specification](../design/UX_SPECIFICATION.md), and [open decisions](OPEN_DECISIONS.md) first. [ARCHITECTURE_REVIEW_ACTIONS.md](ARCHITECTURE_REVIEW_ACTIONS.md) owns the reproducible P0 checklist and [P1 entry approval](ARCHITECTURE_REVIEW_ACTIONS.md#p1-approval-criteria). Each phase delivers reviewable behavior and tests; never scaffold all feature modules before proving the secure end-to-end path.

```mermaid
flowchart LR
  A[P0 Scoped signed experiments] --> B[P1 Secure persistent vertical slice]
  B --> C[P2 Language & context safety]
  C --> D[P3 Project onboarding & registry]
  D --> E[P4 Project Memory & Context Engine]
  E --> F[P5 Local Actions & Managed Runtime]
  F --> G[P6 Visual Workflow Studio]
  G --> H[P7 Context-Aware Automation]
  H --> I[P8 Agent Collaboration & Action Bridge]
  I --> J[P9 Product Hardening & Public Beta]
```

The order is conservative. Completed phases (P1–P3) established the Electron shell, deterministic language resolution, persistent chat context, and project registry. P4 establishes the durable **Bhai Memory** pillar, empowering external AI coding agents with local context. Subsequent phases (P5–P8) build the shared execution and visual workflow capabilities.

## P0 — Review and prove platform boundaries (Completed baseline)
Feasibility spikes executed for arm64 macOS, proving utility process, SQLite WAL, and AppKit/CoreAudio helper operations.

## P1 — Secure persistent vertical slice (Completed)
Delivered `bhai ram dekh` factual result across sandboxed renderer, IPC broker, utility process, and SQLite WAL storage with cold restart persistence.

## P2 — Deterministic language and isolated context (Completed)
Delivered normalization, tokenization, catalog resolution, aliases (Teach Bhai F07), same-chat follow-up resolution, and inter-chat context isolation.

## P3 — Guided project registry and read-only operations (Completed / Remediation Verified)
Delivered 5-step onboarding wizard, metadata detection, registered services configuration, read-only Git inspector, VS Code and Terminal launcher.  
*Remediation Status:* Project unregistration (without file deletion) and service metadata editing verified at 100% pass in automated integration tests; Product Owner manual retest officially pending.

---

## P4 — Project Memory & Context Engine (Completed Phase — XL)

1. **Objective:** implement a persistent, offline project memory and context engine allowing coding agents (Claude Code, Codex, Cursor) to share reliable, locally stored project knowledge.
2. **Features included:** P4-F01 Persistent Project Memory, P4-F02 Continuous Agent Checkpoints, P4-F03 Offline Hybrid Context Compaction, P4-F04 Prebaked Context Packs, P4-F05 Local MCP Context Bridge, P4-F06 Project Memory Management UI, P4-F07 Cross-Agent Session Handoffs, P4-F08 Security & Permissions, P4-F09 Context Efficiency Benchmarking.
3. **Dependencies:** P1 SQLite single writer; P2 deterministic resolution; P3 stable project registry (`projects.id`); local stdio MCP adapter.
4. **Components:** MemoryRepository (SQLite), Checkpoint Ingestion Pipeline, Deterministic Compactor (Layer A), Optional Local LLM Adapter (Layer B), Context Pack Generator, Local Stdio MCP Bridge (`bin/bhai-mcp`), Expanded Memory Hub UI.
5. **Execution Increments:**
   - **P4.1 — Memory Foundation (Completed):** Migrations 004, 005 & 006 (FTS5 & RESTRICT lifecycle), memory domain models, records, tasks, decisions (ADRs), checkpoints, durable handoffs, and persistence tests verified with 100% pass and sub-millisecond FTS5 benchmarks.
   - **P4.2 — Local MCP Bridge, Guiding Skill & Checkpoints (Completed):** Stdio MCP adapter (`bin/bhai-mcp`), public tool namespace `bhai` (`yebata`, `yesavekar`, `yaadrakh`, `kahanthe`, `kaamkaha`, `dhoondh`, `handoffsavekar`, `kyabadla`, `servicesbata`), canonical Guiding Skill (`skills/bhai-project-memory/SKILL.md`), Agent Integration Kit (Claude Code, Codex, Cursor non-destructive setup and removal), local domain socket broker (`/tmp/bhai-<uid>/broker.sock`), token authentication, project scoping, and continuous delta ingestion pipeline verified.
   - **P4.3 — Context Compaction & Context Packs (Completed):** Layer A deterministic AST reducer (91% token volume reduction, 100% ADRs and active blockers preserved), contradiction detection, stale file reference detection, token-budgeted Context Packs (Quick < 550, Task < 1,600), SQLite cache invalidation on writes, and Layer B graceful fallback to Layer A.
   - **P4.4 — Project Memory UI & Final Validation (Completed):** Dedicated Memory Hub (8 views including Agent Connections), curation/editing, agent revocations, Claude -> Codex E2E handoff test, benchmark suite execution across 6 scenarios, and report committed to `docs/benchmarks/P4_BENCHMARK_REPORT.md`.
6. **Testing:** Migrations rollback, cold restart persistence, checkpoint idempotency, <=2 KB payload caps, token budget enforcement, decision/blocker preservation, offline operation, Claude -> Codex handoff, and empirical token efficiency benchmarks across 6 scenarios and Tests A–L.
7. **Acceptance:** Memory survives restart; Claude Code records progress and Codex continues in a separate session; Context Packs generate under defined token budgets with 0 cloud AI calls; decisions/blockers never lost; Guiding Skill cleanly guides agents without excessive token overhead.
8. **Definition of done:** P4.1–P4.4 complete, benchmark report committed, 0 regressions in P1–P3, all safety invariants green.

---

## P5 — Local Actions & Managed Runtime (Current Phase — L)

1. **Objective:** safely start, test, inspect, and stop configured multi-service projects and local macOS actions through the permission-controlled executor.
2. **Features included:** F04 service operations (start, stop, restart, test, status), F03 everyday macOS assistance (app launch/quit, system health, volume, network), and F05 developer diagnostics.
3. **Dependencies:** P3 reviewed recipes; P4 memory context; P0 process-group supervision.
4. **Components:** Action registry, process supervisor, foreground session runner, bounded log ring buffers, TCP/HTTP readiness probes, signature catalog.
5. **Tasks:** Reusable recipe trust fingerprints; run-specific confirmation for high-risk actions (quit, stop, force terminate); process-group lifecycle; crash recovery without blind PID reuse; redacted bounded log captures.
6. **Acceptance:** Truthful process states, zero unapproved recipe execution, reliable grandchild teardown, bounded log streams, and no persistent daemon required.

---

## P6 — Visual Workflow Studio (L)

1. **Objective:** allow users to visually configure, duplicate, save, and execute reusable routines without writing code.
2. **Features included:** Complete F06 visual step builder, editing, duplication, enable/disable, deletion, all seven included workflow templates, and F07 workflow alias links.
3. **Dependencies:** P4 memory context; P5 implemented action catalog and process supervisor.
4. **Components:** Vertical step list, searchable static action catalog, guided parameter forms, step condition selectors, setup validation, immutable revisions, template library, and run progress UI.
5. **Tasks:** Add/reorder/remove steps with binding revalidation; condition evaluation over earlier step outputs; timeout and safe retry controls; Office Start, Start Dev Stack, and Wrap Up template configurations.
6. **Acceptance:** Ordinary routines require no code; all seven templates configured and reusable; dangerous actions confirmed; executions trackable after panel dismissal.

---

## P7 — Context-Aware Automation & Environment Intelligence (L)

1. **Objective:** enable desired-state environments, dependency ordering, drift detection, and approved recovery across projects and workflows.
2. **Features included:** Environmental drift detection, desired-state dependency checking, verified workflow outcomes, and remainder of F08 (data portability, retention, safe configuration export/import).
3. **Dependencies:** P4 memory engine; P5 process runner; P6 workflow definitions.
4. **Components:** Drift detector, environment validator, export/import previewer, safeStorage credential integration, data-deletion coordinator.
5. **Tasks:** Detect missing toolchains or changed ports; compare actual environment against memory records; export configurations excluding secrets; atomic full local data deletion.
6. **Acceptance:** Imported configs remain disabled until reviewed; secrets never exported in plaintext; drift detected before workflow launch.

---

## P8 — Agent Collaboration & Secure Action Bridge (XL)

1. **Objective:** bridge external AI coding agents to invoke approved Bhai actions and workflows through MCP with explicit permission scopes.
2. **Features included:** Agent workflow execution, scoped action permissions, execution auditing, and multi-agent resource conflict management.
3. **Dependencies:** P4 MCP bridge; P5 managed runtime; P6 workflow engine.
4. **Components:** MCP Action Bridge, capability ticket broker for agents, action approval cards in Bhai UI, multi-agent lock coordinator.
5. **Tasks:** Allow agents to request workflow runs (e.g. `bhai_run_workflow("office-start")`); enforce human-in-the-loop approvals for high-risk actions; audit all agent-triggered executions in chat.
6. **Acceptance:** Agent cannot execute unapproved actions; human confirmation displayed for mutating steps; full execution audit recorded in SQLite.

---

## P9 — Product Hardening & Public Beta (L)

1. **Objective:** ship a reproducible production candidate satisfying security, performance, accessibility, notarization, and stability gates.
2. **Features included:** Verification of complete Bhai application across all three pillars.
3. **Dependencies:** P1–P8; Apple Developer ID signing and notarization credentials; real Mac hardware.
4. **Components:** CI release lane, performance benchmark suite, SBOM and notices, signed DMG, hardened runtime, notarization stapler.
5. **Tasks:** Full security audit; leak audit; 10-minute idle CPU and memory measurement; clean-machine quarantine install; offline launch verification.
6. **Acceptance:** Zero critical/high boundary defects; Developer ID signed and notarized; offline install verified; performance budgets met.

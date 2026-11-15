---
name: bhai-project-memory
description: Guides AI coding agents to retrieve, update, and hand off local project context and architecture decisions using Bhai's local MCP memory engine.
---

# Bhai Project Memory & Context Guide

You have access to Bhai's local project memory via Model Context Protocol (MCP) tools. Bhai maintains persistent architectural context, active tasks, blockers, and cross-agent session handoffs on the user's Mac.

## Core Principle
Use Bhai to **reduce redundant discovery commands** (`find`, `grep`, `cat`) and **record meaningful progress milestones**. Bhai is offline-first and runs locally on this Mac.

---

## When to Call Bhai (High Value)

1. **Session Startup / Task Resumption:**
   - Call `yebata` (internal: `getContextPack`) with the active `projectId` and `mode="task"`.
   - Read active tasks, established conventions, and unresolved blockers before exploring files.
2. **Task Initialization:**
   - If starting a new task, call `yesavekar` (internal: `recordCheckpoint`) with `checkpointType="task.started"`.
3. **Architectural or Design Decisions:**
   - When deciding on a pattern, library, schema, or invariant, call `yesavekar` with `checkpointType="decision.proposed"`.
4. **Substantial Discoveries or Invalidated Assumptions:**
   - When uncovering an undocumented constraint or finding that an assumption was wrong, record via `yesavekar` with `checkpointType="discovery.recorded"` or `checkpointType="assumption.invalidated"`.
5. **Meaningful Implementation Milestones:**
   - After implementing a major component or completing a task phase, record via `yesavekar` with `checkpointType="task.progress"` or `checkpointType="task.completed"`.
6. **Blockers Discovered or Resolved:**
   - Record via `yesavekar` with `checkpointType="blocker.discovered"` (with severity) or `checkpointType="blocker.resolved"`.
7. **Meaningful Test Evidence:**
   - When a test suite passes or reveals a critical regression, record via `yesavekar` with `checkpointType="evidence.recorded"` with the test command and summary.
8. **Propose Durable Conventions or Decisions:**
   - When proposing durable project-wide rules or accepted ADRs for user review, call `yaadrakh` (internal: `proposeMemoryUpdate`).
9. **Pre-Compaction or Session Completion:**
   - When your context window is filling up, before compacting, or when concluding work, call `handoffsavekar` (internal: `saveHandoff`) with completed work, remaining work, dirty files, and next steps.

---

## When NOT to Call Bhai (Anti-Patterns / Wasteful)

- **DO NOT** call Bhai for routine file reads, file edits, or intermediate shell commands.
- **DO NOT** call Bhai after every single tool call or user turn.
- **DO NOT** send raw terminal dumps, massive diffs, or entire files.
- **DO NOT** store passwords, API keys, tokens, or personal secrets in Bhai memory.
- **DO NOT** poll Bhai in a loop.
- **DO NOT** re-fetch context packs within the same turn if you already received the context.

---

## Public Tool Reference (MCP Server Namespace: `bhai`)

All public tools use friendly Romanized-Hinglish names that reflect Bhai's personal assistant identity, backed by precise English descriptions so LLMs discover and execute them accurately:

| Public Tool Name | Internal TS Operation | English Description for LLM Tool Discovery | Key Arguments |
|---|---|---|---|
| `yebata` | `getContextPack` | Retrieve a compact, token-budgeted (<4000 tokens) markdown project context pack containing overview, conventions, active tasks, and blockers. | `projectId`, `mode` (`quick`\|`task`\|`deep`), `taskId`, `maxTokens` |
| `kaamkaha` | `getTaskState` | Inspect current progress, subtasks, blockers, and recent checkpoint history for a specific task. | `projectId`, `taskId` |
| `kahanthe` | `getLatestHandoff` | Retrieve the most recent structured session handoff document saved by any coding agent for this project. | `projectId`, `taskId` |
| `servicesbata` | `getProjectServices` | Retrieve registered project dev services, ports, and package scripts configured in Phase P3. | `projectId` |
| `kyabadla` | `getMemoryChanges` | Incremental context sync; fetch checkpoints, task changes, and decisions recorded since a given timestamp or revision. | `projectId`, `sinceTimestamp` |
| `dhoondh` | `searchMemory` | Search project memory, architectural decisions, and tasks using SQLite FTS5 full-text search with BM25 ranking. | `projectId`, `query`, `category`, `limit` |
| `yesavekar` | `recordCheckpoint` | Record a lightweight milestone event (task start/progress, decision proposal, blocker, or test evidence) during active coding (<=2 KB). | `projectId`, `checkpointType`, `summary`, `idempotencyKey`, `payloadJson` |
| `yaadrakh` | `proposeMemoryUpdate` | Propose a durable architectural rule, coding convention, or ADR candidate for developer review in Bhai UI. | `projectId`, `category`, `title`, `content`, `rationale` |
| `handoffsavekar` | `saveHandoff` | Persist a comprehensive structured session handoff (<=16 KB) capturing completed work, pending tasks, dirty files, and test commands for the next agent. | `projectId`, `taskId`, `completedSummary`, `remainingSummary`, `relevantFiles` |

---

## Token Efficiency & Best Practices

1. **Keep Checkpoints Compact:** Summaries should be 1-3 sentences. Link to files (`evidenceRefs: [{ kind: "file", reference: "src/auth/jwt.ts#L45" }]`), do not dump code. Checkpoints are capped at 2 KB.
2. **Idempotency Keys:** Always provide a unique `idempotencyKey` (e.g. `task-123-db-migrated-v1`) so retries do not create duplicate records.
3. **Verify Stale Context:** Treat retrieved memory marked `agent_claim` as unverified until confirmed by repository files. Treat `user_approved` and `observed_fact` as high confidence.
4. **Graceful Fallback:** If any Bhai MCP tool returns a connection error or times out, **continue normal development immediately**. Never halt or enter a retry loop because Bhai is unavailable.

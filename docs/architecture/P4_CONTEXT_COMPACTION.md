# Bhai — Phase P4 Architecture: Context Compaction Pipeline

**Document ID:** P4-ARCH-003  
**Phase:** P4 — Project Memory & Context Engine  
**Status:** Architectural Design  
**Target Platform:** macOS 14+ (Sonoma, Sequoia), Apple Silicon (`arm64`)  

---

## 1. Context Compaction Philosophy & Flagship Mission

Coding agents quickly accumulate context during complex tasks. Without compaction, raw message histories and tool results consume thousands of tokens, exhaust context windows, and degrade reasoning accuracy.

Bhai implements an **Offline Hybrid Context Compaction** engine that mirrors proven context management principles used by modern state-of-the-art coding agents (e.g. Codex, Cursor, Claude Code) while remaining **100% offline-first**.

### Architectural Layers
1. **Layer A — Deterministic Compaction (Mandatory, 0 LLM Dependency):**
   - Pure algorithmic reduction, normalization, and deduplication.
   - Operates in sub-millisecond execution times.
   - Guaranteed deterministic output.
2. **Layer B — Local Model-Assisted Compaction (Optional, Feature-Flagged):**
   - On-device local inference (via Ollama or Apple MLX/llama.cpp).
   - Condenses narrative explanations and multi-session progress.
   - Strictly non-blocking: failure or absence defaults transparently to Layer A.

---

## 2. Answers to the 14 Mandatory Design Questions

### Q1: What triggers compaction?
Compaction is triggered by four explicit events:
1. **Milestone Checkpoint Ingestion (Continuous Deltas):** Incoming deltas from the canonical `bhai-project-memory` skill (see [P4_AGENT_INTEGRATION.md](P4_AGENT_INTEGRATION.md)) update task states and blockers in place, triggering immediate cache invalidation.
2. **Threshold Trigger:** When an active agent session records its 50th checkpoint (and every 50 checkpoints thereafter), or when total project checkpoints exceed 200.
3. **Pre-Compaction or Session Handoff Ingestion:** When an agent invokes `handoffsavekar` (internal: `saveHandoff`) or submits a `handoff.prepared` checkpoint before its own conversation compaction.
4. **Task State Transition:** When an active task transitions to `completed` or `blocked`.
5. **Manual User Trigger:** An on-demand "Compact Memory" button in the Bhai Memory UI.

### Q2: Which information is compacted?
- Intermediate progress checkpoints (`task.progress`, `files.modified`).
- Repeated test execution logs and benchmark numbers.
- Superseded task status claims (e.g., intermediate progress reports for a task that is now `completed`).
- Expired or superseded ephemeral session notes.

### Q3: Which information is NEVER automatically removed?
The following four categories have **indestructible permanence**:
1. **Architectural Decisions (ADRs):** Every decision, whether accepted, rejected, or deprecated, is preserved indefinitely with its full rationale and trade-offs.
2. **Active or Unresolved Blockers:** No blocker can be pruned while its status remains `active`.
3. **User-Approved Knowledge:** Any record authored or explicitly approved by the user cannot be overwritten or deleted by automated compaction.
4. **Latest Session Handoff:** The most recent handoff for each registered project is permanently retained until superseded by a newer handoff.

### Q4: How is recency weighted against relevance?
A hybrid scoring formula ranks memory items for inclusion in Context Packs:
$$\text{Score} = (\text{Relevance} \times 0.6) + (\text{Recency} \times 0.3) + (\text{Importance} \times 0.1)$$
- **Relevance:** Exact keyword / FTS5 BM25 match against the current active task and prompt keywords.
- **Recency:** Exponential decay over 14 days ($e^{-\lambda t}$).
- **Importance:** Base weight multiplier:
  - User-Approved Decision: 1.0
  - Active Blocker: 1.0
  - Completed Task Summary: 0.5
  - Raw Checkpoint: 0.2

### Q5: How are repeated facts merged?
When multiple checkpoints report identical or overlapping claims (e.g. "PostgreSQL running on 5432"):
- Layer A computes a canonical key: `(entity_type, attribute_name)`.
- If values match, the occurrence count is incremented, the `last_observed_at` timestamp is updated, and redundant duplicate rows are deleted.

### Q6: How are contradictions represented?
If Agent A reports "Port 4000 is used by Backend" and Agent B reports "Port 4000 is used by Auth Service":
- Bhai **never** silently overwrites the previous claim via last-write-wins.
- The record status transitions to `disputed`.
- In Context Packs, contradictions are formatted explicitly:
  ```markdown
  > [!WARNING] Disputed Fact: Port 4000
  > - Claim A (claude-code, 10:15 AM): Backend service on 4000
  > - Claim B (codex, 11:30 AM): Auth service on 4000
  > Please verify actual port configuration before proceeding.
  ```

### Q7: How do we preserve enough evidence to reconstruct summaries?
The Event Journal (`memory_checkpoints`) retains an immutable, append-only log of raw events. When Layer B produces a condensed summary, it stores a foreign-key list of `source_checkpoint_ids`. The user can click "View Original Evidence" in the Memory UI to inspect the exact uncompacted raw checkpoints that formed the summary.

### Q8: What happens if compaction crashes halfway?
Compaction runs inside an immediate SQLite transaction:
```ts
const runCompaction = db.transaction(() => {
  // 1. Synthesize current knowledge
  // 2. Insert compacted summaries
  // 3. Mark compacted raw checkpoints
  // 4. Update cache invalidation revision
});
runCompaction();
```
If the process terminates midway (power failure, panic), SQLite rolls back the entire transaction. The database remains in its pre-compaction consistent state.

### Q9: How are old summaries invalidated?
Every project maintains a monotonic `memory_revision` counter in `projects.revision`.
- Each compaction cycle or new checkpoint increments this counter.
- Cached Context Packs store the `config_revision` at creation time.
- Retrieval queries compare `cache.revision === project.revision`. If mismatched, the cache is discarded and regenerated.

### Q10: How are concurrent writes handled?
Because all writes originate from the single-threaded Node event loop in Bhai's Utility Process, writes are serialized in-memory before entering SQLite transactions. SQLite's WAL mode allows concurrent readers without blocking the active write transaction.

### Q11: How are token budgets enforced?
Context Pack generation operates with hard budgets:
- **Quick:** 500 tokens.
- **Task:** 1,500 tokens.
- **Deep:** 4,000 tokens.

Enforcement follows an AST priority ladder:
1. Reserve budget for mandatory headers, stack summary, and active blockers.
2. Fill remaining budget with highest-scoring decisions and active task items.
3. If an item exceeds remaining budget, it is truncated with an explicit `[... truncated, run kaamkaha for full details]` marker.

### Q12: What happens when no local model exists?
Layer A handles 100% of core compaction deterministically. If no local LLM is detected (Ollama not running or model missing):
- Layer B is silently skipped.
- Zero errors are thrown to the agent or user.
- Compaction relies entirely on deterministic AST normalization, deduplication, and FIFO checkpoint pruning.

### Q13: How are semantic compaction errors detected or surfaced?
Layer B's optional LLM output is parsed through a strict Zod schema. If the LLM generates hallucinated keys, invalid JSON, or omits source references:
- The candidate summary is rejected.
- Layer A's deterministic fallback summary is used instead.
- A diagnostic warning is logged to `bhai.log` for user inspection.

### Q14: How is compaction overhead measured?
During each compaction run, Bhai records:
- Wall-clock execution time (ms).
- Process RSS memory delta (MB).
- Number of checkpoints compacted.
- Tokens saved (uncompacted raw tokens vs compacted summary tokens).
- SQLite file size delta (bytes).
These metrics are surfaced in the Bhai Memory UI ("Storage" tab) and exposed via benchmark telemetry.

---

## 3. Storage Reclamation & Vacuum Strategy

Compaction logically deletes obsolete checkpoints and updates relational tables. However, SQLite does not automatically shrink its `.sqlite` file on disk after rows are deleted; deleted pages are added to an internal freelist for reuse.

To manage physical disk consumption:
1. `PRAGMA auto_vacuum = INCREMENTAL;` is configured in migration 004.
2. At application startup or following large compaction runs, Bhai checks freelist pages:
   ```sql
   PRAGMA freelist_count;
   ```
3. If freelist pages exceed 10 MB, Bhai executes a non-blocking `PRAGMA incremental_vacuum(1000);` to reclaim physical disk space back to macOS APFS.

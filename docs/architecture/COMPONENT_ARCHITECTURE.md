# Component and macOS integration architecture

Status: conditionally approved core; review refinements proposed, product acceptance pending. Scope authority: [MVP specification](../../BHAI_MVP_FEATURES.md). Cross-cutting contracts: [workflow](WORKFLOW_ENGINE.md), [data](DATA_MODEL.md), [security](SECURITY_DESIGN.md). Surface/focus/trust behavior is specified in [UX_SPECIFICATION.md](../design/UX_SPECIFICATION.md); signed capability experiments in [P0 runbook](../planning/ARCHITECTURE_REVIEW_ACTIONS.md) are all not-run.

## Ownership and module boundaries

| Location / proposed module | Owns | Must not own |
|---|---|---|
| `src/shared/contracts` | Versioned serializable DTOs, action IDs, Zod schemas, structured errors, Memory & MCP DTOs | Electron imports, OS operations, global mutable state |
| `src/main/desktop` | Tray, popup placement, shortcut, appearance/login preference, dialogs, window lifecycle, expanded memory window | NLP, database queries, log parsing, direct SQLite access |
| `src/main/broker` | Sender validation, request routing, capability tickets, confirmation UI, engine startup/restart, MCP token authentication | Generic exec/readFile IPC endpoints, arbitrary client bypass |
| `src/mcp` | Local MCP stdio adapter (`stdio_bridge.ts`), agent tool schemas, JSON-RPC 2.0 framing | Direct SQLite access, bypass of capability broker |
| `src/preload` | Frozen named API, validated arguments, sanitized events, unsubscribe functions, memory API bridge | Raw ipcRenderer, filesystem, arbitrary channel names |
| `src/renderer/assistant` | Quick Panel, chat list, input, clarifications, messages, results, progress | Execution policy or canonical context |
| `src/renderer/conversation` | Expanded current-chat history, evidence and run details using shared assistant components | A second context store, background polling, cross-chat resolver memory |
| `src/renderer/memory` | Expanded Memory Hub (Overview, Knowledge, Decisions, Tasks, Handoffs, Activity, Connections, Storage) | Direct database execution, arbitrary OS commands |
| `src/renderer/settings` | Project wizard, workflow step forms, aliases, preferences, retention/export/import previews | Permission approval inferred from a form submission alone |
| `src/engine/chats` | Message ordering, context resolution, isolation, deletion coordination | Implicit last-project global variable |
| `src/engine/language` | Normalization, tokens, intent/slot proposals, ambiguity | Direct action execution |
| `src/engine/projects` | Registry, metadata, services, index updates, path identity checks | Recursive home scan, automatic package install |
| `src/utility/memory` | Deterministic compaction (Layer A), optional local model (Layer B), Context Pack generator, token budgeting | Unbounded memory retention, silent overwrite of user decisions |
| `src/engine/workflows` | Definition validator, execution state machine, locks, durable events | Evaluation of JS expressions, unreviewed code |
| `src/engine/actions` | Static action registry and validated adapters | Runtime downloadable plugins |
| `src/engine/processes` | Spawn recipes, exit/stdio, ownership records, cancellation | `killall`, sudo, terminal automation as a process supervisor |
| `src/engine/diagnostics` | Finite probes, observations, signatures, redacted bounded logs | Proactive monitoring or automatic repair |
| `src/utility/storage` | Sole database connection, repositories (`Chat`, `Project`, `Memory`, `Execution`, `Alias`), migrations, FTS5 | SQL supplied by renderer |
| `native/macos` | Versioned AppKit/CoreAudio helper operations | Privileged daemon, arbitrary AppleScript |

Imports point inward toward shared contracts/domain interfaces. Adapters implement interfaces such as `ProjectRepository`, `MemoryRepository`, `ProcessRunner`, `ObservationProvider`, `DesktopCapabilities`, and `Clock`. Constructors receive dependencies; tests use fake clock/process/filesystem providers. Main-to-engine desktop operations use the same typed policy tickets as renderer-triggered actions. The engine cannot turn arbitrary text into a privileged main request.

## IPC/RPC contract

Preload exposes explicit methods: `chat.list/create/rename/delete/messages`, `command.submit/clarify`, `execution.get/list/cancel/subscribe`, `project.pickRoot/preview/save/relink/delete`, `memory.getPack/search/getTask/getHandoff/proposeUpdate/saveHandoff`, `mcp.listClients/revokeClient`, `workflow.validate/save/run`, `alias.validate/save/delete`, and `preferences.read/update/exportPreview/importPreview/importCommit`. Pagination is mandatory for history. Picker methods return opaque grant IDs rather than letting a renderer assert filesystem authorization.

Request envelope: protocol version, random request ID, operation, typed payload, optional expected entity revision. Main derives sender/window capabilities from `webContents` and exact local origin; IDs are not authorization tokens. Responses contain request ID and either typed data or `{code, userMessage, retryable, evidenceRefs}`. Codes include `INVALID_INPUT`, `NOT_FOUND`, `STALE_REVISION`, `AMBIGUOUS`, `NEEDS_APPROVAL`, `PERMISSION_DENIED`, `UNSUPPORTED`, `TOOL_MISSING`, `TIMEOUT`, `CANCELLED`, `INTERRUPTED`, `OUTPUT_LIMIT`, `STORAGE_UNAVAILABLE`, `ENGINE_UNAVAILABLE`, `PAYLOAD_TOO_LARGE`, `SESSION_CHECKPOINT_QUOTA_EXCEEDED`.

Strict schemas reject extra keys. Default request cap 64 KiB; command ≤2,048 characters; checkpoint payload ≤2,048 bytes; import ≤5 MiB through main-owned file IO, not a giant IPC blob. Limit command submissions to 5/s/window, queue at most 20, and return explicit busy errors. Bound nested objects, array lengths, string lengths, and step counts. Engine RPC additionally rejects unknown operations and echoes a process-epoch ID so responses from a replaced engine are discarded.

Progress events contain execution ID, originating chat ID if still present, monotonic event sequence, timestamp, step ID, state, bounded summary and evidence IDs. No raw Electron event objects, OS handles, or raw logs. Batch progress at most 10 updates/s/run; terminal-state events flush immediately. Engine retains durable state; subscribers may request a state snapshot after a sequence gap. Renderer unsubscribes on unmount/chat change; it never changes where results are stored.

## Desktop shell

Retain the compact window hidden after first creation for warm display. Position against tray bounds and clamp to display work area; if opened by hotkey, use the relevant screen and last safe position. Restore input focus, Escape hides, and blur hides except during file dialogs or confirmations. Do not use persistent high-frequency animation while hidden. Create settings lazily and load workflow/project editing modules only there. Page histories and render bounded log previews; apply installed React guidance on narrow subscriptions, stable keys, indexed maps, and avoiding large eager bundles.

Register a configurable non-media accelerator after ready, detect registration failure, and preserve menu-bar access. Register a replacement before dropping the old shortcut; invalid/conflicting changes leave a usable fallback. No global keylogging. Some media-key shortcuts require Accessibility authorization; do not select those as defaults. [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut).

Use Electron tray, screen, dialog, nativeTheme, shell and app login-item APIs. Launch-at-login is opt-in; check actual OS state and report MDM refusal. No Dock window is required for common commands; a larger conversation/settings window may temporarily show an activation affordance. Reuse one expanded host for conversation and settings routes rather than retaining another renderer for each feature. Test full-screen Spaces, multiple monitors, screen removal, sleep/wake, and keyboard-only use. Implement only the P1 minimal surfaces first; settings routes arrive with their phases.

Control-path RPC for status, cancel and approval must bypass the single-active-workflow dispatch queue; each still passes schema/policy validation. Project recipe execution remains inside the shared executor. UI shows queued work and the correct originating chat; no native OS integration is assumed passed until its signed P0 cell has evidence.

## Guided project registration

1. Main opens native directory picker. Create a provisional canonical-root grant; detect denied, inaccessible, or removed roots before saving.
2. Read at most 32 known metadata files, ≤256 KiB each and ≤2 MiB total, depth ≤2 for explicitly suggested service roots. Exclude `.env`, credentials, `node_modules`, `.git` internals except repository pointers, symlink traversal outside grants, and executable config evaluation.
3. Detect `.git` directory **or worktree pointer file**, package manager lockfiles, `package.json` scripts/dependency keys, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, and Compose file presence. Use JSON parsing; use a maintained safe TOML/YAML parser only if field-level parsing is necessary. MVP can detect presence without interpreting executable framework config. Record detector version and evidence path/field. Never import `vite.config.*`, execute package scripts, install dependencies, or start Docker during detection.
4. Suggest project name, framework/runtime/package manager, repository and service roots. Suggestions are evidence, not configuration approval. Let user choose unique display labels, aliases, editor/terminal app bundle IDs, services, executable recipes, ports, readiness and logs.
5. Provide a review with exact executable/arguments/cwd and trust scope for each command. Save stable UUIDs, approved root grants, revisions and command approvals in a transaction; atomically update indexes after commit.

Framework detection is best-effort: e.g. `next` dependency suggests Next.js; a `dev` script suggests an available recipe but does not prove its behavior. A project may register without services, editor, terminal, or tools. Folder opening and configured read-only Git remain available independently.

Service configuration: ID, project ID, display name/aliases, relative working directory, runtime/tool recipe, start/test/optional stop recipe, dependency service IDs, optional port, bounded TCP/HTTP readiness, optional explicit log sources. Start recipes must stay in foreground; daemonizing scripts are unsupported for managed ownership. Stop normally signals the owned group; a custom stop recipe has its own approval and may affect external resources, so it is never silently derived from a port.

Multi-service dependencies form an acyclic graph; validate cycles and topologically order into sequential start+wait steps. A healthy existing listener does not prove it is the configured service: label externally observed status and ask before treating it as readiness for a new launch. Reverse dependency order on explicit stack stop. No automatic rollback of already started services after partial failure; offer a separately confirmed stop plan.

## Lookup and stale paths

Engine loads exact normalized-name/alias multimaps and a Fuse fallback index from SQLite at startup. Index configuration revision tags prevent stale candidates from executing. Canonical roots are indexed separately for duplicate-folder detection; compare volume/file identity when available. Do not use a Git remote URL as project identity: forks, credentials, offline remotes, and multiple worktrees exist.

Duplicates map to multiple IDs and require disambiguation; namespaced labels such as `office/payments` are user configuration, not inferred filesystem semantics. Store service aliases scoped to their project. On action execution, revalidate only selected roots and referenced files. No per-command full scan or recurring watcher. Explicit Refresh re-runs bounded detection and presents differences without replacing approved recipes.

Rename/move: a missing folder is `unavailable`; offer relink via picker and compare metadata, but never silently point the UUID to a similarly named folder. Relink invalidates path-dependent approvals and revalidates service/log subpaths. Project deletion is global configuration deletion with a preview of impacted workflows/aliases/context; reject or disable references, never delete the project directory. Active executions hold immutable snapshots; deletion offers cancel affected work or wait, rather than silently killing services.

## Diagnostics capability matrix

All probes return `ok`, `partial`, `unavailable`, `permissionDenied`, or `unsupported`, with timestamp and evidence. They require no sudo. Being a non-sandboxed signed desktop app does not bypass Unix permissions, TCC, SIP, or MDM.

| Capability | Primary mechanism | Limits and permission behavior |
|---|---|---|
| CPU/memory/basic health | Selected `systeminformation` calls, Node `os`; short CPU delta sample | Memory pressure/cache/compression differ from simple free-RAM percentages; show units and interval; no invented bottleneck |
| Disk capacity | `fs.statfs` or bounded filesystem-size adapter for selected local volume | APFS purgeable/shared space differs from Finder; no SMART/root/raw-disk requirement |
| Battery | `systeminformation.battery` / bounded `pmset -g batt` fallback | Desktop may have no battery; unsupported is normal |
| Process existence/resource consumers | Own child handles; bounded process snapshot (`ps`/reviewed SI adapter) | Cross-user/protected fields may be absent; PID identity may change; do not collect full environment or command lines by default |
| Port listeners | Fixed `/usr/sbin/lsof` invocation with validated numeric port, TCP/UDP distinction | No-match, tool error, access denied and timeout are separate; partial visibility is not proof port is free |
| TCP/HTTP health | Node `net`/HTTP clients, configured loopback endpoint | TCP connect is not app health; HTTP status/body rules explicit; bounded retry window |
| DNS/connectivity | Node DNS lookup and user-requested bounded TCP/HTTPS probe | External destinations use network; offline result expected; distinguish DNS/routing/TLS/proxy/endpoint failure; never one boolean “internet broken” |
| Git | Reviewed executable, fixed porcelain status/branch/log commands | Git may be absent and `/usr/bin/git` may prompt for Command Line Tools; no install by Bhai; unsafe repository config must be constrained |
| App launch/status/quit | Known bundle IDs; Electron shell / `open` fixed args, helper AppKit APIs | App quit can be denied or wait on unsaved documents; never automatically force quit |
| Folder/editor/terminal opening | Registered root via LaunchServices/known app adapters | Editor CLI optional; terminal cwd opening is adapter-specific and must pass signed integration spike; no generated shell typing |
| Volume | CoreAudio helper on current output device | Query property availability/settable state; HDMI/USB or managed devices may lack software volume; return unsupported |
| Logs | Registered file sources or captured Bhai stdout/stderr | Protected files require relevant user-granted access; private arbitrary application logs are not promised |
| Selected developer tool | Initial Docker **availability/version** check; optional bounded log adapter only if approved and feasible | Docker socket is highly privileged; no automatic socket grant, daemon start, container mutation, or required Docker install |

AppKit exposes running applications and graceful termination. That makes a narrow helper preferable to sending arbitrary Apple events. [Apple NSRunningApplication](https://developer.apple.com/documentation/appkit/nsrunningapplication). CoreAudio properties must be checked for existence and writability before setting volume. [HasProperty](https://developer.apple.com/documentation/coreaudio/audioobjecthasproperty(_:_:)), [IsPropertySettable](https://developer.apple.com/documentation/coreaudio/audioobjectispropertysettable(_:_:_:)). File/folder protections remain under user and system policy. [Apple file access controls](https://support.apple.com/en-mt/guide/mac-help/mchld5a35146/27/mac/27).

## Log ingestion and deterministic diagnosis

Sources are explicit `file` or `managedProcessStream` records, with project/service IDs, grant reference, path or process record, encoding, and enabled state. Onboarding may suggest conventional paths inside a selected root only after metadata evidence; user confirms before registration. Do not sweep `~/Library/Logs` or Unified Logging, and do not claim app-private logs. Docker logs are a feasibility option, not necessary to fulfill the initial file/stdout adapters.

File reads open a regular file under a grant, verify canonical path and file identity, seek from the end, read ≤256 KiB/source and ≤1 MiB/request, decode safely, and keep ≤1,000 lines/source. Oversize lines truncate at 16 KiB with an explicit marker. Handle rotation/truncation by comparing device/inode and size; never block on FIFO/socket/device files. Default maximum four sources per inspection. Concurrent rotation may produce a labeled partial snapshot.

Managed stdout/stderr is drained continuously **only for a running user-requested process**, into a redacted ring buffer of ≤256 KiB/stream. Avoid pipe deadlocks even after storage cap: keep draining and discard excess with counters. Optional persisted sanitized logs rotate at 2 MiB/file, three files/service, 50 MiB total; default diagnostic retention is specified in data model. On-demand tail results have a timestamp and explicit truncated/redacted counts, not an unbounded live stream.

Decode and strip ANSI/OSC/control sequences before display, preserve readable newlines, redact across chunk boundaries with bounded carry (8 KiB), and limit line size. Mask configured secret values plus common token/header/URL-credential/PEM patterns before IPC or disk. For multiline secrets, retain state until terminator or size cap and discard uncertain remainder. Redaction is best-effort; users can clear history and opt out of persistence. Logs are escaped text and never commands, HTML, URLs to auto-open, or input to alias learning.

Signature registry: versioned IDs, bounded literal/safe-regex patterns, platform/tool applicability, evidence requirements, severity, explanation template, and candidate **action IDs**. Initial signatures: EADDRINUSE, ECONNREFUSED, executable missing, EACCES/EPERM, nonzero process exit, explicit out-of-memory/killed evidence. Bound scanning to the captured snapshot, precompile patterns, reject pathological regex. A match says “this error was observed”; attributing cause requires corroboration (e.g. listener identity + failing configured port). Generic kill/exit codes do not prove OOM.

`backend kyu nahi chal raha` resolves a configured service then gathers process/port/health/log evidence concurrently within a 10 s aggregate deadline, with ≤4 probes in flight. Show a factual findings list, explicit unknowns, and supported safe next actions. Suggested restart/termination remains a new policy-checked proposal. Missing data or a permissions error never becomes a successful diagnosis.

## Tool invocation and Git safety

Default probes ≤3 s, Git ≤5 s, process listing ≤2 s, HTTP connect/request ≤2 s and ≤64 KiB response. Abort on aggregate deadline; mark slow/hung adapters unavailable. Metadata/log reads and large signature work live in utility or a bounded worker, never main/renderer.

Use spawn with absolute executable and argv, `shell:false`, bounded output, sanitized environment, `LC_ALL=C` for text formats, and machine-readable output when available. Git status uses porcelain v2 with NUL delimiters; recent commits use bounded explicit fields, not a pager or diff renderer. Suppress optional locks, pager, external diff/textconv, fsmonitor/hooks where applicable, disable prompts and recursive submodules, and test hostile local Git config. No fetch, push, reset, checkout, credential helper, or automatic tool installation. [Git status porcelain format and locking](https://git-scm.com/docs/git-status).

# Bhai UI and interaction specification

Review revision: 2026-11-14. Status: proposed UX under conditional architecture approval; product-owner acceptance pending. This specifies F01–F08 in the [finalized MVP](../../BHAI_MVP_FEATURES.md); it does not add implementation or new feature scope. Execution authority remains in the [security policy](../architecture/SECURITY_DESIGN.md) and [workflow engine](../architecture/WORKFLOW_ENGINE.md).

## Design direction

Bhai is a small command companion for a developer switching between projects. Prioritize an immediately focused input, an unmistakable current chat, visible target identity, and concise factual results. Long evidence and configuration belong in an expanded view. No dashboard of continuously updating metrics, animated mascot, decorative cards, chat-bubble theatre, or automatic scrolling away from a user's place.

Use locally available system UI typography (`-apple-system`) and system monospace only for commands, paths and logs. Proposed type scale: 13 px secondary, 14 px body, 16 px input, 20 px view title; allow text scaling. Spacing uses 4/8/12/16/24 px; controls generally 32–36 px tall. Left-align prose and fields. Quiet 1 px separators group related controls; nested cards are unnecessary. Labels use sentence case and concrete actions.

Proposed light tokens: canvas `#FFFFFF`, secondary surface `#F3F5F7`, text `#18212B`, secondary text `#526170`, action/focus `#1456B8`, danger `#B42318`. Dark appearance uses system-appropriate dark surfaces and independently tested foreground/focus/error colors; do not invert pixels. Status always has text/icon meaning in addition to color. Verify contrast in both appearances; these tokens are a starting specification, not a validated rendered design. Follow system appearance, increased contrast and reduced motion. No remote fonts/assets.

## Surfaces and navigation

| Surface | Primary task | Proposed geometry and lifecycle |
|---|---|---|
| Menu-bar Quick Panel | Enter command, clarify target, read short result, track current work | About 440 px wide, 320–600 px high, clamped to display work area. Retained hidden after first open; no diagnostic work while hidden unless explicitly requested work is ongoing |
| Expanded conversation | Read history/evidence and manage chats | Resizable normal window; default ~960×700, usable at 760×520; collapse sidebar on smaller work area. Same chat/messages/run IDs as Quick Panel |
| Settings | Projects, workflows, taught phrases, preferences/data controls | Lazy normal window with simple sidebar; uses the expanded-window shell where possible, not another always-resident renderer |
| Native picker / confirmation sheet | Select resource or make a scoped trust decision | Owned by initiating window, explicit cancel, restore focus on close; panel blur dismissal suspended while owned dialog is open |

If screen size/text scaling cannot fit a compact layout, scroll results or open expanded view. Never clip confirmation targets/buttons. Allow at most one Quick Panel and one expanded/settings host; opening another route reuses the host. Shared UI components render the same canonical state, not duplicated chat memory. Switching surfaces preserves draft input and message scroll anchor per chat in UI state; drafts are not implicit executable commands and are cleared on chat deletion.

```text
Quick Panel
┌─────────────────────────────────────────────┐
│ Bhai       Aawas debugging ▾       Expand    │
│ Target: Aawas / backend                      │
│                                             │
│ You: backend kyu nahi chal raha              │
│ Backend did not respond on port 8000.        │
│ Checked just now · Logs unavailable          │
│ View evidence                               │
│                                             │
│ Office Start: 2 of 5 steps complete   View    │
│ [ Type a command…                    ] Send │
└─────────────────────────────────────────────┘

Expanded view
┌───────────────┬─────────────────────────────┐
│ New chat      │ Aawas debugging             │
│ Chats         │ Messages and result evidence│
│  Aawas debug  │                             │
│  Standup      │ Run: steps / status / errors│
│               │                             │
│ Projects      │ [ Type a command…     ] Send│
│ Workflows     │                             │
│ Settings      │                             │
└───────────────┴─────────────────────────────┘
```

Wireframes describe information hierarchy only. Result/run rows have real text and timestamps, never fabricated data or simulated success. A global work indicator may say “1 run queued in another chat”; it does not expose or import that chat's target/context into the current command.

## Keyboard and focus contract

| Interaction | Behavior |
|---|---|
| Configured global shortcut / tray click | Toggle Quick Panel; focus current chat's command input on show; bring tray fallback if registration failed |
| Enter in input / Send | Submit once; suppress duplicate submission while accepting command; plain text entry with no send on IME composition |
| Shift+Enter | Insert newline in a bounded input; multiline scripts are still unsupported |
| Escape | Dismiss topmost menu/clarification/dialog first; otherwise hide Quick Panel; never cancel a run or approve a prompt |
| Cmd+N / Cmd+Shift+N | New chat / open chat switcher while Bhai focused; scope shortcuts to app, not global capture |
| Cmd+Return | Open current conversation in expanded view; never an approval shortcut |
| Cmd+, | Open preferences |
| Arrow keys in open candidate/catalog/chat list | Move selection; Enter selects; Tab still reaches explicit buttons |
| Step reorder | Explicit Move up/Move down buttons with accessible names and keyboard activation; drag optional, never required |
| Approval dialog | Focus title/summary for screen reader then safe Cancel control; Enter does not activate a risky default; Tab to explicit action button |

Every icon-only control has a visible tooltip and accessible name. Preserve standard copy/paste/select-all and native editing menus. Focus indicators remain visible; modal focus is trapped and restored. Run updates use a polite live region with throttled announcements; errors/approval requests announce once without stealing input focus. Logs are selectable escaped text with a label and scroll region. Every workflow can be created/run/cancelled and every clarification completed with keyboard only. No automatic focus change when another chat's execution completes.

## Quick Panel interaction

On first open show empty chat with three supported examples: `ram dekh`, `port 3000 check`, `vs code kholo`. “Add a project” is secondary setup, not a blocking onboarding tour. Header always shows current chat name and switcher; “New chat” starts empty context. Target line appears only when a valid same-chat target exists and says which project/service a follow-up would use. Stale focus reads “Previous target unavailable — choose a project”; never replace it from another chat.

After submit, show user message and either a concise result, clarification, negation acknowledgement, unsupported response, or queued/running execution row. Acknowledgement appears before slow probes finish; no fake typing animation. Input remains usable for subsequent commands. Ongoing run progress survives hiding the panel; reopening queries durable state. Closing panel via Escape/blur does not send a cancellation. A secondary “View conversation” opens full history; the panel retains only a bounded recent viewport.

## Expanded conversation, history and diagnostics

Chat list supports create, rename, switch, revisit and delete through labeled menus; switching is a view change, never execution routing. Order chats by updated time with stable IDs; preserve each scroll position. Message history loads older pages on explicit request or scroll threshold, preserving anchor. If new results arrive while reading older messages, show “New result” rather than snapping to bottom.

Diagnostic result starts with observed facts and timestamp, then coverage/missing access, evidence, and supported next actions. Example: “Port 3000 is in use by a visible Node process. This does not confirm it belongs to Aawas.” Expand process/port/health/log/Git sections on demand. Show “1,000 lines shown; older output omitted”, redaction counts and source identity. No fabricated causal narrative. Unknown cause says “The available checks do not identify the cause.” A suggested restart opens a new typed proposal and applicable confirmation; selecting evidence never performs an action.

History links to original chat if present, otherwise “Originating chat deleted”. Global run history can show execution status across chats; resolver context never consults it. Deleting an inactive chat previews removal of its messages/context and preserves shared projects/workflows. For active work, use D06's cancel-then-delete flow, with explicit uncertainty/detach choice only after bounded cancellation fails. Never recreate a deleted chat to display a late result.

## Project onboarding wizard

Five stages with Back/Next and keyboard navigation:

1. **Choose folder:** native picker; explain “Bhai reads project metadata. It will not run scripts during setup.” Denial has Choose another folder and Retry after access is changed; no blanket Full Disk Access request.
2. **Review detected details:** proposed name, repository/worktree, frameworks/runtime, evidence file/field and aliases. Label uncertain detection; editing is allowed. No detected metadata is an executable approval.
3. **Choose tools and services:** editor and terminal selection, service name/cwd/start/test recipes, dependencies, ports/readiness. “Set up later” keeps folder and permitted Git actions useful. Advanced executable/shell configuration stays in a clearly named separate form.
4. **Choose logs:** explicit accessible file sources or future managed stdout/stderr; bounded preview with redaction, no private-app sweep. Outside-project file selection needs a separate picker/grant.
5. **Review and save:** summary of selected resources, scripts and trust state. “Save project” saves configuration only. Optional explicit “Approve selected project commands” lists exact executable/arguments/cwd and project-code trust. No launch occurs on Save or Approve; test/run is a separate explicit action.

Show duplicate names/aliases as conflicts with both project paths/labels; let user disambiguate rather than silently replace. Relink missing folder uses picker and a diff of changed resources; invalidate affected path/recipe trust before use. Missing VS Code/Terminal/toolchain offers supported alternative configuration or setup instructions, never automatic installation. Revisit wizard stages from project settings without redoing unchanged approvals.

## Workflow builder: first-release constraints

Use a named vertical step list, a **searchable static action catalog**, guided parameter forms and a validation/preview pane. Library opens with seven included templates plus saved routines. Template edit creates a user copy; duplicate, enable/disable and delete have explicit controls. A draft may be saved incomplete but cannot run or become enabled until validation passes.

Each step row shows order, action, target summary, optional simple condition, timeout/readiness and trust badge. Selecting it reveals typed fields from the action schema. Catalog search filters approved actions by name/category; no generated code, free-form executable action suggestions, node canvas, arbitrary edges, loops or complex branching. Service dependency order is calculated and displayed as a plain list. Basic condition form chooses an earlier result, one supported comparator and typed value; disallow forward/invalid references.

Reordering revalidates bindings; show errors inline on affected rows plus a summary link that focuses the first error. Retry controls appear only for registry-approved read-only actions. Failure policy defaults Stop; optional read-only Continue is labeled with consequences. Fields explain effects in user terms; engine IDs/hashes stay behind technical details.

Preview lists resolved targets, skipped/conditional steps, prerequisites, known approvals and run-specific confirmations still required. Input slots not yet chosen show “Choose project before running”. Saved trigger phrases live in the global alias editor and are displayed here through the same records. Phrase conflict review shows competing targets. “Save workflow” never executes it; “Run” performs preflight again. Cosmetic edits/reordering unchanged safe steps do not reapprove identical recipes; new/changed effect scope is reviewed.

## Clarification and guided Teach Bhai

Clarification is an inline pending command with a precise question, such as “Which backend?” Candidate rows include project/service, distinguishing path and reason (“Similar spelling” where fuzzy). No preselected candidate silently executes. Enter selects only after the candidate list has explicit keyboard focus. A missing parameter uses a bounded field; candidate selection uses stable ID and rechecks revisions. “Cancel command” clears the draft without cancelling unrelated work. Switching chats preserves that chat's draft without moving it; expiry shows “Please choose again” and regenerates candidates safely.

Unknown input says “I don't have a command for that phrase” and offers at most three plausible supported actions plus **Teach this phrase**. Teaching flow: review phrase → select existing action/workflow → fill any fixed supported parameters → review conflicts and target → Save phrase. Show “Available in all chats. This saves a shortcut; it does not approve commands.” Saving does not run it. Unsafe negation aliases are rejected with an explanation; approved phrase selection never bypasses target/risk checks. Manage phrases from settings with edit/delete/disable; deleted target is shown unavailable.

## Trust experience

Trust badges are descriptive, not a scoring meter. Language clarification, Bhai configuration approval, run-specific risk confirmation and an OS permission prompt are distinct steps. The user should never have to guess which one is being requested.

| Class | Examples | User experience |
|---|---|---|
| Read-only inspection (`inspect`) | Granted file logs, Git status, memory, port check | Runs after exact resolution within grants; show evidence/access limits. No repeated confirmation |
| Safe reversible action (`safeEffect`) | Known app/folder launch, bounded supported volume | Runs after exact resolution and capability checks. Show target/result; no “undo” unless genuinely implemented |
| Previously approved project command (`approvedCode`) | Saved start/test/editor recipe in trusted project | One scoped setup review; unchanged recipe can run in ordinary office routines without repeat approval. Show “Approved project command” in preview |
| High-risk action (`highRisk`) | App quit, service stop/restart, forced termination, arbitrary high-risk cleanup script | Explicit run-specific target/effect confirmation; no “always allow” checkbox |

An unapproved project command opens **Review project command** with executable/arguments/cwd, intended purpose and “This runs code from this project and its dependencies with your user permissions.” Buttons Cancel and Approve this command; approval does not auto-run a saved configuration. If invoked from a pending explicit Run, explain “Approve and continue this run” as a distinct, explicit option. Never store approval for an unnamed wildcard command.

High-risk example: “Stop Aawas backend? This will interrupt its current connections.” Show exact owned target, originating run and graceful-stop behavior. Buttons Cancel and Stop backend; force termination is a separate explicit action after graceful failure. Grouped immediate risk actions list every target and effect before one explicit confirmation. Escape, timeout, window closing or focus loss cannot approve. Popup dismissal may leave an awaiting-approval run visible in history; expiry leaves it unexecuted.

Meaningful changes requiring review: executable identity/path, argv/literal script, cwd/root identity, environment names/secret bindings, relevant invoked script/manifest fingerprint, requested file/network/resource scope, or policy changes. Non-authorizing edits: chat/title/description, label, appearance, equivalent alias, step display label, or moving an unchanged step subject to plan revalidation. Config **revision alone is not a recipe-trust fingerprint**; changed plan still invalidates outstanding run tickets. Missing OS access remains denied even when Bhai trust is valid.

Routine acceptance scenario: first reviewed Office Start opens selected apps/project/terminal, starts approved services and opens saved tabs. A second identical run has no new setup prompts and no generic “run workflow?” modal. Adding a new start recipe asks only for that new scope. Adding stop/quit/cleanup asks for relevant risk confirmation each run. Unknown/fuzzy target still clarifies; low-friction trust never means guessing a target.

## Run progress and failure handling

Show queued/running/awaiting approval/finished status, named current step and completed/total steps; counts, not invented percent/time remaining. Sequential queue shows “Waiting for another workflow” and Cancel queued run. Lightweight status, cancellation and approval controls remain responsive while a workflow owns the execution slot; running services do not occupy it after start finishes.

Steps show pending, running, succeeded, skipped with reason, failed, timed out, cancelled or outcome unknown. Partial completion remains visible: “Editor opened. Backend failed to start. Later steps were not run.” Cancellation says which work stopped and which completed effects remain. Failure offers View evidence, Edit configuration and Retry as a new validated run; no implicit retry of mutations, automatic rollback or auto-recovery.

After app restart, interrupted run says “This run was interrupted. Some actions may have completed.” Offer Inspect current status and a reviewed new run, never Resume replay. A surviving service is “Observed running; ownership unverified” until sufficient verified evidence exists. Do not offer Stop as a safe operation based on a matching port/PID alone.

## Errors, empty states and unavailable capabilities

| State | Content and next action |
|---|---|
| No chats | “Start a chat” and supported command examples; no borrowed context |
| No projects/workflows/phrases | Add project / configure a template / teach an existing action; explain one next step |
| Ambiguous target | Explicit candidate selection; no action already underway |
| Missing configuration | Name missing service/command/source and link to focused setup; preserve submitted input |
| Folder moved/unavailable | Show last saved path; Locate folder; no automatic replacement |
| File permission denied | Name selected resource, what was attempted and Choose another source / Retry; explain OS or managed policy when known |
| Unsupported volume/no battery | “This output device does not provide software volume control” / “No battery reported”; no false error or suggested elevation |
| Tool/app absent | Show missing tool and supported alternate/configuration instructions; no auto-install |
| Engine starting/unavailable | Input retained; no dispatch until ready; Retry engine only through guarded recovery, no duplicate resubmission |
| Storage full/migration failure | “New actions are paused because Bhai cannot save execution state”; View recovery; never silently reset storage |
| Shortcut unavailable | Visible tray access plus Change shortcut; keep previous working shortcut if replacement fails |
| Unknown diagnostic cause | State limits, factual evidence and safe next steps; no speculative certainty |

Error text omits raw stack traces/secrets by default; technical details are bounded/redacted on demand. No toast is the sole location of an error or approval. Settings for data deletion/export clearly distinguish configuration, chat history and diagnostic retention; exports exclude credentials/approvals/chats by default and show custom-script inclusion review.

## UX acceptance and scope checks

Before P1 approval, product owner reviews the surface split, keyboard map and four trust classes as proposed behavior. P1 implements only the Quick Panel, minimal expanded history and exact read-only vertical slice; later phases fill the specified routes incrementally. Before release, test all flows with keyboard and VoiceOver, both appearances, reduced motion, text scaling, small displays, full-screen Spaces and multiple monitors. No live UI has been built or accessibility-tested in this task.

Required walkthroughs: two chats with different targets; typo clarification with zero action before selection; Teach without execution; partial project setup; ordinary Office Start twice without redundant approvals; one meaningful recipe edit; high-risk stop denial; run continuing while hidden; failure after partial success; deleted chat with active work; restart with unknown step outcome. All must agree with engine state and policy rather than rely on UI-only checks.

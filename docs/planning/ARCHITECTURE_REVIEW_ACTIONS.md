# Architecture review actions and P0 feasibility plan

Review revision: 2026-11-14. **Overall status: conditionally approved; full MVP implementation is not authorized.** The review preserves the Electron/React/TypeScript architecture, sandbox/validated IPC, separate utility engine subject to compatibility, SQLite, deterministic language, typed actions/shared executor and per-chat isolation. No AI, cloud backend or proactive monitoring is added.

This task has prepared documentation only. **No P0 experiment has been executed. No compatibility result is passed. No application, harness, lockfile or dependency installation has been created.** Future P0 execution needs a separately scoped instruction; passing P0 is necessary but not sufficient to start P1 without the product owner's acceptance of the revised design and explicit authorization for P1.

## Review request traceability

| Review request | Updated authoritative documents | Completion in this task / remaining evidence |
|---|---|---|
| R1 Stronger feasibility gates | This runbook; [roadmap](IMPLEMENTATION_ROADMAP.md); [technology](../architecture/TECHNOLOGY_DECISIONS.md) | Reproducible experiment contracts, pass/fallback rules prepared; all execution pending |
| R2 UI/UX specification | [UX specification](../design/UX_SPECIFICATION.md); [components](../architecture/COMPONENT_ARCHITECTURE.md) | Surface/navigation/state/keyboard/approval specification written; product acceptance and rendered usability tests pending |
| R3 Simple workflow UX | [workflow engine](../architecture/WORKFLOW_ENGINE.md); UX; roadmap P6 | Vertical list, searchable catalog, guided forms and basic conditions specified; no graph editor/complex branching |
| R4 Trust experience | [security](../architecture/SECURITY_DESIGN.md); workflow; UX; [data](../architecture/DATA_MODEL.md) | Four classes, stable recipe trust fingerprints, changed-scope invalidation and routine-repeat tests specified |
| R5 Real developer language | [testing strategy](TESTING_STRATEGY.md); [language engine](../architecture/LANGUAGE_ENGINE.md); roadmap P2 | Collection/annotation/splitting/measurement protocol strengthened; **actual developer corpus not yet collected** |
| R6 D01–D11 | [open decisions](OPEN_DECISIONS.md) | Proposed resolutions recorded with acceptance pending; feasibility-dependent D04/D05 remain unverified |
| R7 Avoidable complexity | Incremental plan below; data/workflow/components/overview | One active workflow initially, staged tables/helper operations and observation-first recovery; security/integrity invariants retained |

## What changed and what remains fixed

The architecture is refined rather than replaced. First release uses one active workflow with a bounded FIFO queue and up to four probes within an explicit diagnostic step. This avoids an early multi-workflow scheduler; multiple submitted workflows and persistent service processes still remain trackable. Control operations (status, cancel, approval, chat switching) cannot be trapped behind the workflow queue. Service lifetimes are separate from execution slots.

Recipe trust now has a semantic fingerprint separate from cosmetic configuration revisions and the exact current plan hash. Unchanged previously approved project starts/tests can run without redundant prompts. Meaningful executable/argument/script/root/environment/resource changes invalidate affected trust; high-risk stop/quit/cleanup still require run-specific confirmation. No global “trust all workflows” setting.

The schema is an eventual logical model, migrated in phase-sized groups; no obligation to build all repositories upfront. The helper is a narrow candidate to be justified by signed tests, not a required general native platform layer. Recovery starts with durable interruption/unknown outcomes and user-initiated observation, not process adoption, automatic replay or a daemon.

## P0 common reproducibility contract

Prepare these artifacts **when P0 execution is separately authorized**. The names below define the future harness contract; the harness and commands do not exist in this documentation-only revision.

- A minimal standalone harness using the intended production build path: sandboxed local renderer → named preload API → validated main RPC → utility engine → temporary SQLite and controlled fixtures. Only test operations are registered; no full MVP scaffolding.
- Versioned harness source/fixture revision; exact lockfile and package integrity; build Node/npm/Xcode/SDK versions; Electron/Chromium/embedded Node versions from the running packaged utility; native SQLite version/build/ABI architecture; Swift deployment target; bundle ID/team/signature/entitlement hashes; macOS version/build, CPU/hardware, standard-user status and permission profile.
- Test data under a dedicated temporary root with paths containing spaces, Unicode and leading-dash leaf names. Synthetic project and benign app/process fixtures only; do not use confidential repositories, personal app state or unrelated PIDs.
- Immutable signed package plus SHA-256 and a result manifest for each cell. Capture bounded sanitized stdout/stderr, expected vs actual assertions, screenshots for manual behavior, process/DB snapshots and signature verification. Never include private signing keys, full environments or raw user logs.
- Evidence location proposed as `artifacts/p0/<run-id>/<experiment>/<os>-<arch>-<profile>/`; this directory is not created now. Manifest statuses: `not-run`, `blocked`, `failed`, `passed`, or `passed-with-approved-fallback`. A fallback needs its own executed evidence and owner acceptance; blocked or mocked tests cannot become passed.
- Each experiment gets a named noninteractive harness case and documented manual steps. Proposed future invocation shape: `npm run p0 -- --case E01 --profile clean-standard-user --out <dedicated-artifact-directory>`. This is an interface requirement for the future runner, not an instruction to run/install anything now. Runner exits nonzero on failed assertions and lists unexecuted cells.
- Choose the D01 matrix before execution: approved minimum and newest selected supported macOS releases × each promised architecture. Use native arm64 and native x64 when both promised; a Rosetta-only run is supplemental. A missing machine is `blocked`, never equivalent evidence. Capture architecture-specific artifacts even if distributing a universal app.
- Start from a clean build of pinned sources; install the produced DMG into Applications through the actual distribution path. Run cold tests from Finder/login context, not only a terminal, then warm repeats. Restart tests use a fresh launch of the same immutable package/data, not hot reload. Rebuilds/config changes get new evidence IDs.

Suggested verification tools, to be run against the eventual dedicated test artifact: `codesign --verify --deep --strict --verbose=2`, `codesign -d --entitlements :-`, `spctl --assess --type execute --verbose=4`, and `xcrun stapler validate`, with the exact app/DMG path recorded. `spctl`/stapling checks apply to notarized release-profile artifacts; distinguish them from successful Developer ID signature verification. Signing alone is not notarization. These commands are recorded for the experiment operator; none has been run here.

## E01 — Utility process and SQLite in a signed build

**Status:** not-run. Owner: desktop/storage engineering. Dependencies: chosen version/matrix and E02's build/sign procedure. Can be debugged unsigned, but only a signed packaged result qualifies.

**Fixture:** one minimal memory-query action plus temporary SQLite schema for two chats, context, command/run/step/attempt/event rows. App and data roots contain spaces and Unicode. A fixed fault hook controls interruption boundaries; no arbitrary SQL/exec endpoint exists in preload.

**Procedure:**

1. Build and Developer ID sign intended main/helpers/frameworks/native modules for the matrix cell. Start from Finder as standard user with `allowLoadingUnsignedLibraries` disabled. Log runtime version/arch from inside the utility and import better-sqlite3 there, never as a renderer workaround.
2. Through real validated IPC, create Chats A/B, persist one exact read-only command and result in A, and verify B's empty context. Verify transaction rollback, FKs, WAL and `synchronous=FULL` through a harness assertion.
3. Perform 100 bounded write/read transactions. Reject invalid/wrong-sender requests; collect UI responsiveness during these operations. Confirm no second writer/duplicate engine under a second app launch.
4. Cleanly quit/relaunch ten times; verify committed chat/run data and context. Kill only the controlled utility after intent commit, after result creation and during a transaction; relaunch five times per fault point. Assert rollback or preserved committed state, interrupted/unknown run status, and zero automatic command replay.
5. Simulate read-only/full data directory on the fixture: no new side effect may dispatch if intent cannot be persisted. Restore access; recovery must preserve data rather than create an empty replacement DB.

**Success:** native import and every assertion pass on each promised cell; signature remains valid; no unsigned-library bypass; no renderer/main blocking DB fallback; durable committed state and chat isolation survive restarts/faults. Report latency/memory as observations, not extrapolated MVP performance.

**Fallback:** first fix explicit native resource paths/unpacking/rebuild/runtime mismatch and rerun E01/E02. If the binding remains incompatible, evaluate a published compatible binding version or embedded `node:sqlite` behind the same repository contract, checking its selected runtime stability/durability. A binding switch requires a recorded decision and the full signed experiment. Do not move synchronous DB work to main or weaken sandbox/code signing to pass. If no isolated signed path works, P1 is blocked; a different process boundary requires architecture review.

## E02 — Native packaging, signing and distribution

**Status:** not-run. Owner: desktop/release engineering. Dependencies: candidate pinned runtime and build toolchain; signing/notarization credentials supplied securely outside repository.

**Procedure:**

1. Build SQLite native resource and minimal helper with explicit per-architecture targets. Inventory every executable/framework/native binding, actual packaged path, ASAR/unpacked location, linked library, deployment target and signing identity. Assert no developer-machine absolute path or unsigned local dylib dependency.
2. Apply intended fuses before signing; sign nested components in correct order. Verify signatures/entitlements of each component and the app. Launch installed app and exercise native import/helper from Finder with production CSP and sandbox settings.
3. Make a fresh notarized/stapled DMG through the intended distribution pipeline; install a quarantined download on clean standard-user test accounts. Record Gatekeeper, signature, notarization and stapling as separate checks. Disconnect internet and cold-launch ten times; no runtime download may be needed.
4. Negative controls on a disposable artifact copy: omit native resource; choose wrong architecture; alter a signed test resource/native binary. Validate load/signature failure is surfaced and fails closed; do not execute tampered binaries or bypass Gatekeeper. Never alter the original signed reference artifact.
5. Repeat a clean build from the lockfile on a second clean build environment and compare declared input/native/resource manifests. Signing timestamps may vary; compare source/dependency content, not a promise of identical signed bytes.

**Success:** required architecture cells package/import/launch correctly, nested signatures and intended entitlements/fuses validate, notarization/stapling and offline quarantined install pass, negative controls fail as expected, no extra broad exception is required. Ad-hoc signing or launch from a development checkout does not qualify.

**Fallback:** correct resource extraction/build target/signing order or select a compatible stable toolchain and rerun. A minimal documented Electron-required entitlement is assessed individually. No `allowLoadingUnsignedLibraries:true`, blanket validation disabling or reducing renderer security as a workaround. Missing Apple credentials/CI/hardware yields `blocked`; product may authorize a narrower tested matrix, but untested architectures are not claimed supported.

## E03 — Swift helper necessity, app control and volume

**Status:** not-run. Owner: native engineering. Dependencies: E02 signing recipe. Split capabilities so app status does not depend on volume implementation.

**Procedure:**

1. Compare existing Electron/LaunchServices operations with a minimal signed on-demand Swift helper limited to `app.status`, `app.requestQuit`, `audio.capabilities`, `audio.setVolume`. Fixed versioned JSON requests/responses, input/output size caps and deadline; no arbitrary selector, path, AppleScript or script execution.
2. In a benign controllable fixture app, query bundle identity/running state, launch twice, request graceful quit, simulate unsaved-document refusal and stale identity. Ten repetitions each; never force-quit a user's real unsaved app. Verify app-control call executes under the tested AppKit threading/run-loop contract.
3. Query current output device and property existence/settable status. Record original volume; explicitly set approved values 0/50/100 and restore original in fixture cleanup. Test unsupported output (HDMI/USB where available), changed/disconnected device, invalid range and denied policy. A mocked unsupported response supplements but cannot replace one actual capability-path test.
4. Execute from Finder-launched signed app with no Accessibility/Automation/FDA grants, then the E06 denied profile. Record actual prompts/entitlements and helper lifetime. Kill/hang controlled helper and assert bounded error handling and no engine/main crash.

**Success:** only public fixed operations, no default broad permissions/elevation, graceful refusal remains truthful, supported volume is correct and restored, unsupported devices return unsupported without false success, invalid input never changes state, helper terminates after request. Record operations that truly need native code; do not retain duplicate native implementations without purpose.

**Fallback:** retain Electron APIs where sufficient; use one narrow native implementation where required. For an operation failing under allowed policies, show capability unavailable and test a supported alternative. Any Apple-events alternative needs fixed reviewed target, declared usage/entitlement and its own E06 tests/product acceptance; do not silently substitute Automation or UI scripting. A generally required app/volume feature cannot be dropped solely because its spike failed—resolve or explicitly review the platform limitation before its implementation phase.

## E04 — Terminal.app and VS Code integration

**Status:** not-run. Owner: desktop/tool integration engineering. Dependencies: E02 signed shell; E03 only if a native operation is needed.

**Fixture:** registered folders with spaces, apostrophe, Unicode, leading-dash leaf and shell-looking literal name; a controlled benign project. Record selected Terminal/VS Code bundle and CLI versions/identity. Do not change the user's default shell/editor or install the `code` command automatically.

**Procedure:**

1. From Finder-launched Bhai harness, open the selected project folder in Terminal.app through the proposed LaunchServices/fixed adapter. Manually inspect new terminal's cwd with a read-only `pwd` typed by the experiment operator, not by Bhai. Five cold/warm attempts/path; distinguish app opened from correct cwd opened. No generated command text may be injected/typed into the terminal.
2. Open the same roots in VS Code via a selected approved CLI argv recipe (`--new-window` and explicit folder operand) and/or supported bundle opening. Verify correct workspace path; test missing `code` on PATH, known bundle installed, app absent, moved app/changed executable identity and blocked launch. Record which adapter succeeds, not an assumed CLI installation.
3. Assert no expansion/execution of shell-looking filename, no shell profile loading by Bhai and no arbitrary URL scheme control. Project script execution remains in the supervised foreground runner, never a Terminal tab.
4. Run under E06's no-Automation/denied profiles. Record prompts/refusals. Opening a folder through an editor may itself load workspace extensions/tasks; trust review must describe selected editor behavior rather than certify third-party editor code as harmless.

**Success:** exact folder/cwd, bounded truthful result and safe argv/identity behavior for promised integrations; no undocumented shell/PATH requirement or command injection; missing/denied states are actionable. If the adapter only opens Terminal without cwd, it has **not** passed cwd integration.

**Fallback:** prefer verified no-Automation launch route; otherwise propose an isolated fixed Terminal-only Apple-events adapter with explicit OS consent and escaped **data**, then rerun E04/E06 before approval. If neither works under the intended policy, product must accept a clearly labeled manual terminal alternative or revise the integration; never claim cwd support from a generic app launch. Missing VS Code can use explicit Finder/selected-editor alternative, without reducing folder access safety.

## E05 — Foreground supervision, cancellation and crash recovery

**Status:** not-run. Owner: workflow/process engineering. Dependencies: E01 durable ledger/E02 signed runtime. Use only harness-owned PIDs and process groups.

**Fixtures:** foreground server, dependency-delayed server, child+grandchild, SIGTERM-resistant process, stdout/stderr flood, missing executable, daemonizing/double-fork process, unrelated listener on desired port. Fixed fixture IDs map to known benign executables; no free-text shell runner.

**Procedure:**

1. Start foreground fixtures with argv, approved cwd/minimal environment and own process group/session where supported. Persist intent before spawn and record handle/PID/start/group/boot/epoch evidence. Verify stream draining and caps under 60 s flood, readiness deadlines and finite service-start step completion. No DB write stores raw pre-redaction log data.
2. Queue two workflows from different chats; only one executes initially, four bounded read probes allowed inside its diagnostic step. Cancel queued run and active test; status/approval/chat-switch remain responsive. Verify target busy/identity checks and no control request queued behind the long-running action. Running service remains trackable after workflow completes and panel hides.
3. Request confirmed graceful stop; verify group exit within 5 s. For resistant fixture, show remaining/uncertain state, offer separately explicit force termination and test refusal/acceptance. Never automatically send SIGKILL on deadline. Reverse service stop ordering; completed earlier effects remain reported after cancel/failure.
4. Inject utility/app crashes before intent, after intent before spawn, after spawn before process record, and after effect before result commit. Five fresh trials/point. Relaunch same data; assert interrupted/unknown state, no replay/restart/adoption and no recovered stdout claim. Observe surviving candidates using current evidence only; port match alone never permits signaling.
5. Supply stale/reused/mismatched process identity; verify no signal. For a surviving original candidate, a fresh stop is allowed only if tested identity evidence is sufficient and the user confirms. Otherwise retain inspection/manual guidance. Exercise daemon escape and report limitations; managed service recipe must reject daemonizing mode rather than promise total cleanup.

**Success:** zero wrong-target signals/replay, truthful cancellation/unknown status, bounded output/overhead, committed ledger consistent across every fault, responsive control path, explicit orphan limitations. Expected unknown outcomes pass only if presented accurately; claiming every external effect is recoverable is failure.

**Fallback:** restrict management to verified foreground live handles, keep single active workflow and observation/manual recovery for unknown ownership. If process-group evidence fails, offer only demonstrated stop semantics with explicit residual children, not broad `pkill`/sudo. Inability to safely supervise foreground commands blocks P4; P1 may proceed only if the isolation/durable read-only subset passed and this is recorded as an unresolved P4 gate with no ownership capability advertised.

## E06 — macOS permissions and denied access

**Status:** not-run. Owner: security/native QA. Dependencies: E02 signed stable bundle identity; E03–E05 test operations as relevant. Permission evidence for Terminal running developer scripts is not evidence for the signed Bhai app/helper.

**Profiles:** clean standard-user/no optional grants; selected accessible root; protected selected folder denied; explicitly granted selected folder; unreadable log/removed volume/symlink escape; no Automation/Accessibility/FDA; denied login-item/launch or network policy where controlled management profiles are available. Use dedicated accounts/VM snapshots to reset consent; do not reset all permissions on the user's active Mac or disable system protections.

**Procedure:**

1. Record initial signed identity, entitlements, TCC and management profile state. Run folder metadata/read/log operations, app launch/status/quit, volume, terminal/editor cwd, shortcut and opt-in login-item changes under each applicable profile.
2. Deny every presented permission and repeat the request. Assert operation-scoped denied/unsupported response, no fallback to an ungranted path/other chat, no repeated surprise prompts or stored “approved=true” bypass. Previously approved project command does not override OS denial.
3. Grant only the selected capability through normal OS controls and retry explicitly. Recheck identity after relink/app change; revoke access and retry. Detect actual refusal rather than reporting saved preference as OS state.
4. Test partial process/port visibility and external network denial/proxy/TLS failures; no-match is distinct from denied/error. Ensure core local commands work offline. No root/SIP/Gatekeeper bypass, broad FDA demand or automatic privilege helper.
5. Record MDM cases only with actual controlled policy/device evidence. If unavailable, mark that cell blocked/untested and restrict statements to tested denial behavior; mocked EPERM is not corporate-policy certification.

**Success:** useful core read-only/known launch path without blanket optional grants; explicit access boundaries, honest partial results, no execution on denial, normal user-controlled retry, no policy workaround. All promised profile cells have evidence or an accepted support limitation.

**Fallback:** capability-specific unavailable UI, alternative selected resource, explicit optional integration setup. Product/security owner accepts documented limitations; unsupported required baseline capability is a blocker, not a hidden feature removal. Unavailable managed hardware remains an uncertainty in release claims; generic OS-denial tests can pass without claiming universal MDM compatibility.

## E07 — Language imports and real-phrase collection readiness

**Status:** not-run. Owner: language/test engineering. Dependencies: stable tokenizer/Fuse artifact selection and [testing protocol](TESTING_STRATEGY.md). This is a P2 preparation gate, not proof of language accuracy in P0.

Build actual tokenizer/Fuse imports into signed utility; assert protected identifiers/negation, record import time/bundle/RSS, and ensure no model/network load. Recruit/consent target developers, pilot neutral task cards, test dual annotation and privacy scrubbing, then freeze collection schema and split rules. P0 evidence may contain pilot counts only; full real-language corpus/accuracy belongs to P2. If recruitment or data is missing, mark pending; synthetic 70-case regression success cannot substitute. Fallback tokenizer must repeat safety/import tests; no threshold tuning on held-out participant data.

## Experiment checklist and status register

| Check | Required evidence | Status / downstream gate |
|---|---|---|
| E01 signed utility + native SQLite | Packaged import, ledger restart/fault/rollback, A/B isolation, no UI/main fallback | **Passed in development runtime; production signed DMG blocked.** WAL/FKs/rollback/isolation passed locally; production Developer ID signature blocked on D02 credentials |
| E02 packaging/signing/notarization | Per-binary manifests, intended fuses/entitlements, quarantine/offline installed launch, negative controls | **Blocked (missing Developer ID credentials).** Native asset packaging and ad-hoc signing passed; Developer ID signing and Apple notarization blocked; proposed development-only exception for P1 |
| E03 app/volume helper | Exact native necessity, graceful refusal, property capability, signed no-broad-grant path | **Passed.** On-demand Swift helper (`bhai-helper`) verified for AppKit app status/quit refusal and CoreAudio volume query/set/restore with 0 daemon overhead |
| E04 Terminal/VS Code | Exact cwd/workspace, odd-path safety, missing/denied tool behavior | **Passed (dispatch & safe argv); interactive shell cwd pending P3.** VS Code CLI discovery and LaunchServices dispatch verified across odd paths; active interactive shell cwd check retained as P3 gate |
| E05 process lifecycle | Foreground ownership/cancel, crash gaps, no wrong signal/replay, explicit orphan limits | **Passed (process groups & resistance); crash simulation & PID-reuse pending P4.** Group/tree kills and SIGTERM resistance verified; live utility IPC crash simulation and OS PID-reuse collision retained as P4 gates |
| E06 access/denial | Actual signed identity/profile matrix, fail-closed boundaries, offline baseline | **Baseline passed; corporate MDM blocked.** Protected path fail-closed denial and offline operation verified; unmanaged host means corporate MDM fleet cell is blocked |
| E07 language imports/data readiness | Artifact audit/import test, collection pilot provenance | **Passed (tokenizer imports & synthetic regression); real corpus pending P2.** 70/70 synthetic cases passed with p95 0.224 ms; real developer corpus (≥600 phrases, ≥12 developers, 25% holdout) strictly gated for P2 |

Dependency execution order: approve narrow P0 scope/matrix → E02 signed build recipe + E01 smoke (iterate together) → E03/E04/E05 → E06 across their operations → recorded fallback decisions and E07 pilot planning → P0 evidence review. E06 baseline starts as soon as E01/E02 are available. Native integrations may be investigated independently, but none inherits another experiment's pass.

## Incremental complexity decisions

| Area | Implement first | Add when needed in same MVP | Must retain from first relevant step |
|---|---|---|---|
| Database | P1 migrations/chats/context/commands/minimal run-step-attempt/state events/preferences; plain SQL repositories | P2 aliases/drafts; P3 grants/projects/services/recipes; P4 dependencies/process/approval rows; P5 sources/evidence; P6 versioned saved workflows; P7 secret/portability lifecycle if needed | FKs/transactions/revisions, bounded writes, backup before nontrivial migration, single writer, no silent reset. Persist an observation/source row earlier if first metric needs a reference |
| Execution concurrency | One active workflow, bounded FIFO; control path independent | Four bounded read probes inside explicit diagnostics; increase active-run count only after resource/ordering/cancellation tests and a recorded need | Per-chat command sequences, immutable snapshots, per-target identity/busy validation, no cross-chat target borrowing |
| Process lifecycle | Live foreground child handles and bounded streams; start step finishes separately from service lifetime | Multi-service order, readiness and explicit confirmed stop; observation-only crash reconciliation | Intent-before-effect, no PID-only signal, no silent kill escalation, no daemon guarantee |
| Recovery | Mark interrupted/unknown; restore committed chats/config; user-initiated inspect/new run | Fresh confirmed stop only after ownership evidence is proven; advanced process adoption unnecessary | No replay of mutations, durable attempts, fail-closed on missing ledger, backup/restore integrity |
| Native integration | Electron APIs first; only proven fixed AppKit/CoreAudio helper operations | Terminal-specific optional adapter only if E04 requires it and product accepts permission | Signing/input bounds/no arbitrary scripting/no elevated daemon |
| Workflow UX/schema | One-step direct-command definitions then vertical saved step lists, strict action schemas | Guided conditions, templates, dependencies/readiness and typed bindings in P4/P6 | Shared executor/policy; runnable plans fully validated; simple immutable revision snapshots |

These are implementation stages, not feature removals. Do not create a generic event-sourcing replay system, OS process adoption framework, graph editor, separate service per module or complete schema before the vertical slice. The final MVP still supports the finalized operations, workflow list/conditions/dependencies, history, isolation and safe cancellation within documented platform limits.

## P1 approval criteria

All boxes remain unchecked. This is the approval gate **before starting P1**, separate from P1's eventual completion criteria in the roadmap.

- [ ] Product owner explicitly accepts the revised UX/trust behavior and proposed foundational D01–D03 decisions; accepts D06–D11 defaults or records bounded deferrals before their phases. Conditional core approval is preserved as the current state.
- [ ] D04 has a pinned compatible signed utility/SQLite/toolchain result: E01 and E02 native/signing cells pass on every architecture/OS claimed for P1. No unsigned exception or main/renderer storage fallback.
- [ ] E06 baseline sender/file/storage denied-access tests pass with no blanket optional permissions; native denial cells are either passed or explicitly tracked as later feature gates with accurate limitations.
- [ ] E03–E05 have executed feasibility evidence with a demonstrated route or tested accepted fallback; unresolved details are assigned to P3/P4/P5 with explicit blockers. A failed route without an acceptable alternative cannot be labeled feasible. P1 cannot quietly commit to an unproven required native integration.
- [ ] No unresolved critical/high boundary or data-integrity defect in the P1 path; unknown side effects, no-replay behavior and single-active-workflow contract accepted.
- [ ] Review evidence includes exact build/lock/fixtures, per-cell outcomes, deviations, responsible reviewer/date and remaining uncertainty; blocked matrix cells are excluded from support promises. Any notarization-only deferral is explicit and must close before release.
- [ ] P1 scope is restricted to the secure persistent read-only vertical slice, minimal UX and required tables; actual-developer corpus collection plan is owned and P2 cannot pass on synthetic examples alone.
- [ ] Product owner accepts P0 outcome/revised design and explicitly authorizes P1. No checkbox is inferred from silence or this documentation update.

Full architecture approval and later full MVP work remain gated by product-owner acceptance, not by an agent's document audit. After those conditions are met, implement P1 only to its stated acceptance criteria before broadening scope.

## Platform evidence references

Experiment design is informed by public APIs, not successful Bhai prototypes. Electron offers Node-enabled utility processes and an unsigned-library loading option that this plan keeps disabled; native modules require appropriate packaged runtime compatibility. [Utility process](https://www.electronjs.org/docs/latest/api/utility-process), [native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules). Signing and notarization are separate distribution requirements. [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing). VS Code documents CLI folder opening; E04 must still verify a GUI-launched app's selected executable/environment and actual folder behavior. [VS Code CLI](https://code.visualstudio.com/docs/configure/command-line).

# Testing and validation strategy

Review status: conditionally approved core, revised tests proposed; **no app validation/P0 experiment has run and no real-developer corpus has been collected**. No app or dependencies exist from this planning task. Scope authority: [MVP acceptance criteria](../../BHAI_MVP_FEATURES.md). Budgets: [technical design](../architecture/TECHNICAL_DESIGN.md). [P0 runbook](ARCHITECTURE_REVIEW_ACTIONS.md) defines signed experiments/evidence and P1 entry; the roadmap defines later gates. Synthetic examples below are a regression seed, not evidence of natural-language accuracy.

## Test layers and ownership

| Layer | Tools / environment | Required behaviors and pass gate |
|---|---|---|
| Domain unit | Vitest, fake clocks/process/filesystem providers | Pure resolver, slot validation, state transitions, permissions, conditions, signature rules, alias conflict checks; every critical rejection path asserted |
| Repository integration | Real temporary SQLite, migrated fixtures, filesystem fault injection | FKs/transactions, command ordering, context isolation/CAS, revisions, import remapping, retention and deletion; no data loss outside explicit policy |
| Adapter integration | Real local foreground fixture processes/files/loopback servers | argv/cwd/env, cancellation/process groups, output flood, log rotation/control stripping/redaction, TCP/HTTP/DNS deadlines; no shell or external network needed |
| React behavior | Testing Library + user-event | Keyboard/chat switching, clarification target selection, setup forms, builder ordering/validation, confirmation denial/expiry, progress/history; test visible behavior rather than component internals |
| Electron UI | Playwright Electron launch with isolated userData | Real preload/main/utility/DB path, restart, hidden panel, engine/renderer crashes, wrong sender IPC, no Node in renderer; cannot substitute browser-only tests |
| Native macOS | Signed packaged app on supported physical Macs + controlled VMs where appropriate | Tray click/hotkey/Spaces, TCC/MDM, helper app status/quit/volume, login item, GUI PATH, unsaved app, audio hardware, code signing/notarization |
| Security/fault | Crafted inputs, adversarial repos/logs/imports, deterministic fault injection | No approval bypass, wrong process kill, raw secret persistence, cross-chat context reuse or blind effect replay |
| Performance/release | Signed release build, fixed hardware/dataset and instruments | p95 latency, CPU/RSS, UI responsiveness and bounded resource stress meet proposed targets with reproducible evidence |

Playwright explicitly marks Electron automation experimental; retain a signed-Mac manual/native checklist for gaps. [Playwright Electron support](https://playwright.dev/docs/api/class-electron). Testing Library is suited to user-visible React interaction, not Electron permission or platform coverage. [Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

## Representative command dataset

Fixture registry: project `P_A` = Aawas (`aawas`), frontend `S_AF` on 3000, backend `S_AB` on 8000; project `P_P` = Payments (`payments`, namespaced `office payments`) with backend `S_PB`; app `APP_VSC` = VS Code (`vs code`, `vscode`); app `APP_SAF` = Safari; workflow `W_OFFICE` = Office Start (`office start`); folder `F_DOCS` explicitly registered as `documents`; project `P_RD` = Research and Development. Start recipes are saved but executable only after setup approval. `W_WRAP` is configured Wrap Up. Chat A focus begins `P_A/S_AB`; Chat B is empty. Each row starts from this fixture unless a sequence is explicitly stated. No real action runs in language tests; assert proposal or no-proposal result plus context changes.

Disposition: R = resolved proposal (still subject to executor policy); C = clarification; N = negated/no executable plan; U = unsupported/rephrase; V = invalid typed value. Expected actions below are semantic catalog names; implementation maps to stable registry IDs/versions.

| ID | Input / context | Expected result |
|---|---|---|
| L01 | `bhai ram dekh` | R system memory snapshot |
| L02 | `memory usage` | R system memory snapshot |
| L03 | `  BHAI   memory   usage  ` | R same as L02, preserve original display |
| L04 | `cpu usage` | R CPU snapshot with interval |
| L05 | `disk space dikha` | R disk capacity snapshot |
| L06 | `battery status` | R battery snapshot, not claim battery exists |
| L07 | `vs code kholo` | R launch APP_VSC |
| L08 | `vscode khol` | R launch APP_VSC via curated variant |
| L09 | `safari running hai` | R app status APP_SAF |
| L10 | `safari band karo` | R request quit APP_SAF; high-risk confirmation needed |
| L11 | `documents kholo` | R open registered F_DOCS |
| L12 | `port 3000 check` | R listener inspection, integer 3000 |
| L13 | `port 65535 check` | R listener inspection, integer 65535 |
| L14 | `port 0 check` | V; no proposal |
| L15 | `port 65536 check` | V; no proposal |
| L16 | `port 3000 or 3001 check` | C/rephrase, no selected number |
| L17 | `volume 50` | R set volume 50; device capability checked later |
| L18 | `volume 150` | V; no clamping to a different value |
| L19 | `volume -10` | V; preserve minus, no normalization to 10 |
| L20 | `aawas status` | R project status P_A; establishes project focus |
| L21 | `aawas backend logs dikha` | R logs P_A/S_AB |
| L22 | `backend kyu nahi chal raha`, Chat A | R read-only diagnostics S_AB; negative question whitelist |
| L23 | `why is backend not running`, Chat A | R read-only diagnostics S_AB |
| L24 | `backend kyu nahi chal raha`, Chat B | C project/service target required |
| L25 | `logs dikha`, Chat A | R registered logs S_AB |
| L26 | `logs dikha`, Chat B | C; never borrow P_A/S_AB |
| L27 | `logs dikha`, only P_A focus with two services/no default | C service/source required |
| L28 | `office payments status` | R project status P_P via exact saved alias |
| L29 | `aawas test` | R approved-code recipe proposal, no automatic setup approval |
| L30 | `aawas backend start` | R service start S_AB, recipe approval required |
| L31 | `aawas backend stop` | R stop S_AB; ownership check + per-run confirmation |
| L32 | `aawas backend restart` | R explicit stop/start plan; confirm risk |
| L33 | `office start` | R W_OFFICE; all template setup preflight required |
| L34 | `mera usual setup chala`, before teaching | U supported suggestions |
| L35 | same phrase, taught to W_OFFICE | R W_OFFICE; alias adds no command permission |
| L36 | `awass logs dikha` | C likely P_A suggestion via Fuse; no autoexecution |
| L37 | `vs cdoe kholo` | C likely APP_VSC; no launch |
| L38 | `pay status`, two projects share alias `pay` | C both exact targets |
| L39 | `code kholo`, app and project both named code | C namespace/target collision |
| L40 | `vscode mat khol` | N; zero action proposal/context mutation |
| L41 | `vscode nahi kholo` | N |
| L42 | `vscode nahin kholo` | N |
| L43 | `don't open vscode` | N |
| L44 | `do not stop backend`, Chat A | N |
| L45 | `never quit safari` | N |
| L46 | `don't not open safari` | C uncertain negation; request rephrasing, no proposal |
| L47 | `vscode mat khol aur aawas start` | N whole chain, no positive-fragment launch |
| L48 | `open vscode and show memory usage` | R two ordered validated actions |
| L49 | `aawas status then logs dikha`, Chat B | C whole chain: explicit P_A has two services and no selected/default service; no status action first |
| L50 | `open vscode and fly to moon` | U whole chain; no first action |
| L51 | `Research and Development kholo` | R one P_RD open action; no conjunction split |
| L52 | `open vscode and show memory and cpu usage and battery status` | U exceeds three actions |
| L53 | `aawas delete everything` | U no generic destructive grammar |
| L54 | `run rm -rf /` | U; never create a shell recipe from chat |
| L55 | `port 3000; touch /tmp/pwn check` | V malformed parameter/grammar; metacharacters never executed/stripped into accepted plan |
| L56 | `open $(whoami)` | U; no shell expansion |
| L57 | `show logs except secrets from all apps` | U, unsupported scope; no private-app scan |
| L58 | `stop it`, Chat A with valid S_AB focus | R S_AB only, confirmation still required |
| L59 | `stop it`, Chat B | C; global active service not implicit target |
| L60 | `logs dikha`, Chat A after S_AB deleted | C stale target; no silent switch to frontend |
| L61 | `logs dikha`, reopened Chat A after restart | R same identity only after config/access revalidation; reread logs |
| L62 | `yes`, Chat B while Chat A clarification pending | U; cannot approve/select Chat A draft |
| L63 | `yes`, expired clarification in Chat A | C new draft required; no execution |
| L64 | `bhai` | U supported examples, no context mutation |
| L65 | `what is the capital of France` | U outside command catalog |
| L66 | `open /unregistered/path` | C folder selection/registration, no grant from typed text |
| L67 | `aawas frontend logs dikha` | R S_AF and update service focus in Chat A only |
| L68 | `wrap up`, configured W_WRAP | R reviewed routine with explicit high-risk prompts |
| L69 | `volume 50 then stop backend`, Chat B | C whole chain; no volume change first |
| L70 | `aawas wait 2 minutes`, without supported wait command grammar | U; duration recognizer alone cannot invent an action |

Corpus records also include original/normalized spans, expected intent/action ID+version, entity IDs, numeric slots, evidence tier, clarification candidate set, negation disposition, required risk class, expected context update and allowed side-effect count (zero in resolver tests). Add action-specific valid wait/duration tests at schema level for 500 ms, 30 s, 2 min, zero, negative, overflow and missing units; parsing a number is not permission to add scheduling.

## Actual developer corpus: collection and provenance

The supplied 70 rows are authored examples from the specification/design plus safety constructions. They must keep provenance `spec-example`, `authored` or `generated-mutation`; never relabel them `observed-developer`. No developer submission has been provided here, so collected counts, accuracy and latency results are **pending**, not zero-percent measurements or passed gates. This revision prepares the collection/evaluation protocol, not invented user evidence.

Before P2 acceptance, collect ≥600 original utterances from ≥12 target developers, including ≥6 who naturally use Romanized Hinglish. Proposed coverage: ≥200 English supported, ≥200 Romanized Hinglish supported, ≥100 human-authored negation/ambiguity/context cases and ≥100 naturally requested unknown/out-of-scope cases. Rebalance participants/task cards to fill coverage; retain the natural distribution too, reporting any oversampling weights. Do not count translations, AI paraphrases or random mutations toward these original-utterance quotas.

Collection procedure:

1. Ask consent for local, scrubbed task-study data; participants may decline/delete their contribution. No default production telemetry, account, cloud sync or transcript upload is introduced. A research facilitator can collect phrases in a local worksheet before the app exists.
2. Present neutral task goals and fixture facts, e.g. “Check whether your backend has recent errors” with project/service registry and current chat focus. Do not show a canonical command or grammar first. Capture what the developer would type verbatim, optional their intended project/service/action, and relevant preceding same-chat turns. Include novices to Bhai so examples do not merely reflect learned grammar.
3. Obtain practical optional follow-up observations from consented manual dogfooding after the vertical slice exists: unfamiliar abbreviations, corrections, “don't do that” instructions, ambiguous multiple projects, missing context and stop/start confusion. Never collect actual log contents, env values, confidential paths or business project names; replace sensitive entities with stable fixtures while retaining the sentence structure and record the substitution.
4. Separate natural spontaneous entries, task-elicited human entries, facilitator-authored safety probes and generated variants. Preserve provenance and participant/task grouping. If a participant's phrase is unclear, annotate `intentionallyAmbiguous`/`needsTarget` or ask them to explain the intent separately, without rewriting the submitted phrase.
5. Two reviewers independently label action/intent, target IDs, slots, language slice, supported scope, negation, expected disposition, appropriate clarification and risk class. Adjudicate disagreements before freezing gold labels; report agreement and unresolved counts. Ambiguous gold cases must not be forced to one executable target to inflate accuracy.
6. Group splits by participant and task-story/phrase family: development ≤75%, sealed release holdout ≥25% with ≥3 unseen participants. Keep equivalent normalized/translated/near-duplicate variants in one split. Overlapping intents are allowed so the holdout tests unseen phrasing, not entirely unimplemented intents. Holdout expected commands remain hidden from rule authors until a versioned evaluation run; repeated tuning requires a fresh untouched set for release claims.
7. Tune phrase tables/suggestion thresholds on development examples only. Freeze resolver/catalog/config/corpus versions, then evaluate holdout once and record failures. Maintain the evolving synthetic safety suite separately, without inflating the natural corpus denominator.

Planned corpus record: sample ID, source type, consent reference, pseudonymous participant group, task/story family, language, verbatim scrubbed text, fixture registry/context snapshot, intended action/target, gold disposition/slots/risk, annotator/adjudication, split, collection date and substitutions. Store only consented scrubbed records locally in a versioned test fixture directory when collected; provenance manifests/checksums accompany benchmark reports. No corpus artifact with fabricated participant identities is created in this revision. An unfilled quota or missing holdout is a P2 blocker, not a reason to substitute synthetic data.

## Metrics, reporting and acceptance gates

Report natural and synthetic results in separate tables, with sample counts, per-intent/language/target/context slices, 95% binomial intervals for rates, error examples and test build/dataset versions. Rates on small slices are evidence with uncertainty, not universal reliability claims.

| Metric | Definition / denominator | Gate or use |
|---|---|---|
| Intent accuracy | Correct action/workflow intent among supported, unambiguous real utterances; incorrect clarification counts as miss | Report separately from target and joint correctness |
| Target accuracy | Exact project/service/app ID match on supported real utterances requiring a target; report conditional and end-to-end, not just correctly parsed subset | Wrong target gets zero credit even if intent correct |
| Joint accuracy | Correct intent + all required targets and typed slots, per utterance | ≥98% supported real heldout; Romanized Hinglish slice ≥97% |
| Safe rejection | No executable proposal on gold negated/ambiguous/stale/injection inputs | 100% designated safety regression; real out-of-scope rejection ≥99%; any unsafe mutating proposal is a blocker |
| Clarification frequency | All clarifications / real utterances, stratified into genuinely ambiguous/missing, fuzzy suggestions, and unnecessary exact-unambiguous clarification | Report all; unnecessary exact-unambiguous ≤5%; no penalty for required safety clarification |
| Clarification usability | Selected candidate correct and task completed after one clarification on independent interactive tasks | Report completion/abandonment and count; diagnose excess friction, never weaken target safety to reduce frequency |
| Matching latency | Engine receipt to proposal/clarification including same-chat context query; excludes action/approval wait | p50/p95/max by real-language slice and index size; p95 <100 ms; project lookup p95 <50 ms |

Replay each real holdout case against fixed fixture context/config, then reset state for the next unless it belongs to a labeled sequence. An instrumented dry-run executor records proposed effects without launching them. Interactive validation is separate from offline replay; include selecting candidates/denying actions and repeated routine trust. Do not optimize only top-line accuracy or latency on canonical commands.

Release gates:

- Supported **actual-developer** held-out intent, target **and all required slots** exact match ≥98% overall and ≥97% Romanized Hinglish. Report per-intent confusion and worst slices; no aggregate score hides weak destructive intents.
- 100% designated negation/ambiguity/stale-target/injection safety suite returns no executable proposal unless the expected result is a separately confirmed exact target.
- Zero wrong-target execution in integration tests. Any wrong mutating action is a release blocker regardless of averages.
- Unknown/out-of-scope rejection ≥99%; false confident recognition <1%. Clarification is safer than guessing but report its rate separately to prevent “ask always” gaming.
- Exact unambiguous supported real positives clarify unnecessarily ≤5%; also report total and justified clarification separately. Fuzzy candidate suggestion top-3 recall ≥95% on the separate typo set; fuzzy selection never autoexecutes.
- Cross-chat test sequences have 100% isolation. Suggestions may use shared saved labels, never another chat's focus or transcript.

These thresholds are proposed acceptance criteria, not measured accuracy. Maintain a locked corpus version/resolver version pair with every report.

## Workflow and process correctness

Test every transition including queued→cancel, validating failure, approval denial/expiry, step skip, retry exhausted, optional read-only failure, dependency unsatisfied, timeout with failed termination and engine interruption. Inject fake-clock timing; do not rely on arbitrary sleeps. Assert immutable terminal states and one terminal run summary. Validate bindings after step reorder; reject unknown actions/versions, cycles, forward references, over-32-step definitions, invalid retry classes and missing setup.

Real-process fixtures: foreground echo/exit; delayed ready server; child with grandchildren; stdout/stderr flood; process ignoring SIGTERM; daemonizing/double-fork attempt; port already held by an unrelated process; reused PID fixture; missing executable; denied cwd; changed recipe after confirmation. Verify stream draining after buffer saturation, run/service lifecycle separation, queued contention and target-busy checks across two chats, reverse dependency stop order, explicit force termination, and no broad kills. Never target arbitrary host processes in tests.

First-release concurrency fixtures submit two runs from distinct chats and assert one active/one queued with immutable targets and ordered history; status/cancel/approval RPC remains responsive outside that queue. Waiting for human approval releases the dispatch slot and target guard; granted work requeues and revalidates before effects. Persistent service children do not consume a workflow slot. Only if raising active concurrency later, add deterministic overlapping-resource lock ordering and completion races; the initial MVP does not need a generalized parallel scheduler.

Trust friction fixtures: configure/approve Office Start once, run it twice and assert no extra setup or blanket workflow confirmation for unchanged safe/approved-code steps. Rename project/workflow or edit an equivalent phrase: trust remains valid. Change executable/argv/script/cwd/env binding/relevant manifest/scope: affected trust revoked with a visible diff. Change only a pending plan: old per-run ticket rejected independently of reusable recipe trust. Stop/quit/restart/cleanup retain explicit confirmation every run. Missing OS access still denies a previously trusted command.

Crash injection points: before intent commit, after intent before spawn, after spawn before PID persistence, after side effect before result commit, between step result and run completion, during approval, during migration/import/chat deletion. Restart must mark interrupted/unknown truthfully and never replay a mutating action. Validate surviving process reconciliation and unavailable stdout; a PID/port-only candidate must not be killed.

## Persistence and isolation scenarios

Create A and B; in A target Aawas backend; B follow-up asks. Reopen A and verify stable target reference; delete service and verify stale reference prompt. Complete A run while B visible and assert A-only result storage. Issue newer command in A while an older run finishes and assert older completion does not replace new focus. Delete A during approval/running/terminal transitions and verify no resurrection, no callback/context write, no shared config deletion, and proper globally visible orphaned work when explicitly retained.

Test migration from each supported previous schema fixture, checksum mismatch, future version, corrupt DB, missing WAL, read-only disk, disk full, busy transaction, backup restore and forced engine crash. No silent empty DB. Test logical deletion plus app-managed backup invalidation, retention cap without active-run data loss, zero diagnostic retention, and export/import roundtrip with ID conflicts and absent tools/root grants.

## Logs, signatures, and privacy

Fixtures: exact known errors, similar benign strings, multiline stacks, invalid UTF-8, binary/NUL data, terminal OSC hyperlinks/clipboard controls, HTML/script text, 100 MiB file tail, 10 MiB line, rotating/truncated file, inaccessible file, symlink escape, FIFO/device/socket, source removed mid-read. Verify byte/line/source bounds and clear truncation indicators. A random exit 137 does not prove OOM; EADDRINUSE without listener correlation remains a symptom.

Insert sentinel credentials in headers, URL userinfo, JSON, plain env formats, PEM blocks, arbitrary user-configured secret values, and split them at every chunk boundary. Inspect all IPC payloads, SQLite rows/WAL/backup files, log files, export, crash/error records and UI. No raw sentinel may persist or cross to renderer. Stress redactor carry limits; discard uncertain secret blocks rather than leak excess. Test benign false positives for legibility and disclose heuristic limits. No background process/service checks should remain after requests complete.

## Security boundary suite

Wrong-origin/frame/window IPC, destroyed sender, generic channel attempts, extra keys, nested oversize payload, prototype keys, request replay, renderer `confirmed:true`, stale plan hash, target edit during confirmation, reused/expired tickets, imported approval record, alias targeting unapproved script, recipe cwd relink, shell/option injection, PATH hijack, malicious Git configuration and external hooks. Renderer must have no Node access, no eval, no remote navigation/windows, and no outbound network capability. Test custom protocol traversal and external URL scheme allowlist.

Loopback health checks: redirects to public/metadata/private-network hosts, DNS rebinding, IPv6 loopback, credentialed URL, TLS failure, huge body, infinite response and refused connection. No TLS verification disabling. Explicit external connectivity probe sends no chat/log payload and is the only expected network call. Run a core test with internet disabled and confirm zero AI/account/cloud requests.

## macOS integration matrix

Cover approved minimum OS and current supported OS, arm64 and x64 if promised; clean standard-user account, protected Documents/Desktop/log directory denied/granted, optional FDA absent, Accessibility absent, Automation absent, MDM-restricted policy fixture where available. Terminal/VS Code absent and present; app with unsaved document; external audio device without software volume; no battery; toolchain via Homebrew/NVM/custom path; no CLT; network proxy/VPN/offline; multiple monitors/full-screen Spaces; sleep/wake; shortcut already reserved; launch-at-login OS denial.

On each release candidate: verify nested signature and entitlements, hardened runtime/fuses, notarization acceptance and stapling, Gatekeeper quarantine launch on a clean Mac and offline launch. Do not mark untested MDM behavior as verified; record exact policy and OS used. Native helper cannot depend on the developer's shell environment or unsigned local dylibs.

## Performance protocol

Use signed optimized builds with logging at release level. Record hardware/OS/build hash/dataset/power mode and any running external services. Warm up before command measurements. Collect ≥1,000 resolver/lookup samples, ≥100 warm panel openings, ≥20 cold launches, and a 10-minute quiescent hidden-panel CPU/RSS trace. Keep raw timings locally as test artifacts; report p50/p95/max, not a single favorable run.

Use the baseline dataset in [TECHNICAL_DESIGN.md](../architecture/TECHNICAL_DESIGN.md). Assert p95 command <100 ms, project lookup <50 ms, warm panel <300 ms, cold tray <2 s, cold readiness <3 s, dispatch overhead <25 ms/step. Measure all Bhai process RSS (target ≤300 MiB settled idle) and idle CPU average <0.5% of one core. Main/renderer event-loop/paint tests run during four-probe diagnostics and output flood; p95 input-to-paint <50 ms, no >100 ms renderer long task. Exclude child-service resources from the Bhai target but report them separately.

Stress: 32 steps/run, two submitted runs with one active and one queued, queue cap 20, 10,000 aliases, 1,000 projects, 10,000 messages, stdout flood, log limits and disk-full. Exercise up to four bounded probes inside the active diagnostic step while control RPC remains responsive. Observe plateau after bounds/retention rather than unbounded memory/disk growth. No continuous monitoring is added for production merely to collect test metrics. If a target misses, profile and document cause; owner approval of an explicit target exception is required before release, not an undocumented change of benchmark conditions.

## Feature acceptance traceability

| Spec module/template | Required acceptance suite |
|---|---|
| F01 | Tray/hotkey + chat CRUD/restart + no context leakage + hidden-run continuation |
| F02 | Corpus, parameters, ambiguity/negation, typed proposal, bounded chaining, exact/fuzzy policy |
| F03 | Signed Mac app/folder/status/system/network/port/volume supported+denied outcomes |
| F04 | Guided non-executing metadata, partial projects, alias index, duplicate/moved roots, multi-service ops |
| P4-F01 | Memory schema migrations 004/005, cold restart persistence, project isolation, cascading unregistration |
| P4-F02 | Checkpoint ingestion <=2 KB, session quota 200, idempotency deduplication, secret redaction, guiding skill (`bhai-project-memory`) integration |
| P4-F03 | Deterministic compaction, decision & blocker preservation, explicit contradiction flags, Layer B fallback |
| P4-F04 | Prebaked Quick (~500), Task (~1,500), Deep (~4,000) token budgets, cache invalidation, stale file tagging |
| P4-F05 | Local stdio MCP bridge (namespace `bhai`: `yebata`, `yesavekar`, etc.), Unix socket broker, `p4_mcp_contract.test.ts` |
| P4-F06 | Memory Hub UI, ADR visual editing, Agent Connections manager, client token revocation, compaction controls |
| P4-F07 | Cross-agent session handoff, Claude Code -> Codex continuity, unverified claim re-verification |
| P4-F08 | Prompt injection delimiters, project-scoped ACL enforcement, zero external network traffic audit |
| P4-F09 | Empirical benchmarks across 6 scenarios and Real-World Tests A through L (see P4_BENCHMARK_PLAN.md) |
| F05 | Process/port/health/Git/tool availability/log adapters/signatures; evidence and unknown causes (P5) |
| F06 | Builder definitions, lifecycle/progress/history, dependencies/conditions/readiness/retry/cancel (P6) |
| F07 | Teach/edit/delete/conflict alias, global availability without permissions or memory sharing |
| F08 | Local persistence, preferences, safe export/import, retention/deletion, no account/cloud |
| Office Start | Selected apps/editor/terminal/services/tabs; missing setup and partial failure |
| Open Project | Registered root and preferred tools; partial project fallback |
| Start Dev Stack | Acyclic dependency order, readiness, already-running identity, partial start |
| Project Health | Finite timestamped service observations, unavailable coverage |
| Debug Localhost | Conflicting listener/log evidence; no unconfirmed kill |
| Standup Prep | Local Git fields, no network or repository mutation |
| Wrap Up | Pending-work review and explicitly confirmed configured stop/quit/cleanup |

## CI and release evidence

P0 has its own per-cell experiment manifest in [review actions](ARCHITECTURE_REVIEW_ACTIONS.md); no test listed here is marked passed by writing the plan. P1 entry requires product acceptance plus signed baseline evidence, distinct from P1 completion. UX walkthroughs cover Quick Panel/expanded history, wizard, list builder/catalog/forms/conditions, Teach, four trust classes, unavailable capabilities and truthful progress/failures per [UX specification](../design/UX_SPECIFICATION.md#ux-acceptance-and-scope-checks).

Every PR: typecheck/lint, affected domain/UI suites, memory repository tests, and DB migrations/contract tests; changes to resolver/policy always run full safety corpus. macOS CI runs real SQLite/child/loopback/Electron integration; pull-request jobs have no signing secrets for untrusted code. Release lane runs all suites and signed hardware checklist. Include corpus report, fault-injection matrix, feature traceability, performance measurements, SBOM/notices, supported capability matrix and unresolved defects. Zero open critical/high boundary defects. Coverage percentages alone cannot satisfy a gate; risky branches need behavioral assertions and actual process-boundary tests.

# Bhai — Phase P0 Feasibility Validation Report

**Document Date:** 2026-11-14 (Reconciled)  
**Author / Role:** Principal Electron Engineer, macOS Platform Engineer, and Software Architect  
**Review Revision Reference:** `docs/planning/ARCHITECTURE_REVIEW_ACTIONS.md`  
**Overall Feasibility Verdict:** **Conditionally Feasible — Production Signing Blocked**  

---

## 1. Executive Summary & Evidence Reconciliation

Phase P0 technical feasibility experiments were executed on native Apple Silicon hardware to validate the core architecture of **Bhai**, an offline-first macOS menu-bar assistant built with Electron, React, and TypeScript.

Following architecture review, the experimental results are reconciled as follows:

1. **E01 (Storage & Utility Boundary):** **Passed in development runtime; production signed DMG blocked.** Full transactional integrity, WAL journaling, `PRAGMA synchronous = FULL`, foreign keys, chat context isolation, and restart integrity were verified in the development/local environment. Because production Developer ID signing credentials are not available on the test machine, signed production compatibility remains unverified.
2. **E02 (Packaging, Signing, and Notarization):** **BLOCKED**. Native module packaging and local ad-hoc signing (`codesign -s -`) passed with verified deep signatures and tamper detection. However, Developer ID signing, Hardened Runtime distribution verification, and Apple notarization are **blocked** due to zero Developer ID certificates in the local keychain. A **development-only P1 entry exception** is proposed.
3. **E03 (macOS App Control & Audio Helper):** **Passed**. The minimal on-demand Swift helper (`bhai-helper`) successfully interfaces with AppKit (`NSRunningApplication`) and CoreAudio (`AudioObjectSetPropertyData` / `AudioObjectGetPropertyData`), requiring 0 resident daemons, 0 elevated privileges, and 0 Accessibility/Full Disk Access grants.
4. **E04 (VS Code & Terminal Integration):** **Passed (safe argv & LaunchServices dispatch); interactive shell cwd pending P3.** Safe argv construction was proven across directory paths with spaces, Unicode, leading dashes, apostrophes, and shell characters. LaunchServices dispatch (`open -a Terminal <path>`) succeeded. However, verifying the active working directory inside a live interactive Terminal shell session was not automated in this headless harness and is retained as a mandatory **Phase P3 gate**.
5. **E05 (Process Supervision & Resistance):** **Passed (process groups & resistance); crash simulation & PID-reuse pending P4.** Foreground process groups, negative PID tree teardown (`process.kill(-pid, 'SIGTERM')`), stream buffer capping (32KB), SIGTERM resistance detection, and non-owned PID rejection were proven. Live utility-process crash injection across IPC and true OS PID-reuse collision protection were not fully simulated and are retained as **Phase P4 safety gates**.
6. **E06 (Permissions & Corporate Restrictions):** **Baseline passed; corporate MDM blocked.** Fail-closed enforcement on protected system paths (`/Library/Application Support/com.apple.TCC`, `/private/var/root`) and 100% offline baseline passed. Because the test machine is an unmanaged developer host (`DEP: No, MDM enrollment: No`), corporate MDM fleet restrictions are **blocked** (untested), not passed.
7. **E07 (Language Parser & Regression):** **Passed (tokenizer imports & synthetic regression); real corpus pending P2.** The Compromise tokenizer and Fuse.js 7.5.0 evaluated 70/70 (100%) on the synthetic regression dataset from `TESTING_STRATEGY.md` with p95 resolution latency of 0.224 ms (<100 ms gate) and 1.2 MB RSS. This proves tokenizer compatibility and deterministic grammar execution, but does **not** prove real-world natural language accuracy. Real-developer corpus collection (≥600 utterances, ≥12 developers, 25% holdout) is strictly gated for **Phase P2**.
8. **Initial Support Target:** Reconciled to **Apple Silicon (arm64) macOS 14+** (Sonoma, Sequoia, and above) supported by Electron 44.x/45.x. Native Intel (x86_64) support is **deferred until verified** on dedicated Intel hardware.

---

## 2. Test Environment

| Parameter | Host Value |
|---|---|
| **Operating System** | macOS 26.6.2 (Build 25G83) |
| **CPU Architecture** | arm64 (Apple M4, Apple Silicon) |
| **Host Privilege Profile** | Standard developer account, unmanaged (`DEP: No, MDM enrollment: No`) |
| **System Node.js** | v24.11.1 |
| **System npm** | 11.6.2 |
| **Electron Runtime** | `electron@44.11.3` (embedded Node 24.22.2, Chromium 152.0.7977.169) |
| **Toolchain** | Xcode CLT (`/Applications/Xcode.app/Contents/Developer`), Apple Swift 6.3.3 (`swiftlang-6.3.3.1.3`), `notarytool` 1.1.2 |
| **Signing Identities** | `0 valid identities found` (`security find-identity -p codesigning -v`) |
| **Pinned Packages** | `better-sqlite3@13.2.0`, `fuse.js@7.5.0`, `compromise@14.20.0`, `zod@4.6.7`, `systeminformation@5.33.22`, `@electron/packager@20.3.0`, `@electron/rebuild@4.2.1`, `@electron/fuses@2.1.3` |

---

## 3. Reconciled Experiment Status Matrix (E01–E07)

| Experiment | Title | Reconciled Status | Tested Surface vs Downstream Gates |
|---|---|---|---|
| **E01** | Utility Process + SQLite | `passed (development-only)` | Passed in local runtime. Production signed DMG verification **blocked** on D02 credentials |
| **E02** | Packaging, Signing & Native Loading | `blocked` | Native packaging and ad-hoc signing passed; Developer ID signing and notarization **blocked** |
| **E03** | macOS App Control & Audio | `passed` | AppKit status/quit refusal and CoreAudio volume read/set/restore verified; helper ephemeral |
| **E04** | VS Code & Terminal Integration | `passed (dispatch/argv)` | Safe argv and LaunchServices dispatch verified; **interactive shell cwd check pending P3** |
| **E05** | Process Supervision & Recovery | `passed (groups/resistance)` | Tree teardown and resistance verified; **real IPC crash & PID-reuse pending P4** |
| **E06** | Permissions & Corporate Denial | `baseline-passed / mdm-blocked` | Baseline TCC denial and offline verified; **corporate MDM fleet testing blocked** |
| **E07** | Parser & Language Test Readiness | `passed (synthetic-only)` | 70/70 synthetic regression passed (p95 0.224 ms); **real developer corpus pending P2** |

---

## 4. Detailed Reconciled Findings

### E01 — Electron Utility Process + SQLite
- **Environment:** macOS 26.6.2 arm64, Node v24.11.1, `better-sqlite3@13.2.0`.
- **What Was Verified:**
  - Database initialization under complex paths (`Bhai SQLite 🚀 Space/bhai_p0.db`).
  - Strict PRAGMAs: `journal_mode = WAL`, `synchronous = FULL` (2), `foreign_keys = ON` (1).
  - Inter-chat context isolation: Chat A updated to `P_A/S_AB`; Chat B remained `null/null`.
  - Transaction rollback upon fault injection: zero orphaned rows committed.
  - 100 sequential write/read transactions completed in 19 ms (0.19 ms/tx average).
  - Database close and reopen integrity verified: `PRAGMA integrity_check` returned `ok`.
  - Fallback evaluation: `node:sqlite` verified operational in Node 24 runtime.
- **Evidence Gap & Reconciliation:**
  - Verified exclusively in local development mode. Signed production packaging could not be tested due to lack of Developer ID credentials.
  - **Status:** `passed (development-only)`. Production signed gate remains blocked under E02.

### E02 — Native Packaging, Signing and Distribution
- **Environment:** macOS 26.6.2 arm64, `@electron/packager@20.3.0`, `@electron/fuses@2.1.3`.
- **What Was Verified:**
  - Inclusion of prebuilt native binary `better-sqlite3/prebuilds/darwin-arm64.node` (1.91 MB).
  - Local ad-hoc signing (`codesign -s -`) and deep strict verification of native helper.
  - Tamper detection: modification of a single byte in `bhai-helper` was detected and rejected by `codesign --verify`.
  - Electron fuses package loaded with support for `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `OnlyLoadAppFromAsar`.
- **Evidence Gap & Reconciliation:**
  - `security find-identity -p codesigning -v` returned `0 valid identities found`. Developer ID signing and Apple notarization could not run.
  - Native x86_64 architecture could not be tested on this arm64 host.
  - **Status:** `blocked`. Production distribution signing cannot pass without credentials.

### E03 — macOS Application and Audio Capabilities
- **Environment:** macOS 26.6.2 arm64, Swift 6.3.3, AppKit, CoreAudio.
- **What Was Verified:**
  - Running app status (`app.status`) correctly returned Finder PID 655; non-running app returned `running: false`.
  - Termination refusal handled truthfully for non-running application.
  - CoreAudio default output device discovered (`Mac mini Speakers`, Device ID 71).
  - Volume modified to 50% and restored to original 69% without Accessibility or Full Disk Access permissions.
  - Range validation rejected invalid volume values (150, -10).
  - Helper terminated immediately after single request (zero daemon overhead).
- **Status:** `passed`.

### E04 — VS Code and Terminal Integration
- **Environment:** macOS 26.6.2 arm64, VS Code CLI, Terminal.app LaunchServices.
- **What Was Verified:**
  - VS Code CLI located at `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`.
  - Safe argv construction verified across complex paths: spaces/Unicode (`Project 🚀 Space & More`), leading dash (`-leading-dash-dir`), apostrophe (`Alice's Project`), shell characters (`$(whoami)_literal_dir`).
  - LaunchServices dispatch (`open -a Terminal <path>`) verified without command injection.
  - Non-existent directories safely rejected prior to dispatch.
- **Evidence Gap & Reconciliation:**
  - The harness verified the LaunchServices command invocation and argv safety, but did **not** attach to the launched Terminal.app window to inspect the live interactive shell's `pwd`.
  - **Status:** `passed (dispatch/argv)`. Interactive shell cwd validation is retained as a mandatory **Phase P3 gate**.

### E05 — Process Supervision and Crash Recovery
- **Environment:** macOS 26.6.2 arm64, Node v24.11.1 child_process.
- **What Was Verified:**
  - Foreground echo server spawned with dedicated process group (`detached: true`) and graceful SIGTERM cancellation verified.
  - Process tree cancellation: terminating parent via negative PID signaling (`process.kill(-pid, 'SIGTERM')`) cleanly terminated child and grandchild processes.
  - SIGTERM-resistant process detected, surfacing truthful uncertainty and requiring explicit user-confirmed SIGKILL (no silent escalation).
  - Stdout buffer stream bounded at 32KB cap.
  - Safety invariant: signaling rejected for non-owned/stale PID (9999999).
- **Evidence Gap & Reconciliation:**
  - Testing covered clean process group teardown and resistance. It did **not** simulate a live mid-flight crash of the Electron utility process during an active IPC transaction, nor did it simulate true OS-level PID reuse collision.
  - **Status:** `passed (groups/resistance)`. Live utility-process IPC crash recovery and OS PID-reuse collision protection are retained as **Phase P4 safety gates**.

### E06 — macOS Permission and Corporate-Environment Restrictions
- **Environment:** macOS 26.6.2 arm64, unmanaged developer host.
- **What Was Verified:**
  - Granted project root read/write confirmed.
  - Protected paths (`/Library/Application Support/com.apple.TCC`, `/private/var/root`) cleanly failed closed with `EPERM` without application crash.
  - Toolchain binaries (`git`, `swiftc`, `node`) resolved directly from system PATH.
  - Core operations operate 100% offline.
- **Evidence Gap & Reconciliation:**
  - The host machine is unmanaged (`DEP: No, MDM enrollment: No`). No MDM configuration profile or managed restriction was active. A blocked test cannot be labeled a passed fallback without an approved alternative.
  - **Status:** `baseline-passed / mdm-blocked`. Baseline file denial passed; corporate MDM compatibility is `blocked`.

### E07 — Parser Compatibility and Language-Test Readiness
- **Environment:** Node v24.11.1, `compromise@14.20.0`, `fuse.js@7.5.0`.
- **What Was Verified:**
  - 100% pass rate (70 / 70) on synthetic regression cases from `TESTING_STRATEGY.md`.
  - Resolution latency: p50 = 0.035 ms, p95 = 0.224 ms (budget: < 100 ms).
  - Memory RSS overhead: 1.2 MB.
  - Negation safety veto verified across all 7 designated negation probe cases.
- **Evidence Gap & Reconciliation:**
  - Synthetic test success proves tokenizer compatibility, negation detection, and deterministic rule execution. It does **not** prove natural language accuracy on diverse human developer phrasing.
  - **Status:** `passed (synthetic-only)`. Real developer natural language corpus collection (≥600 phrases, ≥12 developers, 25% holdout) is strictly gated for **Phase P2**.

---

## 5. Proposed Development-Only P1 Entry Exception

To allow progress into Phase P1 without compromising production security or misrepresenting release readiness, the following **formal exception** is submitted for Product Owner approval:

> ### Formal Exception: Development-Only P1 Entry
> 1. **Scope:** Phase P1 (Persistent Secure Chat & Read-Only Vertical Slice) may proceed using **local ad-hoc code signing (`codesign -s -`)** on Apple Silicon (arm64) macOS 14+ test environments.
> 2. **Invariants Preserved:**
>    - Renderer process remains strictly sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`).
>    - No `allowLoadingUnsignedLibraries` entitlement bypass in packaging configuration.
>    - IPC validation schemas (Zod) and capability tickets remain strictly enforced.
>    - SQLite remains isolated in the utility process with WAL mode and `synchronous = FULL`.
> 3. **Production Release Blocker:** Developer ID Application signing, Hardened Runtime entitlement verification, and Apple notarization (`notarytool`) remain **mandatory blocking release gates** before public distribution (Phase P8). An Apple Developer ID certificate must be installed in CI prior to packaging releases.
> 4. **Hardware Scope:** Initial supported target is strictly **Apple Silicon (arm64) macOS 14+**. Native Intel (x86_64) support is deferred until validated on physical Intel hardware.

---

## 6. Retained Phase-Specific Implementation Gates

All unresolved safety and integration requirements are formally assigned to future phase gates:

| Phase | Milestone | Retained Implementation Gate |
|---|---|---|
| **P2** | Language Engine | Real developer corpus collection (≥600 phrases, ≥12 developers, 25% unseen holdout). ≥98% joint accuracy required on held-out set. Synthetic regression alone cannot pass P2. |
| **P3** | Tool Integration | Automated verification of active interactive shell working directory inside Terminal.app sessions opened via LaunchServices. |
| **P4** | Process Supervision | Real utility-process crash simulation during in-flight IPC and OS PID-reuse collision protection (start time/boot epoch verification before signaling). |
| **P5** | System Diagnostics | Audio volume capability checks for unsupported hardware (HDMI, non-settable USB interfaces); bounded adapters for `systeminformation` calls. |
| **P8** | Distribution & Release | Apple Developer ID code signing, Hardened Runtime entitlement audit, Apple notarization (`notarytool`), DMG stapling, and quarantined offline launch testing. |

---

## 7. Phase P1 Entry Checklist & Approvals Required

Before starting Phase P1 implementation, the following checklist must be reviewed:

- [x] **D01 Target Architecture Scope Defined:** Narrowed to Apple Silicon (arm64) macOS 14+; Intel deferred.
- [x] **D04 Storage & Engine Toolchain Pinned:** `electron@44.11.3`, Node 24, `better-sqlite3@13.2.0`, `node:sqlite` fallback.
- [x] **E01 Local Persistence Integrity Proven:** WAL, FKs, rollback, chat isolation, 100 tx stress test passed.
- [x] **E03 On-Demand Native Helper Proven:** AppKit and CoreAudio verified without resident daemon.
- [x] **E06 Baseline Access Denial Proven:** Protected paths fail closed; core executes 100% offline.
- [x] **E07 Tokenizer & Regression Readiness Proven:** 70/70 synthetic regression passed in 0.224 ms p95.
- [ ] **Product Owner Approval 1:** Explicit acceptance of the revised UX, trust model, and foundational decisions (D01–D03).
- [ ] **Product Owner Approval 2:** Explicit approval of the **Development-Only P1 Entry Exception** (deferring Developer ID signing to CI / P8 while using ad-hoc signing locally).
- [ ] **Product Owner Approval 3:** Formal authorization to begin Phase P1 implementation.

**Status: Awaiting Product Owner Sign-Off. No Phase P1 implementation has been started.**

# Bhai — Phase P3 Implementation & Project Registry Report
**Document ID:** P3-EXEC-REPORT-001  
**Phase:** P3 — Guided Project Onboarding, Project Registry & Developer Context  
**Target Architecture:** Apple Silicon (`arm64`), macOS 14+ (Sonoma, Sequoia)  
**Implementation Status:** COMPLETED  
**Acceptance Gate Status:** **P3 Implementation & Verification PASSED; P4 Process Supervision STRICTLY GATED**  
**Date:** November 14, 2026  

---

## 1. Executive Summary & Deliverables Overview

Phase P3 extends **Bhai**, an offline-first, deterministic, non-AI personal assistant for macOS, with the ability to discover, understand, and remember developer projects through a guided, transparent, and security-hardened onboarding experience.

In strict compliance with the project architecture decisions and security design:
1. **Zero Shell Execution**: Project inspection, Git inspection, editor launching, and terminal launching never invoke `/bin/sh`, `/bin/zsh`, or construct string shell commands. Fixed argument arrays (`execFile`) and macOS LaunchServices (`open` URL schemes) are used exclusively.
2. **Deterministic, Read-Only Inspection**: Inspects projects with bounded reads (≤256 KB per manifest), strictly enforces scan timeouts (≤2500ms), caps directory traversals, blocks symlinks resolving outside the root, and ignores bulky/sensitive trees (`node_modules`, `.git/objects`, `.venv`, `dist`, `build`, etc.). No project code or lifecycle scripts (`npm install`, `setup.py`, etc.) are ever executed.
3. **Persistent SQLite Project Registry**: Integrated into the single-writer SQLite Utility Process via Migration 003 (`projects`, `services`, `path_grants`). Stable UUIDv4 identifiers and canonical filesystem paths (`fs.realpathSync`) prevent path aliasing and duplicate registrations.
4. **Chat-Specific Context Isolation**: Reuses the approved `chat_contexts` schema. Conversational references (e.g., `iske services dikhao`) strictly bind to the active chat's selected project without leaking across conversations. Project unregistration invalidates active references across all chats.
5. **Safe Unregistration Guarantee**: Removing a project from Bhai deletes rows from `projects`, `services`, and `path_grants` and clears contextual pointers in `chat_contexts`, but **never** deletes or mutates the developer's source files.
6. **Strict P4 Execution Gating**: Commands expressing intent to start or stop services (e.g., `aawas backend start karo`) recognize user intent truthfully but explicitly gate execution, explaining that managed process supervision is scheduled for Phase P4.

All unit, integration, durability, and Electron test suites have passed with 100% compliance.

---

## 2. Files Created, Modified, or Extended

| Path | Nature of Change | Purpose / Architectural Role |
| :--- | :--- | :--- |
| `src/utility/storage/migrations.ts` | **Modified** | Added Migration 003 creating `path_grants`, `projects`, and `services` tables with foreign keys and unique constraints. |
| `src/shared/contracts/channels.ts` | **Modified** | Declared P3 IPC channels (`bhai:project:*`) for folder selection, inspection, registry CRUD, Git info, launchers, and `revealInFinder`. |
| `src/shared/contracts/dto.ts` | **Modified** | Added Zod validation schemas and TypeScript types for projects, services (`portConfidence: 'configured' \| 'inferred'`), inspections, Git info, and launch requests. |
| `src/utility/inspector/project_inspector.ts` | **Created/Modified** | Modular, read-only project detection pipeline with deep child-service manifest inspection for monorepos, extracting real technologies and port confidence. |
| `src/utility/inspector/git_inspector.ts` | **Created** | Safe read-only Git status inspector using fixed-argument `git status --porcelain=v1` and `git symbolic-ref`. |
| `src/utility/storage/project_repository.ts` | **Created/Modified** | SQLite persistence repository with transactional writes, duplicate canonical path checks, cascade context invalidation, and `portConfidence` persistence. |
| `src/utility/launcher/safe_launcher.ts` | **Created/Modified** | Safe fixed-argument editor (VS Code / Cursor), Terminal, and Finder (`/usr/bin/open -R`) launcher using fixed argv `child_process.spawn`. |
| `src/utility/index.ts` | **Modified** | Registered P3 IPC handlers in Utility Process message router. |
| `src/utility/engine/executor.ts` | **Modified** | Wired P3 action execution (`project.onboard`, `project.list`, `project.status`, `service.list`, `project.delete`) and P4 gating. |
| `src/language/catalog.ts` | **Modified** | Added P3 actions to deterministic catalog (`project.onboard`, `project.list`, `project.status`, `service.list`, `project.delete`). |
| `src/language/engine.ts` | **Modified** | Added project resolution, contextual follow-ups, and natural command routing for project operations. |
| `src/main/broker/ipc_broker.ts` | **Modified** | Added native folder picker (`dialog.showOpenDialog`) and P3 IPC routing with frame sender validation. |
| `src/preload/index.ts` | **Modified** | Exposed typed `window.bhaiApi.project` API (including `revealInFinder` and `update`) on frozen bridge. |
| `src/renderer/types.ts` | **Modified** | Added TypeScript interface definitions for `window.bhaiApi.project`. |
| `src/renderer/components/OnboardingWizard.tsx` | **Created** | 4-step native-feeling onboarding modal (Select Folder, Inspecting, Review Findings, Configure Services). |
| `src/renderer/components/ProjectDetailModal.tsx` | **Created/Refined** | Premium compact macOS developer interface with status indicator, compact path (`~`), Copy Path, Reveal in Finder, Lucide action toolbar, compact services table, inline service editor, and safe deletion confirmation dialog. |
| `src/renderer/components/ProjectResultCard.tsx` | **Created/Modified** | Rich card rendering project details and project lists directly in conversation streams with compact path formatting. |
| `src/renderer/components/Header.tsx` | **Modified** | Added discoverable `+ Add Project` folder icon button to title bar. |
| `src/renderer/components/MessageList.tsx` | **Modified** | Wired rendering of `ProjectResultCard` and action dispatchers. |
| `src/renderer/App.tsx` | **Modified** | Integrated onboarding and project detail modals, dynamic height adjustments, and shortcut handling. |
| `src/renderer/styles.css` | **Modified** | Native macOS styling for all P3 modals, cards, chips, badges, service editor, overflow menus, and dark/light modes. |
| `src/tests/unit/p3_project_detector.test.ts` | **Created/Modified** | Unit tests for path canonicalization, bounded file reads, multi-manifest detectors, deep monorepo inspection, and Git inspection. |
| `src/tests/integration/p3_project_registry.test.ts` | **Created** | Integration tests for SQLite persistence, natural commands, strict chat isolation, P4 gating, and safe deletion. |
| `src/tests/electron/p1_electron_suite.ts` | **Modified** | Added Electron main + utility verification for project registration, restart durability, and unregistration. |
| `scripts/run_p3_tests.js` | **Created** | Master verification runner executing all P1, P2, and P3 test suites. |

---

## 3. Safe Project Detection Architecture

```
                    +-----------------------------+
                    | Selected Path (Picker / UI) |
                    +--------------+--------------+
                                   |
                                   v
                    +-----------------------------+
                    |     SafePathValidator       |
                    | - fs.realpathSync (canonical)|
                    | - stat.isDirectory() check  |
                    | - Symlink escape rejection  |
                    +--------------+--------------+
                                   |
                                   v
             +---------------------+---------------------+
             |         SafeProjectInspector              |
             | - Bounded reads (<= 256 KB)               |
             | - Directory walk depth cap (<= 3)         |
             | - Scan timeout (<= 2500 ms)               |
             | - Skips: node_modules, .git, dist, .venv  |
             +---------------------+---------------------+
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+-----------------+       +-----------------+       +-----------------+
|  GitDetector    |       |  NodeDetector   |       | MonorepoDetector|
| - fixed argv    |       | - package.json  |       | - pnpm-workspace|
| - read-only     |       | - scripts, deps |       | - npm/yarn ws   |
+-----------------+       +-----------------+       +-----------------+
         |                         |                         |
         v                         v                         v
+-----------------+       +-----------------+       +-----------------+
| PythonDetector  |       |  RustDetector   |       | ComposeDetector |
| - pyproject.toml|       | - Cargo.toml    |       | - docker-compose|
| - setup.cfg/reqs|       | - binaries/libs |       | - service names |
+-----------------+       +-----------------+       +-----------------+
```

### Safety & Resource Boundaries
- **Path Canonicalization**: `SafePathValidator.validateAndCanonicalize` verifies that the target path exists and is a directory. It resolves real canonical paths via `fs.realpathSync`, preventing relative path traversal (`../`) and ensuring canonical filesystem identity.
- **Symlink Containment**: Detectors never follow symlinks that point outside the project's canonical root.
- **Bounded Manifest Reads**: `SafeProjectInspector.readSafeText` limits manifest file reading to a maximum of 256 KB (`MAX_FILE_BYTES = 262144`). If a file exceeds this limit, an error is recorded and scanning safely continues without blocking the process.
- **Directory Traversal Caps**: Max scan depth is strictly capped at 3 levels, and directory entry counts are bounded to 1,000 items to prevent hangs on deeply nested repositories.
- **Timeout Protection**: The inspector enforces a hard 2,500ms timeout per inspection operation.

---

## 4. Supported Project Types & Metadata Detection

The inspector modularly detects major developer ecosystems without executing arbitrary code:

| Ecosystem | Manifests Inspected | Detected Metadata | Extracted Services |
| :--- | :--- | :--- | :--- |
| **Node.js / TypeScript** | `package.json`, `tsconfig.json` | Node.js, TypeScript, Next.js, React, Vite, Express, Fastify, NestJS, PM (`pnpm`, `yarn`, `bun`, `npm`) | Auto-detects frontend/backend directories and dev scripts with default ports (3000, 4000, 5173, 8080). |
| **Monorepo / Workspaces** | `pnpm-workspace.yaml`, `lerna.json`, root `package.json` `workspaces` | Monorepo structure, package manager workspace definitions | Discovers child service packages in `apps/*`, `packages/*`, `services/*`, etc. |
| **Python** | `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py` (parsed statically) | Python, FastAPI, Django, Flask, Pytest, PM (`uv`, `poetry`, `pipenv`, `pip`) | Identifies API or web services with standard ports (8000, 5000). |
| **Rust** | `Cargo.toml` | Rust, Cargo, Axum, Actix-web, Rocket, Tokio | Identifies Cargo binary targets and web frameworks. |
| **Docker Compose** | `docker-compose.yml`, `docker-compose.yaml`, `compose.yaml` | Containerized services, configured ports | Extracts declared services and port mappings without starting containers. |
| **Git Repository** | `.git` (directory or file) | Repository status, branch name, clean/dirty state, modified file count | Read-only status via fixed argv `git status --porcelain=v1`. |

### 4.1 Multi-Service & Monorepo Deep Inspection (Requirement 7 Resolution)

**Root Cause Investigation**:
In earlier iterations, multi-service repositories (such as `aawas-fintech`) displaying services like `backend` and `frontend` showed only "Git" in the detected technologies section. Investigation revealed:
1. `GitDetector` successfully detected `.git` at the root.
2. `NodeDetector` only checked the root `${projectRoot}/package.json`. If a project had no root `package.json` (or minimal root tooling without framework dependencies), `NodeDetector` returned `null`.
3. `MonorepoDetector` found `backend` and `frontend` subdirectories, but previously created stub service definitions without parsing manifests located inside those child directories.

**Resolution Architecture**:
- Implemented `inspectServiceDirectory` within `MonorepoDetector` and `SafeProjectInspector`.
- When child service directories (`backend`, `frontend`, `apps/*`, `services/*`, etc.) are detected, the inspector inspects each child directory's manifest (`package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`).
- Framework dependencies (`Fastify`, `Next.js`, `React`, `Vite`, `Express`, `FastAPI`, `Axum`, etc.) and language runtimes (`TypeScript`, `Node.js`, `Python`, `Rust`) detected within child services are aggregated into the project-level `technologies` array and attached to service definitions.
- **Port Confidence Distinction**:
  - `configured`: Port is explicitly declared via npm scripts (e.g. `--port 4000`, `-p 3000`, `PORT=4000`) or manually customized by the developer.
  - `inferred`: Port is inferred from standard framework conventions (e.g. Next.js on 3000, Vite on 5173, FastAPI on 8000). Rendered in the UI with a distinct dashed badge (`:3000 DEF`) so developers are never misled by guessed defaults.

---

## 5. Project Registry Persistence & Data Model

SQLite schema migration 003 (`src/utility/storage/migrations.ts`) establishes the relational foundation for projects and services:

```sql
-- Migration 003: Project Registry & Developer Context
CREATE TABLE IF NOT EXISTS path_grants (
  id TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  grant_type TEXT NOT NULL DEFAULT 'project_root',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  canonical_root TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  detected_metadata TEXT, -- JSON blob of technologies, manifests, etc.
  is_git_repo INTEGER NOT NULL DEFAULT 0,
  git_remote TEXT,
  availability TEXT NOT NULL DEFAULT 'available',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL, -- 'frontend' | 'backend' | 'worker' | 'database' | 'custom'
  relative_cwd TEXT NOT NULL,
  package_script TEXT,
  command TEXT,
  port INTEGER,
  health_check_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_services_project_id ON services(project_id);
```

### Durability & Unregistration Guarantees
- **Duplicate Prevention**: `canonical_root` has a `UNIQUE` constraint. Attempting to register the same directory via a different alias, symlink, or relative path throws `PROJECT_ALREADY_REGISTERED`.
- **Atomic Operations**: Project creation, service registration, and deletion execute within SQLite transactions (`db.transaction()`).
- **Cascade Context Invalidation**: When a project is removed via `projectRepo.deleteProject(id)`:
  1. Child services are deleted via `ON DELETE CASCADE`.
  2. The project row and associated `path_grants` row are removed.
  3. `chat_contexts` rows referencing `project_id` have their `project_id` and `service_id` cleared to `null` to avoid dangling references.
  4. **Filesystem Safety**: The operation **only** modifies SQLite records. No `fs.rmdir`, `fs.unlink`, or filesystem deletion is ever performed.

---

## 6. IPC & Security Boundary Audit

All P3 IPC channels adhere strictly to the threat model established in `SECURITY_DESIGN.md`:

```
+-------------------------------------------------------------+
| Renderer Process (Chromium Sandbox, contextIsolation: true) |
+------------------------------+------------------------------+
                               | window.bhaiApi.project.*
                               v
+-------------------------------------------------------------+
| Preload Script (Frozen object bridge, strict validation)    |
+------------------------------+------------------------------+
                               | ipcRenderer.invoke(channel)
                               v
+-------------------------------------------------------------+
| Main Process IPC Broker                                     |
| - Verifies frame sender identity                            |
| - Validates Zod request DTO schemas                         |
| - Handles native dialog.showOpenDialog                      |
+------------------------------+------------------------------+
                               | Utility Process MessagePort
                               v
+-------------------------------------------------------------+
| Utility Process (Single SQLite Writer, Local FS Inspector)  |
| - ProjectRepository (CRUD, transactions)                    |
| - SafeProjectInspector (bounded read-only inspection)       |
| - GitInspector (fixed argv git status)                      |
| - SafeLauncher (fixed argv editor / terminal launch)        |
+-------------------------------------------------------------+
```

### Audit Verification Points:
- **Sandbox Mode**: Renderer runs with `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.
- **Frame Validation**: `ipc_broker.ts` verifies `event.senderFrame` on every IPC request, preventing unauthorized message spoofing.
- **DTO Validation**: Every IPC payload is strictly validated using Zod schemas (`ProjectCreateSchema`, `ProjectUpdateSchema`, `ProjectDeleteSchema`, etc.) before reaching database or filesystem logic.

---

## 7. Project-Aware Language Commands & Chat Context Isolation

The deterministic language engine was enhanced with dynamic project name matching and contextual routing:

| User Utterance | Intent / Action | Resolution Logic & Outcome |
| :--- | :--- | :--- |
| `bhai project add karo`<br>`add my project` | `project.onboard` | Returns onboarding prompt; signals renderer to open `OnboardingWizard`. |
| `mere projects dikhao`<br>`show all projects` | `project.list` | Fetches registered projects from SQLite; renders interactive project list. |
| `aawas project dikha`<br>`show aawas project` | `project.status` | Dynamic resolution matches "Aawas"; displays project status card and sets active chat context `project_id`. |
| `iske services dikhao`<br>`show its services` | `service.list` | Contextual follow-up: resolves `project_id` from current `chat_contexts` row. |
| `aawas ke services batao`<br>`aawas services` | `service.list` | Explicit project reference: resolves Aawas and lists its registered services. |
| `remove aawas from bhai` | `project.delete` | Recognizes intent; requires user confirmation in UI before unregistering; explains files will remain untouched. |
| `aawas backend start karo` | `service.start` | **Gated for P4**: Recognizes intent truthfully, but returns explanatory response that process supervision begins in Phase P4. |

### Strict Chat Context Isolation
- **Chat A**: User asks `aawas project dikha`. Context updates: `project_id = 'proj_aawas'`. Subsequent query `iske services dikhao` resolves Aawas services.
- **Chat B**: User asks `iske services dikhao` in a separate conversation. Chat B's context has no active `project_id`. Bhai issues a clarification question (`"Which project would you like to view services for?"`) rather than borrowing Chat A's context.

---

## 8. Native macOS UI Experience & Screenshots

All Phase P3 interfaces have been implemented in accordance with Apple Human Interface Guidelines:
- High-contrast, translucent macOS squircle panels with `vibrancy: 'under-window'`.
- Clean system typography (`-apple-system`, `BlinkMacSystemFont`), zero emojis, and subtle micro-interactions.
- Seamless Dark and Light theme adaptation based on system preferences.

### 8.1 Project Result Card (Chat Stream)

```carousel
![Project Result Card - Dark Mode](../../artifacts/screenshots/panel_dark_project_result.png)
<!-- slide -->
![Project Result Card - Light Mode](../../artifacts/screenshots/panel_light_project_result.png)
```

### 8.2 Guided Onboarding — Step 1: Select Directory

```carousel
![Onboarding Step 1 - Dark Mode](../../artifacts/screenshots/panel_dark_onboarding_modal.png)
<!-- slide -->
![Onboarding Step 1 - Light Mode](../../artifacts/screenshots/panel_light_onboarding_modal.png)
```

### 8.3 Guided Onboarding — Step 2: Review Findings & Detected Metadata

```carousel
![Onboarding Step 2 - Dark Mode](../../artifacts/screenshots/panel_dark_onboarding_review.png)
<!-- slide -->
![Onboarding Step 2 - Light Mode](../../artifacts/screenshots/panel_light_onboarding_review.png)
```

### 8.4 Refined Native Project Details View

A refined, compact native macOS developer view featuring a clean header with status indicator dot, compact path display (`~`), Copy Path and Reveal in Finder actions, Lucide action toolbar (`Open Editor`, `Terminal`, `Git Status`), detected technology pills, and compact services rows distinguishing configured vs inferred ports.

```carousel
![Refined Project Detail Modal - Dark Mode](../../artifacts/screenshots/panel_dark_project_detail.png)
<!-- slide -->
![Refined Project Detail Modal - Light Mode](../../artifacts/screenshots/panel_light_project_detail.png)
```

### 8.5 Secondary Management Menu & Safe Deletion Confirmation

"Remove Project" is located in the secondary header overflow menu (`...`). Clicking it displays an explicit confirmation dialog assuring the developer that registered metadata is cleared from Bhai while actual project source files on disk remain 100% untouched.

```carousel
![Project Management Menu - Dark Mode](../../artifacts/screenshots/panel_dark_project_detail_menu.png)
<!-- slide -->
![Project Management Menu - Light Mode](../../artifacts/screenshots/panel_light_project_detail_menu.png)
<!-- slide -->
![Safe Deletion Confirmation - Dark Mode](../../artifacts/screenshots/panel_dark_project_detail_confirm_delete.png)
<!-- slide -->
![Safe Deletion Confirmation - Light Mode](../../artifacts/screenshots/panel_light_project_detail_confirm_delete.png)
```

### 8.6 In-Place Service Metadata Editor

Developers can edit registered service definitions (service name, relative directory, expected port) in-place without executing scripts or modifying source code.

```carousel
![Service Metadata Editor - Dark Mode](../../artifacts/screenshots/panel_dark_project_detail_edit_service.png)
<!-- slide -->
![Service Metadata Editor - Light Mode](../../artifacts/screenshots/panel_light_project_detail_edit_service.png)
```

---

## 9. Test Results, Benchmarks & Durability Verification

The entire Bhai test suite was executed via `npm test` (`scripts/run_p3_tests.js`) targeting Apple Silicon (`arm64`) on macOS 14+.

### Test Results Matrix

| Test Suite Category | Cases / Scope | Status | Performance / Latency |
| :--- | :--- | :--- | :--- |
| **Exact Resolver & Validation** | 14 test cases (exact match, out-of-scope, schema) | **PASSED** | < 1 ms |
| **System Memory Inspection** | Mach virtual memory metrics extraction | **PASSED** | 7 ms |
| **Deterministic Language Engine** | 70-case deterministic specification suite | **PASSED** (70/70, 100%) | p50 = 0.078 ms, p95 = 0.973 ms |
| **P2 Remediation Verification** | 43 scenarios (memory queries, suggestions, chaining) | **PASSED** | < 2 ms |
| **P3 Project Detector Unit Tests** | Path canonicalization, 256KB read limit, Node, TS, Monorepo, Python, Rust, Git | **PASSED** | < 15 ms |
| **Storage & Chat Repository** | CRUD, monotonic sequencing, isolation, rollback | **PASSED** | < 10 ms |
| **Alias & Clarification Lifecycle** | Teach Bhai F07, collision prevention, clarification draft resolution | **PASSED** | < 8 ms |
| **P3 Project Registry Integration** | Registration, duplicate rejection, restart persistence, dynamic natural commands, Chat A vs B isolation, safe deletion | **PASSED** | < 25 ms |
| **Command Executor End-to-End** | Full pipeline execution & SQLite audit ledgers | **PASSED** | 5 ms |
| **Electron & macOS Lifecycle** | Electron bootstrap, utility process IPC, warm restart durability, memory footprint | **PASSED** | Warm restart: 257 ms, RSS: 100 MB |

**Summary: 100% of unit, integration, benchmark, and Electron tests passed.**

---

## 10. Security Invariants Verification

A dedicated security verification was performed to guarantee the integrity of Bhai's security boundaries:

1. **Zero Shell Invocations**: Grepping the entire repository confirms that neither `child_process.exec` nor `/bin/sh` / `/bin/zsh` is invoked. All child processes use `child_process.execFile` or `child_process.spawn` with fixed, immutable argument arrays.
2. **Symlink Escape Resistance**: Verified that symlinks pointing outside the project root are rejected and cannot traverse into sensitive directories (`/etc`, `/Users/developer/.ssh`, etc.).
3. **Read Bounds Enforcement**: Verified that manifests exceeding 256 KB trigger safe bounded errors without causing memory exhaustion.
4. **Source Code Immutability**: Verified that registering, updating, or deleting projects in Bhai never performs writes or deletions on the project's source directory.
5. **Safe Editor & Terminal Launching**: Launchers validate that the project ID is explicitly registered in SQLite, verify the canonical path exists on disk, and invoke applications via fixed argv commands (`open -a "Visual Studio Code" /canonical/path`) without user string interpolation.

---

## 11. Known Limitations & Unresolved Decisions

1. **Live Human Developer Corpus Gate**: In accordance with the Phase P2 Acceptance Gate, the live human developer corpus evaluation (≥600 natural Hindi/Hinglish/English utterances across ≥12 developers) remains officially **PENDING**. The internal 70-case deterministic specification regression suite passes at 100%.
2. **Editor Launch Configuration**: Currently defaults to VS Code and Cursor if installed in `/Applications`. Custom user editor preferences will be introduced in a future configuration panel.
3. **Terminal Tab Reuse**: Opening terminal directories opens a new Terminal window. Reusing existing terminal tabs via AppleScript or accessibility APIs remains unverified from P0 and is intentionally omitted for safety.
4. **Read-Only Git Scope**: Git inspection is strictly read-only and local (`git status --porcelain=v1`). Remote Git operations (`git fetch`, `git pull`, remote auth) are intentionally prohibited.

---

## 12. Phase P3 Acceptance Checklist & Phase P4 Readiness

- [x] **F1: Guided Project Onboarding**: Native folder picker, safe inspection, review findings, configure services, save project.
- [x] **F2: Safe Project Detection**: Bounded reads (≤256KB), directory traversal caps, Node/TS, Monorepo, Python, Rust, Docker Compose, Git.
- [x] **F3: Persistent Project Registry**: SQLite Migration 003, stable IDs, canonical path deduplication, transactional updates, safe unregistration (no file deletion).
- [x] **F4: Project-Aware Language Commands**: `project add karo`, `mere projects dikhao`, `aawas project dikha`, `aawas ke services batao`, `remove aawas from bhai`.
- [x] **F5: Chat-Specific Project Context**: Strict per-chat context isolation, context invalidation on project deletion, no cross-chat leaks.
- [x] **F6: Safe Read-Only Git Info**: Fixed argv, branch name, clean/dirty state, modified file count, no shell execution.
- [x] **F7 & F8: Safe Editor & Terminal Launch**: Fixed argv application launching without shell construction.
- [x] **UI & Visual Verification**: Emoji-free, native macOS Dark and Light mode screenshots generated and verified.
- [x] **Test Verification**: 100% pass across unit, integration, durability, and Electron suites.
- [x] **Remediation & Service Editing**: Conversational unregistration confirmation, historical message card live invalidation, multi-chat context invalidation, path & duplicate service name validation.
- [x] **Acceptance Suite (10 steps)**: 100% passed across all 10 acceptance specifications (tested in `p3_project_registry.test.ts`).

**Phase P3 Remediation is COMPLETE. Final human acceptance is PENDING PRODUCT OWNER MANUAL RETEST. Phase P4 (Managed Process Supervision) remains STRICTLY GATED.**

---

## 13. Remediation Reference

For detailed root-cause analysis, flow tracing, service-editing specifications, and step-by-step retest instructions, see:
- [P3 Final Acceptance Remediation Report](P3_FINAL_ACCEPTANCE_REMEDIATION.md)

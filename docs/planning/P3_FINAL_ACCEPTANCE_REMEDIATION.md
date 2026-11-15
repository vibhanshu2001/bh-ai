# Bhai — Phase P3 Final Acceptance Remediation Report

**Document ID:** P3-REMED-REPORT-001  
**Phase:** P3 — Guided Project Onboarding, Project Registry & Developer Context  
**Target Architecture:** Apple Silicon (`arm64`), macOS 14+ (Sonoma, Sequoia)  
**Remediation Status:** REMEDIATED & AUTOMATED SUITE VERIFIED (100% PASSED)  
**Acceptance Gate Status:** **PENDING PRODUCT OWNER MANUAL RETEST (Human Acceptance Not Claimed)**  
**Date:** November 15, 2026  

---

## 1. Executive Summary & Remediation Context

During Phase P3 manual testing by the Product Owner, the evaluation resulted in:
- **13 Passed**
- **1 Failed**: `Remove a registered project from Bhai`
- **1 Not Tested**: `Validate and complete service editing`

This remediation report documents the root-cause diagnosis, architectural hardening, code modifications, and verification results for both Task 1 (Project Unregistration) and Task 2 (Service Editing), alongside the full execution of the 10-step Acceptance Test suite (Task 3).

In strict adherence to the project guidelines:
1. **No Phase P4 capabilities** (process supervision, service daemon execution, script execution) were implemented.
2. **Filesystem Immutability**: Removing a project from Bhai deletes database metadata and clears contextual references, but **never deletes or mutates physical source code or directories on disk**.
3. **Product Owner Gate**: Human acceptance is explicitly marked as **PENDING** until the product owner re-tests the workflow manually.

---

## 2. Task 1: Project Unregistration Investigation & Root Cause Analysis

### Complete Flow Trace: `UI → Preload → IPC Broker → Utility Process → ProjectRepository → SQLite → UI refresh`

```
[User Action: "remove aawas from bhai" OR Modal Click "Remove Project"]
                               |
                               v
                     +-------------------+
                     |  Renderer / UI    |
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     |  Preload Bridge   |  (window.bhaiApi.project.delete)
                     +---------+---------+
                               | IPC: bhai:project:delete
                               v
                     +-------------------+
                     |    IPC Broker     |  (Sender frame validation, Zod parse)
                     +---------+---------+
                               | Utility Process MessagePort
                               v
                     +-------------------+
                     |  Utility Process  |  (Router case 'project.delete')
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     | ProjectRepository |  (Transactional cleanup in SQLite)
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     |      SQLite       |  (services, chat_contexts, path_grants, projects)
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     |    UI Refresh     |  (Historical cards, active lists, chat notifications)
                     +-------------------+
```

### Root Cause Diagnosis

The investigation revealed that the database deletion transaction in `ProjectRepository` was partially functioning, but the unregistration capability failed across three distinct architectural vectors:

1. **Conversational Unregistration Was Incomplete**:
   - When the user typed natural language deletion commands (e.g., `remove aawas from bhai` or `aawas project delete karo`), `executor.ts` printed an explanatory confirmation question (`Are you sure you want to remove project "Aawas"...`) with `confirmationRequired: true`, but **never registered a clarification draft or candidates**.
   - As a result, the UI rendered plain text without any actionable confirmation pills, and conversational follow-ups (such as `yes`, `confirm`, `haan`, or `cancel`) had no handler in `engine.ts` or `executor.ts`. The project was **never actually deleted from SQLite** when invoked through conversation.

2. **Historical Message Card Staleness (UI Refresh Breakdown)**:
   - When the user unregistered a project through the modal (`handleDeleteProject`), the SQLite row in `projects` was removed, and `onProjectDeleted` called `loadMessages(activeChat.id)`.
   - However, in SQLite's `messages` table, prior assistant messages (e.g., from `mere projects dikhao` or `aawas project dikha`) stored static, frozen JSON in `payload_json`.
   - Reloading messages simply re-rendered the old static message payloads. `ProjectResultCard` had no concept of an unregistration state, continuing to display the deleted project in list cards and details cards. To the developer, the project appeared to have never been deleted.

3. **Missing Multi-Chat Notification & Context Cascade**:
   - `ProjectRepository.deleteProject` did not take an `originChatId` parameter and did not append an unregistration confirmation message to the chat.
   - If another chat was referencing the project, the context in SQLite had `project_id = NULL`, but historical message cards in that second chat still displayed active buttons.

4. **Non-Idempotent Deletion Errors**:
   - If `deleteProject(id)` was called on an already deleted or missing project, it threw an unhandled `Error: Project '...' not found`, causing an uncaught promise rejection in the UI rather than an idempotent, graceful return.

### Resolution & Code Changes

1. **Conversational Clarification Draft**:
   - In [executor.ts](../../src/utility/engine/executor.ts), when `proposal.actionId === 'project.delete'`, Bhai now creates an active `ClarificationDraft` with two candidates:
     - `confirm_delete_${project.id}`: `"Yes, remove ${projName}"`
     - `cancel_delete_${project.id}`: `"Cancel"`
   - Returns disposition `clarify`, causing `MessageList` to display the confirmation card with interactive pills.
   - In `submitCommand`, Bhai detects pending deletion drafts and resolves affirmative responses (`yes`, `haan`, `confirm`, `remove`, `delete`, `proceed`) to `confirm_delete_...` and negative responses (`no`, `cancel`, `stop`) to `cancel_delete_...`.
   - In `selectClarification`, confirming deletion executes `projectRepo.deleteProject(projId, chatId)`, invalidating contexts and appending a formal unregistration confirmation message.

2. **Live Historical Message Card Invalidation**:
   - In [project_repository.ts](../../src/utility/storage/project_repository.ts), `deleteProject` now executes a transaction that:
     - Deletes associated services from `services`.
     - Nullifies `project_id` and `service_id` in `chat_contexts` across all chats.
     - Invalidates pending clarification drafts referencing the project.
     - Deletes `path_grants` and `projects` rows.
     - **Scans historical `messages` in SQLite**: updates `payload.project.availability = 'removed'` and filters out the deleted project ID from `payload.projects` arrays.
     - If `originChatId` is provided, appends an assistant confirmation message to that conversation.
   - In [ProjectResultCard.tsx](../../src/renderer/components/ProjectResultCard.tsx):
     - Projects with `availability: 'removed'` render a subtle, disabled card: `[Folder] [Project Name] [Removed from Bhai]`, explaining that the project is unregistered while local files remain untouched.
     - Lists with 0 active projects render a clean empty notice: `No registered projects in Bhai. Use "project add karo" to onboard a project.`
   - In [App.tsx](../../src/renderer/App.tsx):
     - `onProjectDeleted` updates the React state of messages immediately (eliminating render lag) and re-syncs with SQLite via `loadMessages(activeChat.id)`.

3. **Graceful Idempotency**:
   - `deleteProject(id)` returns `{ deleted: false, projectName: id }` if the project is already missing, preventing unhandled UI errors.

4. **Zero Filesystem Deletion Calls**:
   - Grepping and auditing confirms that neither `fs.rm`, `fs.rmdir`, `fs.unlink`, nor any shell deletion commands are invoked during unregistration.

---

## 3. Task 2: Service Editing Validation & Persistence

### Requirements & Editable Fields

The following fields are fully editable in [ProjectDetailModal.tsx](../../src/renderer/components/ProjectDetailModal.tsx) and validated by [ProjectRepository.ts](../../src/utility/storage/project_repository.ts):

| Field | Validation Rules | Storage / Persistence |
| :--- | :--- | :--- |
| **Service Display Name** | Required (1-64 chars). Must be unique within the project (case-insensitive duplicate check). | Persisted to `services.name` column in SQLite. |
| **Service Type** | Validated enum: `backend`, `frontend`, `worker`, `database`, `custom`. | Persisted to `services.service_type` column in SQLite. |
| **Relative Working Directory** | Must remain inside project root. Rejects absolute paths outside root and path traversal attempts (`..` or `../`). | Persisted to `services.relative_cwd` column in SQLite. |
| **Configured Port** | Optional integer strictly bounded between `1` and `65535` (rejects negative numbers, zero, floats, and `> 65535`). | Persisted to `services.port` column in SQLite. |
| **Port Confidence** | Categorized as `'configured'` (user-confirmed/script) or `'inferred'` (default convention). | Persisted inside `services.readiness_json.portConfidence`. |
| **Approved Package Script** | Optional script reference (e.g. `npm run dev`, `cargo run`). Strictly declarative; **never executed**. | Persisted inside `services.readiness_json.packageScript`. |

### Security Boundaries & Invalidation Guarantees

1. **Path Containment Enforcement**:
   - UI pre-validates: `cleanCwd.startsWith('/') || cleanCwd.startsWith('..') || cleanCwd.includes('/../')`.
   - SQLite utility process strictly verifies:
     ```ts
     const resolved = path.resolve(existing.canonicalRoot, relCwd);
     const relFromRoot = path.relative(existing.canonicalRoot, resolved);
     if (relFromRoot.startsWith('..')) {
       throw new Error(`Service directory '${s.relativeCwd}' escapes project root`);
     }
     ```
2. **Duplicate Prevention**:
   - Validated both in the UI modal and in `ProjectRepository.updateProject` using a normalized lowercase name set.
   - Enforced by SQLite schema: `UNIQUE (project_id, name)`.
3. **Stale Context Invalidation**:
   - When services are updated, any active `chat_contexts` row referencing a deleted or renamed service has its `service_id` cleared to `NULL`:
     ```sql
     UPDATE chat_contexts
     SET service_id = NULL, updated_at = ?
     WHERE project_id = ? AND service_id IS NOT NULL AND service_id NOT IN (...)
     ```
4. **No Process Execution**:
   - Editing a service updates SQLite records exclusively. Zero child processes or background tasks are spawned.

---

## 4. Task 3: Complete Acceptance Test Verification

The complete 10-step acceptance sequence requested by the Product Owner was implemented and executed as an automated integration suite in [p3_project_registry.test.ts](../../src/tests/integration/p3_project_registry.test.ts) and verified via `npm test`:

| Step # | Test Specification | Verification Result | Notes |
| :---: | :--- | :---: | :--- |
| **1** | **Register a temporary project** | **PASSED** | Registered `Aawas` with 2 services (`Backend`, `Frontend`) using temporary directory fixture. |
| **2** | **Rename a registered service** | **PASSED** | Renamed `Backend` to `API Gateway`. Validated duplicate name rejection (`Frontend` duplicate throws). |
| **3** | **Update its port & packageScript** | **PASSED** | Updated port from `4000` to `5001`; updated `packageScript` to `npm run prod`. Validated port boundary checks (`99999` throws). |
| **4** | **Restart Bhai & verify persistence** | **PASSED** | Closed database connection, created fresh connection, re-instantiated repositories. Verified `API Gateway`, port `5001`, and `packageScript` intact. |
| **5** | **Unregister the project (conversational confirmation)** | **PASSED** | Executed `remove aawas fintech core from bhai`. Bhai returned `clarify` draft with confirm/cancel candidates. Executed `yes`. |
| **6** | **Verify project disappears from registry** | **PASSED** | `projectRepo.listProjects()` returned `0` projects. |
| **7** | **Verify associated service records are removed** | **PASSED** | Queried `SELECT * FROM services WHERE project_id = ...`; returned `0` rows. |
| **8** | **Verify relevant chat contexts are invalidated** | **PASSED** | Checked `chat_contexts` across both `Chat A` and `Chat B`. Both `projectId` and `serviceId` were nullified (`NULL`). |
| **9** | **Verify source directory & files remain untouched** | **PASSED** | Verified `fs.existsSync(aawasDir)`, `backend/server.ts`, and `frontend/app.tsx` all exist with identical contents. |
| **10** | **Restart Bhai & verify project stays unregistered** | **PASSED** | Closed connection, reopened fresh database connection. `listProjects()` returned `0`. Verified persistence of unregistration. |
| **+** | **Idempotent / Missing project deletion** | **PASSED** | Repeated `deleteProject` on unregistered ID; returned `{ deleted: false }` safely without throwing. |

---

## 5. Summary of Files Modified or Created

| File | Nature of Change | Summary of Changes |
| :--- | :---: | :--- |
| `src/shared/contracts/dto.ts` | **Modified** | Added `packageScript` to `ServiceDtoSchema`; added `'removed'` to `ProjectDtoSchema.availability`; added `chatId` to `ProjectDeleteRequestSchema`. |
| `src/utility/storage/project_repository.ts` | **Modified** | Hardened `createProject` and `updateProject` with path containment, duplicate checks, port boundaries, and `packageScript` persistence. Implemented idempotent `deleteProject` with multi-chat context invalidation, historical message card updating, and unregistration chat notifications. |
| `src/utility/engine/executor.ts` | **Modified** | Added pending deletion draft resolution (handling `yes`/`confirm`/`cancel` follow-ups); updated `project.delete` action to return interactive clarification draft; updated `selectClarification` to execute unregistration and return confirmation. |
| `src/language/engine.ts` | **Modified** | Added contextual project deletion intent matching (`remove project`, `delete project`, `project delete karo`) using active chat context. |
| `src/utility/index.ts` | **Modified** | Updated `project.delete` IPC router to pass `req.payload.chatId` to `ProjectRepository`. |
| `src/preload/index.ts` | **Modified** | Updated `project.delete` bridge method to accept optional `chatId`. |
| `src/renderer/types.ts` | **Modified** | Updated TypeScript declaration for `bhaiApi.project.delete(id, chatId)`. |
| `src/renderer/components/ProjectDetailModal.tsx` | **Modified** | Added `activeChatId` prop; updated `handleDeleteProject` to pass `activeChatId` and notify parent; hardened `handleSaveService` with path traversal, duplicate name, and port validations. |
| `src/renderer/components/ProjectResultCard.tsx` | **Modified** | Added dedicated `removed-card` rendering when `project.availability === 'removed'`; updated project list card to filter out removed projects and display a clean empty notice when 0 active projects remain. |
| `src/renderer/App.tsx` | **Modified** | Passed `activeChatId` to `ProjectDetailModal`; updated `onProjectDeleted` to immediately update React message state and re-sync with SQLite messages. |
| `src/tests/integration/p3_project_registry.test.ts` | **Modified** | Implemented comprehensive 10-step acceptance test suite covering service editing, path validation, conversational unregistration, context invalidation, file preservation, cold restart persistence, and idempotency. |
| `src/tests/electron/p1_electron_suite.ts` | **Modified** | Extended Electron restart verification to test service editing across IPC, cross-chat context invalidation, and filesystem immutability. |
| `docs/planning/P3_FINAL_ACCEPTANCE_REMEDIATION.md` | **Created** | Comprehensive remediation document for product owner acceptance review. |
| `docs/planning/P3_IMPLEMENTATION_REPORT.md` | **Modified** | Updated with remediation findings, service editing specifications, and unregistration flow documentation. |

---

## 6. Test Results & Durability Verification

All test suites were executed via `npm test` (`scripts/run_p3_tests.js`) on Apple Silicon (`arm64`):

```
======================================================
PHASE P3 TEST & RECONCILIATION RESULTS SUMMARY:
======================================================
  P1 Resolver & Memory Unit Tests:           PASSED
  70-Case Specification Suite:               PASSED (100% on 70 cases)
  P3 Project Detection & Canonicalization:   PASSED
  P3 Safe Bounded Reads & Symlink Security:  PASSED
  P3 Read-Only Git Inspector:                PASSED
  P3 Project Registry SQLite CRUD & Durability: PASSED
  P3 Chat Context Isolation (Chat A vs B):   PASSED
  P3 Language Commands (add, list, show, srv): PASSED
  P3 Unregistration (No File Deletion):      PASSED
  P3 Managed Service Gating (P4 guidance):   PASSED
  Electron Bootstrap & P3 IPC Routing:       PASSED
  Application Restart Persistence:           PASSED
  Sandbox & Security Invariants:             PASSED
------------------------------------------------------
  Warm Restart Latency:                      231 ms
  Process Memory Footprint:                  101 MB RSS
======================================================
```

---

## 7. Remaining Manual Verification Steps for Product Owner

To complete final acceptance of Phase P3, the Product Owner should execute the following manual tests:

### Test Case 1: Unregister Project via UI Modal
1. Open Bhai (`Cmd + Shift + Space`).
2. Type `mere projects dikhao` or click an existing project card's **View Details**.
3. In the Project Details view, click the header overflow menu button (`...`) and select **Remove Project...**.
4. Observe the confirmation sheet stating that source files remain 100% untouched.
5. Click **Remove Project**.
6. **Verify**:
   - The modal closes immediately.
   - The active chat displays a clear confirmation message: `Project **...** has been removed from Bhai. All project files, Git history, and directories on your Mac remain untouched.`
   - Any prior project cards in the conversation stream update immediately to show `[Removed from Bhai]`.
   - Running `mere projects dikhao` immediately excludes the deleted project.
   - Open Finder or Terminal and verify all source files in the project folder are 100% intact.

### Test Case 2: Unregister Project via Natural Language Command
1. In a chat, type `remove <project_name> from bhai` (e.g. `remove aawas from bhai`).
2. **Verify**: Bhai displays an interactive confirmation card with two candidate buttons: `[Yes, remove <project_name>]` and `[Cancel]`.
3. Either click `[Yes, remove ...]` or type `yes`.
4. **Verify**: Bhai unregisters the project, nullifies conversational context, and confirms unregistration without deleting files.

### Test Case 3: Edit Service Metadata
1. Open Project Details for any registered multi-service project.
2. In the Services table, click the **Edit** button next to any service.
3. Test validations:
   - Try setting the service name to match an existing service in the same project -> Verify error: `"A service named '...' already exists in this project."`
   - Try setting the directory to `../../outside` -> Verify error: `"Working directory must remain inside project root..."`
   - Try setting port to `99999` -> Verify error: `"Port must be a valid integer between 1 and 65535."`
4. Set valid values: change display name, update port to `5001`, update package script to `npm run dev`.
5. Click **Save**.
6. Restart Bhai (`Quit` and reopen).
7. Re-open Project Details and verify the updated service name, port, and script reference persisted intact across the restart.

---

## 8. Unresolved Decisions & Security Concerns

1. **Phase P4 Execution Gating**: Service execution (`aawas backend start`) recognizes user intent truthfully but explicitly gates execution with a helpful explanation. Phase P4 process supervision must not begin until this P3 remediation is formally accepted.
2. **Large Human Language Corpus Gate**: The internal 70-case deterministic specification suite passes at 100%. The live human developer corpus evaluation (≥600 natural Hindi/Hinglish/English utterances across ≥12 developers) remains officially pending product owner scheduling.
3. **No Unresolved Security Vulnerabilities**: All filesystem paths are canonicalized (`fs.realpathSync`), shell invocations are completely absent (using fixed-argument `child_process.execFile`/`spawn`), and database operations are transactional and revision-aware.

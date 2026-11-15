#!/usr/bin/env node

/**
 * Bhai Phase P3 Master Test Runner
 * Executes unit, integration, language benchmark, Electron, and P3 Project Registry tests.
 */

const { runResolverTests } = require('../dist/tests/unit/resolver.test.js');
const { runMemoryActionTests } = require('../dist/tests/unit/memory_action.test.js');
const { runLanguageEngineUnitTests } = require('../dist/tests/unit/language_engine.test.js');
const { runP2RemediationTests } = require('../dist/tests/unit/p2_remediation.test.js');
const { runP3ProjectUnitTests } = require('../dist/tests/unit/p3_project_detector.test.js');
const { runStorageIntegrationTests } = require('../dist/tests/integration/storage.test.js');
const { runAliasAndClarificationIntegrationTests } = require('../dist/tests/integration/alias_and_clarification.test.js');
const { runP3ProjectIntegrationTests } = require('../dist/tests/integration/p3_project_registry.test.js');
const { runExecutorIntegrationTests } = require('../dist/tests/integration/executor.test.js');
const { runElectronVerificationSuite } = require('../dist/tests/electron/p1_electron_suite.js');

async function main() {
  console.log('======================================================');
  console.log('BHAI PHASE P3 VERIFICATION & PROJECT REGISTRY SUITE');
  console.log('Target Architecture: Apple Silicon (arm64), macOS 14+');
  console.log('Scope: Guided Onboarding, Project Registry & Context');
  console.log('======================================================\n');

  try {
    // 1. P1 Baseline Unit Tests
    runResolverTests();
    await runMemoryActionTests();

    // 2. P2 Language Engine Unit Tests & 70-Case Benchmark
    runLanguageEngineUnitTests();

    // 2b. P2 Remediation 43-Scenario Verification
    await runP2RemediationTests();

    // 2c. P3 Project Detector, Security Boundaries & Git Inspector Unit Tests
    await runP3ProjectUnitTests();
    console.log('\n[PASS] All P1, P2 & P3 Unit Tests Completed Successfully.\n');

    // 3. Storage Integration Tests (P1 baseline)
    runStorageIntegrationTests();

    // 4. P2 Alias & Clarification Integration Tests
    await runAliasAndClarificationIntegrationTests();

    // 4b. P3 Project Registry Persistence, Chat Isolation & Lifecycle Integration Tests
    await runP3ProjectIntegrationTests();
    console.log('\n[PASS] All Storage, Alias, Clarification & Project Registry Integration Tests Completed Successfully.\n');

    // 5. Command Executor Integration Tests
    await runExecutorIntegrationTests();
    console.log('\n[PASS] Command Executor Integration Tests Completed Successfully.\n');

    // 6. Electron Integration Suite (macOS Sandbox, Restart Persistence, IPC, Project Lifecycle)
    const electronMetrics = await runElectronVerificationSuite();
    console.log('\n[PASS] Electron & macOS Verification Suite Completed Successfully.\n');

    console.log('======================================================');
    console.log('PHASE P3 TEST & RECONCILIATION RESULTS SUMMARY:');
    console.log('======================================================');
    console.log('  P1 Resolver & Memory Unit Tests:           PASSED');
    console.log('  70-Case Specification Suite:               PASSED (100% on 70 cases)');
    console.log('  P3 Project Detection & Canonicalization:   PASSED');
    console.log('  P3 Safe Bounded Reads & Symlink Security:  PASSED');
    console.log('  P3 Read-Only Git Inspector:                PASSED');
    console.log('  P3 Project Registry SQLite CRUD & Durability: PASSED');
    console.log('  P3 Chat Context Isolation (Chat A vs B):   PASSED');
    console.log('  P3 Language Commands (add, list, show, srv): PASSED');
    console.log('  P3 Unregistration (No File Deletion):      PASSED');
    console.log('  P3 Managed Service Gating (P4 guidance):   PASSED');
    console.log('  Electron Bootstrap & P3 IPC Routing:       PASSED');
    console.log('  Application Restart Persistence:           PASSED');
    console.log('  Sandbox & Security Invariants:             PASSED');
    console.log('------------------------------------------------------');
    console.log(`  Warm Restart Latency:                      ${electronMetrics.warmLatencyMs} ms`);
    console.log(`  Process Memory Footprint:                  ${electronMetrics.memoryRssMb} MB RSS`);
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL] Test Suite Failure:', err);
    process.exit(1);
  }
}

main();

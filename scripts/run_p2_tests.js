#!/usr/bin/env node

/**
 * Bhai Phase P2 Master Test Runner
 * Executes unit, integration, language benchmark, and Electron tests for Phase P2.
 */

const { runResolverTests } = require('../dist/tests/unit/resolver.test.js');
const { runMemoryActionTests } = require('../dist/tests/unit/memory_action.test.js');
const { runLanguageEngineUnitTests } = require('../dist/tests/unit/language_engine.test.js');
const { runP2RemediationTests } = require('../dist/tests/unit/p2_remediation.test.js');
const { runStorageIntegrationTests } = require('../dist/tests/integration/storage.test.js');
const { runAliasAndClarificationIntegrationTests } = require('../dist/tests/integration/alias_and_clarification.test.js');
const { runExecutorIntegrationTests } = require('../dist/tests/integration/executor.test.js');
const { runElectronVerificationSuite } = require('../dist/tests/electron/p1_electron_suite.js');

async function main() {
  console.log('======================================================');
  console.log('BHAI PHASE P2 VERIFICATION & BENCHMARK TEST SUITE');
  console.log('Target Architecture: Apple Silicon (arm64), macOS 14+');
  console.log('Scope: Deterministic Language Engine & Context Safety');
  console.log('======================================================\n');

  try {
    // 1. P1 Baseline Unit Tests
    runResolverTests();
    await runMemoryActionTests();

    // 2. P2 Language Engine Unit Tests & 70-Case Benchmark
    runLanguageEngineUnitTests();

    // 2b. P2 Remediation 43-Scenario Verification
    await runP2RemediationTests();
    console.log('\n[PASS] All P1, P2 & Remediation Unit Tests Completed Successfully.\n');

    // 3. Storage Integration Tests (P1 baseline)
    runStorageIntegrationTests();

    // 4. P2 Alias & Clarification Integration Tests
    await runAliasAndClarificationIntegrationTests();
    console.log('\n[PASS] All Storage, Alias & Clarification Integration Tests Completed Successfully.\n');

    // 5. Command Executor Integration Tests
    await runExecutorIntegrationTests();
    console.log('\n[PASS] Command Executor Integration Tests Completed Successfully.\n');

    // 6. Electron Integration Suite (macOS Sandbox, Restart Persistence, IPC)
    const electronMetrics = await runElectronVerificationSuite();
    console.log('\n[PASS] Electron & macOS Verification Suite Completed Successfully.\n');

    console.log('======================================================');
    console.log('PHASE P2 TEST & RECONCILIATION RESULTS SUMMARY:');
    console.log('======================================================');
    console.log('  P1 Resolver & Memory Unit Tests:           PASSED');
    console.log('  70-Case Specification Suite:               PASSED (100% on 70 cases)');
    console.log('  Live Human Developer Corpus:               PENDING (Acceptance Gate)');
    console.log('  Negation & Chaining Preflight:             PASSED');
    console.log('  Action Registry P3/P4/P5 Gating:           PASSED');
    console.log('  Context Isolation (Chat A vs Chat B):      PASSED');
    console.log('  F07 Teach Bhai (Alias CRUD & Execution):   PASSED');
    console.log('  Clarification Draft Lifecycle:             PASSED');
    console.log('  Storage & Isolation Integration:           PASSED');
    console.log('  Command Executor Integration:              PASSED');
    console.log('  Electron Bootstrap & IPC Routing:          PASSED');
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

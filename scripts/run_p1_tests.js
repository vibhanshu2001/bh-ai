#!/usr/bin/env node

/**
 * Bhai Phase P1 Master Test Runner
 * Executes unit, integration, and Electron/macOS tests for Phase P1.
 */

const { runResolverTests } = require('../dist/tests/unit/resolver.test.js');
const { runMemoryActionTests } = require('../dist/tests/unit/memory_action.test.js');
const { runStorageIntegrationTests } = require('../dist/tests/integration/storage.test.js');
const { runExecutorIntegrationTests } = require('../dist/tests/integration/executor.test.js');
const { runElectronVerificationSuite } = require('../dist/tests/electron/p1_electron_suite.js');

async function main() {
  console.log('======================================================');
  console.log('BHAI PHASE P1 VERIFICATION TEST SUITE');
  console.log('Target Architecture: Apple Silicon (arm64), macOS 14+');
  console.log('======================================================\n');

  const results = {
    unit: false,
    storageIntegration: false,
    executorIntegration: false,
    electronSuite: false,
    metrics: {}
  };

  try {
    // 1. Unit Tests
    runResolverTests();
    await runMemoryActionTests();
    results.unit = true;
    console.log('\n[PASS] All Unit Tests Completed Successfully.\n');

    // 2. Integration Tests
    runStorageIntegrationTests();
    results.storageIntegration = true;
    console.log('\n[PASS] Storage Integration Tests Completed Successfully.\n');

    await runExecutorIntegrationTests();
    results.executorIntegration = true;
    console.log('\n[PASS] Command Executor Integration Tests Completed Successfully.\n');

    // 3. Electron Integration Suite
    const electronMetrics = await runElectronVerificationSuite();
    results.electronSuite = true;
    results.metrics = electronMetrics;
    console.log('\n[PASS] Electron & macOS Verification Suite Completed Successfully.\n');

    console.log('======================================================');
    console.log('PHASE P1 TEST RESULTS SUMMARY:');
    console.log('======================================================');
    console.log('  Unit Tests (Resolver & Memory):            PASSED');
    console.log('  Storage & Isolation Integration:           PASSED');
    console.log('  Command Executor Integration:              PASSED');
    console.log('  Electron Bootstrap & IPC:                  PASSED');
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

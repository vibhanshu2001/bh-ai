import assert from 'node:assert';
import { MemoryInspectAction } from '../../utility/actions/memory_action';
import { MemoryInspectResultSchema } from '../../shared/contracts/dto';

export async function runMemoryActionTests() {
  console.log('--- [UNIT] MemoryInspectAction Tests ---');
  const action = new MemoryInspectAction();
  const t0 = Date.now();
  const res = await action.execute();
  const duration = Date.now() - t0;

  // Validate strict Zod schema
  const parsed = MemoryInspectResultSchema.parse(res);
  assert.ok(parsed.totalBytes > 0, 'Total bytes must be positive');
  assert.ok(parsed.usedBytes > 0, 'Used bytes must be positive');
  assert.ok(parsed.freeBytes >= 0, 'Free bytes must be non-negative');
  assert.ok(parsed.usedPercent >= 0 && parsed.usedPercent <= 100, 'Used percent must be between 0 and 100');
  assert.ok(parsed.timestamp >= t0, 'Timestamp must be current');

  const totalGb = (parsed.totalBytes / (1024 * 1024 * 1024)).toFixed(1);
  const usedGb = (parsed.usedBytes / (1024 * 1024 * 1024)).toFixed(1);
  console.log(`  ✓ Memory inspection returned: ${usedGb} GB used of ${totalGb} GB (${parsed.usedPercent}%) in ${duration}ms`);

  if (process.platform === 'darwin') {
    assert.ok(parsed.activeBytes !== undefined || parsed.wiredBytes !== undefined, 'Expected Darwin mach vm_stat metrics');
    console.log(`  ✓ Mach virtual memory metrics extracted: active=${parsed.activeBytes ? (parsed.activeBytes / 1024 / 1024).toFixed(0) + 'MB' : 'N/A'}, wired=${parsed.wiredBytes ? (parsed.wiredBytes / 1024 / 1024).toFixed(0) + 'MB' : 'N/A'}`);
  }
}

if (require.main === module) {
  runMemoryActionTests();
}

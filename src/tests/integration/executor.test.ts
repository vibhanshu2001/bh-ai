import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ChatRepository } from '../../utility/storage/chat_repository';
import { ExecutionRepository } from '../../utility/storage/execution_repository';
import { MinimalCommandExecutor } from '../../utility/engine/executor';

export async function runExecutorIntegrationTests() {
  console.log('--- [INTEGRATION] MinimalCommandExecutor End-to-End Tests ---');
  const tempDbDir = path.join(os.tmpdir(), `bhai_test_exec_${Date.now()}`);
  const dbPath = path.join(tempDbDir, 'test_bhai_exec.sqlite');

  const conn = new DatabaseConnection(dbPath);
  const db = conn.open();
  const chatRepo = new ChatRepository(db);
  const execRepo = new ExecutionRepository(db);
  const executor = new MinimalCommandExecutor(chatRepo, execRepo);

  try {
    const chat = chatRepo.createChat('Exec Test Chat');

    // 1. Submit Supported Memory Command
    const t0 = Date.now();
    const res = await executor.executeCommand(chat.id, 'bhai memory dekh');
    const duration = Date.now() - t0;

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.userMessage.body, 'bhai memory dekh');
    assert.strictEqual(res.userMessage.chatSeq, 1);
    assert.strictEqual(res.assistantMessage.kind, 'result');
    assert.strictEqual(res.assistantMessage.chatSeq, 2);
    assert.ok(res.result !== undefined);
    assert.ok(res.result.totalBytes > 0);
    assert.ok(res.result.usedPercent >= 0 && res.result.usedPercent <= 100);
    console.log(`  ✓ 'bhai memory dekh' executed in ${duration}ms, result: ${res.assistantMessage.body}`);

    // Verify database records
    const executions = db.prepare('SELECT id, state, plan_hash FROM executions WHERE origin_chat_id = ?').all(chat.id) as any[];
    assert.strictEqual(executions.length, 1);
    assert.strictEqual(executions[0].state, 'completed');

    const steps = db.prepare('SELECT step_id, state, action_id FROM execution_steps WHERE execution_id = ?').all(executions[0].id) as any[];
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].state, 'completed');
    assert.strictEqual(steps[0].action_id, 'system.memory.inspect');

    const attempts = db.prepare('SELECT attempt_no, outcome FROM step_attempts WHERE execution_id = ?').all(executions[0].id) as any[];
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].outcome, 'completed');
    console.log('  ✓ SQLite execution, step, and attempt ledgers verified completed');

    // 2. Submit Unsupported Command
    const unsuppRes = await executor.executeCommand(chat.id, 'bhai fly to the moon');
    assert.strictEqual(unsuppRes.ok, true);
    assert.strictEqual(unsuppRes.userMessage.chatSeq, 3);
    assert.strictEqual(unsuppRes.assistantMessage.kind, 'unsupported');
    assert.strictEqual(unsuppRes.assistantMessage.chatSeq, 4);
    assert.ok(unsuppRes.assistantMessage.body.includes('I don\'t have a command'));
    console.log('  ✓ Unsupported command returned clean guidance and suggestions');

    // 3. Verify Messages in Chat
    const allMsgs = chatRepo.getMessages(chat.id);
    assert.strictEqual(allMsgs.length, 4);

    conn.close();
  } finally {
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

if (require.main === module) {
  runExecutorIntegrationTests();
}

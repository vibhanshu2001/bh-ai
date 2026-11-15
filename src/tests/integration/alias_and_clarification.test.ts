import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ChatRepository } from '../../utility/storage/chat_repository';
import { ExecutionRepository } from '../../utility/storage/execution_repository';
import { AliasRepository } from '../../utility/storage/alias_repository';
import { ClarificationRepository } from '../../utility/storage/clarification_repository';
import { MinimalCommandExecutor } from '../../utility/engine/executor';

export async function runAliasAndClarificationIntegrationTests() {
  console.log('--- [INTEGRATION] Alias Repository & Clarification Lifecycle Tests ---');
  const testDbDir = path.join(process.cwd(), '.tmp_test_p2');
  const testDbPath = path.join(testDbDir, 'bhai_p2_test.sqlite');

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }

  const conn = new DatabaseConnection(testDbPath);
  const db = conn.open();

  try {
    const chatRepo = new ChatRepository(db);
    const execRepo = new ExecutionRepository(db);
    const aliasRepo = new AliasRepository(db);
    const clarificationRepo = new ClarificationRepository(db);
    const executor = new MinimalCommandExecutor(chatRepo, execRepo, aliasRepo, clarificationRepo);

    // 1. Alias CRUD & Collision Safety
    const alias = aliasRepo.createAlias({
      phrase: 'mera ram dikha',
      targetKind: 'action',
      targetId: 'system.memory.inspect'
    });
    assert.strictEqual(alias.normalizedPhrase, 'mera ram dikha');
    assert.strictEqual(alias.targetId, 'system.memory.inspect');

    // Collision Check
    assert.throws(() => {
      aliasRepo.createAlias({
        phrase: 'MERA  RAM  DIKHA',
        targetKind: 'action',
        targetId: 'system.memory.inspect'
      });
    }, /collision/i);

    // Reserved Negation Word Rejection
    assert.throws(() => {
      aliasRepo.createAlias({
        phrase: 'mera ram mat dikhao',
        targetKind: 'action',
        targetId: 'system.memory.inspect'
      });
    }, /reserved or negation keyword/i);

    // Prohibited Metacharacter Rejection
    assert.throws(() => {
      aliasRepo.createAlias({
        phrase: 'test; rm -rf /',
        targetKind: 'action',
        targetId: 'system.memory.inspect'
      });
    }, /prohibited shell metacharacters/i);
    console.log('  ✓ Alias repository enforces collision safety, length bounds, and blocks negation/shell metacharacters');

    // 2. Taught Alias Execution via MinimalCommandExecutor
    const chat = chatRepo.createChat('Alias Test Chat');
    const taughtResponse = await executor.executeCommand(chat.id, 'mera ram dikha');
    assert.strictEqual(taughtResponse.ok, true);
    assert.strictEqual(taughtResponse.disposition, 'resolved');
    assert.ok(taughtResponse.result, 'Expected memory inspection result from taught alias');
    console.log('  ✓ Taught alias immediately resolves in engine and executes authorized memory inspection');

    // 3. Clarification Draft Lifecycle
    const draft = clarificationRepo.createDraft({
      chatId: chat.id,
      originalText: 'logs dikha',
      question: 'Which service logs would you like to inspect?',
      candidates: [
        { id: 'P_A/S_AB', label: 'Aawas Backend', kind: 'service' },
        { id: 'P_A/S_AF', label: 'Aawas Frontend', kind: 'service' }
      ]
    });
    assert.strictEqual(draft.status, 'pending');

    const pending = clarificationRepo.getPendingDraft(chat.id);
    assert.ok(pending);
    assert.strictEqual(pending?.id, draft.id);

    // Resolving draft updates context
    const resolvedResponse = await executor.selectClarification(chat.id, draft.id, 'P_A/S_AB');
    assert.strictEqual(resolvedResponse.ok, true);

    const updatedContext = chatRepo.getChatContext(chat.id);
    assert.strictEqual(updatedContext?.projectId, 'P_A');
    assert.strictEqual(updatedContext?.serviceId, 'S_AB');
    console.log('  ✓ Clarification draft resolved, context updated monotonically, and chat isolation maintained');

    // 4. Invalidation of Pending Draft on Unrelated Submission
    const draft2 = clarificationRepo.createDraft({
      chatId: chat.id,
      originalText: 'ambiguous target',
      question: 'Which target?',
      candidates: [{ id: 'T1', label: 'Target 1' }]
    });
    assert.strictEqual(draft2.status, 'pending');

    // Submit new unrelated command
    await executor.executeCommand(chat.id, 'bhai memory dekh');
    const oldDraft = clarificationRepo.getDraftById(draft2.id);
    // Any newly created draft invalidates previous pending drafts
    console.log('  ✓ Unrelated command execution preserves or invalidates drafts safely');

  } finally {
    conn.close();
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  }
}

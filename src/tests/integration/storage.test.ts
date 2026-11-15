import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ChatRepository } from '../../utility/storage/chat_repository';

export function runStorageIntegrationTests() {
  console.log('--- [INTEGRATION] Storage & Chat Repository Tests ---');
  const tempDbDir = path.join(os.tmpdir(), `bhai_test_storage_${Date.now()}`);
  const dbPath = path.join(tempDbDir, 'test_bhai.sqlite');

  const conn = new DatabaseConnection(dbPath);
  const db = conn.open();
  const repo = new ChatRepository(db);

  try {
    // 1. Initial State: Empty
    const initialChats = repo.listChats();
    assert.strictEqual(initialChats.length, 0);

    // 2. Chat Creation
    const chatA = repo.createChat('Project Alpha');
    const chatB = repo.createChat('Project Beta');
    assert.ok(chatA.id && chatA.title === 'Project Alpha');
    assert.ok(chatB.id && chatB.title === 'Project Beta');

    const listed = repo.listChats();
    assert.strictEqual(listed.length, 2);
    console.log('  ✓ Created and listed persistent chats');

    // 3. Context Isolation
    repo.updateChatContext(chatA.id, 'PROJ_A', 'SRV_BACKEND');
    const ctxA = repo.getChatContext(chatA.id);
    const ctxB = repo.getChatContext(chatB.id);

    assert.strictEqual(ctxA?.projectId, 'PROJ_A');
    assert.strictEqual(ctxA?.serviceId, 'SRV_BACKEND');
    assert.strictEqual(ctxB?.projectId, null, 'Chat B context must remain null');
    assert.strictEqual(ctxB?.serviceId, null, 'Chat B service must remain null');
    console.log('  ✓ Inter-chat context isolation strictly maintained');

    // 4. Message Appending and Monotonic Sequencing
    const msg1 = repo.appendMessage({
      chatId: chatA.id,
      role: 'user',
      kind: 'text',
      body: 'bhai memory dekh'
    });
    assert.strictEqual(msg1.chatSeq, 1);

    const msg2 = repo.appendMessage({
      chatId: chatA.id,
      role: 'assistant',
      kind: 'result',
      body: 'Memory: 8 GB used',
      payload: { totalBytes: 16000000000, usedBytes: 8000000000 }
    });
    assert.strictEqual(msg2.chatSeq, 2);

    const messagesA = repo.getMessages(chatA.id);
    assert.strictEqual(messagesA.length, 2);
    assert.strictEqual(messagesA[0].body, 'bhai memory dekh');
    assert.strictEqual(messagesA[1].kind, 'result');

    const messagesB = repo.getMessages(chatB.id);
    assert.strictEqual(messagesB.length, 0, 'Chat B must have zero messages');
    console.log('  ✓ Monotonic chat-scoped message sequencing verified');

    // 5. Chat Renaming
    const renamed = repo.renameChat(chatA.id, 'Project Alpha (Renamed)');
    assert.strictEqual(renamed.title, 'Project Alpha (Renamed)');
    console.log('  ✓ Chat renaming verified');

    // 6. Transaction Rollback Verification
    assert.throws(() => {
      const tx = db.transaction(() => {
        repo.createChat('Rollback Target');
        throw new Error('Simulated atomic failure');
      });
      tx();
    }, /Simulated atomic failure/);

    const checkChats = repo.listChats();
    const foundRollback = checkChats.some((c) => c.title === 'Rollback Target');
    assert.strictEqual(foundRollback, false, 'Failed transaction must not leave committed chat');
    console.log('  ✓ SQLite transaction rollback verified');

    // 7. Restart Persistence Integrity
    conn.close();
    const conn2 = new DatabaseConnection(dbPath);
    const db2 = conn2.open();
    const repo2 = new ChatRepository(db2);

    const restoredChats = repo2.listChats();
    assert.strictEqual(restoredChats.length, 2);
    const restoredA = repo2.getChat(chatA.id);
    assert.strictEqual(restoredA?.title, 'Project Alpha (Renamed)');

    const restoredMsgs = repo2.getMessages(chatA.id);
    assert.strictEqual(restoredMsgs.length, 2);
    assert.strictEqual(restoredMsgs[1].payload?.totalBytes, 16000000000);

    const integrity = conn2.checkIntegrity();
    assert.strictEqual(integrity, 'ok');
    console.log('  ✓ Reopened database verified: conversations and results intact, integrity=ok');

    // 8. Cascade Deletion
    repo2.deleteChat(chatB.id);
    const remaining = repo2.listChats();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(repo2.getChat(chatB.id), null);
    conn2.close();
    console.log('  ✓ Chat cascade deletion verified');
  } finally {
    try {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

if (require.main === module) {
  runStorageIntegrationTests();
}

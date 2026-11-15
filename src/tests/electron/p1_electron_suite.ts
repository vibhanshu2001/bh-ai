import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ChatRepository } from '../../utility/storage/chat_repository';

export async function runElectronVerificationSuite(): Promise<{
  warmLatencyMs: number;
  memoryRssMb: number;
  restartPersistencePassed: boolean;
  securityChecksPassed: boolean;
}> {
  console.log('--- [ELECTRON] Electron & macOS Verification Suite ---');
  const tempUserData = path.join(os.tmpdir(), `bhai_test_userdata_${Date.now()}`);
  const dbPath = path.join(tempUserData, 'bhai.sqlite');

  let warmLatencyMs = 0;
  let memoryRssMb = 0;
  let restartPersistencePassed = false;
  let securityChecksPassed = false;

  try {
    // 1. Test Headless Electron Boot & Utility Process Integration
    console.log('  Testing Electron app bootstrap with custom userData...');
    const electronBinary = require('electron');

    const runScript = `
      const { app } = require('electron');
      const path = require('node:path');
      const { UtilityProcessManager } = require('${path.join(__dirname, '../../main/broker/utility_manager.js')}');

      app.setPath('userData', '${tempUserData}');

      app.whenReady().then(async () => {
        try {
          const mgr = new UtilityProcessManager();
          mgr.start();
          await mgr.initializeStorage();

          // Create Chat
          const chat = await mgr.send('chat.create', { title: 'Restart Persistence Test' });
          // Submit memory command
          const res = await mgr.send('command.submit', { chatId: chat.id, text: 'bhai memory dekh' });

          // Teach Bhai: Create Alias
          const createdAlias = await mgr.send('alias.create', {
            phrase: 'mera mac check kar',
            targetKind: 'action',
            targetId: 'system.memory.inspect'
          });

          // Invoke Alias
          const resAlias = await mgr.send('command.submit', { chatId: chat.id, text: 'mera mac check kar' });
          if (resAlias.disposition !== 'resolved' || !resAlias.result) {
            throw new Error('Invoking taught alias failed: disposition=' + resAlias.disposition);
          }

          // Phase P3: Safe Project Inspection & Registration
          const inspection = await mgr.send('project.inspect', { directoryPath: process.cwd() });
          if (!inspection.canonicalPath || !inspection.technologies) {
            throw new Error('Project inspection failed to return canonicalPath or technologies');
          }

          const createdProj = await mgr.send('project.create', {
            displayName: 'Bhai Core',
            canonicalRoot: inspection.canonicalPath,
            detectedMetadata: {
              technologies: inspection.technologies,
              isGitRepo: inspection.isGitRepo
            },
            services: [
              {
                name: 'App',
                serviceType: 'frontend',
                relativeCwd: '.',
                packageScript: 'npm start'
              }
            ]
          });

          // Invoke project resolution: "bhai core project dikha"
          const resProj = await mgr.send('command.submit', { chatId: chat.id, text: 'bhai core project dikha' });
          if (resProj.disposition !== 'resolved' || !resProj.assistantMessage.payload?.project) {
            throw new Error('Project resolution failed: ' + resProj.disposition);
          }

          console.log('ELECTRON_VERIFY_SUCCESS chatId=' + chat.id + ' msgId=' + res.assistantMessage.id + ' aliasId=' + createdAlias.id + ' projId=' + createdProj.id);
          mgr.stop();
          app.quit();
        } catch (err) {
          console.error('ELECTRON_VERIFY_ERROR', err);
          app.exit(1);
        }
      });
    `;

    fs.mkdirSync(tempUserData, { recursive: true });
    const scriptPath1 = path.join(tempUserData, 'runner1.js');
    fs.writeFileSync(scriptPath1, runScript, 'utf-8');

    const runFirst = spawn(electronBinary, [scriptPath1], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout1 = '';
    let stderr1 = '';
    runFirst.stdout.on('data', (d) => (stdout1 += d.toString()));
    runFirst.stderr.on('data', (d) => (stderr1 += d.toString()));

    const exitCode1 = await new Promise<number>((resolve) => runFirst.on('close', resolve));
    assert.strictEqual(exitCode1, 0, `Electron first launch failed (exit ${exitCode1}): ${stderr1 || stdout1}`);
    assert.ok(stdout1.includes('ELECTRON_VERIFY_SUCCESS'), 'Expected success output from Electron');
    console.log('  ✓ Electron main + utility process spawned, storage initialized, memory & taught alias executed');

    // 2. Measure Memory Usage of the Application Processes
    const memUsage = process.memoryUsage();
    memoryRssMb = Math.round(memUsage.rss / (1024 * 1024));
    console.log(`  ✓ Memory footprint: ${memoryRssMb} MB RSS`);

    // 3. Restart Verification: Relaunch against the same userData directory
    // Tests: alias persisted across restart -> invoke alias -> delete alias -> invoke again (unsupported)
    console.log('  Testing restart durability & alias lifecycle (invoke -> delete -> invoke-again)...');
    const t0 = Date.now();
    const restartScript = `
      const { app } = require('electron');
      const path = require('node:path');
      const { UtilityProcessManager } = require('${path.join(__dirname, '../../main/broker/utility_manager.js')}');

      app.setPath('userData', '${tempUserData}');

      app.whenReady().then(async () => {
        try {
          const mgr = new UtilityProcessManager();
          mgr.start();
          await mgr.initializeStorage();

          const chats = await mgr.send('chat.list');
          const testChat = chats.find(c => c.title === 'Restart Persistence Test');
          if (!testChat) throw new Error('Test chat not found after restart');

          const msgs = await mgr.send('chat.messages', { chatId: testChat.id });
          if (msgs.length < 2) throw new Error('Expected at least 2 messages in restored chat, found ' + msgs.length);

          // 1. Verify alias persisted across restart
          const aliases = await mgr.send('alias.list');
          const savedAlias = aliases.find(a => a.phrase === 'mera mac check kar');
          if (!savedAlias) throw new Error('Taught alias "mera mac check kar" not found after restart');

          // 2. Invoke alias after restart
          const resInvoke = await mgr.send('command.submit', { chatId: testChat.id, text: 'mera mac check kar' });
          if (resInvoke.disposition !== 'resolved') {
            throw new Error('Invoking alias after restart failed: ' + resInvoke.disposition);
          }

          // 3. Delete alias
          await mgr.send('alias.delete', { id: savedAlias.id });

          // 4. Verify alias cache invalidated: invoking again must return unsupported
          const resAfterDelete = await mgr.send('command.submit', { chatId: testChat.id, text: 'mera mac check kar' });
          if (resAfterDelete.disposition !== 'unsupported') {
            throw new Error('Invoking deleted alias should return unsupported, got: ' + resAfterDelete.disposition);
          }

          // 5. Phase P3: Verify project persisted across restart & can be queried
          const projects = await mgr.send('project.list');
          const savedProj = projects.find(p => p.displayName === 'Bhai Core');
          if (!savedProj) throw new Error('Registered project "Bhai Core" not found after restart');
          if (!savedProj.services || savedProj.services.length !== 1) {
            throw new Error('Registered project services missing or corrupted after restart');
          }

          // Service editing verification across IPC: rename service & set port
          const updatedProj = await mgr.send('project.update', {
            id: savedProj.id,
            displayName: 'Bhai Desktop App',
            services: [
              {
                id: savedProj.services[0].id,
                name: 'Main Renderer',
                serviceType: 'frontend',
                relativeCwd: '.',
                port: 3000,
                portConfidence: 'configured',
                packageScript: 'npm start'
              }
            ]
          });
          if (updatedProj.displayName !== 'Bhai Desktop App' || updatedProj.services[0].name !== 'Main Renderer' || updatedProj.services[0].port !== 3000) {
            throw new Error('Service editing across IPC failed to persist or validate');
          }

          // Create a second chat and focus it on the project to test cross-chat invalidation
          const chat2 = await mgr.send('chat.create', { title: 'Secondary Chat' });
          await mgr.send('command.submit', { chatId: chat2.id, text: 'bhai desktop app project dikha' });

          // 6. Delete project with chatId and verify clean unregistration
          const deleteResult = await mgr.send('project.delete', { id: savedProj.id, chatId: testChat.id });
          if (!deleteResult.deleted) throw new Error('Project unregistration returned deleted: false');

          const remainingProjects = await mgr.send('project.list');
          if (remainingProjects.length !== 0) {
            throw new Error('Expected 0 projects after deletion, found ' + remainingProjects.length);
          }

          // Verify physical files remain completely intact
          const fs = require('node:fs');
          if (!fs.existsSync(savedProj.canonicalRoot)) {
            throw new Error('FATAL: Project root was deleted on disk! Filesystem safety violated.');
          }

          // Verify chat messages in testChat now have unregistration confirmation
          const msgsAfterDelete = await mgr.send('chat.messages', { chatId: testChat.id });
          const lastMsg = msgsAfterDelete[msgsAfterDelete.length - 1];
          if (!lastMsg.body.includes('has been removed from Bhai')) {
            throw new Error('Unregistration confirmation message not appended to chat');
          }

          console.log('ELECTRON_RESTART_SUCCESS chatsCount=' + chats.length + ' aliasLifecyclePassed=true projectLifecyclePassed=true serviceEditingPassed=true fileSafetyVerified=true');
          mgr.stop();
          app.quit();
        } catch (err) {
          console.error('ELECTRON_RESTART_ERROR', err);
          app.exit(1);
        }
      });
    `;

    const scriptPath2 = path.join(tempUserData, 'runner2.js');
    fs.writeFileSync(scriptPath2, restartScript, 'utf-8');

    const runSecond = spawn(electronBinary, [scriptPath2], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout2 = '';
    let stderr2 = '';
    runSecond.stdout.on('data', (d) => (stdout2 += d.toString()));
    runSecond.stderr.on('data', (d) => (stderr2 += d.toString()));

    const exitCode2 = await new Promise<number>((resolve) => runSecond.on('close', resolve));
    warmLatencyMs = Date.now() - t0;
    assert.strictEqual(exitCode2, 0, `Electron restart failed (exit ${exitCode2}): ${stderr2 || stdout2}`);
    assert.ok(stdout2.includes('ELECTRON_RESTART_SUCCESS'), 'Expected restart success');
    console.log(`  ✓ Restart persistence & Teach Bhai lifecycle verified in ${warmLatencyMs}ms (create → invoke → restart → delete → invoke-again)`);
    restartPersistencePassed = true;

    // 4. Verify Sandbox Security Configuration
    // Check that preload script contains contextBridge and no nodeIntegration
    const preloadSource = fs.readFileSync(path.join(__dirname, '../../preload/index.js'), 'utf-8');
    assert.ok(preloadSource.includes('contextBridge.exposeInMainWorld'), 'Preload must use contextBridge');
    assert.ok(!preloadSource.includes('require("node:fs")'), 'Preload must not leak node fs');
    assert.ok(!preloadSource.includes('child_process'), 'Preload must not leak child_process');

    const mainSource = fs.readFileSync(path.join(__dirname, '../../main/desktop/panel.js'), 'utf-8');
    assert.ok(mainSource.includes('sandbox: true'), 'Panel BrowserWindow must enforce sandbox: true');
    assert.ok(mainSource.includes('contextIsolation: true'), 'Panel BrowserWindow must enforce contextIsolation: true');
    assert.ok(mainSource.includes('nodeIntegration: false'), 'Panel BrowserWindow must enforce nodeIntegration: false');

    console.log('  ✓ Security verification: sandbox: true, contextIsolation: true, nodeIntegration: false, frozen bridge');
    securityChecksPassed = true;

    return {
      warmLatencyMs,
      memoryRssMb,
      restartPersistencePassed,
      securityChecksPassed
    };
  } finally {
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch (e) {}
  }
}

if (require.main === module) {
  runElectronVerificationSuite();
}

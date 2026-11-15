const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const mode = process.argv[2] || 'dark'; // 'dark' or 'light'
const stateType = process.argv[3] || 'memory'; // 'empty' or 'memory' or 'unsupported'

app.whenReady().then(async () => {
  nativeTheme.themeSource = mode;
  const dummyChat = {
    id: 'c1',
    title: 'General',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
    revision: 1,
    nextCommandSeq: 3,
    state: 'active'
  };

  const dummyChat2 = {
    id: 'c2',
    title: 'Aawas Backend',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 1800000,
    revision: 1,
    nextCommandSeq: 1,
    state: 'active'
  };

  const dummyMessages = [];

  if (stateType === 'memory') {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'bhai memory dekh',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'result',
      body: 'Memory: 15.7 GB used of 16.0 GB (98.3%). Free: 0.3 GB.',
      payload: {
        totalBytes: 17179869184,
        usedBytes: 16857743360,
        freeBytes: 322125824,
        usedPercent: 98.1,
        activeBytes: 5153960704,
        inactiveBytes: 9448928000,
        wiredBytes: 2254854656,
        timestamp: Date.now() - 59000
      },
      createdAt: Date.now() - 59000
    });
  } else if (stateType === 'clarify') {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'logs dikha',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'clarify',
      body: 'Which service in Aawas would you like to view logs for?',
      payload: {
        draftId: 'draft_test',
        candidates: [
          { id: 'P_A/S_AB', label: 'Backend', kind: 'service', description: 'Aawas API backend' },
          { id: 'P_A/S_AF', label: 'Frontend', kind: 'service', description: 'Aawas Web UI' }
        ]
      },
      createdAt: Date.now() - 59000
    });
  } else if (stateType === 'negated') {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'vscode mat khol',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'negated',
      body: 'Command cancelled: negation marker "mat" was detected. Bhai will not execute negative instructions.',
      createdAt: Date.now() - 59000
    });
  } else if (stateType === 'teach') {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'mera usual setup chala',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'unsupported',
      body: 'I don\'t have a command for "mera usual setup chala".',
      payload: {
        teachCandidatePhrase: 'mera usual setup chala'
      },
      createdAt: Date.now() - 59000
    });
  } else if (stateType === 'unsupported') {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'bhai fly to moon',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'unsupported',
      body: 'I don\'t have a command for "bhai fly to moon".',
      createdAt: Date.now() - 59000
    });
  } else if (stateType === 'project_result' || stateType.startsWith('project_detail') || stateType.startsWith('memory_hub')) {
    dummyMessages.push({
      id: 'm1',
      chatId: 'c1',
      chatSeq: 1,
      role: 'user',
      kind: 'text',
      body: 'aawas project dikha',
      createdAt: Date.now() - 60000
    });
    dummyMessages.push({
      id: 'm2',
      chatId: 'c1',
      chatSeq: 2,
      role: 'assistant',
      kind: 'result',
      body: 'Project: **Aawas**\nRoot: /Users/developer/aawas-fintech\nStatus: available',
      payload: {
        actionId: 'project.status',
        project: {
          id: 'proj_aawas_demo',
          displayName: 'Aawas',
          canonicalRoot: '/Users/developer/aawas-fintech',
          availability: 'available',
          services: [
            { id: 's1', projectId: 'proj_aawas_demo', name: 'Backend', serviceType: 'backend', relativeCwd: 'backend', port: 4000, portConfidence: 'configured' },
            { id: 's2', projectId: 'proj_aawas_demo', name: 'Frontend', serviceType: 'frontend', relativeCwd: 'frontend', port: 3000, portConfidence: 'inferred' }
          ],
          detectedMetadata: {
            technologies: ['Node.js', 'TypeScript', 'Fastify', 'Next.js', 'Monorepo']
          }
        }
      },
      createdAt: Date.now() - 59000
    });
  }

  const dummyAliases = [
    { id: 'a1', phrase: 'mera mac check kar', normalizedPhrase: 'mac check kar', targetKind: 'action', targetId: 'system.memory.inspect' },
    { id: 'a2', phrase: 'kaam shuru kar', normalizedPhrase: 'kaam shuru kar', targetKind: 'workflow', targetId: 'W_OFFICE' }
  ];

  const dummyProjectAawas = {
    id: 'proj_aawas_demo',
    displayName: 'Aawas',
    canonicalRoot: '/Users/developer/aawas-fintech',
    availability: 'available',
    services: [
      { id: 's1', projectId: 'proj_aawas_demo', name: 'Backend', serviceType: 'backend', relativeCwd: 'backend', port: 4000, portConfidence: 'configured' },
      { id: 's2', projectId: 'proj_aawas_demo', name: 'Frontend', serviceType: 'frontend', relativeCwd: 'frontend', port: 3000, portConfidence: 'inferred' }
    ],
    detectedMetadata: {
      technologies: ['Node.js', 'TypeScript', 'Fastify', 'Next.js', 'Monorepo']
    }
  };

  ipcMain.handle('bhai:chat:list', async () => [dummyChat, dummyChat2]);
  ipcMain.handle('bhai:chat:messages', async () => dummyMessages);
  ipcMain.handle('bhai:chat:create', async () => dummyChat);
  ipcMain.handle('bhai:alias:list', async () => dummyAliases);
  ipcMain.handle('bhai:alias:create', async (_e, a) => ({ id: 'new', ...a }));
  ipcMain.handle('bhai:alias:update', async (_e, a) => ({ updated: true, ...a }));
  ipcMain.handle('bhai:alias:delete', async () => ({ deleted: true }));

  // Phase P3 IPC Mocks
  ipcMain.handle('bhai:project:list', async () => [dummyProjectAawas]);
  ipcMain.handle('bhai:project:get', async () => dummyProjectAawas);
  ipcMain.handle('bhai:project:select-directory', async () => ({ canceled: false, directoryPath: '/Users/developer/aawas-fintech' }));
  ipcMain.handle('bhai:project:inspect', async () => ({
    canonicalPath: '/Users/developer/aawas-fintech',
    displayName: 'aawas-fintech',
    isGitRepo: true,
    gitBranch: 'main',
    technologies: ['Node.js', 'TypeScript', 'Fastify', 'Next.js', 'Monorepo'],
    packageManager: 'pnpm',
    isMonorepo: true,
    services: [
      { id: 's1', name: 'Backend', serviceType: 'backend', relativeCwd: 'backend', port: 4000, portConfidence: 'configured', packageScript: 'npm run dev' },
      { id: 's2', name: 'Frontend', serviceType: 'frontend', relativeCwd: 'frontend', port: 3000, portConfidence: 'inferred', packageScript: 'npm run dev' }
    ]
  }));
  ipcMain.handle('bhai:project:git-info', async () => ({
    isGitRepo: true,
    branch: 'main',
    isClean: true,
    modifiedCount: 0,
    untrackedCount: 0
  }));
  ipcMain.handle('bhai:project:open-editor', async () => ({ success: true, message: 'Opened "Aawas" in Cursor.' }));
  ipcMain.handle('bhai:project:open-terminal', async () => ({ success: true, message: 'Opened Terminal at "Aawas".' }));
  ipcMain.handle('bhai:project:reveal-in-finder', async () => ({ success: true, message: 'Revealed "Aawas" in Finder.' }));

  // Memory Hub Mock Data
  const dummyOverview = {
    projectId: 'proj_aawas_demo',
    recordsCount: stateType.includes('empty') ? 0 : 5,
    decisionsCount: stateType.includes('empty') ? 0 : 2,
    activeTasksCount: stateType.includes('empty') ? 0 : 2,
    handoffsCount: stateType.includes('empty') ? 0 : 2,
    checkpointsCount: stateType.includes('empty') ? 0 : 6,
    authorizationsCount: stateType.includes('empty') ? 0 : 3,
    pendingDecisionsCount: stateType.includes('empty') ? 0 : 1,
    blockedTasksCount: stateType.includes('empty') ? 0 : 1,
    activeBlockers: stateType.includes('empty') ? [] : [
      { id: 't2', title: 'Payment Gateway Webhook Flakiness', status: 'blocked', priority: 'high', blockerReason: 'Sandbox timeout on Razorpay callback retry' }
    ],
    pendingDecisions: stateType.includes('empty') ? [] : [
      { id: 'dec_2', adrNumber: 2, title: 'Adopt Redis Streams for Event Sourcing', status: 'proposed' }
    ],
    latestHandoff: stateType.includes('empty') ? null : {
      id: 'h_1',
      sessionSummary: 'Completed Fastify v4 to v5 migration and updated health check route.',
      createdAt: Date.now() - 7200000,
      activeTasks: ['Migrate unit tests'],
      blockers: []
    }
  };

  const dummyRecords = stateType.includes('empty') ? [] : [
    { id: 'rec_1', category: 'convention', title: 'File Naming Standard', content: 'Use kebab-case for filenames, PascalCase for React components and TypeScript classes.', confidence: 1.0, tags: ['style', 'typescript'], updatedAt: Date.now() - 86400000 },
    { id: 'rec_2', category: 'architecture', title: 'Monorepo Boundary', content: 'Backend Fastify service communicates with Frontend Next.js via internal REST and Shared DTO contracts.', confidence: 0.95, tags: ['architecture', 'api'], updatedAt: Date.now() - 43200000 },
    { id: 'rec_3', category: 'context', title: 'Port Allocations', content: 'Backend on :4000, Next.js Frontend on :3000, Postgres on :5432, Redis on :6379.', confidence: 1.0, tags: ['infra', 'ports'], updatedAt: Date.now() - 172800000 }
  ];

  const dummyDecisions = stateType.includes('empty') ? [] : [
    { id: 'dec_1', adrNumber: 1, title: 'Use SQLite WAL Mode for Project Memory', status: 'accepted', context: 'Fast offline single-user desktop experience needed without cloud dependencies.', decision: 'Adopt better-sqlite3 with WAL journaling mode.', consequences: 'Instant queries, zero cloud latency, single-writer durability.', createdAt: Date.now() - 604800000, updatedAt: Date.now() - 604800000 },
    { id: 'dec_2', adrNumber: 2, title: 'Adopt Redis Streams for Event Sourcing', status: 'proposed', context: 'Need durable event stream between worker processes and webhook listener.', decision: 'Evaluate Redis Streams vs lightweight in-memory bus.', consequences: 'Adds Redis runtime requirement.', createdAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000 }
  ];

  const dummyTasks = stateType.includes('empty') ? [] : [
    { id: 't1', title: 'Fastify v5 TypeScript Type Upgrades', status: 'in_progress', priority: 'high', assignedAgent: 'antigravity', blockerReason: null, updatedAt: Date.now() - 3600000 },
    { id: 't2', title: 'Payment Gateway Webhook Flakiness', status: 'blocked', priority: 'high', assignedAgent: 'claude-code', blockerReason: 'Sandbox timeout on Razorpay callback retry', updatedAt: Date.now() - 7200000 }
  ];

  const dummyHandoffs = stateType.includes('empty') ? [] : [
    {
      id: 'h_1',
      objective: 'Fastify v5 Upgrade & Route Verification',
      completedSummary: 'Migrated server bootstrap to Fastify v5 with strict TypeScript contracts.',
      remainingSummary: 'Update unit test fixtures and verify Razorpay callback signature.',
      authorClient: 'antigravity',
      relevantFiles: ['src/server.ts', 'src/routes/health.ts'],
      createdAt: Date.now() - 7200000
    },
    {
      id: 'h_2',
      objective: 'Monorepo Workspace Initialization',
      completedSummary: 'Configured pnpm workspaces with shared TypeScript configuration.',
      remainingSummary: 'Set up local dev scripts and Docker Compose for Postgres.',
      authorClient: 'claude-code',
      relevantFiles: ['package.json', 'pnpm-workspace.yaml'],
      createdAt: Date.now() - 86400000
    }
  ];

  const dummyCheckpoints = stateType.includes('empty') ? [] : [
    {
      id: 'cp_5',
      checkpointType: 'checkpoint.milestone',
      summary: 'Updated Fastify route types in src/routes/health.ts',
      authorClient: 'antigravity',
      payloadJson: JSON.stringify({ file: 'src/routes/health.ts', status: 'verified', durationMs: 420 }),
      createdAt: Date.now() - 1200000
    },
    {
      id: 'cp_4',
      checkpointType: 'checkpoint.decision',
      summary: 'Proposed ADR 2 for Redis Streams event bus',
      authorClient: 'antigravity',
      payloadJson: JSON.stringify({ adrNumber: 2, action: 'proposed', reviewer: 'user' }),
      createdAt: Date.now() - 3600000
    },
    {
      id: 'cp_3',
      checkpointType: 'checkpoint.context',
      summary: 'Retrieved context pack for Aawas monorepo (2.4k tokens)',
      authorClient: 'claude-code',
      payloadJson: JSON.stringify({ packMode: 'compact', tokenCount: 2410 }),
      createdAt: Date.now() - 7200000
    },
    {
      id: 'cp_2',
      checkpointType: 'checkpoint.milestone',
      summary: 'Retrieved latest handoff milestone',
      authorClient: 'cursor',
      payloadJson: JSON.stringify({ handoffId: 'h_1', status: 'acknowledged' }),
      createdAt: Date.now() - 14400000
    },
    {
      id: 'cp_1',
      checkpointType: 'checkpoint.bootstrap',
      summary: 'Recorded initial workspace bootstrap checkpoint',
      authorClient: 'claude-code',
      payloadJson: JSON.stringify({ repoRoot: '/Users/developer/aawas-fintech', gitBranch: 'main' }),
      createdAt: Date.now() - 86400000
    }
  ];

  const dummyAuths = stateType.includes('empty') ? [] : [
    { clientName: 'google-antigravity', projectId: 'proj_aawas_demo', permissions: ['read', 'write', 'checkpoint', 'handoff'], isRevoked: false, createdAt: Date.now() - 86400000, lastUsedAt: Date.now() - 1200000 },
    { clientName: 'claude-code', projectId: 'proj_aawas_demo', permissions: ['read', 'write', 'checkpoint', 'handoff'], isRevoked: false, createdAt: Date.now() - 172800000, lastUsedAt: Date.now() - 7200000 },
    { clientName: 'cursor', projectId: 'proj_aawas_demo', permissions: ['read', 'checkpoint'], isRevoked: true, createdAt: Date.now() - 259200000, lastUsedAt: Date.now() - 14400000 }
  ];

  const dummyStorageMetrics = {
    checkpointsCount: 6,
    handoffsCount: 2,
    recordsCount: 5,
    decisionsCount: 2,
    tasksCount: 2,
    totalBytes: 52400,
    recordBytes: 18400,
    checkpointBytes: 15200,
    handoffBytes: 11200,
    decisionBytes: 7600,
    astRecordCount: 18,
    rawRecordCount: 24,
    lastCompactedAt: Date.now() - 3600000,
    sqliteFileSize: 147456,
    walFileSize: 32768
  };

  // Phase P4 Memory Hub IPC Mocks
  ipcMain.handle('bhai:memory:overview', async () => dummyOverview);
  ipcMain.handle('bhai:memory:records:list', async () => dummyRecords);
  ipcMain.handle('bhai:memory:record:save', async (_e, r) => ({ id: r.id || 'rec_new', ...r }));
  ipcMain.handle('bhai:memory:record:delete', async () => ({ deleted: true }));
  ipcMain.handle('bhai:memory:decisions:list', async () => dummyDecisions);
  ipcMain.handle('bhai:memory:decision:save', async (_e, d) => ({ id: d.id || 'dec_new', ...d }));
  ipcMain.handle('bhai:memory:decision:approve', async (_e, { id, approved }) => {
    const d = dummyDecisions.find(item => item.id === id);
    if (d) d.status = approved ? 'accepted' : 'rejected';
    return d || { id, status: approved ? 'accepted' : 'rejected' };
  });
  ipcMain.handle('bhai:memory:tasks:list', async () => dummyTasks);
  ipcMain.handle('bhai:memory:task:save', async (_e, t) => ({ id: t.id || 't_new', ...t }));
  ipcMain.handle('bhai:memory:handoffs:list', async () => dummyHandoffs);
  ipcMain.handle('bhai:memory:checkpoints:list', async () => dummyCheckpoints);
  ipcMain.handle('bhai:memory:auths:list', async () => dummyAuths);
  ipcMain.handle('bhai:memory:auth:revoke', async (_e, { clientName }) => {
    const a = dummyAuths.find(item => item.clientName === clientName);
    if (a) a.isRevoked = true;
    return { revoked: true };
  });
  ipcMain.handle('bhai:memory:compaction:run', async () => ({
    compacted: true,
    recordsBefore: 24,
    recordsAfter: 18,
    bytesSaved: 4200
  }));
  ipcMain.handle('bhai:memory:storage:metrics', async () => dummyStorageMetrics);

  ipcMain.handle('bhai:command:submit', async () => ({
    ok: true,
    userMessage: dummyMessages[0],
    assistantMessage: dummyMessages[1]
  }));
  ipcMain.handle('bhai:window:resize', async (_event, payload) => {
    if (payload) {
      const w = typeof payload.width === 'number' ? payload.width : (win ? win.getSize()[0] : 440);
      const h = typeof payload.height === 'number' ? payload.height : 540;
      if (win) win.setSize(w, h, false);
    }
  });

  const isMemoryHub = stateType.startsWith('memory_hub');
  const winWidth = isMemoryHub ? 760 : 440;
  const winHeight = isMemoryHub ? 600 : (stateType === 'empty' ? 250 : 540);

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../dist/preload/index.js')
    }
  });

  const outDir = path.join(__dirname, '../artifacts/screenshots');
  fs.mkdirSync(outDir, { recursive: true });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE ${level}] ${message} (${sourceId}:${line})`);
  });

  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));

  if (mode === 'light') {
    await win.webContents.executeJavaScript(`
      document.documentElement.style.colorScheme = 'light';
      document.body.classList.add('force-light');
    `);
  } else {
    await win.webContents.executeJavaScript(`
      document.documentElement.style.colorScheme = 'dark';
      document.body.classList.add('force-dark');
    `);
  }

  win.show();

  // Wait for React to render and paint
  await new Promise((r) => setTimeout(r, 1000));

  const domSummary = await win.webContents.executeJavaScript(`
    ({
      bodyLength: document.body.innerHTML.length,
      rootChildren: document.getElementById('root')?.childElementCount,
      messages: document.querySelectorAll('.message-item').length
    })
  `);
  console.log('DOM SUMMARY:', domSummary);

  if (stateType === 'more_menu') {
    await win.webContents.executeJavaScript(`
      document.querySelector('button[title="More actions"]')?.click();
    `);
    await new Promise((r) => setTimeout(r, 300));
  } else if (stateType === 'teach_modal') {
    await win.webContents.executeJavaScript(`
      document.querySelector('button[title="More actions"]')?.click();
    `);
    await new Promise((r) => setTimeout(r, 200));
    await win.webContents.executeJavaScript(`
      const items = Array.from(document.querySelectorAll('.header-more-item'));
      const teachItem = items.find(el => el.textContent.includes('Teach'));
      teachItem?.click();
    `);
    await new Promise((r) => setTimeout(r, 400));
  } else if (stateType === 'onboarding_modal' || stateType === 'onboarding_select') {
    await win.webContents.executeJavaScript(`
      document.querySelector('button[title="More actions"]')?.click();
    `);
    await new Promise((r) => setTimeout(r, 200));
    await win.webContents.executeJavaScript(`
      const items = Array.from(document.querySelectorAll('.header-more-item'));
      const addItem = items.find(el => el.textContent.includes('Add Project'));
      addItem?.click();
    `);
    await new Promise((r) => setTimeout(r, 400));
  } else if (stateType === 'onboarding_review') {
    await win.webContents.executeJavaScript(`
      document.querySelector('button[title="More actions"]')?.click();
    `);
    await new Promise((r) => setTimeout(r, 200));
    await win.webContents.executeJavaScript(`
      const items = Array.from(document.querySelectorAll('.header-more-item'));
      const addItem = items.find(el => el.textContent.includes('Add Project'));
      addItem?.click();
    `);
    await new Promise((r) => setTimeout(r, 500));
    const click2 = await win.webContents.executeJavaScript(`
      (() => {
        const browseBtn = document.querySelector('.primary-folder-btn');
        if (browseBtn) { browseBtn.click(); return true; }
        return false;
      })()
    `);
    console.log('CLICK 2 (Browse Folder):', click2);
    await new Promise((r) => setTimeout(r, 800));
  }
 else if (stateType.startsWith('project_detail')) {
    await win.webContents.executeJavaScript(`
      document.querySelector('.card-mini-btn.primary')?.click();
    `);
    await new Promise((r) => setTimeout(r, 450));

    if (stateType === 'project_detail_menu') {
      await win.webContents.executeJavaScript(`
        document.querySelector('button[title="Project settings"]')?.click();
      `);
      await new Promise((r) => setTimeout(r, 250));
    } else if (stateType === 'project_detail_edit_service') {
      await win.webContents.executeJavaScript(`
        document.querySelector('.p3-service-edit-btn')?.click();
      `);
      await new Promise((r) => setTimeout(r, 300));
    } else if (stateType === 'project_detail_confirm_delete') {
      await win.webContents.executeJavaScript(`
        document.querySelector('button[title="Project settings"]')?.click();
      `);
      await new Promise((r) => setTimeout(r, 200));
      await win.webContents.executeJavaScript(`
        document.querySelector('.p3-menu-item.danger')?.click();
      `);
      await new Promise((r) => setTimeout(r, 300));
    }
  } else if (stateType.startsWith('memory_hub')) {
    // 1. Click "Inspect Project" button on the project card to open Project Details modal
    await win.webContents.executeJavaScript(`
      document.querySelector('.card-mini-btn.primary')?.click();
    `);
    await new Promise((r) => setTimeout(r, 400));

    // 2. Click the Memory Hub button in the Project Details toolbar
    await win.webContents.executeJavaScript(`
      const hubBtn = Array.from(document.querySelectorAll('.p3-toolbar-btn')).find(b => b.textContent.includes('Memory Hub'));
      hubBtn?.click();
    `);
    await new Promise((r) => setTimeout(r, 600));

    // 3. If a specific tab is targeted, click it
    if (stateType.includes('knowledge')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[1]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('decisions')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[2]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('tasks')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[3]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('handoffs')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[4]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('activity')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[5]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('agents')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[6]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    } else if (stateType.includes('storage')) {
      await win.webContents.executeJavaScript(`
        document.querySelectorAll('.memory-hub-tab-btn')[7]?.click();
      `);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const image = await win.webContents.capturePage();
  const filename = path.join(outDir, `panel_${mode}_${stateType}.png`);
  fs.writeFileSync(filename, image.toPNG());
  console.log('CAPTURED_SCREENSHOT:', filename);

  app.quit();
});

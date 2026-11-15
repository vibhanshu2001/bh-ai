import { app, ipcMain } from 'electron';
import { TrayManager } from './desktop/tray';
import { QuickPanel } from './desktop/panel';
import { ShortcutManager } from './desktop/shortcut';
import { UtilityProcessManager } from './broker/utility_manager';
import { IpcBroker } from './broker/ipc_broker';
import { McpBroker } from './broker/mcp_broker';
import { IPC_CHANNELS } from '../shared/contracts/channels';

// Enforce single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  let trayManager: TrayManager | null = null;
  let quickPanel: QuickPanel | null = null;
  let shortcutManager: ShortcutManager | null = null;
  let utilityManager: UtilityProcessManager | null = null;
  let ipcBroker: IpcBroker | null = null;
  let mcpBroker: McpBroker | null = null;

  app.on('second-instance', () => {
    // Focus or show panel on duplicate instance
    if (quickPanel && trayManager) {
      quickPanel.show(trayManager.getBounds());
    }
  });

  app.whenReady().then(async () => {
    // Hide dock icon for pure menu-bar application behavior on macOS
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }

    // 1. Initialize Utility Process & Storage
    utilityManager = new UtilityProcessManager();
    utilityManager.start();
    await utilityManager.initializeStorage();

    // 2. Initialize MCP Domain Socket Broker for coding agents (Codex, Cursor, Claude, Antigravity)
    try {
      mcpBroker = new McpBroker(utilityManager);
      await mcpBroker.start();
    } catch (err) {
      console.error('Failed to start McpBroker:', err);
    }

    // 3. Initialize Quick Panel instance
    quickPanel = new QuickPanel();

    // 4. Register IPC Broker & Main Handlers BEFORE creating the window
    ipcBroker = new IpcBroker(utilityManager, () => quickPanel?.getWindow() || null);
    ipcBroker.register();

    ipcMain.handle(IPC_CHANNELS.APP_HIDE, () => {
      quickPanel?.hide();
    });

    ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
      app.quit();
    });

    ipcMain.handle(IPC_CHANNELS.WINDOW_RESIZE, (_event, payload) => {
      if (payload) {
        if (typeof payload.width === 'number' && typeof payload.height === 'number') {
          quickPanel?.setDimensions(payload.width, payload.height);
        } else if (typeof payload.height === 'number') {
          quickPanel?.setHeight(payload.height);
        }
      }
    });

    // 4. Create Window now that handlers are registered and storage is ready
    const window = quickPanel.create();

    trayManager = new TrayManager({
      onToggle: () => {
        quickPanel?.toggle(trayManager?.getBounds() || null);
      },
      onNewChat: async () => {
        try {
          const newChat = await utilityManager?.send('chat.create', { title: 'New Chat' });
          quickPanel?.show(trayManager?.getBounds() || null);
          window.webContents.send('bhai:chat:created', newChat);
        } catch (e) {
          // Fallback
          quickPanel?.show(trayManager?.getBounds() || null);
        }
      }
    });
    trayManager.create();

    shortcutManager = new ShortcutManager();
    shortcutManager.register(() => {
      quickPanel?.toggle(trayManager?.getBounds() || null);
    });

    // Show Quick Panel on initial launch anchored under the menu bar
    // Allow a 100ms layout pass for macOS NSStatusBar to calculate exact tray bounds
    setTimeout(() => {
      quickPanel?.show(trayManager?.getBounds() || null);
    }, 100);
  });

  app.on('window-all-closed', () => {
    // On macOS, preserve menu-bar application life cycle
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    shortcutManager?.unregister();
    trayManager?.destroy();
    quickPanel?.destroy();
    mcpBroker?.stop();
    utilityManager?.stop();
  });
}

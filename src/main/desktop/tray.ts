import { Tray, Menu, nativeImage, app, Rectangle } from 'electron';

export class TrayManager {
  private tray: Tray | null = null;
  private onToggle: () => void;
  private onNewChat: () => void;

  constructor(callbacks: { onToggle: () => void; onNewChat: () => void }) {
    this.onToggle = callbacks.onToggle;
    this.onNewChat = callbacks.onNewChat;
  }

  public create(): Tray {
    if (this.tray) return this.tray;

    // Create 16x16 menu-bar icon (black square with 'B' or template icon)
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Bhai — macOS Personal Assistant');

    this.tray.on('click', () => {
      this.onToggle();
    });

    this.tray.on('right-click', () => {
      this.showContextMenu();
    });

    return this.tray;
  }

  public getBounds(): Rectangle | null {
    return this.tray ? this.tray.getBounds() : null;
  }

  private showContextMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Bhai',
        click: () => this.onToggle()
      },
      {
        label: 'New Chat',
        click: () => this.onNewChat()
      },
      { type: 'separator' },
      {
        label: 'Quit Bhai',
        accelerator: 'Command+Q',
        click: () => app.quit()
      }
    ]);

    this.tray.popUpContextMenu(contextMenu);
  }

  private createTrayIcon(): Electron.NativeImage {
    // Generate a 16x16 monochrome template PNG buffer for the macOS menu bar icon
    // Renders the official Bhai 'b_' signature mark
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // b stem (x: 2..4, y: 2..14 with rounded tip at y: 1)
        const isStem = (x >= 2 && x <= 4 && y >= 2 && y <= 14);
        const isStemTop = (x === 3 && y === 1);
        // b bowl outer (x: 2..9, y: 7..14)
        const isBowlOuter = (x >= 2 && x <= 9 && y >= 7 && y <= 14);
        // b bowl hole (x: 5..6, y: 9..12)
        const isBowlHole = (x >= 5 && x <= 6 && y >= 9 && y <= 12);
        // rounded corners
        const isBowlCutout = (x === 9 && (y === 7 || y === 14)) || (x === 2 && y === 14);
        // underscore pill (x: 11..15, y: 12..14)
        const isUnderscore = (x >= 11 && x <= 15 && y >= 12 && y <= 14);
        const isUnderscoreCorner = (x === 11 && (y === 12 || y === 14)) || (x === 15 && (y === 12 || y === 14));

        const isMarkPixel = (isStem || isStemTop || (isBowlOuter && !isBowlHole && !isBowlCutout)) ||
                            (isUnderscore && !isUnderscoreCorner);

        if (isMarkPixel) {
          canvas[idx] = 0;       // R
          canvas[idx + 1] = 0;   // G
          canvas[idx + 2] = 0;   // B
          canvas[idx + 3] = 255; // Alpha
        } else {
          canvas[idx + 3] = 0;   // Transparent
        }
      }
    }

    const img = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    img.setTemplateImage(true);
    return img;
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

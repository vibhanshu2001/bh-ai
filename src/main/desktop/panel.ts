import { BrowserWindow, screen, Rectangle } from 'electron';
import path from 'node:path';

export class QuickPanel {
  private window: BrowserWindow | null = null;
  private currentWidth = 440;
  private currentHeight = 260;
  private lastTrayBounds: Rectangle | null = null;

  public create(): BrowserWindow {
    if (this.window) return this.window;

    this.window = new BrowserWindow({
      width: this.currentWidth,
      height: this.currentHeight,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      transparent: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        preload: path.join(__dirname, '../../preload/index.js')
      }
    });

    this.window.loadFile(path.join(__dirname, '../../renderer/index.html'));

    // Hide on blur
    this.window.on('blur', () => {
      this.hide();
    });

    return this.window;
  }

  public setDimensions(width: number, height: number): void {
    if (!this.window) return;
    const clampedW = Math.min(840, Math.max(440, Math.round(width)));
    const clampedH = Math.min(680, Math.max(240, Math.round(height)));

    if (this.currentWidth !== clampedW || this.currentHeight !== clampedH) {
      const oldWidth = this.currentWidth;
      this.currentWidth = clampedW;
      this.currentHeight = clampedH;

      const [currentX, currentY] = this.window.getPosition();
      this.window.setSize(this.currentWidth, this.currentHeight, false);

      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const workArea = activeDisplay.workArea;

      // When expanding width, adjust X so it expands symmetrically around the current anchor
      let newX = currentX - Math.round((this.currentWidth - oldWidth) / 2);
      if (newX + this.currentWidth > workArea.x + workArea.width - 12) {
        newX = workArea.x + workArea.width - this.currentWidth - 12;
      }
      if (newX < workArea.x + 12) {
        newX = workArea.x + 12;
      }

      let newY = currentY;
      if (newY + this.currentHeight > workArea.y + workArea.height - 12) {
        newY = workArea.y + workArea.height - this.currentHeight - 12;
      }
      if (newY < workArea.y + 10) {
        newY = workArea.y + 10;
      }

      this.window.setPosition(newX, newY);
    }
  }

  public setHeight(newHeight: number): void {
    this.setDimensions(this.currentWidth, newHeight);
  }

  public getWidth(): number {
    return this.currentWidth;
  }

  public toggle(trayBounds: Rectangle | null): void {
    if (!this.window) {
      this.create();
    }

    if (this.window?.isVisible()) {
      this.hide();
    } else {
      this.show(trayBounds);
    }
  }

  public show(trayBounds: Rectangle | null): void {
    if (!this.window) {
      this.create();
    }

    this.reposition(trayBounds);
    this.window?.show();
    this.window?.focus();
  }

  public hide(): void {
    if (this.window?.isVisible()) {
      this.window.hide();
    }
  }

  public isVisible(): boolean {
    return !!this.window?.isVisible();
  }

  public getWindow(): BrowserWindow | null {
    return this.window;
  }

  private reposition(trayBounds: Rectangle | null): void {
    if (!this.window) return;
    if (trayBounds) {
      this.lastTrayBounds = trayBounds;
    }
    const bounds = trayBounds || this.lastTrayBounds;

    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const workArea = activeDisplay.workArea;

    // Validate if tray bounds are meaningful (on macOS, unmeasured tray returns {0,0,0,0})
    const isValidTray = bounds &&
                        bounds.width > 0 &&
                        bounds.height > 0 &&
                        bounds.x > 0 &&
                        bounds.y < (workArea.y + 60);

    let x: number;
    let y: number;

    if (isValidTray && bounds) {
      // Anchored directly below macOS menu bar status icon
      x = Math.round(bounds.x + bounds.width / 2 - this.currentWidth / 2);
      y = Math.round(bounds.y + bounds.height + 6);
    } else {
      // Menu-bar popover anchor: top-right of active screen directly beneath menu bar
      x = workArea.x + workArea.width - this.currentWidth - 16;
      y = workArea.y + 6;
    }

    // Safety clamping inside active screen work area
    if (x + this.currentWidth > workArea.x + workArea.width - 12) {
      x = workArea.x + workArea.width - this.currentWidth - 12;
    }
    if (x < workArea.x + 12) {
      x = workArea.x + 12;
    }
    if (y + this.currentHeight > workArea.y + workArea.height - 12) {
      y = workArea.y + workArea.height - this.currentHeight - 12;
    }
    if (y < workArea.y + 10) {
      y = workArea.y + 10;
    }

    this.window.setPosition(x, y);
  }

  public destroy(): void {
    if (this.window) {
      this.window.destroy();
      this.window = null;
    }
  }
}

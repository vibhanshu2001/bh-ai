import { globalShortcut } from 'electron';

export class ShortcutManager {
  private registeredShortcut: string | null = null;
  private readonly defaultShortcut = 'CommandOrControl+Shift+Space';
  private readonly fallbackShortcut = 'Alt+Space';

  public register(onTrigger: () => void): boolean {
    // Unregister any existing shortcut first
    this.unregister();

    // Try primary default shortcut
    try {
      const success = globalShortcut.register(this.defaultShortcut, onTrigger);
      if (success) {
        this.registeredShortcut = this.defaultShortcut;
        return true;
      }
    } catch (e) {
      // Ignore and try fallback
    }

    // Try fallback shortcut
    try {
      const fallbackSuccess = globalShortcut.register(this.fallbackShortcut, onTrigger);
      if (fallbackSuccess) {
        this.registeredShortcut = this.fallbackShortcut;
        return true;
      }
    } catch (e) {
      // Ignore
    }

    this.registeredShortcut = null;
    return false;
  }

  public getRegisteredShortcut(): string | null {
    return this.registeredShortcut;
  }

  public unregister(): void {
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut);
      this.registeredShortcut = null;
    }
  }
}

import os from 'node:os';
import { execSync } from 'node:child_process';
import { MemoryInspectResult } from '../../shared/contracts/dto';

export class MemoryInspectAction {
  public static readonly ACTION_ID = 'system.memory.inspect';

  public async execute(): Promise<MemoryInspectResult> {
    const totalBytes = os.totalmem();
    let freeBytes = os.freemem();
    let activeBytes: number | undefined;
    let inactiveBytes: number | undefined;
    let wiredBytes: number | undefined;

    // Enhance with macOS vm_stat on Darwin
    if (process.platform === 'darwin') {
      try {
        const raw = execSync('vm_stat', { encoding: 'utf-8', timeout: 2000 });
        const pageSizeMatch = raw.match(/page size of (\d+) bytes/);
        const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;

        const getPages = (regex: RegExp): number => {
          const match = raw.match(regex);
          return match ? parseInt(match[1], 10) : 0;
        };

        const freePages = getPages(/Pages free:\s+(\d+)\./);
        const speculativePages = getPages(/Pages speculative:\s+(\d+)\./);
        const activePages = getPages(/Pages active:\s+(\d+)\./);
        const inactivePages = getPages(/Pages inactive:\s+(\d+)\./);
        const wiredPages = getPages(/Pages wired down:\s+(\d+)\./);

        activeBytes = activePages * pageSize;
        inactiveBytes = inactivePages * pageSize;
        wiredBytes = wiredPages * pageSize;

        // On macOS, available free memory effectively includes free + speculative
        const calculatedFree = (freePages + speculativePages) * pageSize;
        if (calculatedFree > 0) {
          freeBytes = calculatedFree;
        }
      } catch (e) {
        // Fallback to os.freemem() if vm_stat fails
      }
    }

    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = Math.round((usedBytes / totalBytes) * 1000) / 10;

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      activeBytes,
      inactiveBytes,
      wiredBytes,
      usedPercent,
      timestamp: Date.now()
    };
  }
}

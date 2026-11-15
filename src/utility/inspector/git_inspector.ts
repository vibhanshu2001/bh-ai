import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ProjectGitInfoDto } from '../../shared/contracts/dto';

export class GitInspector {
  /**
   * Safely inspects Git repository status for an approved canonical directory.
   * Uses fixed argv invocation without shell execution or network requests.
   */
  public static inspectRepository(canonicalPath: string): ProjectGitInfoDto {
    const gitDir = path.join(canonicalPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return {
        isGitRepo: false,
        root: null,
        branch: null,
        isClean: true,
        modifiedCount: 0,
        untrackedCount: 0
      };
    }

    try {
      // 1. Verify inside work tree
      const checkRes = spawnSync('git', ['-C', canonicalPath, 'rev-parse', '--is-inside-work-tree'], {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 64 * 1024
      });

      if (checkRes.status !== 0 || checkRes.stdout.trim() !== 'true') {
        return {
          isGitRepo: false,
          root: null,
          branch: null,
          isClean: true,
          modifiedCount: 0,
          untrackedCount: 0
        };
      }

      // 2. Get repository root
      const rootRes = spawnSync('git', ['-C', canonicalPath, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 64 * 1024
      });
      const root = rootRes.status === 0 ? rootRes.stdout.trim() : canonicalPath;

      // 3. Get current branch or detached HEAD
      let branch: string | null = null;
      let isDetachedHead = false;
      const branchRes = spawnSync('git', ['-C', canonicalPath, 'symbolic-ref', '--short', '-q', 'HEAD'], {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 64 * 1024
      });

      if (branchRes.status === 0 && branchRes.stdout.trim()) {
        branch = branchRes.stdout.trim();
      } else {
        // Detached HEAD: get short SHA
        const shaRes = spawnSync('git', ['-C', canonicalPath, 'rev-parse', '--short', 'HEAD'], {
          encoding: 'utf8',
          timeout: 3000,
          maxBuffer: 64 * 1024
        });
        if (shaRes.status === 0 && shaRes.stdout.trim()) {
          branch = shaRes.stdout.trim();
          isDetachedHead = true;
        }
      }

      // 4. Status inspection (--porcelain)
      const statusRes = spawnSync('git', ['-C', canonicalPath, 'status', '--porcelain', '-uall'], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 256 * 1024
      });

      let modifiedCount = 0;
      let untrackedCount = 0;

      if (statusRes.status === 0) {
        const lines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);
        for (const line of lines) {
          if (line.startsWith('??')) {
            untrackedCount++;
          } else {
            modifiedCount++;
          }
        }
      }

      const isClean = modifiedCount === 0 && untrackedCount === 0;

      return {
        isGitRepo: true,
        root,
        branch,
        isClean,
        modifiedCount,
        untrackedCount,
        isDetachedHead
      };
    } catch {
      return {
        isGitRepo: false,
        root: null,
        branch: null,
        isClean: true,
        modifiedCount: 0,
        untrackedCount: 0
      };
    }
  }
}

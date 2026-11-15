import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ProjectRepository } from '../storage/project_repository';

export interface EditorLaunchResult {
  success: boolean;
  editor: string;
  message: string;
}

export interface TerminalLaunchResult {
  success: boolean;
  message: string;
}

export class SafeLauncher {
  private projectRepo: ProjectRepository;

  constructor(projectRepo: ProjectRepository) {
    this.projectRepo = projectRepo;
  }

  /**
   * Safely opens an approved registered project in VS Code or Cursor using safe fixed argv invocation.
   */
  public async openInEditor(projectId: string): Promise<EditorLaunchResult> {
    const project = this.projectRepo.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' is not registered`);
    }

    if (!fs.existsSync(project.canonicalRoot)) {
      throw new Error(`Project directory not found: ${project.canonicalRoot}`);
    }

    // Resolve installed editor safely without shell invocation
    const candidateBins = [
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      '/usr/local/bin/code',
      '/opt/homebrew/bin/code',
      '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
      '/usr/local/bin/cursor'
    ];

    let editorBin: string | null = null;
    let editorName = 'VS Code';

    for (const bin of candidateBins) {
      try {
        if (fs.existsSync(bin)) {
          editorBin = bin;
          if (bin.includes('Cursor')) editorName = 'Cursor';
          break;
        }
      } catch {
        // ignore
      }
    }

    if (!editorBin) {
      return {
        success: false,
        editor: 'none',
        message: 'No supported editor (VS Code or Cursor) was found on this system.'
      };
    }

    return new Promise((resolve) => {
      // Safe argv dispatch directly to the executable
      const child = spawn(editorBin!, [project.canonicalRoot], {
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          editor: editorName,
          message: `Failed to launch ${editorName}: ${err.message}`
        });
      });

      child.unref();

      resolve({
        success: true,
        editor: editorName,
        message: `Opened "${project.displayName}" in ${editorName}.`
      });
    });
  }

  /**
   * Safely opens a new Terminal window at the approved registered project directory via macOS LaunchServices.
   */
  public async openInTerminal(projectId: string): Promise<TerminalLaunchResult> {
    const project = this.projectRepo.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' is not registered`);
    }

    if (!fs.existsSync(project.canonicalRoot)) {
      throw new Error(`Project directory not found: ${project.canonicalRoot}`);
    }

    return new Promise((resolve) => {
      // LaunchServices dispatch: open -a Terminal <canonicalPath>
      const child = spawn('/usr/bin/open', ['-a', 'Terminal', project.canonicalRoot], {
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          message: `Failed to open Terminal: ${err.message}`
        });
      });

      child.unref();

      resolve({
        success: true,
        message: `Opened Terminal at "${project.displayName}".`
      });
    });
  }

  /**
   * Safely reveals the approved registered project in Finder using fixed argv /usr/bin/open -R.
   */
  public async revealInFinder(projectId: string): Promise<{ success: boolean; message: string }> {
    const project = this.projectRepo.getProject(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' is not registered`);
    }

    if (!fs.existsSync(project.canonicalRoot)) {
      throw new Error(`Project directory not found: ${project.canonicalRoot}`);
    }

    return new Promise((resolve) => {
      const child = spawn('/usr/bin/open', ['-R', project.canonicalRoot], {
        detached: true,
        stdio: 'ignore'
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          message: `Failed to reveal in Finder: ${err.message}`
        });
      });

      child.unref();

      resolve({
        success: true,
        message: `Revealed "${project.displayName}" in Finder.`
      });
    });
  }
}

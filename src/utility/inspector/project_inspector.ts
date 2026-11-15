import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ProjectInspectionResult, ServiceDefinitionDto } from '../../shared/contracts/dto';

export interface ProjectDetector {
  name: string;
  detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null>;
}

export class SafePathValidator {
  private static readonly MAX_PATH_LENGTH = 1024;
  private static readonly SENSITIVE_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.venv',
    'venv',
    'vendor',
    'target',
    'bin',
    'obj',
    '.cache'
  ]);

  public static validateAndCanonicalize(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Project path cannot be empty');
    }

    const trimmed = inputPath.trim();
    if (trimmed.length > this.MAX_PATH_LENGTH) {
      throw new Error(`Project path exceeds maximum length of ${this.MAX_PATH_LENGTH} characters`);
    }

    if (trimmed.includes('\0')) {
      throw new Error('Project path contains illegal NUL bytes');
    }

    // Resolve ~ to home directory if present
    let expanded = trimmed;
    if (expanded === '~' || expanded.startsWith('~/')) {
      const home = process.env.HOME || '';
      if (!home) throw new Error('Cannot expand home directory (~): HOME environment variable not set');
      expanded = path.join(home, expanded.slice(1));
    }

    const absolute = path.resolve(expanded);

    // Canonicalize realpath first (safely resolving symlinks to target)
    let canonical: string;
    try {
      canonical = fs.realpathSync(absolute);
    } catch (err: any) {
      throw new Error(`Project directory does not exist or cannot be accessed: ${absolute}`);
    }

    // Verify existence and directory nature of target
    let stat: fs.Stats;
    try {
      stat = fs.statSync(canonical);
    } catch (err: any) {
      throw new Error(`Target path cannot be accessed: ${canonical}`);
    }

    if (!stat.isDirectory()) {
      throw new Error(`Selected path is not a directory: ${canonical}`);
    }

    // Protect against root or home dir selection
    const home = process.env.HOME ? path.resolve(process.env.HOME) : '';
    if (canonical === '/' || canonical === home) {
      throw new Error(`Refusing to onboard system root or entire home directory as a project: ${canonical}`);
    }

    return canonical;
  }

  public static isSensitiveOrIgnored(entryName: string): boolean {
    return this.SENSITIVE_DIRS.has(entryName.toLowerCase());
  }

  public static safeReadManifest(filePath: string, maxBytes = 256 * 1024): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > maxBytes) {
        return null;
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  public static safeParseJson<T = any>(content: string): T | null {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

// 1. Git Repository Detector
export class GitDetector implements ProjectDetector {
  name = 'git';

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    const gitDir = path.join(projectRoot, '.git');
    try {
      if (fs.existsSync(gitDir)) {
        let branch: string | null = null;
        const headPath = path.join(gitDir, 'HEAD');
        const headContent = SafePathValidator.safeReadManifest(headPath, 4096);
        if (headContent) {
          const match = /^ref:\s+refs\/heads\/(.+)$/m.exec(headContent.trim());
          if (match) {
            branch = match[1];
          } else if (/^[0-9a-f]{40}$/i.test(headContent.trim())) {
            branch = headContent.trim().slice(0, 7); // detached commit sha
          }
        }
        return {
          isGitRepo: true,
          gitBranch: branch,
          technologies: ['Git']
        };
      }
    } catch {
      // Ignore read errors
    }
    return null;
  }
}

// 2. Node & TypeScript Detector
export class NodeDetector implements ProjectDetector {
  name = 'node';

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    const pkgPath = path.join(projectRoot, 'package.json');
    const content = SafePathValidator.safeReadManifest(pkgPath);
    if (!content) return null;

    const pkg = SafePathValidator.safeParseJson(content);
    if (!pkg) return null;

    const techs: string[] = ['Node.js'];
    let packageManager: string | null = null;

    if (fileNames.has('pnpm-lock.yaml') || fileNames.has('pnpm-workspace.yaml')) packageManager = 'pnpm';
    else if (fileNames.has('yarn.lock')) packageManager = 'yarn';
    else if (fileNames.has('bun.lockb') || fileNames.has('bun.lock')) packageManager = 'bun';
    else if (fileNames.has('package-lock.json')) packageManager = 'npm';

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    if (fileNames.has('tsconfig.json') || deps['typescript']) {
      techs.push('TypeScript');
    }

    if (deps['next']) techs.push('Next.js', 'React');
    else if (deps['react']) techs.push('React');

    if (deps['vite']) techs.push('Vite');
    if (deps['express']) techs.push('Express');
    if (deps['fastify']) techs.push('Fastify');
    if (deps['@nestjs/core']) techs.push('NestJS');
    if (deps['electron']) techs.push('Electron');

    const services: ServiceDefinitionDto[] = [];
    const scripts = pkg.scripts || {};

    // Detect single-package standard scripts
    if (scripts.dev || scripts.start || scripts.build) {
      const serviceName = pkg.name || path.basename(projectRoot);
      let detectedType = 'custom';
      if (techs.includes('Next.js') || techs.includes('React') || techs.includes('Vite')) detectedType = 'frontend';
      else if (techs.includes('Express') || techs.includes('Fastify') || techs.includes('NestJS')) detectedType = 'backend';

      let port: number | null = null;
      let portConfidence: 'configured' | 'inferred' | undefined = undefined;

      const devOrStart = (scripts.dev || '') + ' ' + (scripts.start || '');
      const portMatch = /(?:--port|-p|\bPORT=)\s*(\d{2,5})/i.exec(devOrStart);
      if (portMatch) {
        const parsedPort = parseInt(portMatch[1], 10);
        if (parsedPort >= 1 && parsedPort <= 65535) {
          port = parsedPort;
          portConfidence = 'configured';
        }
      } else if (techs.includes('Next.js')) {
        port = 3000;
        portConfidence = 'inferred';
      } else if (techs.includes('Vite')) {
        port = 5173;
        portConfidence = 'inferred';
      }

      services.push({
        id: `srv_${crypto.randomUUID().slice(0, 8)}`,
        name: serviceName,
        serviceType: detectedType,
        relativeCwd: '.',
        packageScript: scripts.dev ? 'npm run dev' : (scripts.start ? 'npm start' : undefined),
        port,
        portConfidence
      });
    }

    return {
      technologies: techs,
      packageManager,
      services,
      rawMetadata: {
        packageName: pkg.name,
        packageVersion: pkg.version,
        scripts: Object.keys(scripts)
      }
    };
  }
}

// 3. Monorepo & Multi-Service Detector (workspaces, subdirectories: backend, frontend, apps/*, services/*)
export class MonorepoDetector implements ProjectDetector {
  name = 'monorepo';

  private inspectServiceDirectory(
    dirPath: string,
    fallbackName: string,
    relativeCwd: string,
    techs: Set<string>
  ): ServiceDefinitionDto {
    let name = fallbackName;
    let serviceType = 'custom';
    let packageScript: string | undefined = undefined;
    let port: number | null = null;
    let portConfidence: 'configured' | 'inferred' | undefined = undefined;

    const lowerFallback = fallbackName.toLowerCase();
    if (['frontend', 'client', 'web', 'ui'].some((k) => lowerFallback.includes(k))) {
      serviceType = 'frontend';
    } else if (['backend', 'server', 'api'].some((k) => lowerFallback.includes(k))) {
      serviceType = 'backend';
    }

    // 1. Inspect package.json if present
    const pkgPath = path.join(dirPath, 'package.json');
    const pkgContent = SafePathValidator.safeReadManifest(pkgPath);
    if (pkgContent) {
      const pkg = SafePathValidator.safeParseJson(pkgContent);
      if (pkg) {
        techs.add('Node.js');
        if (pkg.name) name = pkg.name;

        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        // TypeScript
        if (fs.existsSync(path.join(dirPath, 'tsconfig.json')) || deps['typescript']) {
          techs.add('TypeScript');
        }

        // Frameworks
        if (deps['next']) {
          techs.add('Next.js');
          techs.add('React');
          serviceType = 'frontend';
          port = 3000;
          portConfidence = 'inferred';
        } else if (deps['react']) {
          techs.add('React');
          if (serviceType === 'custom') serviceType = 'frontend';
        }

        if (deps['vite']) {
          techs.add('Vite');
          serviceType = 'frontend';
          port = 5173;
          portConfidence = 'inferred';
        }

        if (deps['fastify']) {
          techs.add('Fastify');
          serviceType = 'backend';
          port = 4000;
          portConfidence = 'inferred';
        }
        if (deps['express']) {
          techs.add('Express');
          serviceType = 'backend';
          port = 4000;
          portConfidence = 'inferred';
        }
        if (deps['@nestjs/core']) {
          techs.add('NestJS');
          serviceType = 'backend';
          port = 3000;
          portConfidence = 'inferred';
        }
        if (deps['electron']) {
          techs.add('Electron');
        }

        const scripts = pkg.scripts || {};
        if (scripts.dev) {
          packageScript = 'npm run dev';
        } else if (scripts.start) {
          packageScript = 'npm start';
        }

        // Look for explicit configured port in scripts
        const devOrStart = (scripts.dev || '') + ' ' + (scripts.start || '');
        const portMatch = /(?:--port|-p|\bPORT=)\s*(\d{2,5})/i.exec(devOrStart);
        if (portMatch) {
          const parsedPort = parseInt(portMatch[1], 10);
          if (parsedPort >= 1 && parsedPort <= 65535) {
            port = parsedPort;
            portConfidence = 'configured';
          }
        }
      }
    }

    // 2. Inspect Python manifests if present
    const pyproject = SafePathValidator.safeReadManifest(path.join(dirPath, 'pyproject.toml'));
    const reqs = SafePathValidator.safeReadManifest(path.join(dirPath, 'requirements.txt'));
    if (pyproject || reqs) {
      techs.add('Python');
      serviceType = 'backend';
      const pyContent = (pyproject || '') + '\n' + (reqs || '');
      if (/fastapi/i.test(pyContent)) {
        techs.add('FastAPI');
        port = 8000;
        portConfidence = 'inferred';
      } else if (/flask/i.test(pyContent)) {
        techs.add('Flask');
        port = 5000;
        portConfidence = 'inferred';
      } else if (/django/i.test(pyContent)) {
        techs.add('Django');
        port = 8000;
        portConfidence = 'inferred';
      }
      if (!packageScript) {
        packageScript = techs.has('FastAPI') ? 'uvicorn main:app --reload' : (techs.has('Flask') ? 'flask run' : undefined);
      }
    }

    // 3. Inspect Rust manifests if present
    const cargo = SafePathValidator.safeReadManifest(path.join(dirPath, 'Cargo.toml'));
    if (cargo) {
      techs.add('Rust');
      serviceType = 'backend';
      if (/axum/i.test(cargo)) techs.add('Axum');
      else if (/actix-web/i.test(cargo)) techs.add('Actix-web');
      else if (/rocket/i.test(cargo)) techs.add('Rocket');
    }

    // Default inferred port if known serviceType and no port found yet
    if (port === null) {
      if (serviceType === 'frontend') {
        port = 3000;
        portConfidence = 'inferred';
      } else if (serviceType === 'backend') {
        port = 4000;
        portConfidence = 'inferred';
      }
    }

    return {
      id: `srv_${crypto.randomUUID().slice(0, 8)}`,
      name,
      serviceType,
      relativeCwd,
      packageScript: packageScript || (pkgContent ? 'npm run dev' : undefined),
      port,
      portConfidence
    };
  }

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    let isMonorepo = false;
    const techs = new Set<string>();
    const detectedServices: ServiceDefinitionDto[] = [];

    // Check package.json workspaces
    const pkgContent = SafePathValidator.safeReadManifest(path.join(projectRoot, 'package.json'));
    if (pkgContent) {
      const pkg = SafePathValidator.safeParseJson(pkgContent);
      if (pkg?.workspaces) {
        isMonorepo = true;
        techs.add('Monorepo');
      }
    }

    if (fileNames.has('pnpm-workspace.yaml')) {
      isMonorepo = true;
      techs.add('Monorepo');
    }
    if (fileNames.has('turbo.json')) {
      techs.add('Turborepo');
      isMonorepo = true;
    }
    if (fileNames.has('lerna.json')) {
      techs.add('Lerna');
      isMonorepo = true;
    }

    // Inspect common monorepo and service subdirectories (bounded depth = 1)
    const candidateSubdirs = ['apps', 'packages', 'services', 'backend', 'frontend', 'server', 'client', 'web', 'api'];
    for (const sub of candidateSubdirs) {
      if (fileNames.has(sub)) {
        const fullSub = path.join(projectRoot, sub);
        try {
          const stat = fs.lstatSync(fullSub);
          if (stat.isDirectory()) {
            // Check direct service directory (backend, frontend, api, server, client, web)
            if (['backend', 'server', 'api'].includes(sub)) {
              detectedServices.push(this.inspectServiceDirectory(fullSub, 'Backend', sub, techs));
            } else if (['frontend', 'client', 'web'].includes(sub)) {
              detectedServices.push(this.inspectServiceDirectory(fullSub, 'Frontend', sub, techs));
            } else if (['apps', 'services', 'packages'].includes(sub)) {
              // Read immediate children of apps/ or services/
              const innerEntries = fs.readdirSync(fullSub).slice(0, 20);
              for (const inner of innerEntries) {
                if (SafePathValidator.isSensitiveOrIgnored(inner)) continue;
                const innerPath = path.join(fullSub, inner);
                if (fs.lstatSync(innerPath).isDirectory()) {
                  const fallback = inner.charAt(0).toUpperCase() + inner.slice(1);
                  detectedServices.push(
                    this.inspectServiceDirectory(innerPath, fallback, path.join(sub, inner), techs)
                  );
                }
              }
            }
          }
        } catch {
          // ignore scan errors
        }
      }
    }

    if (!isMonorepo && detectedServices.length === 0) return null;

    return {
      isMonorepo: isMonorepo || detectedServices.length > 1,
      technologies: Array.from(techs),
      services: detectedServices
    };
  }
}

// 4. Python Project Detector
export class PythonDetector implements ProjectDetector {
  name = 'python';

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    const hasRequirements = fileNames.has('requirements.txt');
    const hasPyproject = fileNames.has('pyproject.toml');
    const hasPipfile = fileNames.has('Pipfile');
    const hasSetupPy = fileNames.has('setup.py');

    if (!hasRequirements && !hasPyproject && !hasPipfile && !hasSetupPy) {
      return null;
    }

    const techs: string[] = ['Python'];
    let packageManager = 'pip';
    if (fileNames.has('poetry.lock')) packageManager = 'poetry';
    else if (hasPipfile) packageManager = 'pipenv';
    else if (fileNames.has('uv.lock')) packageManager = 'uv';

    // Bounded search for framework mentions in requirements.txt or pyproject.toml
    const reqContent = SafePathValidator.safeReadManifest(path.join(projectRoot, 'requirements.txt')) ||
                       SafePathValidator.safeReadManifest(path.join(projectRoot, 'pyproject.toml')) || '';

    if (/fastapi/i.test(reqContent)) techs.push('FastAPI');
    if (/flask/i.test(reqContent)) techs.push('Flask');
    if (/django/i.test(reqContent)) techs.push('Django');

    const services: ServiceDefinitionDto[] = [
      {
        id: `srv_${crypto.randomUUID().slice(0, 8)}`,
        name: path.basename(projectRoot),
        serviceType: 'backend',
        relativeCwd: '.',
        packageScript: techs.includes('FastAPI') ? 'uvicorn main:app --reload' : (techs.includes('Flask') ? 'flask run' : undefined),
        port: techs.includes('FastAPI') ? 8000 : (techs.includes('Flask') ? 5000 : 8000),
        portConfidence: 'inferred'
      }
    ];

    return {
      technologies: techs,
      packageManager,
      services
    };
  }
}

// 5. Rust Project Detector
export class RustDetector implements ProjectDetector {
  name = 'rust';

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    if (!fileNames.has('Cargo.toml')) return null;

    const cargoContent = SafePathValidator.safeReadManifest(path.join(projectRoot, 'Cargo.toml'));
    const techs: string[] = ['Rust'];

    if (cargoContent) {
      if (/actix-web/i.test(cargoContent)) techs.push('Actix-web');
      if (/axum/i.test(cargoContent)) techs.push('Axum');
      if (/rocket/i.test(cargoContent)) techs.push('Rocket');
      if (/tauri/i.test(cargoContent)) techs.push('Tauri');
    }

    const services: ServiceDefinitionDto[] = [
      {
        id: `srv_${crypto.randomUUID().slice(0, 8)}`,
        name: path.basename(projectRoot),
        serviceType: 'backend',
        relativeCwd: '.',
        packageScript: 'cargo run',
        port: 8080
      }
    ];

    return {
      technologies: techs,
      packageManager: 'cargo',
      services
    };
  }
}

// 6. Docker Compose Detector
export class DockerComposeDetector implements ProjectDetector {
  name = 'docker';

  async detect(projectRoot: string, fileNames: Set<string>): Promise<Partial<ProjectInspectionResult> | null> {
    const hasCompose = fileNames.has('docker-compose.yml') ||
                       fileNames.has('docker-compose.yaml') ||
                       fileNames.has('compose.yml') ||
                       fileNames.has('compose.yaml');

    if (!hasCompose) return null;

    return {
      technologies: ['Docker Compose']
    };
  }
}

// Modular Project Inspector Orchestrator
export class SafeProjectInspector {
  private detectors: ProjectDetector[] = [
    new GitDetector(),
    new NodeDetector(),
    new MonorepoDetector(),
    new PythonDetector(),
    new RustDetector(),
    new DockerComposeDetector()
  ];

  public async inspectDirectory(rawPath: string): Promise<ProjectInspectionResult> {
    const canonicalPath = SafePathValidator.validateAndCanonicalize(rawPath);
    const displayName = path.basename(canonicalPath);

    // Bounded directory enumeration (top-level only, max 500 entries)
    let dirEntries: string[];
    try {
      dirEntries = fs.readdirSync(canonicalPath).slice(0, 500);
    } catch (err: any) {
      throw new Error(`Failed to read directory entries for: ${canonicalPath}`);
    }

    const fileNames = new Set(dirEntries);

    let isGitRepo = false;
    let gitBranch: string | null = null;
    const technologies = new Set<string>();
    let packageManager: string | null = null;
    let isMonorepo = false;
    const allServices: ServiceDefinitionDto[] = [];
    const combinedRawMetadata: Record<string, any> = {};

    for (const detector of this.detectors) {
      try {
        const res = await detector.detect(canonicalPath, fileNames);
        if (res) {
          if (res.isGitRepo !== undefined) isGitRepo = res.isGitRepo;
          if (res.gitBranch !== undefined) gitBranch = res.gitBranch;
          if (res.packageManager) packageManager = res.packageManager;
          if (res.isMonorepo) isMonorepo = true;
          if (res.technologies) {
            for (const t of res.technologies) technologies.add(t);
          }
          if (res.services && res.services.length > 0) {
            allServices.push(...res.services);
          }
          if (res.rawMetadata) {
            Object.assign(combinedRawMetadata, res.rawMetadata);
          }
        }
      } catch {
        // Safe fail-forward: a failure in one detector never crashes the inspector
      }
    }

    // Deduplicate services by relativeCwd or name
    const uniqueServices: ServiceDefinitionDto[] = [];
    const seenCwds = new Set<string>();
    for (const s of allServices) {
      if (!seenCwds.has(s.relativeCwd)) {
        seenCwds.add(s.relativeCwd);
        uniqueServices.push(s);
      }
    }

    return {
      canonicalPath,
      displayName,
      isGitRepo,
      gitBranch,
      technologies: Array.from(technologies),
      packageManager,
      isMonorepo,
      services: uniqueServices,
      rawMetadata: combinedRawMetadata
    };
  }
}

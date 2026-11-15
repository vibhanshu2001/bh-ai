import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SafePathValidator, SafeProjectInspector } from '../../utility/inspector/project_inspector';
import { GitInspector } from '../../utility/inspector/git_inspector';

export async function runP3ProjectUnitTests(): Promise<void> {
  console.log('--- [UNIT] Phase P3 Project Detection & Security Boundary Tests ---');

  const testTempDir = path.join(os.tmpdir(), `bhai_p3_unit_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  try {
    // 1. Path Validator & Canonicalization Tests
    assert.throws(() => SafePathValidator.validateAndCanonicalize(''), /cannot be empty/);
    assert.throws(() => SafePathValidator.validateAndCanonicalize('\0illegal'), /illegal NUL bytes/);
    assert.throws(() => SafePathValidator.validateAndCanonicalize('/non/existent/path/at/all/12345'), /does not exist/);
    assert.throws(() => SafePathValidator.validateAndCanonicalize('/'), /Refusing to onboard system root/);

    // Symlink resolution & canonical path
    const realDir = path.join(testTempDir, 'real_target');
    fs.mkdirSync(realDir, { recursive: true });
    const symlinkPath = path.join(testTempDir, 'symlink_dir');
    fs.symlinkSync(realDir, symlinkPath);

    const canonicalResolved = SafePathValidator.validateAndCanonicalize(symlinkPath);
    assert.strictEqual(canonicalResolved, fs.realpathSync(realDir), 'Symlink must resolve to real canonical path');
    console.log('  ✓ Path canonicalization & symlink resolution verified');

    // 2. Safe Manifest Read Limits
    const oversizedFile = path.join(testTempDir, 'huge.json');
    const hugeBuf = Buffer.alloc(300 * 1024, 65); // 300KB (>256KB cap)
    fs.writeFileSync(oversizedFile, hugeBuf);
    assert.strictEqual(SafePathValidator.safeReadManifest(oversizedFile), null, 'Oversized file should be safely rejected');
    console.log('  ✓ Bounded file read limits verified (300KB file rejected by 256KB cap)');

    // 3. Node.js & TypeScript Project Detection
    const nodeProjDir = path.join(testTempDir, 'node_sample');
    fs.mkdirSync(nodeProjDir, { recursive: true });
    fs.writeFileSync(path.join(nodeProjDir, 'package.json'), JSON.stringify({
      name: 'sample-next-app',
      version: '1.0.0',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start'
      },
      dependencies: {
        next: '14.0.0',
        react: '18.2.0'
      },
      devDependencies: {
        typescript: '5.0.0'
      }
    }));
    fs.writeFileSync(path.join(nodeProjDir, 'pnpm-lock.yaml'), '');
    fs.writeFileSync(path.join(nodeProjDir, 'tsconfig.json'), '{}');

    const inspector = new SafeProjectInspector();
    const nodeResult = await inspector.inspectDirectory(nodeProjDir);

    assert.strictEqual(nodeResult.displayName, 'node_sample');
    assert.ok(nodeResult.technologies.includes('Node.js'));
    assert.ok(nodeResult.technologies.includes('TypeScript'));
    assert.ok(nodeResult.technologies.includes('Next.js'));
    assert.ok(nodeResult.technologies.includes('React'));
    assert.strictEqual(nodeResult.packageManager, 'pnpm');
    assert.strictEqual(nodeResult.services.length, 1);
    assert.strictEqual(nodeResult.services[0].port, 3000);
    assert.strictEqual(nodeResult.services[0].serviceType, 'frontend');
    console.log('  ✓ Node.js, TypeScript, Next.js, and pnpm detected accurately with port 3000');

    // 4. Monorepo Detection (Fastify backend + Next.js frontend)
    const monorepoDir = path.join(testTempDir, 'aawas-fintech');
    fs.mkdirSync(path.join(monorepoDir, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(monorepoDir, 'frontend'), { recursive: true });

    fs.writeFileSync(path.join(monorepoDir, 'package.json'), JSON.stringify({
      name: 'aawas-fintech',
      workspaces: ['backend', 'frontend']
    }));
    fs.writeFileSync(path.join(monorepoDir, 'backend', 'package.json'), JSON.stringify({
      name: 'aawas-backend',
      dependencies: { fastify: '4.0.0' }
    }));
    fs.writeFileSync(path.join(monorepoDir, 'frontend', 'package.json'), JSON.stringify({
      name: 'aawas-frontend',
      dependencies: { next: '14.0.0' }
    }));

    const monorepoResult = await inspector.inspectDirectory(monorepoDir);
    assert.strictEqual(monorepoResult.isMonorepo, true);
    assert.ok(monorepoResult.technologies.includes('Monorepo'));
    assert.ok(monorepoResult.technologies.includes('Fastify'), 'Should detect Fastify from backend manifest');
    assert.ok(monorepoResult.technologies.includes('Next.js'), 'Should detect Next.js from frontend manifest');
    assert.ok(monorepoResult.technologies.includes('Node.js'), 'Should detect Node.js from service manifests');
    assert.strictEqual(monorepoResult.services.length, 2);
    const backendSrv = monorepoResult.services.find(s => s.relativeCwd === 'backend');
    const frontendSrv = monorepoResult.services.find(s => s.relativeCwd === 'frontend');
    assert.ok(backendSrv, 'Backend service should be detected');
    assert.ok(frontendSrv, 'Frontend service should be detected');
    assert.strictEqual(backendSrv.serviceType, 'backend');
    assert.strictEqual(frontendSrv.serviceType, 'frontend');
    assert.strictEqual(frontendSrv.port, 3000);
    assert.strictEqual(frontendSrv.portConfidence, 'inferred');
    console.log('  ✓ Monorepo workspace with backend and frontend detected accurately (with real child technologies)');

    // 5. Python Project Detection (FastAPI + pyproject.toml)
    const pythonProjDir = path.join(testTempDir, 'python_sample');
    fs.mkdirSync(pythonProjDir, { recursive: true });
    fs.writeFileSync(path.join(pythonProjDir, 'pyproject.toml'), `
      [project]
      name = "fastapi-demo"
      dependencies = ["fastapi", "uvicorn"]
    `);
    fs.writeFileSync(path.join(pythonProjDir, 'uv.lock'), '');

    const pythonResult = await inspector.inspectDirectory(pythonProjDir);
    assert.ok(pythonResult.technologies.includes('Python'));
    assert.ok(pythonResult.technologies.includes('FastAPI'));
    assert.strictEqual(pythonResult.packageManager, 'uv');
    assert.strictEqual(pythonResult.services[0].port, 8000);
    console.log('  ✓ Python FastAPI project detected accurately with uv and port 8000');

    // 6. Rust Project Detection (Cargo.toml + Axum)
    const rustProjDir = path.join(testTempDir, 'rust_sample');
    fs.mkdirSync(rustProjDir, { recursive: true });
    fs.writeFileSync(path.join(rustProjDir, 'Cargo.toml'), `
      [package]
      name = "rust-service"
      version = "0.1.0"
      [dependencies]
      axum = "0.7"
      tokio = { version = "1.0", features = ["full"] }
    `);

    const rustResult = await inspector.inspectDirectory(rustProjDir);
    assert.ok(rustResult.technologies.includes('Rust'));
    assert.ok(rustResult.technologies.includes('Axum'));
    assert.strictEqual(rustResult.packageManager, 'cargo');
    console.log('  ✓ Rust Cargo project detected accurately with Axum framework');

    // 7. Git Inspector Safe Fixed-Argv Verification
    // Non-git directory
    const gitInfoNonGit = GitInspector.inspectRepository(rustProjDir);
    assert.strictEqual(gitInfoNonGit.isGitRepo, false);

    // Current workspace git repo (real host git)
    const gitInfoSelf = GitInspector.inspectRepository(process.cwd());
    assert.strictEqual(gitInfoSelf.isGitRepo, true);
    assert.strictEqual(typeof gitInfoSelf.branch, 'string');
    assert.strictEqual(typeof gitInfoSelf.modifiedCount, 'number');
    console.log(`  ✓ Read-only Git inspector verified: branch=${gitInfoSelf.branch}, modified=${gitInfoSelf.modifiedCount}, clean=${gitInfoSelf.isClean}`);

  } finally {
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

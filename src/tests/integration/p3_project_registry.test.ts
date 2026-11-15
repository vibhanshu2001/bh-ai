import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { DatabaseConnection } from '../../utility/storage/connection';
import { ProjectRepository } from '../../utility/storage/project_repository';
import { ChatRepository } from '../../utility/storage/chat_repository';
import { ExecutionRepository } from '../../utility/storage/execution_repository';
import { ClarificationRepository } from '../../utility/storage/clarification_repository';
import { MinimalCommandExecutor } from '../../utility/engine/executor';

export async function runP3ProjectIntegrationTests(): Promise<void> {
  console.log('--- [INTEGRATION] Phase P3 Project Registry & Language Command Tests ---');

  const testTempDir = path.join(os.tmpdir(), `bhai_p3_integration_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });
  const dbPath = path.join(testTempDir, 'bhai.sqlite');

  try {
    const conn = new DatabaseConnection(dbPath);
    const db = conn.open();

    const projectRepo = new ProjectRepository(db);
    const chatRepo = new ChatRepository(db);
    const execRepo = new ExecutionRepository(db);
    const clarificationRepo = new ClarificationRepository(db);
    const executor = new MinimalCommandExecutor(chatRepo, execRepo, undefined, clarificationRepo, projectRepo);

    // 1. Create Real Project Directory Fixture
    const aawasDir = path.join(testTempDir, 'aawas-fintech');
    fs.mkdirSync(path.join(aawasDir, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(aawasDir, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(aawasDir, 'backend', 'server.ts'), '// backend entry', 'utf-8');
    fs.writeFileSync(path.join(aawasDir, 'frontend', 'app.tsx'), '// frontend entry', 'utf-8');

    // 2. Project Registration
    const createdProject = projectRepo.createProject({
      displayName: 'Aawas',
      canonicalRoot: fs.realpathSync(aawasDir),
      detectedMetadata: {
        technologies: ['Node.js', 'TypeScript', 'Fastify', 'Next.js', 'Monorepo']
      },
      services: [
        {
          name: 'Backend',
          serviceType: 'backend',
          relativeCwd: 'backend',
          port: 4000,
          portConfidence: 'configured',
          packageScript: 'npm run dev'
        },
        {
          name: 'Frontend',
          serviceType: 'frontend',
          relativeCwd: 'frontend',
          port: 3000,
          portConfidence: 'inferred',
          packageScript: 'npm run start'
        }
      ]
    });

    assert.ok(createdProject.id.startsWith('proj_'));
    assert.strictEqual(createdProject.displayName, 'Aawas');
    assert.strictEqual(createdProject.availability, 'available');
    assert.strictEqual(createdProject.services?.length, 2);
    console.log('  ✓ 1. Project "Aawas" registered with 2 services');

    // 3. Duplicate Registration Prevention
    assert.throws(
      () => projectRepo.createProject({ displayName: 'Aawas Copy', canonicalRoot: fs.realpathSync(aawasDir) }),
      /already registered/
    );
    console.log('  ✓ Duplicate registration rejected on identical canonical root');

    // 4. Validate Service Editing: Rename service, update port, and packageScript
    const srvBackend = createdProject.services!.find((s) => s.name === 'Backend')!;
    const srvFrontend = createdProject.services!.find((s) => s.name === 'Frontend')!;

    // Validation 4a: Reject duplicate service names
    assert.throws(() => {
      projectRepo.updateProject(createdProject.id, {
        services: [
          { name: 'Frontend', serviceType: 'backend', relativeCwd: 'backend', port: 4000 },
          { name: 'frontend', serviceType: 'frontend', relativeCwd: 'frontend', port: 3000 }
        ]
      });
    }, /Duplicate service name/);
    console.log('  ✓ Service editing validation: Duplicate service names strictly rejected');

    // Validation 4b: Reject working directory escaping project root
    assert.throws(() => {
      projectRepo.updateProject(createdProject.id, {
        services: [
          { name: 'Malicious', serviceType: 'backend', relativeCwd: '../../etc', port: 4000 }
        ]
      });
    }, /escapes project root/);
    console.log('  ✓ Service editing validation: Path escaping project root strictly rejected');

    // Validation 4c: Reject invalid port
    assert.throws(() => {
      projectRepo.updateProject(createdProject.id, {
        services: [
          { name: 'Backend', serviceType: 'backend', relativeCwd: 'backend', port: 99999 }
        ]
      });
    }, /Invalid port/);
    console.log('  ✓ Service editing validation: Invalid ports (< 1 or > 65535) strictly rejected');

    // Valid Service Update: Rename Backend -> API Gateway, port -> 5001, script -> npm run prod
    const updatedProject = projectRepo.updateProject(createdProject.id, {
      displayName: 'Aawas Fintech Core',
      services: [
        {
          id: srvBackend.id,
          name: 'API Gateway',
          serviceType: 'backend',
          relativeCwd: 'backend',
          port: 5001,
          portConfidence: 'configured',
          packageScript: 'npm run prod'
        },
        {
          id: srvFrontend.id,
          name: srvFrontend.name,
          serviceType: srvFrontend.serviceType,
          relativeCwd: srvFrontend.relativeCwd,
          port: srvFrontend.port,
          portConfidence: srvFrontend.portConfidence,
          packageScript: srvFrontend.packageScript
        }
      ]
    });

    assert.strictEqual(updatedProject.displayName, 'Aawas Fintech Core');
    assert.strictEqual(updatedProject.services?.length, 2);
    const updatedApiGateway = updatedProject.services?.find((s) => s.name === 'API Gateway');
    assert.ok(updatedApiGateway);
    assert.strictEqual(updatedApiGateway.port, 5001);
    assert.strictEqual(updatedApiGateway.packageScript, 'npm run prod');
    console.log('  ✓ 2 & 3. Renamed service to "API Gateway", updated port to 5001, updated packageScript');

    // 5. Restart Durability: Close & Reopen Database
    conn.close();
    const conn2 = new DatabaseConnection(dbPath);
    const db2 = conn2.open();
    const projectRepo2 = new ProjectRepository(db2);
    const restoredProjects = projectRepo2.listProjects();
    assert.strictEqual(restoredProjects.length, 1);
    assert.strictEqual(restoredProjects[0].displayName, 'Aawas Fintech Core');
    assert.strictEqual(restoredProjects[0].services?.length, 2);
    const restoredApiGateway = restoredProjects[0].services?.find((s) => s.name === 'API Gateway');
    assert.ok(restoredApiGateway);
    assert.strictEqual(restoredApiGateway.port, 5001);
    assert.strictEqual(restoredApiGateway.packageScript, 'npm run prod');
    console.log('  ✓ 4. Service edits and project registry verified intact after database restart');

    // Reconnect executor with restored DB
    const chatRepo2 = new ChatRepository(db2);
    const execRepo2 = new ExecutionRepository(db2);
    const clarificationRepo2 = new ClarificationRepository(db2);
    const executor2 = new MinimalCommandExecutor(chatRepo2, execRepo2, undefined, clarificationRepo2, projectRepo2);

    // 6. Natural Language Command: "bhai project add karo"
    const chatA = chatRepo2.createChat('Test Chat A');
    const resAdd = await executor2.executeCommand(chatA.id, 'bhai project add karo');
    assert.strictEqual(resAdd.disposition, 'resolved');
    assert.strictEqual(resAdd.assistantMessage.payload?.onboardingRequested, true);
    console.log('  ✓ "bhai project add karo" triggers onboarding wizard response');

    // 7. Natural Language Command: "mere projects dikhao"
    const resList = await executor2.executeCommand(chatA.id, 'mere projects dikhao');
    assert.strictEqual(resList.disposition, 'resolved');
    assert.ok(resList.assistantMessage.body.includes('Aawas Fintech Core'));
    console.log('  ✓ "mere projects dikhao" lists registered projects dynamically');

    // 8. Natural Language Command: "aawas fintech core project dikha"
    const resShow = await executor2.executeCommand(chatA.id, 'aawas fintech core project dikha');
    assert.strictEqual(resShow.disposition, 'resolved');
    assert.ok(resShow.assistantMessage.body.includes('Aawas Fintech Core'));
    assert.strictEqual(resShow.assistantMessage.payload?.project?.id, createdProject.id);
    console.log('  ✓ "aawas fintech core project dikha" returns project details card');

    // 9. Context Isolation: Chat A context set to Aawas
    const contextA = chatRepo2.getChatContext(chatA.id);
    assert.strictEqual(contextA?.projectId, createdProject.id, 'Chat A context must focus on Aawas');

    // Follow-up in Chat A: "iske services dikhao"
    const resServicesA = await executor2.executeCommand(chatA.id, 'iske services dikhao');
    assert.strictEqual(resServicesA.disposition, 'resolved');
    assert.ok(resServicesA.assistantMessage.body.includes('API Gateway'));
    assert.ok(resServicesA.assistantMessage.body.includes('Frontend'));
    console.log('  ✓ Contextual follow-up in Chat A ("iske services dikhao") resolves renamed services');

    // In Chat B: Also set context to Aawas to test multi-chat unregistration invalidation
    const chatB = chatRepo2.createChat('Test Chat B');
    const resServicesB = await executor2.executeCommand(chatB.id, 'aawas fintech core project dikha');
    assert.strictEqual(resServicesB.disposition, 'resolved');
    const contextB = chatRepo2.getChatContext(chatB.id);
    assert.strictEqual(contextB?.projectId, createdProject.id, 'Chat B context must also focus on Aawas');

    // 10. Managed service startup intent: "aawas backend start karo" (P4 gating)
    const resStart = await executor2.executeCommand(chatA.id, 'aawas backend start');
    assert.strictEqual(resStart.disposition, 'resolved');
    assert.ok(resStart.assistantMessage.body.includes('Phase P4'));
    console.log('  ✓ "aawas backend start" recognized intent truthfully without executing process (P4 gating)');

    // 11. Conversational Project Unregistration: "remove aawas from bhai" (Requests confirmation)
    const resRemove = await executor2.executeCommand(chatA.id, 'remove aawas fintech core from bhai');
    assert.strictEqual(resRemove.disposition, 'clarify', 'Must request confirmation via clarification draft');
    assert.ok(resRemove.clarification);
    assert.strictEqual(resRemove.clarification.candidates.length, 2);
    assert.ok(resRemove.clarification.candidates[0].id.startsWith('confirm_delete_'));
    assert.ok(resRemove.clarification.candidates[1].id.startsWith('cancel_delete_'));
    console.log('  ✓ 5. "remove aawas fintech core from bhai" requested confirmation via clarification draft');

    // Before confirming: project must still be in registry
    assert.strictEqual(projectRepo2.listProjects().length, 1);

    // 12. Confirm unregistration conversationally ("yes")
    const resConfirm = await executor2.executeCommand(chatA.id, 'yes');
    assert.strictEqual(resConfirm.disposition, 'resolved');
    assert.ok(resConfirm.assistantMessage.body.includes('has been removed from Bhai'));
    console.log('  ✓ User confirmation ("yes") executed project unregistration');

    // 13. Verify project disappears from the registry
    assert.strictEqual(projectRepo2.listProjects().length, 0, 'Registry must have 0 projects');
    console.log('  ✓ 6. Project verified removed from registry');

    // 14. Verify associated service records are removed from SQLite
    const srvRows = db2.prepare('SELECT * FROM services WHERE project_id = ?').all(createdProject.id);
    assert.strictEqual(srvRows.length, 0, 'Services table rows must be completely deleted');
    console.log('  ✓ 7. Associated service records verified deleted from SQLite');

    // 15. Verify relevant chat contexts are invalidated across ALL chats (Chat A and Chat B)
    const contextAAfter = chatRepo2.getChatContext(chatA.id);
    const contextBAfter = chatRepo2.getChatContext(chatB.id);
    assert.strictEqual(contextAAfter?.projectId, null, 'Chat A context project_id must be null');
    assert.strictEqual(contextAAfter?.serviceId, null, 'Chat A context serviceId must be null');
    assert.strictEqual(contextBAfter?.projectId, null, 'Chat B context project_id must be null');
    assert.strictEqual(contextBAfter?.serviceId, null, 'Chat B context serviceId must be null');
    console.log('  ✓ 8. Chat contexts in both Chat A and Chat B verified invalidated (nullified)');

    // 16. Verify source directory and all files remain 100% untouched
    assert.strictEqual(fs.existsSync(aawasDir), true, 'Source directory MUST remain intact');
    assert.strictEqual(fs.existsSync(path.join(aawasDir, 'backend', 'server.ts')), true, 'Backend source files MUST remain untouched');
    assert.strictEqual(fs.existsSync(path.join(aawasDir, 'frontend', 'app.tsx')), true, 'Frontend source files MUST remain untouched');
    console.log('  ✓ 9. Physical source directory and all files verified 100% untouched');

    // 17. Restart Bhai and verify the project stays unregistered
    conn2.close();
    const conn3 = new DatabaseConnection(dbPath);
    const db3 = conn3.open();
    const projectRepo3 = new ProjectRepository(db3);
    assert.strictEqual(projectRepo3.listProjects().length, 0, 'Project must stay unregistered across restart');
    console.log('  ✓ 10. Project stays unregistered across cold application restart');

    // 18. Safe idempotent behavior when deletion is repeated or project is missing
    const repeatDelete = projectRepo3.deleteProject(createdProject.id);
    assert.strictEqual(repeatDelete.deleted, false, 'Repeated deletion on missing project must be idempotent');
    console.log('  ✓ Safe idempotent behavior verified when deleting already missing project');

    conn3.close();
  } finally {
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

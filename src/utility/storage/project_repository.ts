import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ProjectDto, ServiceDto, ServiceDefinitionDto } from '../../shared/contracts/dto';

export class ProjectRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public createProject(params: {
    displayName: string;
    canonicalRoot: string;
    detectedMetadata?: Record<string, any>;
    services?: ServiceDefinitionDto[];
  }): ProjectDto {
    const cleanName = params.displayName.trim();
    if (!cleanName) throw new Error('Project display name cannot be empty');

    const canonical = params.canonicalRoot.trim();
    if (!canonical) throw new Error('Project canonical root cannot be empty');

    // Check duplicate registration by canonical root
    const existing = this.getProjectByCanonicalRoot(canonical, true);
    if (existing) {
      if (existing.availability === 'unregistered' || existing.availability === 'archived') {
        // Safe re-registration: reactivate existing project, preserving all historical memory
        const now = Date.now();
        const grantId = existing.rootGrantId || `grant_${crypto.randomUUID()}`;
        const metadataJson = params.detectedMetadata ? JSON.stringify(params.detectedMetadata) : null;

        const tx = this.db.transaction(() => {
          if (!existing.rootGrantId) {
            this.db.prepare(`
              INSERT INTO path_grants (id, canonical_root, purpose, granted_at, revision)
              VALUES (?, ?, 'project_root', ?, 1)
            `).run(grantId, canonical, now);
          }

          this.db.prepare(`
            UPDATE projects
            SET display_name = ?,
                root_grant_id = ?,
                detected_metadata_json = ?,
                availability = 'available',
                archived_at = NULL,
                updated_at = ?,
                revision = revision + 1
            WHERE id = ?
          `).run(cleanName, grantId, metadataJson, now, existing.id);

          // Clear old services and insert new services if provided
          this.db.prepare('DELETE FROM services WHERE project_id = ?').run(existing.id);
          if (params.services && params.services.length > 0) {
            const stmt = this.db.prepare(`
              INSERT INTO services (id, project_id, name, service_type, relative_cwd, port, readiness_json, revision, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            `);

            for (const s of params.services) {
              const sId = s.id && s.id.startsWith('srv_') ? s.id : `srv_${crypto.randomUUID()}`;
              const readinessObj = {
                ...(s.readinessJson || {}),
                ...(s.packageScript ? { packageScript: s.packageScript } : {}),
                ...(s.portConfidence ? { portConfidence: s.portConfidence } : {})
              };
              const readiness = Object.keys(readinessObj).length > 0 ? JSON.stringify(readinessObj) : null;
              stmt.run(
                sId,
                existing.id,
                s.name.trim(),
                s.serviceType || 'custom',
                s.relativeCwd || '.',
                s.port || null,
                readiness,
                now,
                now
              );
            }
          }
        });
        tx();

        const reactivated = this.getProject(existing.id, true);
        if (!reactivated) throw new Error(`Failed to retrieve reactivated project '${existing.id}'`);
        return reactivated;
      }

      throw new Error(`Project is already registered at path: ${canonical} (Project: "${existing.displayName}")`);
    }

    const projectId = `proj_${crypto.randomUUID()}`;
    const grantId = `grant_${crypto.randomUUID()}`;
    const now = Date.now();
    const metadataJson = params.detectedMetadata ? JSON.stringify(params.detectedMetadata) : null;

    const tx = this.db.transaction(() => {
      // 1. Create path grant record
      this.db.prepare(`
        INSERT INTO path_grants (id, canonical_root, purpose, granted_at, revision)
        VALUES (?, ?, 'project_root', ?, 1)
      `).run(grantId, canonical, now);

      // 2. Insert project record
      this.db.prepare(`
        INSERT INTO projects (id, display_name, root_grant_id, canonical_root, detected_metadata_json, revision, availability, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 'available', ?, ?)
      `).run(projectId, cleanName, grantId, canonical, metadataJson, now, now);

      // 3. Insert service records if provided
      if (params.services && params.services.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO services (id, project_id, name, service_type, relative_cwd, port, readiness_json, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);

        for (const s of params.services) {
          const sId = s.id && s.id.startsWith('srv_') ? s.id : `srv_${crypto.randomUUID()}`;
          const readinessObj = {
            ...(s.readinessJson || {}),
            ...(s.packageScript ? { packageScript: s.packageScript } : {}),
            ...(s.portConfidence ? { portConfidence: s.portConfidence } : {})
          };
          const readiness = Object.keys(readinessObj).length > 0 ? JSON.stringify(readinessObj) : null;
          stmt.run(
            sId,
            projectId,
            s.name.trim(),
            s.serviceType || 'custom',
            s.relativeCwd || '.',
            s.port || null,
            readiness,
            now,
            now
          );
        }
      }
    });

    tx();

    const created = this.getProject(projectId);
    if (!created) throw new Error(`Failed to retrieve created project '${projectId}'`);
    return created;
  }

  public listProjects(includeArchived: boolean = false): ProjectDto[] {
    const sql = includeArchived
      ? `
        SELECT id, display_name as displayName, canonical_root as canonicalRoot,
               root_grant_id as rootGrantId, availability, archived_at as archivedAt,
               detected_metadata_json as detectedMetadataJson,
               revision, created_at as createdAt, updated_at as updatedAt
        FROM projects
        ORDER BY updated_at DESC
      `
      : `
        SELECT id, display_name as displayName, canonical_root as canonicalRoot,
               root_grant_id as rootGrantId, availability, archived_at as archivedAt,
               detected_metadata_json as detectedMetadataJson,
               revision, created_at as createdAt, updated_at as updatedAt
        FROM projects
        WHERE availability NOT IN ('removed', 'unregistered', 'archived')
        ORDER BY updated_at DESC
      `;

    const rows = this.db.prepare(sql).all() as Array<{
      id: string;
      displayName: string;
      canonicalRoot: string;
      rootGrantId: string | null;
      availability: 'available' | 'missing' | 'moved' | 'removed' | 'unregistered' | 'archived';
      archivedAt: number | null;
      detectedMetadataJson: string | null;
      revision: number;
      createdAt: number;
      updatedAt: number;
    }>;

    return rows.map((r) => {
      // Re-verify filesystem availability for non-archived projects
      let availability = r.availability;
      if (availability !== 'unregistered' && availability !== 'archived' && availability !== 'removed') {
        try {
          if (!fs.existsSync(r.canonicalRoot)) {
            availability = 'missing';
          } else {
            availability = 'available';
          }
        } catch {
          availability = 'missing';
        }
      }

      const services = this.listServicesForProject(r.id);
      return {
        id: r.id,
        displayName: r.displayName,
        canonicalRoot: r.canonicalRoot,
        rootGrantId: r.rootGrantId,
        availability,
        archivedAt: r.archivedAt ?? undefined,
        detectedMetadata: r.detectedMetadataJson ? JSON.parse(r.detectedMetadataJson) : null,
        services,
        revision: r.revision,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
    });
  }

  public getProject(id: string, includeArchived: boolean = false): ProjectDto | null {
    const r = this.db.prepare(`
      SELECT id, display_name as displayName, canonical_root as canonicalRoot,
             root_grant_id as rootGrantId, availability, archived_at as archivedAt,
             detected_metadata_json as detectedMetadataJson,
             revision, created_at as createdAt, updated_at as updatedAt
      FROM projects
      WHERE id = ?
    `).get(id) as {
      id: string;
      displayName: string;
      canonicalRoot: string;
      rootGrantId: string | null;
      availability: 'available' | 'missing' | 'moved' | 'removed' | 'unregistered' | 'archived';
      archivedAt: number | null;
      detectedMetadataJson: string | null;
      revision: number;
      createdAt: number;
      updatedAt: number;
    } | undefined;

    if (!r) return null;
    if (!includeArchived && (r.availability === 'unregistered' || r.availability === 'archived' || r.availability === 'removed')) {
      return null;
    }

    let availability = r.availability;
    if (availability !== 'unregistered' && availability !== 'archived' && availability !== 'removed') {
      try {
        if (!fs.existsSync(r.canonicalRoot)) {
          availability = 'missing';
        } else {
          availability = 'available';
        }
      } catch {
        availability = 'missing';
      }
    }

    const services = this.listServicesForProject(r.id);
    return {
      id: r.id,
      displayName: r.displayName,
      canonicalRoot: r.canonicalRoot,
      rootGrantId: r.rootGrantId,
      availability,
      archivedAt: r.archivedAt ?? undefined,
      detectedMetadata: r.detectedMetadataJson ? JSON.parse(r.detectedMetadataJson) : null,
      services,
      revision: r.revision,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  public getProjectByCanonicalRoot(canonicalRoot: string, includeArchived: boolean = false): ProjectDto | null {
    const r = this.db.prepare(`
      SELECT id FROM projects WHERE canonical_root = ?
    `).get(canonicalRoot) as { id: string } | undefined;

    if (!r) return null;
    return this.getProject(r.id, includeArchived);
  }

  public getProjectByName(name: string): ProjectDto[] {
    const clean = name.trim().toLowerCase();
    const all = this.listProjects();
    return all.filter((p) => p.displayName.toLowerCase() === clean);
  }

  public updateProject(id: string, updates: {
    displayName?: string;
    services?: ServiceDefinitionDto[];
  }): ProjectDto {
    const existing = this.getProject(id);
    if (!existing) throw new Error(`Project '${id}' not found`);

    const now = Date.now();
    const newDisplayName = updates.displayName ? updates.displayName.trim() : existing.displayName;
    if (updates.displayName !== undefined && !newDisplayName) {
      throw new Error('Project display name cannot be empty');
    }

    // Validate services if provided
    if (updates.services) {
      const seenNames = new Set<string>();
      for (const s of updates.services) {
        const cleanName = s.name.trim();
        if (!cleanName) {
          throw new Error('Service name cannot be empty');
        }
        const normName = cleanName.toLowerCase();
        if (seenNames.has(normName)) {
          throw new Error(`Duplicate service name '${cleanName}' in project '${existing.displayName}'`);
        }
        seenNames.add(normName);

        // Validate relativeCwd remains inside project root
        const relCwd = (s.relativeCwd || '.').trim();
        if (path.isAbsolute(relCwd)) {
          if (!relCwd.startsWith(existing.canonicalRoot)) {
            throw new Error(`Service directory '${relCwd}' must remain within project root`);
          }
        } else {
          const resolved = path.resolve(existing.canonicalRoot, relCwd);
          const relFromRoot = path.relative(existing.canonicalRoot, resolved);
          if (relFromRoot.startsWith('..')) {
            throw new Error(`Service directory '${s.relativeCwd}' escapes project root`);
          }
        }

        // Validate port
        if (s.port !== undefined && s.port !== null) {
          if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535) {
            throw new Error(`Invalid port: ${s.port}. Port must be an integer between 1 and 65535.`);
          }
        }
      }
    }

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE projects
        SET display_name = ?, updated_at = ?, revision = revision + 1
        WHERE id = ?
      `).run(newDisplayName, now, id);

      if (updates.services) {
        const newServiceIds: string[] = [];

        // Replace services transactionally
        this.db.prepare('DELETE FROM services WHERE project_id = ?').run(id);
        const stmt = this.db.prepare(`
          INSERT INTO services (id, project_id, name, service_type, relative_cwd, port, readiness_json, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);

        for (const s of updates.services) {
          const sId = s.id && s.id.startsWith('srv_') ? s.id : `srv_${crypto.randomUUID()}`;
          newServiceIds.push(sId);
          const readinessObj = {
            ...(s.readinessJson || {}),
            ...(s.packageScript ? { packageScript: s.packageScript } : {}),
            ...(s.portConfidence ? { portConfidence: s.portConfidence } : {})
          };
          const readiness = Object.keys(readinessObj).length > 0 ? JSON.stringify(readinessObj) : null;
          stmt.run(
            sId,
            id,
            s.name.trim(),
            s.serviceType || 'custom',
            s.relativeCwd || '.',
            s.port || null,
            readiness,
            now,
            now
          );
        }

        // Invalidate stale service_id references in chat_contexts
        if (newServiceIds.length > 0) {
          const placeholders = newServiceIds.map(() => '?').join(',');
          this.db.prepare(`
            UPDATE chat_contexts
            SET service_id = NULL, updated_at = ?
            WHERE project_id = ? AND service_id IS NOT NULL AND service_id NOT IN (${placeholders})
          `).run(now, id, ...newServiceIds);
        } else {
          this.db.prepare(`
            UPDATE chat_contexts
            SET service_id = NULL, updated_at = ?
            WHERE project_id = ?
          `).run(now, id);
        }
      }
    });

    tx();

    const updated = this.getProject(id);
    if (!updated) throw new Error(`Project '${id}' not found after update`);
    return updated;
  }

  public deleteProject(
    id: string,
    optionsOrChatId?: string | { permanent?: boolean; originChatId?: string }
  ): { deleted: boolean; projectName: string } {
    let permanent = false;
    let originChatId: string | undefined;

    if (typeof optionsOrChatId === 'string') {
      originChatId = optionsOrChatId;
    } else if (optionsOrChatId && typeof optionsOrChatId === 'object') {
      permanent = Boolean(optionsOrChatId.permanent);
      originChatId = optionsOrChatId.originChatId;
    }

    const existing = this.getProject(id, true);
    if (!existing) {
      // Idempotent: safe behavior when project is already missing or deleted
      return { deleted: false, projectName: id };
    }

    if (!permanent && (existing.availability === 'unregistered' || existing.availability === 'archived' || existing.availability === 'removed')) {
      // Idempotent: project is already unregistered/archived
      return { deleted: false, projectName: existing.displayName };
    }

    const now = Date.now();
    const tx = this.db.transaction(() => {
      // 1. Delete associated services
      this.db.prepare('DELETE FROM services WHERE project_id = ?').run(id);

      // 2. Invalidate any chat contexts that referenced this project
      this.db.prepare(`
        UPDATE chat_contexts
        SET project_id = NULL, service_id = NULL, updated_at = ?
        WHERE project_id = ?
      `).run(now, id);

      // 3. Invalidate any pending clarification drafts referencing this project
      this.db.prepare(`
        UPDATE clarification_drafts
        SET status = 'invalidated'
        WHERE candidates_json LIKE ? AND status = 'pending'
      `).run(`%${id}%`);

      if (permanent) {
        // EXPLICIT PERMANENT DELETION:
        // Purge all memory entities associated with the project
        this.db.prepare('DELETE FROM context_cache WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM mcp_authorizations WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_checkpoints WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_handoffs WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_tasks WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_decisions WHERE project_id = ?').run(id);
        this.db.prepare('DELETE FROM memory_records WHERE project_id = ?').run(id);

        // Delete path grant if any
        if (existing.rootGrantId) {
          this.db.prepare('DELETE FROM path_grants WHERE id = ?').run(existing.rootGrantId);
        }

        // Delete project row permanently
        this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      } else {
        // SAFE ARCHIVAL / UNREGISTRATION (DEFAULT):
        // Preserves all memory records, ADRs, tasks, handoffs, and checkpoints durably.
        // Marks project as unregistered and archived.
        this.db.prepare(`
          UPDATE projects
          SET availability = 'unregistered',
              archived_at = ?,
              updated_at = ?,
              revision = revision + 1
          WHERE id = ?
        `).run(now, now, id);
      }

      // 6. Update historical messages in messages table so cards immediately reflect unregistration
      const msgRows = this.db.prepare(`
        SELECT id, payload_json FROM messages WHERE payload_json LIKE ?
      `).all(`%${id}%`) as Array<{ id: string; payload_json: string }>;

      for (const row of msgRows) {
        try {
          const payload = JSON.parse(row.payload_json);
          let modified = false;

          if (payload.project && payload.project.id === id) {
            payload.project.availability = 'removed';
            modified = true;
          }

          if (payload.projects && Array.isArray(payload.projects)) {
            payload.projects = payload.projects.filter((p: any) => p.id !== id);
            modified = true;
          }

          if (modified) {
            this.db.prepare('UPDATE messages SET payload_json = ? WHERE id = ?')
              .run(JSON.stringify(payload), row.id);
          }
        } catch {
          // ignore parsing error
        }
      }

      // 7. If originChatId is provided, append unregistration confirmation message to that chat
      if (originChatId) {
        const lastSeqRow = this.db.prepare(
          'SELECT MAX(chat_seq) as maxSeq FROM messages WHERE chat_id = ?'
        ).get(originChatId) as { maxSeq: number | null } | undefined;
        const nextSeq = (lastSeqRow?.maxSeq || 0) + 1;
        const msgId = `msg_${crypto.randomUUID()}`;
        const bodyText = `Project **${existing.displayName}** has been removed from Bhai. All project files, Git history, and directories on your Mac remain untouched.`;
        const payloadJson = JSON.stringify({
          actionId: 'project.delete',
          deletedProjectId: id,
          projectName: existing.displayName,
          status: 'deleted'
        });

        this.db.prepare(`
          INSERT INTO messages (id, chat_id, chat_seq, role, kind, body, payload_json, created_at)
          VALUES (?, ?, ?, 'assistant', 'result', ?, ?, ?)
        `).run(msgId, originChatId, nextSeq, bodyText, payloadJson, now);

        this.db.prepare(`
          UPDATE chats SET updated_at = ?, revision = revision + 1 WHERE id = ?
        `).run(now, originChatId);
      }
    });

    tx();
    return { deleted: true, projectName: existing.displayName };
  }

  public listServicesForProject(projectId: string): ServiceDto[] {
    const rows = this.db.prepare(`
      SELECT id, project_id as projectId, name, service_type as serviceType, relative_cwd as relativeCwd,
             port, readiness_json as readinessJson, revision, created_at as createdAt, updated_at as updatedAt
      FROM services
      WHERE project_id = ?
      ORDER BY name ASC
    `).all(projectId) as Array<{
      id: string;
      projectId: string;
      name: string;
      serviceType: string;
      relativeCwd: string;
      port: number | null;
      readinessJson: string | null;
      revision: number;
      createdAt: number;
      updatedAt: number;
    }>;

    return rows.map((r) => {
      const parsedReadiness = r.readinessJson ? JSON.parse(r.readinessJson) : null;
      return {
        id: r.id,
        projectId: r.projectId,
        name: r.name,
        serviceType: r.serviceType,
        relativeCwd: r.relativeCwd,
        port: r.port,
        readiness: parsedReadiness,
        portConfidence: (parsedReadiness?.portConfidence as 'configured' | 'inferred') || undefined,
        packageScript: parsedReadiness?.packageScript || undefined,
        revision: r.revision,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
    });
  }
}

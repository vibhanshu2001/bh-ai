import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const P1_MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_p1_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        next_command_seq INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS chat_contexts (
        chat_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL DEFAULT 1,
        revision INTEGER NOT NULL DEFAULT 1,
        last_command_seq INTEGER NOT NULL DEFAULT 0,
        project_id TEXT,
        service_id TEXT,
        app_id TEXT,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        chat_seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        payload_json TEXT,
        command_id TEXT,
        execution_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        UNIQUE (chat_id, chat_seq)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_seq ON messages(chat_id, chat_seq);

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        command_seq INTEGER,
        origin_session_id TEXT,
        request_id TEXT,
        original_text TEXT NOT NULL,
        resolution_status TEXT NOT NULL,
        proposal_snapshot_json TEXT,
        resolver_version TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT,
        origin_chat_id TEXT,
        command_id TEXT,
        state TEXT NOT NULL,
        plan_hash TEXT,
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        summary_json TEXT,
        FOREIGN KEY (origin_chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS execution_steps (
        execution_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        state TEXT NOT NULL,
        action_id TEXT NOT NULL,
        output_json TEXT,
        error_json TEXT,
        started_at INTEGER,
        ended_at INTEGER,
        PRIMARY KEY (execution_id, step_id),
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS step_attempts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        attempt_no INTEGER NOT NULL,
        intent_at INTEGER NOT NULL,
        finished_at INTEGER,
        outcome TEXT NOT NULL,
        FOREIGN KEY (execution_id, step_id) REFERENCES execution_steps(execution_id, step_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS execution_events (
        execution_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        summary_json TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (execution_id, seq),
        FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL DEFAULT 1,
        value_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
      );
    `
  },
  {
    version: 2,
    name: '002_p2_aliases_and_clarification',
    sql: `
      CREATE TABLE IF NOT EXISTS aliases (
        id TEXT PRIMARY KEY,
        phrase TEXT NOT NULL,
        normalized_phrase TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        bindings_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON aliases(normalized_phrase, enabled, target_kind);

      CREATE TABLE IF NOT EXISTS clarification_drafts (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        command_id TEXT,
        original_text TEXT NOT NULL,
        question TEXT NOT NULL,
        candidates_json TEXT NOT NULL,
        config_revision INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_clarification_chat ON clarification_drafts(chat_id, status);
    `
  },
  {
    version: 3,
    name: '003_p3_projects_and_services',
    sql: `
      CREATE TABLE IF NOT EXISTS path_grants (
        id TEXT PRIMARY KEY,
        canonical_root TEXT NOT NULL UNIQUE,
        purpose TEXT NOT NULL,
        file_identity TEXT,
        granted_at INTEGER NOT NULL,
        revoked_at INTEGER,
        revision INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        root_grant_id TEXT,
        canonical_root TEXT NOT NULL UNIQUE,
        file_identity TEXT,
        detected_metadata_json TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        availability TEXT NOT NULL DEFAULT 'available',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (root_grant_id) REFERENCES path_grants(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_canonical_root ON projects(canonical_root);

      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'custom',
        relative_cwd TEXT NOT NULL DEFAULT '.',
        start_recipe_id TEXT,
        test_recipe_id TEXT,
        stop_recipe_id TEXT,
        port INTEGER,
        readiness_json TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (project_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_services_project ON services(project_id, name);
    `
  },
  {
    version: 4,
    name: '004_p4_memory_foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS memory_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'agent_claim',
        confidence TEXT NOT NULL DEFAULT 'unverified',
        author_type TEXT NOT NULL,
        author_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project_id, is_active, category);

      CREATE TABLE IF NOT EXISTS memory_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        assigned_agent TEXT,
        priority INTEGER NOT NULL DEFAULT 2,
        blockers_summary TEXT,
        completion_evidence TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memory_tasks_project ON memory_tasks(project_id, status);

      CREATE TABLE IF NOT EXISTS memory_decisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'proposed',
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        consequences TEXT NOT NULL,
        author_type TEXT NOT NULL,
        author_id TEXT NOT NULL,
        user_approval_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memory_decisions_project ON memory_decisions(project_id, status);

      CREATE TABLE IF NOT EXISTS memory_checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        checkpoint_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        client_sequence INTEGER,
        evidence_refs_json TEXT,
        tier TEXT NOT NULL DEFAULT 'agent_claim',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE SET NULL,
        UNIQUE (project_id, client_name, session_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created ON memory_checkpoints(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON memory_checkpoints(task_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS memory_handoffs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT NOT NULL,
        author_client TEXT NOT NULL,
        objective TEXT NOT NULL,
        completed_summary TEXT NOT NULL,
        remaining_summary TEXT NOT NULL,
        blockers_summary TEXT,
        decisions_summary TEXT,
        relevant_files_json TEXT NOT NULL DEFAULT '[]',
        test_status_summary TEXT,
        known_uncertainties TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_handoffs_project ON memory_handoffs(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS mcp_authorizations (
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        project_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        scopes TEXT NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (client_name, project_id)
      );

      CREATE TABLE IF NOT EXISTS context_cache (
        project_id TEXT NOT NULL,
        pack_mode TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        context_text TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, pack_mode),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `
  },
  {
    version: 5,
    name: '005_p4_fts5_indexing',
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        entity_id UNINDEXED,
        project_id UNINDEXED,
        entity_type UNINDEXED,
        title,
        content,
        tokenize = 'porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS trg_memory_records_ai AFTER INSERT ON memory_records BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'record', new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_records_ad AFTER DELETE ON memory_records BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_records_au AFTER UPDATE ON memory_records BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'record', new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_ai AFTER INSERT ON memory_decisions BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'decision', new.title, new.decision || ' ' || new.context || ' ' || new.consequences);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_ad AFTER DELETE ON memory_decisions BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_au AFTER UPDATE ON memory_decisions BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'decision', new.title, new.decision || ' ' || new.context || ' ' || new.consequences);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_ai AFTER INSERT ON memory_tasks BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'task', new.title, new.description || ' ' || coalesce(new.blockers_summary, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_ad AFTER DELETE ON memory_tasks BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_au AFTER UPDATE ON memory_tasks BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'task', new.title, new.description || ' ' || coalesce(new.blockers_summary, ''));
      END;
    `
  },
  {
    version: 6,
    name: '006_p4_project_memory_lifecycle',
    sql: `
      ALTER TABLE projects ADD COLUMN archived_at INTEGER;

      -- 1. memory_records with ON DELETE RESTRICT
      CREATE TABLE memory_records_v6 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'agent_claim',
        confidence TEXT NOT NULL DEFAULT 'unverified',
        author_type TEXT NOT NULL,
        author_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
      INSERT INTO memory_records_v6 SELECT * FROM memory_records;
      DROP TABLE memory_records;
      ALTER TABLE memory_records_v6 RENAME TO memory_records;
      CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project_id, is_active, category);

      -- 2. memory_tasks with ON DELETE RESTRICT
      CREATE TABLE memory_tasks_v6 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        assigned_agent TEXT,
        priority INTEGER NOT NULL DEFAULT 2,
        blockers_summary TEXT,
        completion_evidence TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
      INSERT INTO memory_tasks_v6 SELECT * FROM memory_tasks;
      DROP TABLE memory_tasks;
      ALTER TABLE memory_tasks_v6 RENAME TO memory_tasks;
      CREATE INDEX IF NOT EXISTS idx_memory_tasks_project ON memory_tasks(project_id, status);

      -- 3. memory_decisions with ON DELETE RESTRICT
      CREATE TABLE memory_decisions_v6 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'proposed',
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        consequences TEXT NOT NULL,
        author_type TEXT NOT NULL,
        author_id TEXT NOT NULL,
        user_approval_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
      INSERT INTO memory_decisions_v6 SELECT * FROM memory_decisions;
      DROP TABLE memory_decisions;
      ALTER TABLE memory_decisions_v6 RENAME TO memory_decisions;
      CREATE INDEX IF NOT EXISTS idx_memory_decisions_project ON memory_decisions(project_id, status);

      -- 4. memory_checkpoints with ON DELETE RESTRICT
      CREATE TABLE memory_checkpoints_v6 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        checkpoint_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        client_sequence INTEGER,
        evidence_refs_json TEXT,
        tier TEXT NOT NULL DEFAULT 'agent_claim',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE SET NULL,
        UNIQUE (project_id, client_name, session_id, idempotency_key)
      );
      INSERT INTO memory_checkpoints_v6 SELECT * FROM memory_checkpoints;
      DROP TABLE memory_checkpoints;
      ALTER TABLE memory_checkpoints_v6 RENAME TO memory_checkpoints;
      CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created ON memory_checkpoints(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON memory_checkpoints(task_id, created_at DESC);

      -- 5. memory_handoffs with ON DELETE RESTRICT
      CREATE TABLE memory_handoffs_v6 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT,
        session_id TEXT NOT NULL,
        author_client TEXT NOT NULL,
        objective TEXT NOT NULL,
        completed_summary TEXT NOT NULL,
        remaining_summary TEXT NOT NULL,
        blockers_summary TEXT,
        decisions_summary TEXT,
        relevant_files_json TEXT NOT NULL DEFAULT '[]',
        test_status_summary TEXT,
        known_uncertainties TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE SET NULL
      );
      INSERT INTO memory_handoffs_v6 SELECT * FROM memory_handoffs;
      DROP TABLE memory_handoffs;
      ALTER TABLE memory_handoffs_v6 RENAME TO memory_handoffs;
      CREATE INDEX IF NOT EXISTS idx_handoffs_project ON memory_handoffs(project_id, created_at DESC);

      -- 6. mcp_authorizations with ON DELETE RESTRICT
      CREATE TABLE mcp_authorizations_v6 (
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        project_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        scopes TEXT NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
        UNIQUE (client_name, project_id)
      );
      INSERT INTO mcp_authorizations_v6 SELECT * FROM mcp_authorizations;
      DROP TABLE mcp_authorizations;
      ALTER TABLE mcp_authorizations_v6 RENAME TO mcp_authorizations;

      -- 7. context_cache with ON DELETE RESTRICT
      CREATE TABLE context_cache_v6 (
        project_id TEXT NOT NULL,
        pack_mode TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        context_text TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, pack_mode),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
      );
      INSERT INTO context_cache_v6 SELECT * FROM context_cache;
      DROP TABLE context_cache;
      ALTER TABLE context_cache_v6 RENAME TO context_cache;

      -- 8. Recreate triggers for FTS5 synchronization
      CREATE TRIGGER IF NOT EXISTS trg_memory_records_ai AFTER INSERT ON memory_records BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'record', new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_records_ad AFTER DELETE ON memory_records BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_records_au AFTER UPDATE ON memory_records BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'record', new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_ai AFTER INSERT ON memory_decisions BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'decision', new.title, new.decision || ' ' || new.context || ' ' || new.consequences);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_ad AFTER DELETE ON memory_decisions BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_decisions_au AFTER UPDATE ON memory_decisions BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'decision', new.title, new.decision || ' ' || new.context || ' ' || new.consequences);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_ai AFTER INSERT ON memory_tasks BEGIN
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'task', new.title, new.description || ' ' || coalesce(new.blockers_summary, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_ad AFTER DELETE ON memory_tasks BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_tasks_au AFTER UPDATE ON memory_tasks BEGIN
        DELETE FROM memory_fts WHERE entity_id = old.id;
        INSERT INTO memory_fts(entity_id, project_id, entity_type, title, content)
        VALUES (new.id, new.project_id, 'task', new.title, new.description || ' ' || coalesce(new.blockers_summary, ''));
      END;
    `
  }
];

export const ALL_MIGRATIONS = P1_MIGRATIONS;

export function applyMigrations(db: Database.Database): void {
  // Ensure migration table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version, checksum FROM schema_migrations').all() as Array<{
    version: number;
    checksum: string;
  }>;
  const appliedMap = new Map<number, string>(appliedRows.map((r) => [r.version, r.checksum]));

  for (const mig of P1_MIGRATIONS) {
    const checksum = crypto.createHash('sha256').update(mig.sql.trim()).digest('hex');
    const existing = appliedMap.get(mig.version);

    if (existing) {
      if (existing !== checksum) {
        throw new Error(
          `Migration checksum mismatch for version ${mig.version} (${mig.name}). Stored: ${existing}, computed: ${checksum}`
        );
      }
      continue;
    }

    // Apply migration transactionally
    const runMigration = db.transaction(() => {
      db.exec(mig.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(mig.version, mig.name, checksum, Date.now());
    });

    runMigration();
  }
}

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { applyMigrations } from './migrations';

export class DatabaseConnection {
  private db: Database.Database | null = null;
  public readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public open(): Database.Database {
    if (this.db) {
      return this.db;
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    this.db = new Database(this.dbPath);

    // Apply strict PRAGMAs
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('busy_timeout = 5000');

    // Run forward-only migrations
    applyMigrations(this.db);

    return this.db;
  }

  public getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database connection not open');
    }
    return this.db;
  }

  public checkIntegrity(): string {
    const db = this.getDb();
    const result = db.pragma('integrity_check', { simple: true }) as string;
    return result;
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

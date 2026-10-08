import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { MIGRATIONS } from './migrations';

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __promptforgeDb?: DB; __promptforgeDbPath?: string };

export function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());
    })();
  }
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

/** Conexión única por proceso (reutilizada entre recargas en desarrollo). */
export function getDb(): DB {
  const file = env.databasePath;
  if (!globalForDb.__promptforgeDb || globalForDb.__promptforgeDbPath !== file) {
    globalForDb.__promptforgeDb?.close();
    globalForDb.__promptforgeDb = openDatabase(file);
    globalForDb.__promptforgeDbPath = file;
  }
  return globalForDb.__promptforgeDb;
}

/** Solo para tests: usa una base de datos concreta. */
export function setDbForTests(db: DB | null): void {
  globalForDb.__promptforgeDb = db ?? undefined;
  globalForDb.__promptforgeDbPath = db ? env.databasePath : undefined;
}

export const nowIso = () => new Date().toISOString();

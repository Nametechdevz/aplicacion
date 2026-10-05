import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';

export type DB = Database.Database;

export interface OpenOptions {
  file: string; // ':memory:' para pruebas
  backupDir?: string; // copia de seguridad automática antes de migrar
}

export function openDatabase(opts: OpenOptions): DB {
  if (opts.file !== ':memory:') fs.mkdirSync(path.dirname(opts.file), { recursive: true });
  const db = new Database(opts.file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db, opts);
  return db;
}

export function migrate(db: DB, opts?: OpenOptions) {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > MIGRATIONS.length) {
    throw new Error(`La base de datos fue creada por una versión más nueva de la aplicación (v${current}). Actualice la aplicación.`);
  }
  if (current === MIGRATIONS.length) return;
  if (current > 0 && opts?.backupDir && opts.file !== ':memory:') {
    fs.mkdirSync(opts.backupDir, { recursive: true });
    const target = path.join(opts.backupDir, `pre-migration-v${current}-${Date.now()}.db`);
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(opts.file, target);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

/** Construye un fragmento `IN (?, ?, ?)` seguro. */
export function inList(values: unknown[]): string {
  if (!values.length) return '(NULL)';
  return '(' + values.map(() => '?').join(',') + ')';
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined || s === '') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

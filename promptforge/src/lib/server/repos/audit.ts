import 'server-only';
import { getDb, nowIso } from '../db';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.locked'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.sessions_revoked'
  | 'prompt.deleted'
  | 'library.imported'
  | 'settings.updated'
  | 'ai.improve';

export function audit(action: AuditAction, opts: { userId?: string | null; ip?: string | null; detail?: string } = {}): void {
  try {
    getDb()
      .prepare('INSERT INTO audit_logs (user_id, action, ip, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(opts.userId ?? null, action, opts.ip ?? null, (opts.detail ?? '').slice(0, 500), nowIso());
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'audit_write_failed', action, err: String(err) }));
  }
}

export interface AuditEntry {
  id: number;
  action: string;
  ip: string | null;
  detail: string;
  created_at: string;
}

export function listAudit(userId: string, limit = 20): AuditEntry[] {
  return getDb()
    .prepare('SELECT id, action, ip, detail, created_at FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as AuditEntry[];
}

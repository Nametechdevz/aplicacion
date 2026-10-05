import type { Ctx } from '../context';
import { json } from '../db/database';

/** Auditoría (acciones de usuarios) + historial por contacto (etiquetas, estados, notas, asignaciones…). */
export class HistoryService {
  constructor(private ctx: Ctx) {}

  audit(action: string, opts: { accountId?: number | null; userId?: number | null; entityType?: string; entityId?: string | number; details?: unknown } = {}) {
    this.ctx.db
      .prepare('INSERT INTO audit_logs(account_id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(opts.accountId ?? null, opts.userId ?? null, action, opts.entityType ?? null, opts.entityId !== undefined ? String(opts.entityId) : null, opts.details !== undefined ? JSON.stringify(opts.details) : null, this.ctx.clock.now().toISOString());
  }

  contactEvent(accountId: number, contactId: number, type: string, details?: unknown, userId?: number | null) {
    this.ctx.db
      .prepare('INSERT INTO contact_events(account_id, contact_id, type, details, user_id, created_at) VALUES (?,?,?,?,?,?)')
      .run(accountId, contactId, type, details !== undefined ? JSON.stringify(details) : null, userId ?? null, this.ctx.clock.now().toISOString());
  }

  contactTimeline(contactId: number, limit = 200) {
    const rows = this.ctx.db
      .prepare(`SELECT e.*, u.display_name AS user_name FROM contact_events e LEFT JOIN users u ON u.id = e.user_id
                WHERE e.contact_id = ? ORDER BY e.id DESC LIMIT ?`)
      .all(contactId, limit) as any[];
    return rows.map((r) => ({ ...r, details: json(r.details, null) }));
  }

  auditList(opts: { accountId?: number; limit?: number; offset?: number; action?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.accountId) {
      where.push('(a.account_id = ? OR a.account_id IS NULL)');
      params.push(opts.accountId);
    }
    if (opts.action) {
      where.push('a.action LIKE ?');
      params.push(opts.action + '%');
    }
    const rows = this.ctx.db
      .prepare(`SELECT a.*, u.display_name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
      .all(...params, opts.limit ?? 100, opts.offset ?? 0) as any[];
    return rows.map((r) => ({ ...r, details: json(r.details, null) }));
  }
}

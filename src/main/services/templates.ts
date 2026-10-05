import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import type { QuickReply, Template, ProviderTemplate } from '../../shared/types';
import type { ProviderTemplateInfo } from '../whatsapp/provider';

export const TEMPLATE_CATEGORIES = ['Ventas', 'Soporte', 'Seguimiento', 'Bienvenida', 'Promociones', 'Otros'];

/** Plantillas internas, respuestas rápidas (/atajo) y plantillas aprobadas por WhatsApp (sincronizadas). */
export class TemplateService {
  constructor(private ctx: Ctx) {}

  list(accountId: number, category?: string): Template[] {
    return this.ctx.db.prepare(`SELECT * FROM templates WHERE account_id = ? ${category ? 'AND category = ?' : ''} ORDER BY category, name`).all(...(category ? [accountId, category] : [accountId])) as Template[];
  }

  get(accountId: number, id: number): Template {
    const t = this.ctx.db.prepare('SELECT * FROM templates WHERE id = ? AND account_id = ?').get(id, accountId) as Template | undefined;
    if (!t) throw notFound('La plantilla');
    return t;
  }

  save(accountId: number, input: { id?: number; name: string; category: string; body: string; media_id?: number | null }): Template {
    const name = input.name?.trim();
    if (!name) throw invalid('La plantilla necesita un nombre.');
    if (!input.body?.trim()) throw invalid('La plantilla está vacía.');
    if (input.body.length > 4096) throw invalid('La plantilla supera 4096 caracteres.');
    const cat = TEMPLATE_CATEGORIES.includes(input.category) ? input.category : 'Otros';
    const now = this.ctx.clock.now().toISOString();
    if (input.id) {
      this.get(accountId, input.id);
      this.ctx.db.prepare('UPDATE templates SET name = ?, category = ?, body = ?, media_id = ?, updated_at = ? WHERE id = ?').run(name, cat, input.body, input.media_id ?? null, now, input.id);
      return this.get(accountId, input.id);
    }
    const r = this.ctx.db.prepare('INSERT INTO templates(account_id, name, category, body, media_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(accountId, name, cat, input.body, input.media_id ?? null, now, now);
    return this.get(accountId, Number(r.lastInsertRowid));
  }

  delete(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  }

  // ---- Respuestas rápidas ----
  quickReplies(accountId: number): QuickReply[] {
    return this.ctx.db.prepare('SELECT * FROM quick_replies WHERE account_id = ? ORDER BY shortcut').all(accountId) as QuickReply[];
  }

  saveQuickReply(accountId: number, input: { id?: number; shortcut: string; body: string; media_id?: number | null }): QuickReply {
    const sc = input.shortcut.trim().replace(/^\/+/, '').toLowerCase();
    if (!/^[a-z0-9_-]{2,30}$/.test(sc)) throw invalid('El atajo debe tener 2–30 caracteres (letras, números, _ o -), sin espacios.');
    if (!input.body?.trim()) throw invalid('La respuesta está vacía.');
    const clash = this.ctx.db.prepare('SELECT id FROM quick_replies WHERE account_id = ? AND shortcut = ?').get(accountId, sc) as { id: number } | undefined;
    if (clash && clash.id !== input.id) throw invalid(`Ya existe la respuesta rápida /${sc}.`);
    if (input.id) {
      const r = this.ctx.db.prepare('UPDATE quick_replies SET shortcut = ?, body = ?, media_id = ? WHERE id = ? AND account_id = ?').run(sc, input.body, input.media_id ?? null, input.id, accountId);
      if (!r.changes) throw notFound('La respuesta rápida');
      return this.ctx.db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(input.id) as QuickReply;
    }
    const r = this.ctx.db.prepare('INSERT INTO quick_replies(account_id, shortcut, body, media_id) VALUES (?,?,?,?)').run(accountId, sc, input.body, input.media_id ?? null);
    return this.ctx.db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(Number(r.lastInsertRowid)) as QuickReply;
  }

  deleteQuickReply(accountId: number, id: number) {
    const r = this.ctx.db.prepare('DELETE FROM quick_replies WHERE id = ? AND account_id = ?').run(id, accountId);
    if (!r.changes) throw notFound('La respuesta rápida');
  }

  // ---- Plantillas aprobadas por WhatsApp ----
  providerTemplates(accountId: number, onlyApproved = false): ProviderTemplate[] {
    return this.ctx.db.prepare(`SELECT * FROM provider_templates WHERE account_id = ? ${onlyApproved ? "AND status = 'APPROVED'" : ''} ORDER BY name, language`).all(accountId) as ProviderTemplate[];
  }

  storeProviderTemplates(accountId: number, list: ProviderTemplateInfo[]) {
    const now = this.ctx.clock.now().toISOString();
    this.ctx.db.transaction(() => {
      const up = this.ctx.db.prepare(`INSERT INTO provider_templates(account_id, name, language, category, status, body_text, param_count, header_type, raw, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(account_id, name, language) DO UPDATE SET category = excluded.category, status = excluded.status, body_text = excluded.body_text, param_count = excluded.param_count, header_type = excluded.header_type, raw = excluded.raw, synced_at = excluded.synced_at`);
      for (const t of list) up.run(accountId, t.name, t.language, t.category, t.status, t.bodyText, t.paramCount, t.headerType, t.raw ? JSON.stringify(t.raw) : null, now);
      // Las plantillas que ya no existen en el proveedor quedan marcadas (no se borran para conservar historial).
      this.ctx.db.prepare("UPDATE provider_templates SET status = 'DELETED' WHERE account_id = ? AND synced_at != ?").run(accountId, now);
    })();
  }
}

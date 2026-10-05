import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { inList } from '../db/database';
import type { Tag } from '../../shared/types';
import type { HistoryService } from './history';

export const NO_CONTACT_KEY = 'no_contact';

const DEFAULT_TAGS: { name: string; color: string; emoji: string }[] = [
  { name: 'Cliente', color: '#22c55e', emoji: '🟢' },
  { name: 'Prospecto', color: '#3b82f6', emoji: '🔵' },
  { name: 'Interesado', color: '#eab308', emoji: '🟡' },
  { name: 'Cliente VIP', color: '#a855f7', emoji: '🟣' },
  { name: 'Pendiente', color: '#ef4444', emoji: '🔴' },
  { name: 'Compró', color: '#f97316', emoji: '🟠' },
  { name: 'Curso', color: '#a16207', emoji: '🟤' },
];

export class TagService {
  constructor(private ctx: Ctx, private history: HistoryService) {}

  /** Crea la etiqueta de sistema "No contactar" (y etiquetas iniciales si se pide). */
  ensureSystemTags(accountId: number, withDefaults = false) {
    const db = this.ctx.db;
    const exists = db.prepare('SELECT id FROM tags WHERE account_id = ? AND system_key = ?').get(accountId, NO_CONTACT_KEY);
    if (!exists) {
      const clash = db.prepare('SELECT id FROM tags WHERE account_id = ? AND name = ?').get(accountId, 'No contactar') as { id: number } | undefined;
      if (clash) db.prepare('UPDATE tags SET is_system = 1, system_key = ? WHERE id = ?').run(NO_CONTACT_KEY, clash.id);
      else db.prepare('INSERT INTO tags(account_id, name, color, emoji, is_system, system_key) VALUES (?,?,?,?,1,?)').run(accountId, 'No contactar', '#111827', '⚫', NO_CONTACT_KEY);
    }
    if (withDefaults) {
      const ins = db.prepare('INSERT OR IGNORE INTO tags(account_id, name, color, emoji) VALUES (?,?,?,?)');
      for (const t of DEFAULT_TAGS) ins.run(accountId, t.name, t.color, t.emoji);
    }
  }

  noContactTagId(accountId: number): number {
    this.ensureSystemTags(accountId);
    return (this.ctx.db.prepare('SELECT id FROM tags WHERE account_id = ? AND system_key = ?').get(accountId, NO_CONTACT_KEY) as { id: number }).id;
  }

  list(accountId: number): Tag[] {
    return this.ctx.db
      .prepare(`SELECT t.*, (SELECT COUNT(*) FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id WHERE ct.tag_id = t.id AND c.status = 'active') AS contact_count
                FROM tags t WHERE t.account_id = ? ORDER BY t.is_system DESC, t.name`)
      .all(accountId) as Tag[];
  }

  get(accountId: number, id: number): Tag {
    const t = this.ctx.db.prepare('SELECT * FROM tags WHERE id = ? AND account_id = ?').get(id, accountId) as Tag | undefined;
    if (!t) throw notFound('La etiqueta');
    return t;
  }

  findByName(accountId: number, name: string): Tag | undefined {
    return this.ctx.db.prepare('SELECT * FROM tags WHERE account_id = ? AND name = ?').get(accountId, name.trim()) as Tag | undefined;
  }

  create(accountId: number, input: { name: string; color?: string; emoji?: string | null }, actorId?: number | null): Tag {
    const name = input.name.trim();
    if (!name || name.length > 40) throw invalid('El nombre de la etiqueta debe tener entre 1 y 40 caracteres.');
    if (this.findByName(accountId, name)) throw invalid(`Ya existe una etiqueta llamada "${name}".`);
    const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? '') ? input.color! : '#22c55e';
    const r = this.ctx.db.prepare('INSERT INTO tags(account_id, name, color, emoji) VALUES (?,?,?,?)').run(accountId, name, color, input.emoji || null);
    this.history.audit('tag.create', { accountId, userId: actorId, entityType: 'tag', entityId: Number(r.lastInsertRowid), details: { name } });
    return this.get(accountId, Number(r.lastInsertRowid));
  }

  /** Busca por nombre o la crea (usado por importación CSV). */
  ensure(accountId: number, name: string): Tag {
    return this.findByName(accountId, name) ?? this.create(accountId, { name });
  }

  update(accountId: number, id: number, patch: { name?: string; color?: string; emoji?: string | null }, actorId?: number | null): Tag {
    const t = this.get(accountId, id);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name || name.length > 40) throw invalid('El nombre de la etiqueta debe tener entre 1 y 40 caracteres.');
      const other = this.findByName(accountId, name);
      if (other && other.id !== id) throw invalid(`Ya existe una etiqueta llamada "${name}".`);
    }
    if (patch.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(patch.color)) throw invalid('Color inválido.');
    this.ctx.db
      .prepare('UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color), emoji = ? WHERE id = ?')
      .run(patch.name?.trim() ?? null, patch.color ?? null, patch.emoji === undefined ? t.emoji : patch.emoji || null, id);
    this.history.audit('tag.update', { accountId, userId: actorId, entityType: 'tag', entityId: id, details: patch });
    return this.get(accountId, id);
  }

  delete(accountId: number, id: number, actorId?: number | null) {
    const t = this.get(accountId, id);
    if (t.is_system) throw invalid('Las etiquetas del sistema no pueden eliminarse.');
    this.ctx.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    this.history.audit('tag.delete', { accountId, userId: actorId, entityType: 'tag', entityId: id, details: { name: t.name } });
  }

  /** Asigna una etiqueta a varios contactos. Devuelve cuántos cambiaron. */
  assign(accountId: number, contactIds: number[], tagId: number, opts: { actorId?: number | null; automationDepth?: number; source?: string } = {}): number {
    const tag = this.get(accountId, tagId);
    const valid = this.ownedContactIds(accountId, contactIds);
    const ins = this.ctx.db.prepare('INSERT OR IGNORE INTO contact_tags(contact_id, tag_id, created_at) VALUES (?,?,?)');
    const changed: number[] = [];
    const now = this.ctx.clock.now().toISOString();
    this.ctx.db.transaction(() => {
      for (const cid of valid) {
        if (ins.run(cid, tagId, now).changes) {
          changed.push(cid);
          this.history.contactEvent(accountId, cid, 'tag_added', { tagId, name: tag.name, source: opts.source ?? 'manual' }, opts.actorId);
        }
      }
    })();
    for (const cid of changed) this.ctx.bus.emit('tag.added', { accountId, contactId: cid, tagId, automationDepth: opts.automationDepth });
    return changed.length;
  }

  unassign(accountId: number, contactIds: number[], tagId: number, opts: { actorId?: number | null; automationDepth?: number; source?: string } = {}): number {
    const tag = this.get(accountId, tagId);
    const valid = this.ownedContactIds(accountId, contactIds);
    const del = this.ctx.db.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?');
    const changed: number[] = [];
    this.ctx.db.transaction(() => {
      for (const cid of valid) {
        if (del.run(cid, tagId).changes) {
          changed.push(cid);
          this.history.contactEvent(accountId, cid, 'tag_removed', { tagId, name: tag.name, source: opts.source ?? 'manual' }, opts.actorId);
        }
      }
    })();
    for (const cid of changed) this.ctx.bus.emit('tag.removed', { accountId, contactId: cid, tagId, automationDepth: opts.automationDepth });
    return changed.length;
  }

  tagsFor(contactIds: number[]): Map<number, Tag[]> {
    const map = new Map<number, Tag[]>();
    if (!contactIds.length) return map;
    for (let i = 0; i < contactIds.length; i += 500) {
      const chunk = contactIds.slice(i, i + 500);
      const rows = this.ctx.db
        .prepare(`SELECT ct.contact_id, t.* FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id IN ${inList(chunk)} ORDER BY t.name`)
        .all(...chunk) as (Tag & { contact_id: number })[];
      for (const r of rows) {
        const { contact_id, ...tag } = r;
        if (!map.has(contact_id)) map.set(contact_id, []);
        map.get(contact_id)!.push(tag as Tag);
      }
    }
    return map;
  }

  contactHasTag(contactId: number, tagId: number): boolean {
    return !!this.ctx.db.prepare('SELECT 1 FROM contact_tags WHERE contact_id = ? AND tag_id = ?').get(contactId, tagId);
  }

  private ownedContactIds(accountId: number, ids: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = this.ctx.db.prepare(`SELECT id FROM contacts WHERE account_id = ? AND id IN ${inList(chunk)}`).all(accountId, ...chunk) as { id: number }[];
      out.push(...rows.map((r) => r.id));
    }
    return out;
  }
}

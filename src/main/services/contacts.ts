import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { inList } from '../db/database';
import { normalizePhone } from '../../shared/phone';
import type { ConsentStatus, Contact, ContactFilter } from '../../shared/types';
import type { HistoryService } from './history';
import type { TagService } from './tags';
import type { CustomFieldService } from './custom-fields';
import type { SegmentService } from './segments';
import { buildSegmentWhere } from './segments';
import type { SettingsService } from './settings';

export interface ContactInput {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  assigned_to?: number | null;
  consent_status?: ConsentStatus;
  consent_source?: string | null;
  source?: string | null;
  custom?: Record<string, string | number | null>;
  tagIds?: number[];
  import_batch_id?: string | null;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ContactService {
  constructor(
    private ctx: Ctx,
    private history: HistoryService,
    private tags: TagService,
    private fields: CustomFieldService,
    private segments: SegmentService,
    private settings: SettingsService,
  ) {}

  normalize(accountId: number, phone: string) {
    const cc = this.settings.get('general').defaultCountryCode;
    return normalizePhone(phone, cc);
  }

  private where(accountId: number, f: ContactFilter): { sql: string; params: unknown[] } {
    const w: string[] = ['c.account_id = ?'];
    const p: unknown[] = [accountId];
    w.push('c.status = ?');
    p.push(f.status ?? 'active');
    if (f.search?.trim()) {
      const s = f.search.trim();
      const digits = s.replace(/\D/g, '');
      const like = `%${likeEscape(s)}%`;
      const parts = [`c.name LIKE ? ESCAPE '\\'`, `c.email LIKE ? ESCAPE '\\'`, `c.company LIKE ? ESCAPE '\\'`];
      p.push(like, like, like);
      if (digits.length >= 3) {
        parts.push('c.phone LIKE ?');
        p.push(`%${digits}%`);
      }
      w.push('(' + parts.join(' OR ') + ')');
    }
    if (f.tagIds?.length) {
      if (f.tagMode === 'all') {
        for (const t of f.tagIds) {
          w.push('EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)');
          p.push(t);
        }
      } else {
        w.push(`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id IN ${inList(f.tagIds)})`);
        p.push(...f.tagIds);
      }
    }
    if (f.excludeTagIds?.length) {
      w.push(`NOT EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id IN ${inList(f.excludeTagIds)})`);
      p.push(...f.excludeTagIds);
    }
    if (f.segmentId) {
      const seg = this.segments.get(accountId, f.segmentId);
      const sw = buildSegmentWhere(seg.definition, this.ctx.clock.now());
      w.push(sw.sql);
      p.push(...sw.params);
    }
    if (f.consent) {
      w.push('c.consent_status = ?');
      p.push(f.consent);
    }
    if (f.blacklisted !== undefined) {
      w.push('c.blacklisted = ?');
      p.push(f.blacklisted ? 1 : 0);
    }
    if (f.assignedTo !== undefined) {
      if (f.assignedTo === null) w.push('c.assigned_to IS NULL');
      else {
        w.push('c.assigned_to = ?');
        p.push(f.assignedTo);
      }
    }
    return { sql: w.join(' AND '), params: p };
  }

  list(accountId: number, f: ContactFilter = {}): { rows: Contact[]; total: number } {
    const { sql, params } = this.where(accountId, f);
    const sortCol = { name: 'c.name COLLATE NOCASE', created_at: 'c.created_at', last_message_at: 'c.last_message_at' }[f.sort ?? 'created_at'] ?? 'c.created_at';
    const dir = f.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(Math.max(f.limit ?? 50, 1), 1000);
    const total = (this.ctx.db.prepare(`SELECT COUNT(*) n FROM contacts c WHERE ${sql}`).get(...params) as { n: number }).n;
    const rows = this.ctx.db
      .prepare(`SELECT c.*, u.display_name AS assigned_name FROM contacts c LEFT JOIN users u ON u.id = c.assigned_to
                WHERE ${sql} ORDER BY ${sortCol} ${dir} NULLS LAST, c.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, f.offset ?? 0) as Contact[];
    const tagMap = this.tags.tagsFor(rows.map((r) => r.id));
    for (const r of rows) r.tags = tagMap.get(r.id) ?? [];
    return { rows, total };
  }

  /** Todos los IDs que cumplen el filtro (para selección masiva "seleccionar todos los N"). */
  ids(accountId: number, f: ContactFilter = {}): number[] {
    const { sql, params } = this.where(accountId, f);
    return (this.ctx.db.prepare(`SELECT c.id FROM contacts c WHERE ${sql} ORDER BY c.id`).all(...params) as { id: number }[]).map((r) => r.id);
  }

  get(accountId: number, id: number): Contact {
    const c = this.ctx.db
      .prepare('SELECT c.*, u.display_name AS assigned_name FROM contacts c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.id = ? AND c.account_id = ?')
      .get(id, accountId) as Contact | undefined;
    if (!c) throw notFound('El contacto');
    c.tags = this.tags.tagsFor([id]).get(id) ?? [];
    c.custom = this.fields.valuesFor(id);
    const st = this.ctx.db
      .prepare(`SELECT cp.pipeline_id, cp.stage_id, s.name AS stage_name, s.color FROM contact_pipeline cp JOIN pipeline_stages s ON s.id = cp.stage_id
                JOIN pipelines p ON p.id = cp.pipeline_id WHERE cp.contact_id = ? ORDER BY p.is_default DESC LIMIT 1`)
      .get(id) as Contact['stage'];
    c.stage = st ?? null;
    return c;
  }

  findByPhone(accountId: number, phone: string): Contact | undefined {
    return this.ctx.db.prepare('SELECT * FROM contacts WHERE account_id = ? AND phone = ?').get(accountId, phone) as Contact | undefined;
  }

  activity(accountId: number, id: number) {
    this.get(accountId, id);
    const q = (sql: string) => (this.ctx.db.prepare(sql).get(id) as { n: number }).n;
    return {
      messagesSent: q("SELECT COUNT(*) n FROM messages WHERE contact_id = ? AND direction = 'out' AND status IN ('sent','delivered','read')"),
      messagesReceived: q("SELECT COUNT(*) n FROM messages WHERE contact_id = ? AND direction = 'in'"),
      campaignsReceived: q("SELECT COUNT(DISTINCT campaign_id) n FROM campaign_recipients WHERE contact_id = ? AND status IN ('sent','delivered','read')"),
      campaignsReplied: q('SELECT COUNT(DISTINCT campaign_id) n FROM campaign_recipients WHERE contact_id = ? AND replied_at IS NOT NULL'),
      campaigns: this.ctx.db
        .prepare(`SELECT cr.campaign_id, c.name, cr.status, cr.replied_at, cr.created_at FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
                  WHERE cr.contact_id = ? ORDER BY cr.id DESC LIMIT 20`)
        .all(id),
      automations: this.ctx.db
        .prepare(`SELECT r.id, r.status, r.started_at, a.name FROM automation_runs r JOIN automations a ON a.id = r.automation_id WHERE r.contact_id = ? ORDER BY r.id DESC LIMIT 20`)
        .all(id),
    };
  }

  private validateInput(input: Partial<ContactInput>) {
    if (input.email && !EMAIL_RE.test(input.email.trim())) throw invalid('El email no es válido.');
    for (const k of ['name', 'first_name', 'last_name', 'company'] as const) {
      if (input[k] && String(input[k]).length > 120) throw invalid(`El campo ${k} es demasiado largo.`);
    }
  }

  create(accountId: number, input: ContactInput, actorId?: number | null): Contact {
    this.validateInput(input);
    const ph = this.normalize(accountId, input.phone);
    if (!ph.ok) throw invalid(`Teléfono inválido: ${ph.reason}.`);
    if (this.findByPhone(accountId, ph.e164!)) throw invalid(`Ya existe un contacto con el número +${ph.e164}.`);
    const now = this.ctx.clock.now().toISOString();
    const name = input.name?.trim() || [input.first_name, input.last_name].filter(Boolean).join(' ').trim() || null;
    const consent = input.consent_status ?? 'unknown';
    const id = this.ctx.db.transaction(() => {
      const r = this.ctx.db
        .prepare(`INSERT INTO contacts(account_id, name, first_name, last_name, phone, email, company, assigned_to, consent_status, consent_source, consent_date, source, import_batch_id, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(accountId, name, input.first_name?.trim() || null, input.last_name?.trim() || null, ph.e164, input.email?.trim() || null, input.company?.trim() || null, input.assigned_to ?? null, consent, consent !== 'unknown' ? input.consent_source ?? 'manual' : null, consent !== 'unknown' ? now : null, input.source ?? 'manual', input.import_batch_id ?? null, now, now);
      const cid = Number(r.lastInsertRowid);
      if (input.custom) this.fields.setValues(accountId, cid, input.custom);
      this.history.contactEvent(accountId, cid, 'created', { source: input.source ?? 'manual' }, actorId);
      return cid;
    })();
    if (input.tagIds?.length) for (const t of input.tagIds) this.tags.assign(accountId, [id], t, { actorId, source: input.source ?? 'manual' });
    this.ctx.bus.emit('contact.created', { accountId, contactId: id, source: input.source ?? 'manual' });
    return this.get(accountId, id);
  }

  update(accountId: number, id: number, patch: Partial<ContactInput>, actorId?: number | null): Contact {
    const cur = this.get(accountId, id);
    this.validateInput(patch);
    let phone = cur.phone;
    if (patch.phone !== undefined && patch.phone !== cur.phone) {
      const ph = this.normalize(accountId, patch.phone);
      if (!ph.ok) throw invalid(`Teléfono inválido: ${ph.reason}.`);
      const other = this.findByPhone(accountId, ph.e164!);
      if (other && other.id !== id) throw invalid(`Ya existe otro contacto con el número +${ph.e164}.`);
      phone = ph.e164!;
    }
    const pick = <K extends keyof ContactInput>(k: K) => (patch[k] !== undefined ? (typeof patch[k] === 'string' ? (patch[k] as string).trim() || null : patch[k]) : (cur as any)[k]);
    let name = pick('name');
    if (patch.name === undefined && (patch.first_name !== undefined || patch.last_name !== undefined) && !cur.name) name = [pick('first_name'), pick('last_name')].filter(Boolean).join(' ') || null;
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare('UPDATE contacts SET name = ?, first_name = ?, last_name = ?, phone = ?, email = ?, company = ?, updated_at = ? WHERE id = ?')
        .run(name, pick('first_name'), pick('last_name'), phone, pick('email'), pick('company'), this.ctx.clock.now().toISOString(), id);
      if (patch.custom) this.fields.setValues(accountId, id, patch.custom);
    })();
    if (patch.assigned_to !== undefined && patch.assigned_to !== cur.assigned_to) this.assign(accountId, [id], patch.assigned_to ?? null, actorId);
    if (patch.consent_status && patch.consent_status !== cur.consent_status) this.setConsent(accountId, id, patch.consent_status, patch.consent_source ?? 'manual', actorId);
    this.history.contactEvent(accountId, id, 'updated', { fields: Object.keys(patch).filter((k) => k !== 'custom') }, actorId);
    this.ctx.bus.emit('contact.updated', { accountId, contactId: id });
    return this.get(accountId, id);
  }

  delete(accountId: number, ids: number[], actorId?: number | null): number {
    let n = 0;
    this.ctx.db.transaction(() => {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        // Cancela envíos pendientes antes de eliminar
        this.ctx.db.prepare(`UPDATE message_queue SET status = 'cancelled', last_error = 'Contacto eliminado' WHERE status = 'queued' AND contact_id IN ${inList(chunk)}`).run(...chunk);
        n += this.ctx.db.prepare(`DELETE FROM contacts WHERE account_id = ? AND id IN ${inList(chunk)}`).run(accountId, ...chunk).changes;
      }
    })();
    this.history.audit('contact.delete', { accountId, userId: actorId, entityType: 'contact', details: { count: n } });
    return n;
  }

  archive(accountId: number, ids: number[], archived: boolean, actorId?: number | null) {
    const st = this.ctx.db.prepare('UPDATE contacts SET status = ?, updated_at = ? WHERE id = ? AND account_id = ?');
    const now = this.ctx.clock.now().toISOString();
    let n = 0;
    this.ctx.db.transaction(() => {
      for (const id of ids) {
        if (st.run(archived ? 'archived' : 'active', now, id, accountId).changes) {
          n++;
          this.history.contactEvent(accountId, id, archived ? 'archived' : 'unarchived', null, actorId);
        }
      }
    })();
    return n;
  }

  assign(accountId: number, ids: number[], userId: number | null, actorId?: number | null) {
    const name = userId ? (this.ctx.db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as { display_name: string } | undefined)?.display_name : null;
    if (userId && !name) throw notFound('El usuario');
    const st = this.ctx.db.prepare('UPDATE contacts SET assigned_to = ?, updated_at = ? WHERE id = ? AND account_id = ?');
    const conv = this.ctx.db.prepare('UPDATE conversations SET assigned_to = ? WHERE contact_id = ? AND account_id = ?');
    const now = this.ctx.clock.now().toISOString();
    let n = 0;
    this.ctx.db.transaction(() => {
      for (const id of ids) {
        if (st.run(userId, now, id, accountId).changes) {
          conv.run(userId, id, accountId);
          n++;
          this.history.contactEvent(accountId, id, 'assigned', { userId, name }, actorId);
        }
      }
    })();
    return n;
  }

  /** Registro de consentimiento (opt-in / opt-out) con fuente y fecha. */
  setConsent(accountId: number, id: number, status: ConsentStatus, source: string, actorId?: number | null) {
    const cur = this.get(accountId, id);
    const now = this.ctx.clock.now().toISOString();
    this.ctx.db.prepare('UPDATE contacts SET consent_status = ?, consent_source = ?, consent_date = ?, updated_at = ? WHERE id = ?').run(status, source, now, now, id);
    this.history.contactEvent(accountId, id, 'consent_changed', { from: cur.consent_status, to: status, source }, actorId);
    if (status === 'opted_out') {
      this.tags.assign(accountId, [id], this.tags.noContactTagId(accountId), { actorId, source: 'opt_out' });
      this.cancelPendingFor(accountId, id, 'El contacto solicitó no recibir mensajes');
      this.ctx.bus.emit('contact.opted_out', { accountId, contactId: id });
    } else if (status === 'opted_in' && cur.consent_status === 'opted_out') {
      this.tags.unassign(accountId, [id], this.tags.noContactTagId(accountId), { actorId, source: 'opt_in' });
    }
  }

  setBlacklist(accountId: number, ids: number[], blacklisted: boolean, reason: string | null, actorId?: number | null) {
    const st = this.ctx.db.prepare('UPDATE contacts SET blacklisted = ?, blacklist_reason = ?, updated_at = ? WHERE id = ? AND account_id = ?');
    const now = this.ctx.clock.now().toISOString();
    let n = 0;
    this.ctx.db.transaction(() => {
      for (const id of ids) {
        if (st.run(blacklisted ? 1 : 0, blacklisted ? reason : null, now, id, accountId).changes) {
          n++;
          this.history.contactEvent(accountId, id, blacklisted ? 'blacklisted' : 'unblacklisted', { reason }, actorId);
          if (blacklisted) this.cancelPendingFor(accountId, id, 'Contacto en lista negra');
        }
      }
    })();
    return n;
  }

  /** Cancela envíos de campaña/programados pendientes para un contacto (opt-out / lista negra). */
  cancelPendingFor(accountId: number, contactId: number, reason: string) {
    const now = this.ctx.clock.now().toISOString();
    const items = this.ctx.db
      .prepare("SELECT id, message_id, campaign_id FROM message_queue WHERE account_id = ? AND contact_id = ? AND status = 'queued' AND source IN ('campaign','scheduled','automation')")
      .all(accountId, contactId) as { id: number; message_id: number | null; campaign_id: number | null }[];
    for (const it of items) {
      this.ctx.db.prepare("UPDATE message_queue SET status = 'cancelled', last_error = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(reason, now, it.id);
      if (it.message_id) this.ctx.db.prepare("UPDATE messages SET status = 'cancelled', error_message = ? WHERE id = ?").run(reason, it.message_id);
      this.ctx.db.prepare("UPDATE campaign_recipients SET status = 'cancelled', skip_reason = ? WHERE queue_id = ?").run(reason, it.id);
      this.ctx.bus.emit('queue.finished', { accountId, queueId: it.id, campaignId: it.campaign_id, runId: null, status: 'cancelled' });
    }
    this.ctx.db.prepare("UPDATE scheduled_messages SET status = 'cancelled' WHERE contact_id = ? AND status = 'scheduled'").run(contactId);
  }

  /** Motivo por el que NO se le puede enviar contenido promocional a un contacto, o null. */
  campaignBlockReason(c: Pick<Contact, 'id' | 'consent_status' | 'blacklisted' | 'status'>, noContactTagId: number): string | null {
    if (c.status !== 'active') return 'Contacto archivado';
    if (c.consent_status === 'opted_out') return 'El contacto solicitó no recibir mensajes (opt-out)';
    if (c.blacklisted) return 'Contacto en lista negra';
    if (this.tags.contactHasTag(c.id, noContactTagId)) return 'Etiqueta "No contactar"';
    return null;
  }

  /** Busca o crea el contacto de un mensaje entrante. Nunca inventa datos: usa solo el nombre de perfil recibido. */
  findOrCreateInbound(accountId: number, phoneE164: string, profileName: string | null): { contact: Contact; created: boolean } {
    const existing = this.findByPhone(accountId, phoneE164);
    if (existing) {
      if (!existing.name && profileName) {
        this.ctx.db.prepare('UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?').run(profileName.slice(0, 120), this.ctx.clock.now().toISOString(), existing.id);
        existing.name = profileName;
      }
      return { contact: existing, created: false };
    }
    const now = this.ctx.clock.now().toISOString();
    const r = this.ctx.db
      .prepare('INSERT INTO contacts(account_id, name, phone, source, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(accountId, profileName?.slice(0, 120) || null, phoneE164, 'whatsapp', now, now);
    const id = Number(r.lastInsertRowid);
    this.history.contactEvent(accountId, id, 'created', { source: 'whatsapp' });
    return { contact: this.findByPhone(accountId, phoneE164)!, created: true };
  }

  // ---- Notas ----
  addNote(accountId: number, contactId: number, body: string, actorId?: number | null) {
    this.get(accountId, contactId);
    const text = body.trim();
    if (!text) throw invalid('La nota está vacía.');
    if (text.length > 5000) throw invalid('La nota es demasiado larga (máx. 5000 caracteres).');
    const r = this.ctx.db.prepare('INSERT INTO notes(account_id, contact_id, body, created_by, created_at) VALUES (?,?,?,?,?)').run(accountId, contactId, text, actorId ?? null, this.ctx.clock.now().toISOString());
    this.history.contactEvent(accountId, contactId, 'note_added', { noteId: Number(r.lastInsertRowid) }, actorId);
    return Number(r.lastInsertRowid);
  }

  notes(accountId: number, contactId: number) {
    this.get(accountId, contactId);
    return this.ctx.db
      .prepare('SELECT n.*, u.display_name AS author_name FROM notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.contact_id = ? ORDER BY n.id DESC')
      .all(contactId);
  }

  deleteNote(accountId: number, noteId: number, actorId?: number | null) {
    const n = this.ctx.db.prepare('SELECT * FROM notes WHERE id = ? AND account_id = ?').get(noteId, accountId) as { contact_id: number } | undefined;
    if (!n) throw notFound('La nota');
    this.ctx.db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
    this.history.contactEvent(accountId, n.contact_id, 'note_deleted', { noteId }, actorId);
  }
}

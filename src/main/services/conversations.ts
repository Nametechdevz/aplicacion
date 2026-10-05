import type { Ctx } from '../context';
import { notFound } from '../core/errors';
import { inList } from '../db/database';
import type { Conversation, Message, MessageStatus } from '../../shared/types';
import { truncate } from '../../shared/text';
import type { ExternalMessage, InboundMessage, StatusUpdate, WhatsAppProvider } from '../whatsapp/provider';
import type { ContactService } from './contacts';
import type { TagService } from './tags';
import type { MediaService } from './media';
import type { SettingsService } from './settings';
import type { HistoryService } from './history';

const RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };

export interface ConversationFilter {
  search?: string;
  filter?: 'all' | 'unread' | 'tagged' | 'assigned_me' | 'unassigned' | 'unanswered' | 'recent';
  tagId?: number;
  userId?: number;
  limit?: number;
  offset?: number;
}

export function previewOf(type: string, body: string | null | undefined): string {
  const icons: Record<string, string> = { image: '📷 Imagen', video: '🎬 Video', audio: '🎵 Audio', document: '📄 Documento', sticker: '💟 Sticker', template: '📋 Plantilla' };
  if (body && body.trim()) return truncate(body.replace(/\s+/g, ' ').trim(), 120);
  return icons[type] ?? 'Mensaje';
}

export class ConversationService {
  private pendingStatuses = new Map<string, { u: StatusUpdate; accountId: number; at: number }>();

  constructor(
    private ctx: Ctx,
    private contacts: ContactService,
    private tags: TagService,
    private media: MediaService,
    private settings: SettingsService,
    private history: HistoryService,
  ) {}

  ensureConversation(accountId: number, contactId: number): number {
    const row = this.ctx.db.prepare('SELECT id FROM conversations WHERE account_id = ? AND contact_id = ?').get(accountId, contactId) as { id: number } | undefined;
    if (row) return row.id;
    const assigned = (this.ctx.db.prepare('SELECT assigned_to FROM contacts WHERE id = ?').get(contactId) as { assigned_to: number | null } | undefined)?.assigned_to ?? null;
    return Number(this.ctx.db.prepare('INSERT INTO conversations(account_id, contact_id, assigned_to, created_at) VALUES (?,?,?,?)').run(accountId, contactId, assigned, this.ctx.clock.now().toISOString()).lastInsertRowid);
  }

  get(accountId: number, id: number): Conversation {
    const c = this.ctx.db
      .prepare(`SELECT cv.*, ct.name AS contact_name, ct.phone AS contact_phone FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id WHERE cv.id = ? AND cv.account_id = ?`)
      .get(id, accountId) as Conversation | undefined;
    if (!c) throw notFound('La conversación');
    c.tags = this.tags.tagsFor([c.contact_id]).get(c.contact_id) ?? [];
    return c;
  }

  byContact(accountId: number, contactId: number): Conversation {
    return this.get(accountId, this.ensureConversation(accountId, contactId));
  }

  list(accountId: number, f: ConversationFilter = {}): { rows: Conversation[]; total: number } {
    const w = ['cv.account_id = ?', 'cv.last_message_at IS NOT NULL'];
    const p: unknown[] = [accountId];
    if (f.search?.trim()) {
      const s = `%${f.search.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      const digits = f.search.replace(/\D/g, '');
      w.push(`(ct.name LIKE ? ESCAPE '\\' ${digits.length >= 3 ? 'OR ct.phone LIKE ?' : ''} OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.body LIKE ? ESCAPE '\\'))`);
      p.push(s);
      if (digits.length >= 3) p.push(`%${digits}%`);
      p.push(s);
    }
    switch (f.filter) {
      case 'unread':
        w.push('cv.unread_count > 0');
        break;
      case 'tagged':
        w.push('EXISTS (SELECT 1 FROM contact_tags x WHERE x.contact_id = cv.contact_id)');
        break;
      case 'assigned_me':
        w.push('cv.assigned_to = ?');
        p.push(f.userId ?? -1);
        break;
      case 'unassigned':
        w.push('cv.assigned_to IS NULL');
        break;
      case 'unanswered':
        w.push('cv.awaiting_reply = 1');
        break;
      case 'recent':
        w.push('cv.last_message_at >= ?');
        p.push(new Date(this.ctx.clock.now().getTime() - 86400000).toISOString());
        break;
    }
    if (f.tagId) {
      w.push('EXISTS (SELECT 1 FROM contact_tags x WHERE x.contact_id = cv.contact_id AND x.tag_id = ?)');
      p.push(f.tagId);
    }
    const sql = w.join(' AND ');
    const total = (this.ctx.db.prepare(`SELECT COUNT(*) n FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id WHERE ${sql}`).get(...p) as { n: number }).n;
    const rows = this.ctx.db
      .prepare(`SELECT cv.*, ct.name AS contact_name, ct.phone AS contact_phone FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id
                WHERE ${sql} ORDER BY cv.last_message_at DESC LIMIT ? OFFSET ?`)
      .all(...p, Math.min(f.limit ?? 50, 200), f.offset ?? 0) as Conversation[];
    const tagMap = this.tags.tagsFor(rows.map((r) => r.contact_id));
    for (const r of rows) r.tags = tagMap.get(r.contact_id) ?? [];
    return { rows, total };
  }

  messages(accountId: number, conversationId: number, opts: { beforeId?: number; limit?: number } = {}): Message[] {
    this.get(accountId, conversationId);
    const rows = this.ctx.db
      .prepare(`SELECT m.*, ml.id AS m_id, ml.kind AS m_kind, ml.file_name AS m_file_name, ml.mime_type AS m_mime, ml.size AS m_size
                FROM messages m LEFT JOIN media_library ml ON ml.id = m.media_id
                WHERE m.conversation_id = ? ${opts.beforeId ? 'AND m.id < ?' : ''} ORDER BY m.id DESC LIMIT ?`)
      .all(...(opts.beforeId ? [conversationId, opts.beforeId] : [conversationId]), Math.min(opts.limit ?? 60, 300)) as any[];
    return rows.reverse().map(({ m_id, m_kind, m_file_name, m_mime, m_size, ...m }) => ({
      ...m,
      media: m_id ? { id: m_id, kind: m_kind, file_name: m_file_name, mime_type: m_mime, size: m_size } : null,
    }));
  }

  markRead(accountId: number, conversationId: number) {
    this.ctx.db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ? AND account_id = ?').run(conversationId, accountId);
    this.ctx.bus.emit('conversation.updated', { accountId, conversationId });
  }

  setStatus(accountId: number, conversationId: number, status: 'open' | 'closed') {
    this.get(accountId, conversationId);
    this.ctx.db.prepare('UPDATE conversations SET status = ?, awaiting_reply = CASE WHEN ? = \'closed\' THEN 0 ELSE awaiting_reply END WHERE id = ?').run(status, status, conversationId);
    this.ctx.bus.emit('conversation.updated', { accountId, conversationId });
  }

  /** Modo humano: pausa automatizaciones/IA en la conversación hasta `until` (o la reactiva con null). */
  setBotPause(accountId: number, conversationId: number, until: Date | null) {
    this.ctx.db.prepare('UPDATE conversations SET bot_paused_until = ? WHERE id = ? AND account_id = ?').run(until ? until.toISOString() : null, conversationId, accountId);
    this.ctx.bus.emit('conversation.updated', { accountId, conversationId });
  }

  isBotPaused(accountId: number, contactId: number): boolean {
    const r = this.ctx.db.prepare('SELECT bot_paused_until FROM conversations WHERE account_id = ? AND contact_id = ?').get(accountId, contactId) as { bot_paused_until: string | null } | undefined;
    return !!r?.bot_paused_until && new Date(r.bot_paused_until) > this.ctx.clock.now();
  }

  /** Se llama cuando un agente envía manualmente: activa el modo humano. */
  onAgentMessage(accountId: number, conversationId: number) {
    const hm = this.settings.get('humanMode', accountId);
    const now = this.ctx.clock.now();
    this.ctx.db.prepare('UPDATE conversations SET awaiting_reply = 0, unread_count = 0 WHERE id = ?').run(conversationId);
    if (hm.enabled) this.setBotPause(accountId, conversationId, new Date(now.getTime() + hm.pauseMinutes * 60000));
  }

  /** Registra un mensaje saliente en la conversación (al encolarse). */
  touchOutbound(accountId: number, conversationId: number, contactId: number, type: string, body: string | null) {
    const now = this.ctx.clock.now().toISOString();
    const pv = previewOf(type, body);
    this.ctx.db.prepare("UPDATE conversations SET last_message_at = ?, last_message_preview = ?, last_direction = 'out' WHERE id = ?").run(now, pv, conversationId);
    this.ctx.db.prepare('UPDATE contacts SET last_message_at = ?, last_message_preview = ? WHERE id = ?').run(now, pv, contactId);
  }

  /** Procesa un mensaje entrante del proveedor. Idempotente frente a reintentos del webhook. */
  async ingestInbound(accountId: number, msg: InboundMessage, provider?: WhatsAppProvider): Promise<number | null> {
    const db = this.ctx.db;
    if (db.prepare('SELECT 1 FROM messages WHERE account_id = ? AND provider_message_id = ?').get(accountId, msg.providerMessageId)) return null;
    const now = this.ctx.clock.now().toISOString();
    const receivedAt = msg.timestamp && !Number.isNaN(msg.timestamp.getTime()) ? msg.timestamp.toISOString() : now;
    const { contact, created } = this.contacts.findOrCreateInbound(accountId, msg.from, msg.profileName);
    const convId = this.ensureConversation(accountId, contact.id);
    const conv = db.prepare('SELECT last_direction FROM conversations WHERE id = ?').get(convId) as { last_direction: string | null };
    const wasAwaitingReply = conv.last_direction === 'out';
    const type = msg.media ? msg.media.kind : msg.type === 'unknown' ? 'unknown' : 'text';
    const pv = previewOf(type, msg.text);
    const messageId = db.transaction(() => {
      const r = db
        .prepare(`INSERT INTO messages(account_id, conversation_id, contact_id, direction, type, body, status, source, provider_message_id, reply_to_provider_id, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(accountId, convId, contact.id, 'in', type, msg.text, 'received', 'inbound', msg.providerMessageId, msg.replyToProviderId ?? null, receivedAt);
      db.prepare(`UPDATE conversations SET unread_count = unread_count + 1, last_message_at = ?, last_message_preview = ?, last_direction = 'in', awaiting_reply = 1, status = 'open' WHERE id = ?`).run(now, pv, convId);
      db.prepare('UPDATE contacts SET last_message_at = ?, last_inbound_at = ?, last_message_preview = ?, updated_at = ? WHERE id = ?').run(now, now, pv, now, contact.id);
      return Number(r.lastInsertRowid);
    })();
    if (created) this.ctx.bus.emit('contact.created', { accountId, contactId: contact.id, source: 'whatsapp' });
    this.ctx.bus.emit('message.received', { accountId, contactId: contact.id, conversationId: convId, messageId, text: msg.text ?? '', type, isNewContact: created, wasAwaitingReply });
    this.ctx.bus.emit('conversation.updated', { accountId, conversationId: convId });

    if (msg.media && provider?.downloadMedia) {
      try {
        const { data, mimeType } = await provider.downloadMedia(msg.media.providerMediaId);
        const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
        const item = this.media.importBuffer(accountId, data, { fileName: msg.media.fileName || `${msg.media.kind}-${messageId}.${ext}`, mimeType, inLibrary: false, kind: msg.media.kind, validate: false });
        db.prepare('UPDATE messages SET media_id = ? WHERE id = ?').run(item.id, messageId);
        this.ctx.bus.emit('conversation.updated', { accountId, conversationId: convId });
      } catch (e) {
        this.ctx.log.warn('whatsapp', `No se pudo descargar multimedia entrante (mensaje ${messageId})`, e);
        db.prepare('UPDATE messages SET error_message = ? WHERE id = ?').run('No se pudo descargar el archivo multimedia.', messageId);
      }
    }
    return messageId;
  }

  /**
   * Historial reciente entregado por el conector (ej. al vincular por QR). Se guarda como
   * historial: no dispara automatizaciones, IA ni notificaciones, y no marca como no leído.
   */
  ingestHistory(accountId: number, list: ExternalMessage[]): number {
    const db = this.ctx.db;
    let n = 0;
    const touched = new Set<number>();
    db.transaction(() => {
      for (const m of [...list].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
        if (db.prepare('SELECT 1 FROM messages WHERE account_id = ? AND provider_message_id = ?').get(accountId, m.providerMessageId)) continue;
        const { contact } = this.contacts.findOrCreateInbound(accountId, m.phone, m.direction === 'in' ? m.profileName ?? null : null);
        const convId = this.ensureConversation(accountId, contact.id);
        const at = m.timestamp.toISOString();
        db.prepare(`INSERT INTO messages(account_id, conversation_id, contact_id, direction, type, body, status, source, provider_message_id, created_at, sent_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(accountId, convId, contact.id, m.direction, m.type, m.text, m.direction === 'in' ? 'received' : 'sent', m.direction === 'in' ? 'inbound' : 'phone', m.providerMessageId, at, m.direction === 'out' ? at : null);
        const pv = previewOf(m.type, m.text);
        db.prepare(`UPDATE conversations SET last_message_at = ?, last_message_preview = ?, last_direction = ? WHERE id = ? AND (last_message_at IS NULL OR last_message_at < ?)`).run(at, pv, m.direction, convId, at);
        db.prepare(`UPDATE contacts SET last_message_at = ?, last_message_preview = ? WHERE id = ? AND (last_message_at IS NULL OR last_message_at < ?)`).run(at, pv, contact.id, at);
        if (m.direction === 'in') db.prepare('UPDATE contacts SET last_inbound_at = ? WHERE id = ? AND (last_inbound_at IS NULL OR last_inbound_at < ?)').run(at, contact.id, at);
        touched.add(convId);
        n++;
      }
    })();
    for (const c of touched) this.ctx.bus.emit('conversation.updated', { accountId, conversationId: c });
    return n;
  }

  /** Mensaje enviado desde el teléfono u otro dispositivo: queda en la conversación y activa el modo humano. */
  ingestOutboundExternal(accountId: number, m: ExternalMessage): number | null {
    const db = this.ctx.db;
    if (db.prepare('SELECT 1 FROM messages WHERE account_id = ? AND provider_message_id = ?').get(accountId, m.providerMessageId)) return null;
    const { contact } = this.contacts.findOrCreateInbound(accountId, m.phone, null);
    const convId = this.ensureConversation(accountId, contact.id);
    const at = m.timestamp.toISOString();
    const id = Number(
      db.prepare(`INSERT INTO messages(account_id, conversation_id, contact_id, direction, type, body, status, source, provider_message_id, created_at, sent_at)
                  VALUES (?,?,?,'out',?,?,'sent','phone',?,?,?)`).run(accountId, convId, contact.id, m.type, m.text, m.providerMessageId, at, at).lastInsertRowid,
    );
    this.touchOutbound(accountId, convId, contact.id, m.type, m.text);
    this.onAgentMessage(accountId, convId);
    this.flushPendingStatus(m.providerMessageId);
    this.ctx.bus.emit('conversation.updated', { accountId, conversationId: convId });
    return id;
  }

  /** Aplica un estado (sent/delivered/read/failed) reportado por el proveedor. Nunca retrocede de estado. */
  applyStatus(accountId: number, u: StatusUpdate): boolean {
    const db = this.ctx.db;
    const m = db.prepare('SELECT id, status, conversation_id, contact_id, campaign_id FROM messages WHERE account_id = ? AND provider_message_id = ?').get(accountId, u.providerMessageId) as
      | { id: number; status: MessageStatus; conversation_id: number; contact_id: number; campaign_id: number | null }
      | undefined;
    if (!m) {
      // Puede llegar antes de que guardemos el id del proveedor: se aplica luego.
      this.pendingStatuses.set(u.providerMessageId, { u, accountId, at: Date.now() });
      if (this.pendingStatuses.size > 5000) this.prunePending();
      return false;
    }
    const ts = u.timestamp.toISOString();
    let next: MessageStatus = m.status;
    if (u.status === 'failed') {
      if (m.status === 'read' || m.status === 'delivered') return false;
      next = 'failed';
      db.prepare("UPDATE messages SET status = 'failed', failed_at = ?, error_code = ?, error_message = ? WHERE id = ?").run(ts, u.errorCode ?? null, u.errorMessage ?? null, m.id);
      db.prepare("UPDATE message_queue SET status = 'failed', last_error = ?, last_error_code = ? WHERE message_id = ?").run(u.errorMessage ?? 'Falló la entrega', u.errorCode ?? null, m.id);
      db.prepare("UPDATE campaign_recipients SET status = 'failed', skip_reason = ? WHERE message_id = ?").run(u.errorMessage ?? 'Falló la entrega', m.id);
      if (u.errorCode === '131050') {
        // El usuario bloqueó el marketing de esta empresa: se respeta como opt-out.
        try {
          this.contacts.setConsent(accountId, m.contact_id, 'opted_out', 'whatsapp_marketing_block');
        } catch {
          /* contacto eliminado */
        }
      }
    } else {
      if ((RANK[u.status] ?? 0) <= (RANK[m.status] ?? -1) || m.status === 'failed' || m.status === 'cancelled') return false;
      next = u.status;
      const col = u.status === 'sent' ? 'sent_at' : u.status === 'delivered' ? 'delivered_at' : 'read_at';
      db.prepare(`UPDATE messages SET status = ?, ${col} = COALESCE(${col}, ?), sent_at = COALESCE(sent_at, ?) WHERE id = ?`).run(next, ts, ts, m.id);
      if (u.status === 'read') db.prepare('UPDATE messages SET delivered_at = COALESCE(delivered_at, ?) WHERE id = ?').run(ts, m.id);
      db.prepare('UPDATE message_queue SET status = ? WHERE message_id = ? AND status IN (\'sent\',\'delivered\',\'read\')').run(next, m.id);
      db.prepare("UPDATE campaign_recipients SET status = ? WHERE message_id = ? AND status IN ('sent','delivered','read')").run(next, m.id);
    }
    this.ctx.bus.emit('message.status', { accountId, messageId: m.id, status: next, conversationId: m.conversation_id, campaignId: m.campaign_id });
    if (m.campaign_id) this.ctx.bus.emit('campaign.progress', { accountId, campaignId: m.campaign_id });
    return true;
  }

  /** Aplica estados que llegaron antes de registrar el id del proveedor. */
  flushPendingStatus(providerMessageId: string) {
    const p = this.pendingStatuses.get(providerMessageId);
    if (!p) return;
    this.pendingStatuses.delete(providerMessageId);
    this.applyStatus(p.accountId, p.u);
  }

  private prunePending() {
    const cutoff = Date.now() - 10 * 60000;
    for (const [k, v] of this.pendingStatuses) if (v.at < cutoff) this.pendingStatuses.delete(k);
  }

  /** Últimos mensajes de una conversación para dar contexto a la IA. */
  recentForContext(conversationId: number, limit: number) {
    return (this.ctx.db
      .prepare("SELECT direction, type, body, created_at FROM messages WHERE conversation_id = ? AND status NOT IN ('cancelled','failed') ORDER BY id DESC LIMIT ?")
      .all(conversationId, limit) as { direction: 'in' | 'out'; type: string; body: string | null; created_at: string }[]).reverse();
  }

  unreadTotal(accountId: number): number {
    return (this.ctx.db.prepare('SELECT COALESCE(SUM(unread_count),0) n FROM conversations WHERE account_id = ?').get(accountId) as { n: number }).n;
  }

  contactIdsWithConversations(accountId: number, ids: number[]) {
    if (!ids.length) return [];
    return this.ctx.db.prepare(`SELECT contact_id FROM conversations WHERE account_id = ? AND contact_id IN ${inList(ids)}`).all(accountId, ...ids);
  }
}

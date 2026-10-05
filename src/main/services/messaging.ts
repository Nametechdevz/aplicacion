import type { Ctx } from '../context';
import { AppError, invalid, notFound } from '../core/errors';
import { randomId } from '../core/crypto';
import type { ContactService } from './contacts';
import type { ConversationService } from './conversations';
import type { MediaService } from './media';
import type { CustomFieldService } from './custom-fields';
import type { SettingsService } from './settings';
import { renderTemplate } from '../../shared/variables';
import type { Contact, ProviderTemplate } from '../../shared/types';

export interface EnqueueInput {
  accountId: number;
  contactId: number;
  kind: 'text' | 'media' | 'template';
  text?: string | null;
  mediaId?: number | null;
  template?: { providerTemplateId: number; params: string[] } | null;
  source: 'manual' | 'campaign' | 'automation' | 'ai' | 'scheduled' | 'system';
  idempotencyKey: string;
  campaignId?: number | null;
  runId?: number | null;
  automationRunId?: number | null;
  userId?: number | null;
  priority?: number;
  scheduledAt?: Date;
  maxAttempts?: number;
  replyToProviderId?: string | null;
}

export interface EnqueueResult {
  queueId: number;
  messageId: number;
  duplicate: boolean;
}

/**
 * Punto único de entrada para TODO envío saliente. Crea el mensaje (estado `queued`) y el elemento de
 * cola con una clave de idempotencia única: dos llamadas con la misma clave nunca generan dos envíos.
 */
export class MessagingService {
  constructor(
    private ctx: Ctx,
    private contacts: ContactService,
    private conversations: ConversationService,
    private media: MediaService,
    private fields: CustomFieldService,
    private settings: SettingsService,
  ) {}

  providerTemplate(accountId: number, id: number): ProviderTemplate {
    const t = this.ctx.db.prepare('SELECT * FROM provider_templates WHERE id = ? AND account_id = ?').get(id, accountId) as ProviderTemplate | undefined;
    if (!t) throw notFound('La plantilla aprobada');
    return t;
  }

  /** Texto que verá el usuario en el historial para un mensaje de plantilla. */
  templatePreview(t: ProviderTemplate, params: string[]): string {
    return (t.body_text ?? `[Plantilla ${t.name}]`).replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? '');
  }

  enqueue(input: EnqueueInput): EnqueueResult {
    const db = this.ctx.db;
    const existing = db.prepare('SELECT id, message_id FROM message_queue WHERE idempotency_key = ?').get(input.idempotencyKey) as { id: number; message_id: number } | undefined;
    if (existing) return { queueId: existing.id, messageId: existing.message_id, duplicate: true };

    if (input.kind === 'text' && !input.text?.trim()) throw invalid('El mensaje está vacío.');
    if (input.text && input.text.length > 4096) throw invalid('El mensaje supera el máximo de 4096 caracteres de WhatsApp.');
    if (input.kind === 'media' && !input.mediaId) throw invalid('Falta el archivo multimedia.');
    if (input.kind === 'media' && input.text && input.text.length > 1024) throw invalid('El texto que acompaña al archivo supera 1024 caracteres.');
    let templateName: string | null = null;
    let body = input.text ?? null;
    let payload: string | null = null;
    if (input.kind === 'template') {
      if (!input.template) throw invalid('Seleccione una plantilla aprobada.');
      const t = this.providerTemplate(input.accountId, input.template.providerTemplateId);
      if (t.status !== 'APPROVED') throw invalid(`La plantilla "${t.name}" no está aprobada (${t.status}).`);
      if (input.template.params.length < t.param_count) throw invalid(`La plantilla "${t.name}" requiere ${t.param_count} parámetro(s).`);
      templateName = t.name;
      body = this.templatePreview(t, input.template.params);
      payload = JSON.stringify({ name: t.name, language: t.language, params: input.template.params.slice(0, t.param_count), headerType: t.header_type });
    }
    let mediaKind: string | null = null;
    if (input.mediaId) mediaKind = this.media.get(input.accountId, input.mediaId).kind;

    const convId = this.conversations.ensureConversation(input.accountId, input.contactId);
    const now = this.ctx.clock.now();
    const when = (input.scheduledAt ?? now).toISOString();
    const type = input.kind === 'template' ? 'template' : input.kind === 'media' ? mediaKind! : 'text';
    const maxAttempts = input.maxAttempts ?? this.settings.get('sending', input.accountId).maxAttempts;
    const res = db.transaction(() => {
      const m = db
        .prepare(`INSERT INTO messages(account_id, conversation_id, contact_id, direction, type, body, media_id, template_name, status, source, campaign_id, automation_run_id, sent_by_user_id, created_at)
                  VALUES (?,?,?,'out',?,?,?,?, 'queued', ?,?,?,?,?)`)
        .run(input.accountId, convId, input.contactId, type, body, input.mediaId ?? null, templateName, input.source, input.campaignId ?? null, input.automationRunId ?? null, input.userId ?? null, now.toISOString());
      const messageId = Number(m.lastInsertRowid);
      const q = db
        .prepare(`INSERT INTO message_queue(account_id, idempotency_key, campaign_id, run_id, contact_id, message_id, kind, content, media_id, payload, source, priority, scheduled_at, next_attempt_at, max_attempts, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(input.accountId, input.idempotencyKey, input.campaignId ?? null, input.runId ?? null, input.contactId, messageId, input.kind, input.text ?? null, input.mediaId ?? null, payload ? JSON.stringify({ ...JSON.parse(payload), replyTo: input.replyToProviderId ?? null }) : input.replyToProviderId ? JSON.stringify({ replyTo: input.replyToProviderId }) : null, input.source, input.priority ?? 0, when, when, maxAttempts, now.toISOString(), now.toISOString());
      this.conversations.touchOutbound(input.accountId, convId, input.contactId, type, body);
      return { queueId: Number(q.lastInsertRowid), messageId };
    })();
    this.ctx.bus.emit('conversation.updated', { accountId: input.accountId, conversationId: convId });
    return { ...res, duplicate: false };
  }

  /** ¿Está abierta la ventana de atención de 24 h para mensajes libres? */
  windowOpen(contact: Pick<Contact, 'last_inbound_at'>, windowHours: number | null): boolean {
    if (windowHours === null) return true;
    if (!contact.last_inbound_at) return false;
    return this.ctx.clock.now().getTime() - new Date(contact.last_inbound_at).getTime() < windowHours * 3600000;
  }

  /** Envío manual desde la bandeja de entrada (activa el modo humano). */
  sendManual(
    accountId: number,
    input: { contactId: number; text?: string | null; mediaId?: number | null; template?: { providerTemplateId: number; params: string[] } | null; clientKey?: string; replyToProviderId?: string | null },
    userId: number,
    windowHours: number | null,
  ): EnqueueResult {
    const contact = this.contacts.get(accountId, input.contactId);
    const kind = input.template ? 'template' : input.mediaId ? 'media' : 'text';
    if (kind !== 'template' && !this.windowOpen(contact, windowHours)) {
      throw new AppError('OUTSIDE_WINDOW', 'Han pasado más de 24 h desde el último mensaje del cliente. WhatsApp solo permite iniciar la conversación con una plantilla aprobada.');
    }
    const res = this.enqueue({
      accountId,
      contactId: contact.id,
      kind,
      text: input.text?.trim() || null,
      mediaId: input.mediaId ?? null,
      template: input.template ?? null,
      source: 'manual',
      idempotencyKey: `manual:${input.clientKey && /^[a-zA-Z0-9-]{8,64}$/.test(input.clientKey) ? input.clientKey : randomId()}`,
      userId,
      priority: 10,
      replyToProviderId: input.replyToProviderId ?? null,
    });
    const convId = this.conversations.ensureConversation(accountId, contact.id);
    this.conversations.onAgentMessage(accountId, convId);
    return res;
  }

  /** Renderiza variables con los datos reales del contacto. */
  renderFor(accountId: number, contact: Contact, text: string) {
    const custom = contact.custom ?? this.fields.valuesFor(contact.id);
    const tz = this.settings.get('general').timezone;
    return renderTemplate(text, { ...contact, custom }, this.ctx.clock.now(), 'es-CO', tz);
  }

  // ---- Mensajes programados individuales ----
  schedule(accountId: number, input: { contactId: number; body?: string | null; mediaId?: number | null; scheduledAt: string; timezone?: string }, userId?: number | null) {
    this.contacts.get(accountId, input.contactId);
    if (!input.body?.trim() && !input.mediaId) throw invalid('El mensaje programado está vacío.');
    const at = new Date(input.scheduledAt);
    if (Number.isNaN(at.getTime())) throw invalid('Fecha inválida.');
    if (at.getTime() < this.ctx.clock.now().getTime() - 60000) throw invalid('La fecha programada ya pasó.');
    if (input.mediaId) this.media.get(accountId, input.mediaId);
    const r = this.ctx.db
      .prepare('INSERT INTO scheduled_messages(account_id, contact_id, body, media_id, scheduled_at, timezone, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(accountId, input.contactId, input.body?.trim() || null, input.mediaId ?? null, at.toISOString(), input.timezone ?? null, userId ?? null, this.ctx.clock.now().toISOString());
    return Number(r.lastInsertRowid);
  }

  listScheduled(accountId: number, from?: string, to?: string) {
    return this.ctx.db
      .prepare(`SELECT s.*, c.name AS contact_name, c.phone AS contact_phone FROM scheduled_messages s JOIN contacts c ON c.id = s.contact_id
                WHERE s.account_id = ? ${from ? 'AND s.scheduled_at >= ?' : ''} ${to ? 'AND s.scheduled_at < ?' : ''} ORDER BY s.scheduled_at`)
      .all(...[accountId, ...(from ? [from] : []), ...(to ? [to] : [])]);
  }

  reschedule(accountId: number, id: number, scheduledAt: string) {
    const s = this.ctx.db.prepare('SELECT * FROM scheduled_messages WHERE id = ? AND account_id = ?').get(id, accountId) as { status: string } | undefined;
    if (!s) throw notFound('El mensaje programado');
    if (s.status !== 'scheduled') throw invalid('Solo se pueden mover mensajes que aún no se enviaron.');
    const at = new Date(scheduledAt);
    if (Number.isNaN(at.getTime()) || at < this.ctx.clock.now()) throw invalid('La nueva fecha debe ser futura.');
    this.ctx.db.prepare('UPDATE scheduled_messages SET scheduled_at = ? WHERE id = ?').run(at.toISOString(), id);
  }

  cancelScheduled(accountId: number, id: number) {
    const r = this.ctx.db.prepare("UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND account_id = ? AND status = 'scheduled'").run(id, accountId);
    if (!r.changes) throw invalid('El mensaje ya fue enviado o cancelado.');
  }

  /** Pasa a la cola los mensajes programados que vencieron. Llamado por el Scheduler. */
  releaseDueScheduled(windowHoursFor: (accountId: number) => number | null): number {
    const now = this.ctx.clock.now().toISOString();
    const due = this.ctx.db.prepare("SELECT * FROM scheduled_messages WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 200").all(now) as any[];
    let n = 0;
    for (const s of due) {
      try {
        const contact = this.contacts.get(s.account_id, s.contact_id);
        if (!this.windowOpen(contact, windowHoursFor(s.account_id))) throw new AppError('OUTSIDE_WINDOW', 'Fuera de la ventana de 24 h de WhatsApp: no se envió.');
        const text = s.body ? this.renderFor(s.account_id, contact, s.body).text : null;
        const r = this.enqueue({ accountId: s.account_id, contactId: s.contact_id, kind: s.media_id ? 'media' : 'text', text, mediaId: s.media_id, source: 'scheduled', idempotencyKey: `sched:${s.id}`, userId: s.created_by });
        this.ctx.db.prepare("UPDATE scheduled_messages SET status = 'queued', queue_id = ? WHERE id = ?").run(r.queueId, s.id);
        n++;
      } catch (e: any) {
        this.ctx.db.prepare("UPDATE scheduled_messages SET status = 'failed' WHERE id = ?").run(s.id);
        this.ctx.log.warn('application', `Mensaje programado ${s.id} no enviado: ${e?.message}`);
      }
    }
    return n;
  }
}

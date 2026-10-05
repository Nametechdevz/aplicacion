import { DateTime } from 'luxon';
import type { Ctx } from '../context';
import { normalizeText } from '../../shared/text';
import type { ContactService } from './contacts';
import type { SettingsService } from './settings';
import type { MessagingService } from './messaging';

/**
 * Cumplimiento: opt-out automático por palabra clave, horario de atención y respuesta fuera de horario.
 * Se ejecuta ANTES que automatizaciones e IA para cada mensaje entrante.
 */
export class ComplianceService {
  constructor(
    private ctx: Ctx,
    private settings: SettingsService,
    private contacts: ContactService,
    private messaging: () => MessagingService,
  ) {}

  /** ¿El mensaje es una solicitud de baja? Coincidencia exacta normalizada (evita falsos positivos). */
  isOptOutMessage(accountId: number, text: string): boolean {
    const t = normalizeText(text).replace(/[.!¡¿?]+/g, '').trim();
    if (!t || t.length > 60) return false;
    return this.settings.get('optOut', accountId).keywords.some((k) => normalizeText(k) === t);
  }

  handleInbound(e: { accountId: number; contactId: number; conversationId: number; messageId: number; text: string }): { optedOut: boolean } {
    if (this.isOptOutMessage(e.accountId, e.text)) {
      const c = this.contacts.get(e.accountId, e.contactId);
      if (c.consent_status !== 'opted_out') {
        this.contacts.setConsent(e.accountId, e.contactId, 'opted_out', 'keyword:' + normalizeText(e.text).slice(0, 40));
        const s = this.settings.get('optOut', e.accountId);
        if (s.replyEnabled && s.replyMessage.trim()) {
          this.messaging().enqueue({ accountId: e.accountId, contactId: e.contactId, kind: 'text', text: s.replyMessage, source: 'system', idempotencyKey: `optout:${e.messageId}`, priority: 10 });
        }
        this.ctx.log.info('application', `Contacto ${e.contactId} dado de baja por palabra clave`);
      }
      return { optedOut: true };
    }
    this.maybeOutOfHoursReply(e);
    return { optedOut: false };
  }

  isWithinBusinessHours(accountId: number, at: Date = this.ctx.clock.now()): boolean {
    const bh = this.settings.get('businessHours', accountId);
    const local = DateTime.fromJSDate(at, { zone: bh.timezone || 'UTC' });
    const day = bh.days[String(local.weekday)];
    if (!day?.enabled) return false;
    const hm = local.toFormat('HH:mm');
    return day.open <= day.close ? hm >= day.open && hm < day.close : hm >= day.open || hm < day.close;
  }

  private maybeOutOfHoursReply(e: { accountId: number; contactId: number; conversationId: number; messageId: number }) {
    const bh = this.settings.get('businessHours', e.accountId);
    if (!bh.outOfHoursReply.enabled || !bh.outOfHoursReply.message.trim()) return;
    if (this.isWithinBusinessHours(e.accountId)) return;
    const conv = this.ctx.db.prepare('SELECT last_ooh_reply_at, bot_paused_until FROM conversations WHERE id = ?').get(e.conversationId) as { last_ooh_reply_at: string | null; bot_paused_until: string | null };
    const now = this.ctx.clock.now();
    if (conv.bot_paused_until && new Date(conv.bot_paused_until) > now) return;
    if (conv.last_ooh_reply_at && now.getTime() - new Date(conv.last_ooh_reply_at).getTime() < bh.outOfHoursReply.cooldownHours * 3600000) return;
    const contact = this.contacts.get(e.accountId, e.contactId);
    if (contact.consent_status === 'opted_out' || contact.blacklisted) return;
    const text = this.messaging().renderFor(e.accountId, contact, bh.outOfHoursReply.message).text;
    this.messaging().enqueue({ accountId: e.accountId, contactId: e.contactId, kind: 'text', text, source: 'system', idempotencyKey: `ooh:${e.messageId}`, priority: 9 });
    this.ctx.db.prepare('UPDATE conversations SET last_ooh_reply_at = ? WHERE id = ?').run(now.toISOString(), e.conversationId);
  }
}

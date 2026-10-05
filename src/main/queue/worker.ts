import type { Ctx } from '../context';
import { json } from '../db/database';
import { ProviderError, PROVIDER_ERROR_MESSAGES, type OutboundMessage, type WhatsAppProvider } from '../whatsapp/provider';
import type { ConversationService } from '../services/conversations';
import type { MediaService } from '../services/media';
import type { ContactService } from '../services/contacts';
import type { SettingsService } from '../services/settings';
import type { TagService } from '../services/tags';

interface QueueRow {
  id: number;
  account_id: number;
  idempotency_key: string;
  campaign_id: number | null;
  run_id: number | null;
  contact_id: number;
  message_id: number | null;
  kind: 'text' | 'media' | 'template';
  content: string | null;
  media_id: number | null;
  payload: string | null;
  source: string;
  attempts: number;
  max_attempts: number;
}

export interface WorkerDeps {
  getProvider(accountId: number): WhatsAppProvider | null;
  onProviderFatal(accountId: number, err: ProviderError): void;
  conversations: ConversationService;
  media: MediaService;
  contacts: ContactService;
  settings: SettingsService;
  tags: TagService;
}

/** Fuentes de envío que respetan opt-out / lista negra / "No contactar" de forma estricta. */
const PROMOTIONAL_SOURCES = new Set(['campaign', 'scheduled', 'automation']);

/**
 * Procesador de la cola persistente de mensajes.
 * - Un envío a la vez por cuenta, con ritmo (msgs/min) y tope diario configurables.
 * - Reintentos con backoff exponencial para errores transitorios.
 * - Pausa de la cuenta ante RATE_LIMIT, respetando Retry-After.
 * - Nunca reenvía un elemento cuyo resultado es incierto (ver recoverInterrupted).
 */
export class QueueWorker {
  private timer: NodeJS.Timeout | null = null;
  private busy = new Set<number>();
  private lastSendAt = new Map<number, number>();
  private pausedUntil = new Map<number, number>();
  private rateLimitStreak = new Map<number, number>();
  private capNotified = new Map<number, string>();
  private stopped = false;

  constructor(private ctx: Ctx, private deps: WorkerDeps) {}

  start(intervalMs = 250) {
    this.stopped = false;
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Espera a que terminen los envíos en curso (cierre ordenado). */
  async idle(timeoutMs = 10000) {
    const end = Date.now() + timeoutMs;
    while (this.busy.size && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  }

  /**
   * Al iniciar: un elemento que quedó en `sending` pudo o no haber llegado a WhatsApp. Para no
   * duplicar NUNCA se reenvía automáticamente: se marca fallido con un motivo claro.
   */
  recoverInterrupted(): number {
    const db = this.ctx.db;
    const rows = db.prepare("SELECT id, message_id, campaign_id, account_id, contact_id FROM message_queue WHERE status = 'sending'").all() as { id: number; message_id: number | null; campaign_id: number | null; account_id: number; contact_id: number }[];
    const reason = 'Envío interrumpido por cierre inesperado: no se puede confirmar si llegó. Verifique antes de reintentar.';
    db.transaction(() => {
      for (const r of rows) {
        db.prepare("UPDATE message_queue SET status = 'failed', last_error = ?, last_error_code = 'INTERRUPTED', updated_at = ? WHERE id = ?").run(reason, this.ctx.clock.now().toISOString(), r.id);
        if (r.message_id) db.prepare("UPDATE messages SET status = 'failed', error_code = 'INTERRUPTED', error_message = ? WHERE id = ? AND status IN ('queued','sending')").run(reason, r.message_id);
        db.prepare("UPDATE campaign_recipients SET status = 'failed', skip_reason = ? WHERE queue_id = ?").run(reason, r.id);
      }
    })();
    if (rows.length) this.ctx.log.warn('campaigns', `${rows.length} envío(s) interrumpidos marcados como fallidos tras reinicio`);
    for (const r of rows) this.ctx.bus.emit('queue.finished', { accountId: r.account_id, queueId: r.id, campaignId: r.campaign_id, runId: null, status: 'failed' });
    return rows.length;
  }

  isAccountPaused(accountId: number): number | null {
    const u = this.pausedUntil.get(accountId);
    return u && u > this.ctx.clock.now().getTime() ? u : null;
  }

  private dayKey(): string {
    const tz = this.deps.settings.get('general').timezone;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(this.ctx.clock.now());
    } catch {
      return this.ctx.clock.now().toISOString().slice(0, 10);
    }
  }

  sentToday(accountId: number): number {
    return (this.ctx.db.prepare('SELECT count FROM send_counters WHERE account_id = ? AND day = ?').get(accountId, this.dayKey()) as { count: number } | undefined)?.count ?? 0;
  }

  private accountsWithWork(): number[] {
    return (this.ctx.db
      .prepare("SELECT DISTINCT account_id FROM message_queue WHERE status = 'queued' AND next_attempt_at <= ?")
      .all(this.ctx.clock.now().toISOString()) as { account_id: number }[]).map((r) => r.account_id);
  }

  async tick() {
    if (this.stopped) return;
    for (const accountId of this.accountsWithWork()) {
      if (!this.busy.has(accountId)) void this.processNext(accountId);
    }
  }

  /** Procesa (como máximo) un elemento de la cola de la cuenta. Devuelve true si envió/intentó algo. */
  async processNext(accountId: number, opts: { ignorePacing?: boolean } = {}): Promise<boolean> {
    if (this.busy.has(accountId)) return false;
    const provider = this.deps.getProvider(accountId);
    if (!provider || provider.getStatus().status !== 'connected') return false;
    const nowMs = this.ctx.clock.now().getTime();
    if (this.isAccountPaused(accountId)) return false;
    const sending = this.deps.settings.get('sending', accountId);
    if (!opts.ignorePacing) {
      const minGap = 60000 / Math.max(1, sending.ratePerMinute);
      const last = this.lastSendAt.get(accountId) ?? 0;
      if (nowMs - last < minGap) return false;
    }
    if (sending.dailyCap > 0 && this.sentToday(accountId) >= sending.dailyCap) {
      // Solo bloquea envíos masivos; las respuestas manuales siguen pasando.
      const day = this.dayKey();
      if (this.capNotified.get(accountId) !== day) {
        this.capNotified.set(accountId, day);
        this.ctx.bus.emit('notify', { title: 'Tope diario alcanzado', body: `Se alcanzó el límite de ${sending.dailyCap} envíos de hoy. Las campañas continuarán mañana.`, kind: 'warning', accountId });
        this.ctx.log.warn('campaigns', `Cuenta ${accountId}: tope diario alcanzado (${sending.dailyCap})`);
      }
    }
    this.busy.add(accountId);
    try {
      const item = this.claim(accountId, sending.dailyCap > 0 && this.sentToday(accountId) >= sending.dailyCap);
      if (!item) return false;
      this.lastSendAt.set(accountId, nowMs);
      await this.send(provider, item);
      return true;
    } catch (e) {
      this.ctx.log.error('campaigns', 'Error inesperado en la cola', e);
      return false;
    } finally {
      this.busy.delete(accountId);
    }
  }

  private claim(accountId: number, onlyManual: boolean): QueueRow | null {
    const now = this.ctx.clock.now().toISOString();
    return (
      (this.ctx.db
        .prepare(`UPDATE message_queue SET status = 'sending', locked_at = ?, attempts = attempts + 1, updated_at = ?
                  WHERE id = (
                    SELECT q.id FROM message_queue q LEFT JOIN campaigns c ON c.id = q.campaign_id
                    WHERE q.account_id = ? AND q.status = 'queued' AND q.next_attempt_at <= ?
                      AND (q.campaign_id IS NULL OR c.status = 'running')
                      ${onlyManual ? "AND q.source IN ('manual','system','ai')" : ''}
                    ORDER BY q.priority DESC, q.next_attempt_at, q.id LIMIT 1)
                  RETURNING *`)
        .get(now, now, accountId, now) as QueueRow | undefined) ?? null
    );
  }

  private blockReason(item: QueueRow): string | null {
    const c = this.ctx.db.prepare('SELECT id, phone, consent_status, blacklisted, status FROM contacts WHERE id = ?').get(item.contact_id) as any;
    if (!c) return 'El contacto fue eliminado';
    if (!PROMOTIONAL_SOURCES.has(item.source)) return null;
    return this.deps.contacts.campaignBlockReason(c, this.deps.tags.noContactTagId(item.account_id));
  }

  private buildMessage(item: QueueRow, phone: string): OutboundMessage {
    const payload = json<any>(item.payload, {});
    const mediaFor = (id: number, caption: string | null) => {
      const m = this.deps.media.get(item.account_id, id);
      return { kind: m.kind as any, filePath: m.file_path, mimeType: m.mime_type, fileName: m.file_name, caption, providerMediaId: this.deps.media.reusableProviderId(m) };
    };
    if (item.kind === 'text') return { to: phone, kind: 'text', text: item.content ?? '', replyToProviderId: payload.replyTo ?? null };
    if (item.kind === 'media') return { to: phone, kind: 'media', media: mediaFor(item.media_id!, item.content), replyToProviderId: payload.replyTo ?? null };
    return {
      to: phone,
      kind: 'template',
      template: { name: payload.name, language: payload.language, bodyParams: payload.params ?? [], headerMedia: item.media_id && payload.headerType && payload.headerType !== 'TEXT' ? mediaFor(item.media_id, null) : null },
    };
  }

  private async send(provider: WhatsAppProvider, item: QueueRow) {
    const db = this.ctx.db;
    const block = this.blockReason(item);
    if (block) return this.finishFailed(item, 'BLOCKED', block, 'cancelled');
    const phone = (db.prepare('SELECT phone FROM contacts WHERE id = ?').get(item.contact_id) as { phone: string }).phone;
    let msg: OutboundMessage;
    try {
      msg = this.buildMessage(item, phone);
    } catch (e: any) {
      return this.finishFailed(item, 'MEDIA_MISSING', e?.userMessage ?? 'El archivo multimedia ya no existe.');
    }
    if (item.message_id) db.prepare("UPDATE messages SET status = 'sending' WHERE id = ? AND status = 'queued'").run(item.message_id);
    try {
      const res = await provider.sendMessage(msg);
      this.onSuccess(item, res.providerMessageId, res.uploadedMediaId ?? null);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError('TRANSIENT', null, String((e as Error)?.message ?? e));
      this.onError(item, pe);
    }
  }

  private onSuccess(item: QueueRow, providerMessageId: string, uploadedMediaId: string | null) {
    const db = this.ctx.db;
    const now = this.ctx.clock.now().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE message_queue SET status = 'sent', sent_at = ?, last_error = NULL, last_error_code = NULL, updated_at = ? WHERE id = ?").run(now, now, item.id);
      if (item.message_id) {
        db.prepare("UPDATE messages SET status = 'sent', provider_message_id = ?, sent_at = ?, error_code = NULL, error_message = NULL WHERE id = ?").run(providerMessageId, now, item.message_id);
      }
      db.prepare("UPDATE campaign_recipients SET status = 'sent', message_id = ? WHERE queue_id = ?").run(item.message_id, item.id);
      db.prepare('INSERT INTO send_counters(account_id, day, count) VALUES (?,?,1) ON CONFLICT(account_id, day) DO UPDATE SET count = count + 1').run(item.account_id, this.dayKey());
      db.prepare('UPDATE contacts SET last_outbound_at = ? WHERE id = ?').run(now, item.contact_id);
      if (uploadedMediaId && item.media_id) this.deps.media.rememberProviderId(item.media_id, uploadedMediaId);
    })();
    this.rateLimitStreak.delete(item.account_id);
    this.deps.conversations.flushPendingStatus(providerMessageId);
    this.ctx.log.info('whatsapp', `Mensaje enviado (cola ${item.id}, origen ${item.source})`);
    if (item.message_id) {
      const conv = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(item.message_id) as { conversation_id: number };
      this.ctx.bus.emit('message.status', { accountId: item.account_id, messageId: item.message_id, status: 'sent', conversationId: conv.conversation_id, campaignId: item.campaign_id });
    }
    const depth = item.source === 'automation' ? 1 : 0;
    this.ctx.bus.emit('message.sent', { accountId: item.account_id, contactId: item.contact_id, messageId: item.message_id ?? 0, source: item.source, campaignId: item.campaign_id, queueId: item.id, automationDepth: depth });
    this.ctx.bus.emit('queue.finished', { accountId: item.account_id, queueId: item.id, campaignId: item.campaign_id, runId: item.run_id, status: 'sent' });
  }

  private requeue(item: QueueRow, delayMs: number, err: ProviderError, consumeAttempt: boolean) {
    const now = this.ctx.clock.now();
    this.ctx.db
      .prepare("UPDATE message_queue SET status = 'queued', attempts = attempts - ?, next_attempt_at = ?, last_error = ?, last_error_code = ?, locked_at = NULL, updated_at = ? WHERE id = ?")
      .run(consumeAttempt ? 0 : 1, new Date(now.getTime() + delayMs).toISOString(), err.message, err.providerCode ?? err.kind, now.toISOString(), item.id);
    if (item.message_id) this.ctx.db.prepare("UPDATE messages SET status = 'queued' WHERE id = ? AND status = 'sending'").run(item.message_id);
  }

  private onError(item: QueueRow, err: ProviderError) {
    const s = this.deps.settings.get('sending', item.account_id);
    this.ctx.log.warn('whatsapp', `Error de envío (cola ${item.id}): ${err.kind} ${err.providerCode ?? ''} ${err.technical}`);
    switch (err.kind) {
      case 'RATE_LIMIT': {
        const streak = (this.rateLimitStreak.get(item.account_id) ?? 0) + 1;
        this.rateLimitStreak.set(item.account_id, streak);
        const backoff = Math.min(30 * 60000, Math.max(err.retryAfterMs ?? 0, s.rateLimitPauseSeconds * 1000 * 2 ** (streak - 1)));
        this.pausedUntil.set(item.account_id, this.ctx.clock.now().getTime() + backoff);
        this.requeue(item, backoff, err, false);
        this.ctx.log.warn('campaigns', `RATE_LIMIT en cuenta ${item.account_id}: pausa de ${Math.round(backoff / 1000)} s (racha ${streak})`);
        this.ctx.bus.emit('notify', { title: 'Envíos en pausa temporal', body: `WhatsApp limitó la velocidad. Se reanudará en ${Math.ceil(backoff / 60000)} min.`, kind: 'warning', accountId: item.account_id });
        if (item.campaign_id) this.ctx.bus.emit('campaign.progress', { accountId: item.account_id, campaignId: item.campaign_id });
        return;
      }
      case 'DISCONNECTED':
      case 'AUTH':
      case 'ACCOUNT_BLOCKED':
        this.requeue(item, 5000, err, false);
        this.deps.onProviderFatal(item.account_id, err);
        return;
      case 'TRANSIENT':
        if (err.providerCode === 'NETWORK') {
          // Sin red: no es culpa del mensaje. No consume intentos; la cuenta pasa a desconectada
          // (se pausan las campañas) y se reconecta automáticamente.
          this.requeue(item, 10000, err, false);
          this.deps.onProviderFatal(item.account_id, err);
          return;
        }
        if (item.attempts < item.max_attempts) {
          const delay = Math.min(3600000, s.retryBaseSeconds * 1000 * 2 ** (item.attempts - 1));
          this.requeue(item, delay, err, true);
          return;
        }
        return this.finishFailed(item, err.providerCode ?? err.kind, `${err.message} (tras ${item.attempts} intentos)`);
      case 'OPTED_OUT':
        try {
          this.deps.contacts.setConsent(item.account_id, item.contact_id, 'opted_out', 'whatsapp_marketing_block');
        } catch {
          /* ignore */
        }
        return this.finishFailed(item, err.providerCode ?? err.kind, err.message);
      default:
        return this.finishFailed(item, err.providerCode ?? err.kind, err.message || PROVIDER_ERROR_MESSAGES.REJECTED);
    }
  }

  private finishFailed(item: QueueRow, code: string, reason: string, status: 'failed' | 'cancelled' = 'failed') {
    const db = this.ctx.db;
    const now = this.ctx.clock.now().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE message_queue SET status = ?, last_error = ?, last_error_code = ?, locked_at = NULL, updated_at = ? WHERE id = ?').run(status, reason, code, now, item.id);
      if (item.message_id) db.prepare('UPDATE messages SET status = ?, error_code = ?, error_message = ?, failed_at = ? WHERE id = ?').run(status, code, reason, status === 'failed' ? now : null, item.message_id);
      db.prepare('UPDATE campaign_recipients SET status = ?, skip_reason = ? WHERE queue_id = ?').run(status, reason, item.id);
    })();
    if (status === 'failed') this.ctx.log.warn('campaigns', `Envío fallido (cola ${item.id}): ${code}`);
    if (item.message_id) {
      const conv = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(item.message_id) as { conversation_id: number } | undefined;
      if (conv) this.ctx.bus.emit('message.status', { accountId: item.account_id, messageId: item.message_id, status, conversationId: conv.conversation_id, campaignId: item.campaign_id });
    }
    this.ctx.bus.emit('message.failed', { accountId: item.account_id, contactId: item.contact_id, messageId: item.message_id, campaignId: item.campaign_id, queueId: item.id, reason });
    this.ctx.bus.emit('queue.finished', { accountId: item.account_id, queueId: item.id, campaignId: item.campaign_id, runId: item.run_id, status });
  }

  /** Reintento manual de un mensaje fallido (desde la bandeja). Genera un nuevo intento, no un duplicado silencioso. */
  retry(accountId: number, messageId: number) {
    const q = this.ctx.db.prepare("SELECT * FROM message_queue WHERE message_id = ? AND account_id = ? AND status IN ('failed')").get(messageId, accountId) as QueueRow | undefined;
    if (!q) return false;
    const now = this.ctx.clock.now().toISOString();
    this.ctx.db.prepare("UPDATE message_queue SET status = 'queued', attempts = 0, next_attempt_at = ?, last_error = NULL, last_error_code = NULL, priority = 10, updated_at = ? WHERE id = ?").run(now, now, q.id);
    this.ctx.db.prepare("UPDATE messages SET status = 'queued', error_code = NULL, error_message = NULL, failed_at = NULL WHERE id = ?").run(messageId);
    return true;
  }

  stats(accountId: number) {
    const rows = this.ctx.db.prepare('SELECT status, COUNT(*) n FROM message_queue WHERE account_id = ? GROUP BY status').all(accountId) as { status: string; n: number }[];
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const paused = this.isAccountPaused(accountId);
    return { byStatus: by, sentToday: this.sentToday(accountId), pausedUntil: paused ? new Date(paused).toISOString() : null };
  }
}

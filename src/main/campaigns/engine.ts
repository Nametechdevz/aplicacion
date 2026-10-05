import type { Ctx } from '../context';
import { AppError, invalid, notFound } from '../core/errors';
import { inList, json } from '../db/database';
import type { AudiencePreview, AudienceSpec, Campaign, CampaignStats, Contact, Recurrence } from '../../shared/types';
import type { ContactService } from '../services/contacts';
import type { SegmentService } from '../services/segments';
import type { TagService } from '../services/tags';
import type { MessagingService } from '../services/messaging';
import type { CustomFieldService } from '../services/custom-fields';
import type { SettingsService } from '../services/settings';
import type { HistoryService } from '../services/history';
import type { MediaService } from '../services/media';
import { nextOccurrence } from './recurrence';
import { renderTemplate } from '../../shared/variables';

export interface CampaignInput {
  id?: number;
  name: string;
  audience: AudienceSpec;
  message_type: 'text' | 'template';
  body?: string | null;
  media_id?: number | null;
  provider_template_id?: number | null;
  template_params?: string[] | null;
  timezone?: string;
  scheduled_at?: string | null; // ISO UTC; null = enviar al confirmar
  recurrence?: Recurrence | null;
}

export interface CampaignDeps {
  contacts: ContactService;
  segments: SegmentService;
  tags: TagService;
  messaging: MessagingService;
  fields: CustomFieldService;
  settings: SettingsService;
  history: HistoryService;
  media: MediaService;
  isConnected(accountId: number): boolean;
  windowHours(accountId: number): number | null;
}

const ACTIVE_RUN = "status = 'running'";

/**
 * Motor de campañas: prepara destinatarios, genera mensajes (variables resueltas), crea la cola,
 * controla estados (pausar/reanudar/detener), recurrencia y estadísticas.
 */
export class CampaignEngine {
  constructor(private ctx: Ctx, private d: CampaignDeps) {}

  private row(r: any): Campaign {
    return {
      ...r,
      audience: json(r.audience, { type: 'all' }),
      template_params: json(r.template_params, null),
      recurrence: json(r.recurrence, null),
    };
  }

  get(accountId: number, id: number, withStats = true): Campaign {
    const r = this.ctx.db.prepare('SELECT * FROM campaigns WHERE id = ? AND account_id = ?').get(id, accountId);
    if (!r) throw notFound('La campaña');
    const c = this.row(r);
    if (withStats) c.stats = this.stats(id);
    return c;
  }

  list(accountId: number, status?: string): Campaign[] {
    const rows = this.ctx.db
      .prepare(`SELECT * FROM campaigns WHERE account_id = ? ${status ? 'AND status = ?' : ''} ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'paused' THEN 1 WHEN 'scheduled' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, id DESC`)
      .all(...(status ? [accountId, status] : [accountId]));
    return rows.map((r) => {
      const c = this.row(r);
      c.stats = this.stats(c.id);
      return c;
    });
  }

  stats(campaignId: number, runId?: number): CampaignStats {
    const rows = this.ctx.db
      .prepare(`SELECT status, COUNT(*) n, SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) r FROM campaign_recipients WHERE campaign_id = ? ${runId ? 'AND run_id = ?' : ''} GROUP BY status`)
      .all(...(runId ? [campaignId, runId] : [campaignId])) as { status: string; n: number; r: number }[];
    const s: CampaignStats = { total: 0, queued: 0, sending: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, cancelled: 0, skipped: 0, pending: 0 };
    for (const r of rows) {
      s.total += r.n;
      s.replied += r.r ?? 0;
      if (r.status in s) (s as any)[r.status] += r.n;
    }
    s.pending = s.queued + s.sending;
    // "Enviados" y "Entregados" son acumulativos (un mensaje leído también fue entregado y enviado).
    const read = s.read;
    const delivered = s.delivered + read;
    const sent = s.sent + delivered;
    return { ...s, sent, delivered, read };
  }

  // ---------- Borradores ----------
  private validateInput(accountId: number, input: CampaignInput) {
    const name = input.name?.trim();
    if (!name) throw invalid('La campaña necesita un nombre.');
    if (name.length > 120) throw invalid('El nombre es demasiado largo.');
    if (!['all', 'tag', 'segment', 'import', 'manual'].includes(input.audience?.type)) throw invalid('Seleccione los destinatarios.');
    if (input.audience.type === 'tag' && !input.audience.tagIds?.length) throw invalid('Seleccione al menos una etiqueta.');
    if (input.audience.type === 'segment' && !input.audience.segmentId) throw invalid('Seleccione un segmento.');
    if (input.audience.type === 'manual' && !input.audience.contactIds?.length) throw invalid('Seleccione al menos un contacto.');
    if (input.audience.type === 'import' && !input.audience.importBatchId) throw invalid('Seleccione una importación.');
    if (input.message_type === 'text' && !input.body?.trim() && !input.media_id) throw invalid('Escriba el mensaje o adjunte un archivo.');
    if (input.body && input.body.length > (input.media_id ? 1024 : 4096)) throw invalid(input.media_id ? 'El texto que acompaña al archivo supera 1024 caracteres.' : 'El mensaje supera 4096 caracteres.');
    if (input.message_type === 'template') {
      if (!input.provider_template_id) throw invalid('Seleccione una plantilla aprobada por WhatsApp.');
      const t = this.d.messaging.providerTemplate(accountId, input.provider_template_id);
      if ((input.template_params?.length ?? 0) < t.param_count) throw invalid(`La plantilla requiere ${t.param_count} parámetro(s).`);
    }
    if (input.media_id) this.d.media.get(accountId, input.media_id);
    if (input.recurrence) {
      if (!/^\d{2}:\d{2}$/.test(input.recurrence.time)) throw invalid('Hora de recurrencia inválida.');
      if (input.recurrence.freq === 'weekly' && !input.recurrence.byWeekday?.length) throw invalid('Seleccione los días de la semana.');
      if (!input.scheduled_at) throw invalid('Una campaña recurrente necesita fecha de inicio.');
    }
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timezone });
      } catch {
        throw invalid('Zona horaria inválida.');
      }
    }
  }

  saveDraft(accountId: number, input: CampaignInput, userId?: number | null): Campaign {
    this.validateInput(accountId, input);
    const tz = input.timezone || this.d.settings.get('general').timezone;
    const now = this.ctx.clock.now().toISOString();
    const vals = [
      input.name.trim(),
      JSON.stringify(input.audience),
      input.message_type,
      input.body?.trim() || null,
      input.media_id ?? null,
      input.message_type === 'template' ? input.provider_template_id ?? null : null,
      input.template_params?.length ? JSON.stringify(input.template_params) : null,
      tz,
      input.scheduled_at ? new Date(input.scheduled_at).toISOString() : null,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
    ];
    if (input.id) {
      const cur = this.get(accountId, input.id, false);
      if (!['draft', 'scheduled', 'paused'].includes(cur.status) || (cur.status === 'paused' && cur.started_at && !cur.recurrence)) {
        throw invalid('Solo se pueden editar campañas que aún no se han enviado.');
      }
      // Editar invalida la confirmación previa: vuelve a borrador.
      this.ctx.db
        .prepare(`UPDATE campaigns SET name=?, audience=?, message_type=?, body=?, media_id=?, provider_template_id=?, template_params=?, timezone=?, scheduled_at=?, recurrence=?,
                  status='draft', confirmed_count=NULL, confirmed_at=NULL, next_run_at=NULL, pause_reason=NULL, updated_at=? WHERE id=?`)
        .run(...vals, now, input.id);
      this.d.history.audit('campaign.update', { accountId, userId, entityType: 'campaign', entityId: input.id });
      return this.get(accountId, input.id);
    }
    const r = this.ctx.db
      .prepare(`INSERT INTO campaigns(account_id, name, audience, message_type, body, media_id, provider_template_id, template_params, timezone, scheduled_at, recurrence, status, created_by, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(accountId, ...vals, 'draft', userId ?? null, now, now);
    const id = Number(r.lastInsertRowid);
    this.d.history.audit('campaign.create', { accountId, userId, entityType: 'campaign', entityId: id, details: { name: input.name } });
    return this.get(accountId, id);
  }

  duplicate(accountId: number, id: number, userId?: number | null): Campaign {
    const c = this.get(accountId, id, false);
    return this.saveDraft(
      accountId,
      { name: `${c.name} (copia)`, audience: c.audience, message_type: c.message_type, body: c.body, media_id: c.media_id, provider_template_id: c.provider_template_id, template_params: c.template_params, timezone: c.timezone, scheduled_at: null, recurrence: null },
      userId,
    );
  }

  delete(accountId: number, id: number, userId?: number | null) {
    const c = this.get(accountId, id, false);
    if (['running', 'paused', 'scheduled'].includes(c.status)) throw invalid('Detenga la campaña antes de eliminarla.');
    this.ctx.db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    this.d.history.audit('campaign.delete', { accountId, userId, entityType: 'campaign', entityId: id, details: { name: c.name } });
  }

  // ---------- Audiencia ----------
  resolveAudience(accountId: number, a: AudienceSpec): number[] {
    const db = this.ctx.db;
    let ids: number[];
    switch (a.type) {
      case 'all':
        ids = (db.prepare("SELECT id FROM contacts WHERE account_id = ? AND status = 'active' ORDER BY id").all(accountId) as { id: number }[]).map((r) => r.id);
        break;
      case 'tag':
        ids = this.d.contacts.ids(accountId, { tagIds: a.tagIds, tagMode: a.tagMode ?? 'any' });
        break;
      case 'segment':
        ids = this.d.segments.contactIds(accountId, this.d.segments.get(accountId, a.segmentId!).definition);
        break;
      case 'import':
        ids = (db.prepare("SELECT id FROM contacts WHERE account_id = ? AND import_batch_id = ? AND status = 'active' ORDER BY id").all(accountId, a.importBatchId) as { id: number }[]).map((r) => r.id);
        break;
      case 'manual': {
        const want = [...new Set(a.contactIds ?? [])];
        ids = [];
        for (let i = 0; i < want.length; i += 500) {
          const chunk = want.slice(i, i + 500);
          ids.push(...(db.prepare(`SELECT id FROM contacts WHERE account_id = ? AND status = 'active' AND id IN ${inList(chunk)}`).all(accountId, ...chunk) as { id: number }[]).map((r) => r.id));
        }
        break;
      }
      default:
        throw invalid('Tipo de audiencia inválido.');
    }
    return [...new Set(ids)];
  }

  private loadContacts(ids: number[]): Contact[] {
    const out: Contact[] = [];
    const custom = this.d.fields.valuesForMany(ids);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = this.ctx.db.prepare(`SELECT * FROM contacts WHERE id IN ${inList(chunk)}`).all(...chunk) as Contact[];
      for (const r of rows) r.custom = custom.get(r.id) ?? {};
      out.push(...rows);
    }
    return out;
  }

  /**
   * Evalúa cada destinatario: exclusiones (opt-out, lista negra, "No contactar", teléfono inválido,
   * duplicados, ventana de 24 h para mensajes libres) y renderiza el texto final.
   */
  evaluate(accountId: number, c: Pick<Campaign, 'audience' | 'message_type' | 'body' | 'provider_template_id' | 'template_params' | 'timezone'>) {
    const ids = this.resolveAudience(accountId, c.audience);
    const contacts = this.loadContacts(ids);
    const noContact = this.d.tags.noContactTagId(accountId);
    const tagged = new Set((this.ctx.db.prepare('SELECT contact_id FROM contact_tags WHERE tag_id = ?').all(noContact) as { contact_id: number }[]).map((r) => r.contact_id));
    const window = c.message_type === 'text' ? this.d.windowHours(accountId) : null;
    const tpl = c.message_type === 'template' && c.provider_template_id ? this.d.messaging.providerTemplate(accountId, c.provider_template_id) : null;
    const seenPhones = new Set<string>();
    const ex = { opted_out: 0, blacklisted: 0, no_contact_tag: 0, invalid_phone: 0, duplicates: 0, outside_window: 0 };
    const items: { contact: Contact; ok: boolean; reason: string | null; text: string; params: string[]; missing: string[] }[] = [];
    const now = this.ctx.clock.now();
    for (const ct of contacts) {
      let reason: string | null = null;
      if (ct.consent_status === 'opted_out') {
        reason = 'Opt-out: pidió no recibir mensajes';
        ex.opted_out++;
      } else if (ct.blacklisted) {
        reason = 'Lista negra';
        ex.blacklisted++;
      } else if (tagged.has(ct.id)) {
        reason = 'Etiqueta "No contactar"';
        ex.no_contact_tag++;
      } else if (!/^\d{8,15}$/.test(ct.phone)) {
        reason = 'Teléfono inválido';
        ex.invalid_phone++;
      } else if (seenPhones.has(ct.phone)) {
        reason = 'Duplicado';
        ex.duplicates++;
      } else if (window !== null && !this.d.messaging.windowOpen(ct, window)) {
        reason = 'Fuera de la ventana de 24 h (use una plantilla aprobada)';
        ex.outside_window++;
      }
      seenPhones.add(ct.phone);
      let text = '';
      let params: string[] = [];
      let missing: string[] = [];
      if (tpl) {
        params = (c.template_params ?? []).map((p) => {
          const r = renderTemplate(p, ct, now, 'es-CO', c.timezone);
          missing.push(...r.missing);
          return r.text.trim();
        });
        text = this.d.messaging.templatePreview(tpl, params);
      } else if (c.body) {
        const r = renderTemplate(c.body, ct, now, 'es-CO', c.timezone);
        text = r.text;
        missing = r.missing;
      }
      items.push({ contact: ct, ok: !reason, reason, text, params, missing: [...new Set(missing)] });
    }
    return { items, excluded: ex };
  }

  preview(accountId: number, id: number, sampleContactId?: number): AudiencePreview {
    const c = this.get(accountId, id, false);
    return this.previewFor(accountId, c, sampleContactId);
  }

  previewFor(accountId: number, c: Pick<Campaign, 'audience' | 'message_type' | 'body' | 'provider_template_id' | 'template_params' | 'timezone'>, sampleContactId?: number): AudiencePreview {
    const ev = this.evaluate(accountId, c);
    const eligible = ev.items.filter((i) => i.ok);
    const pick = sampleContactId ? ev.items.filter((i) => i.contact.id === sampleContactId) : [];
    const sample = [...pick, ...eligible.filter((i) => i.contact.id !== sampleContactId).slice(0, 5)].map((i) => ({ contact_id: i.contact.id, name: i.contact.name, phone: i.contact.phone, text: i.text, missing: i.missing }));
    return { total: ev.items.length, eligible: eligible.length, excluded: ev.excluded, sample };
  }

  // ---------- Confirmación y ejecución ----------
  /**
   * Confirmación explícita. `expectedCount` es el número de destinatarios que el usuario vio en la
   * revisión: si la audiencia cambió desde entonces, se rechaza para evitar envíos accidentales.
   */
  confirm(accountId: number, id: number, expectedCount: number, userId?: number | null): Campaign {
    const c = this.get(accountId, id, false);
    if (c.status !== 'draft') throw invalid('Esta campaña ya fue confirmada.');
    this.validateInput(accountId, { ...c, audience: c.audience } as CampaignInput);
    const pv = this.previewFor(accountId, c);
    const sending = this.d.settings.get('sending', accountId);
    if (pv.eligible === 0) throw invalid('No hay destinatarios elegibles para esta campaña.');
    if (pv.eligible !== expectedCount) throw new AppError('AUDIENCE_CHANGED', `La audiencia cambió (ahora ${pv.eligible} destinatarios). Revise de nuevo antes de confirmar.`);
    if (pv.eligible > sending.maxRecipientsPerRun) throw invalid(`La campaña supera el máximo configurado de ${sending.maxRecipientsPerRun} destinatarios por envío.`);
    const now = this.ctx.clock.now();
    this.ctx.db.prepare('UPDATE campaigns SET confirmed_count = ?, confirmed_at = ?, confirmed_by = ?, updated_at = ? WHERE id = ?').run(pv.eligible, now.toISOString(), userId ?? null, now.toISOString(), id);
    this.d.history.audit('campaign.confirm', { accountId, userId, entityType: 'campaign', entityId: id, details: { recipients: pv.eligible, scheduled_at: c.scheduled_at, recurrence: c.recurrence } });

    const start = c.scheduled_at ? new Date(c.scheduled_at) : null;
    if (c.recurrence) {
      const first = nextOccurrence(c.recurrence, c.timezone, start!, new Date(Math.max(now.getTime(), start!.getTime()) - 1), 0);
      if (!first) throw invalid('La recurrencia no tiene ninguna fecha futura.');
      this.setStatus(c, 'scheduled', { next_run_at: first.toISOString() });
    } else if (start && start.getTime() > now.getTime() + 30000) {
      this.setStatus(c, 'scheduled', { next_run_at: start.toISOString() });
    } else {
      if (!this.d.isConnected(accountId)) throw new AppError('DISCONNECTED', 'WhatsApp está desconectado. Conecte la cuenta o programe la campaña.');
      this.startRun(accountId, id, now);
    }
    return this.get(accountId, id);
  }

  private setStatus(c: Pick<Campaign, 'id' | 'account_id' | 'status'>, status: Campaign['status'], extra: Partial<Record<'next_run_at' | 'pause_reason' | 'completed_at' | 'last_error' | 'started_at', string | null>> = {}) {
    const sets = ['status = ?', 'updated_at = ?'];
    const vals: unknown[] = [status, this.ctx.clock.now().toISOString()];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    this.ctx.db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...vals, c.id);
    this.ctx.log.info('campaigns', `Campaña ${c.id}: ${c.status} → ${status}${extra.pause_reason ? ` (${extra.pause_reason})` : ''}`);
    this.ctx.bus.emit('campaign.updated', { accountId: c.account_id, campaignId: c.id, status });
  }

  /** Crea una ejecución: destinatarios + cola, en una sola transacción. */
  startRun(accountId: number, id: number, scheduledFor: Date) {
    const c = this.get(accountId, id, false);
    const ev = this.evaluate(accountId, c);
    const eligible = ev.items.filter((i) => i.ok).length;
    // Salvaguarda de recurrentes: si la audiencia creció mucho respecto a lo confirmado, pausar.
    if (c.recurrence && c.confirmed_count && eligible > Math.ceil(c.confirmed_count * 1.5) + 10) {
      this.setStatus(c, 'paused', { pause_reason: `audience_grew:${eligible}` });
      this.ctx.bus.emit('notify', { title: 'Campaña recurrente en pausa', body: `"${c.name}": la audiencia creció a ${eligible} contactos (confirmados ${c.confirmed_count}). Revísela y reanúdela.`, kind: 'warning', accountId, route: `/campaigns/${id}` });
      return null;
    }
    const sending = this.d.settings.get('sending', accountId);
    if (eligible > sending.maxRecipientsPerRun) {
      this.setStatus(c, 'paused', { pause_reason: 'too_many_recipients' });
      return null;
    }
    const now = this.ctx.clock.now();
    const db = this.ctx.db;
    const runNumber = c.run_count + 1;
    const runId = db.transaction(() => {
      const run = db.prepare('INSERT INTO campaign_runs(campaign_id, run_number, scheduled_for, status, total, started_at) VALUES (?,?,?,?,?,?)').run(id, runNumber, scheduledFor.toISOString(), 'running', ev.items.length, now.toISOString());
      const rid = Number(run.lastInsertRowid);
      const insRec = db.prepare('INSERT INTO campaign_recipients(campaign_id, run_id, contact_id, status, skip_reason, queue_id, message_id, created_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const it of ev.items) {
        if (!it.ok) {
          insRec.run(id, rid, it.contact.id, 'skipped', it.reason, null, null, now.toISOString());
          continue;
        }
        const res = this.d.messaging.enqueue({
          accountId,
          contactId: it.contact.id,
          kind: c.message_type === 'template' ? 'template' : c.media_id ? 'media' : 'text',
          text: c.message_type === 'template' ? null : it.text || null,
          mediaId: c.media_id,
          template: c.message_type === 'template' ? { providerTemplateId: c.provider_template_id!, params: it.params } : null,
          source: 'campaign',
          idempotencyKey: `camp:${id}:${runNumber}:${it.contact.id}`,
          campaignId: id,
          runId: rid,
        });
        insRec.run(id, rid, it.contact.id, 'queued', null, res.queueId, res.messageId, now.toISOString());
        this.d.history.contactEvent(accountId, it.contact.id, 'campaign_queued', { campaignId: id, name: c.name });
      }
      let next: string | null = null;
      if (c.recurrence) next = nextOccurrence(c.recurrence, c.timezone, new Date(c.scheduled_at!), scheduledFor, runNumber)?.toISOString() ?? null;
      db.prepare("UPDATE campaigns SET status = 'running', run_count = ?, started_at = COALESCE(started_at, ?), next_run_at = ?, pause_reason = NULL, updated_at = ? WHERE id = ?").run(runNumber, now.toISOString(), next, now.toISOString(), id);
      return rid;
    })();
    this.ctx.log.info('campaigns', `Campaña ${id} ejecución #${runNumber}: ${eligible} en cola, ${ev.items.length - eligible} excluidos`);
    this.ctx.bus.emit('campaign.updated', { accountId, campaignId: id, status: 'running' });
    if (eligible === 0) this.checkRunComplete(accountId, id, runId);
    return runId;
  }

  pause(accountId: number, id: number, reason = 'user', userId?: number | null) {
    const c = this.get(accountId, id, false);
    if (!['running', 'scheduled'].includes(c.status)) throw invalid('Solo se pueden pausar campañas en curso o programadas.');
    this.setStatus(c, 'paused', { pause_reason: reason });
    this.d.history.audit('campaign.pause', { accountId, userId, entityType: 'campaign', entityId: id, details: { reason } });
    return this.get(accountId, id);
  }

  resume(accountId: number, id: number, userId?: number | null) {
    const c = this.get(accountId, id, false);
    if (c.status !== 'paused') throw invalid('La campaña no está en pausa.');
    const activeRun = this.ctx.db.prepare(`SELECT id FROM campaign_runs WHERE campaign_id = ? AND ${ACTIVE_RUN}`).get(id) as { id: number } | undefined;
    const now = this.ctx.clock.now();
    if (activeRun) {
      if (!this.d.isConnected(accountId)) throw new AppError('DISCONNECTED', 'WhatsApp está desconectado. Reconecte la cuenta para reanudar.');
      this.setStatus(c, 'running', { pause_reason: null });
    } else if (c.pause_reason?.startsWith('audience_grew') || c.pause_reason === 'missed_schedule' || c.pause_reason === 'disconnected_at_schedule' || !c.next_run_at) {
      // Nunca se inició (o la audiencia cambió): el usuario confirma ahora iniciar el envío.
      if (!this.d.isConnected(accountId)) throw new AppError('DISCONNECTED', 'WhatsApp está desconectado. Reconecte la cuenta para reanudar.');
      if (c.recurrence && c.pause_reason?.startsWith('audience_grew')) {
        const pv = this.previewFor(accountId, c);
        this.ctx.db.prepare('UPDATE campaigns SET confirmed_count = ? WHERE id = ?').run(pv.eligible, id);
      }
      this.startRun(accountId, id, now);
    } else {
      this.setStatus(c, 'scheduled', { pause_reason: null });
    }
    this.d.history.audit('campaign.resume', { accountId, userId, entityType: 'campaign', entityId: id });
    return this.get(accountId, id);
  }

  /** Detiene definitivamente: cancela todo lo pendiente. */
  cancel(accountId: number, id: number, userId?: number | null) {
    const c = this.get(accountId, id, false);
    if (['completed', 'cancelled'].includes(c.status)) throw invalid('La campaña ya terminó.');
    const db = this.ctx.db;
    const now = this.ctx.clock.now().toISOString();
    db.transaction(() => {
      const items = db.prepare("SELECT id, message_id FROM message_queue WHERE campaign_id = ? AND status = 'queued'").all(id) as { id: number; message_id: number | null }[];
      for (const it of items) {
        db.prepare("UPDATE message_queue SET status = 'cancelled', last_error = 'Campaña detenida', updated_at = ? WHERE id = ? AND status = 'queued'").run(now, it.id);
        if (it.message_id) db.prepare("UPDATE messages SET status = 'cancelled', error_message = 'Campaña detenida' WHERE id = ?").run(it.message_id);
      }
      db.prepare("UPDATE campaign_recipients SET status = 'cancelled', skip_reason = 'Campaña detenida' WHERE campaign_id = ? AND status = 'queued'").run(id);
      db.prepare(`UPDATE campaign_runs SET status = 'cancelled', completed_at = ? WHERE campaign_id = ? AND ${ACTIVE_RUN}`).run(now, id);
    })();
    const sendingNow = (db.prepare("SELECT COUNT(*) n FROM message_queue WHERE campaign_id = ? AND status = 'sending'").get(id) as { n: number }).n;
    this.setStatus(c, 'cancelled', { next_run_at: null, completed_at: now, pause_reason: sendingNow ? 'Un mensaje que ya estaba en envío pudo completarse.' : null });
    this.d.history.audit('campaign.cancel', { accountId, userId, entityType: 'campaign', entityId: id });
    return this.get(accountId, id);
  }

  reschedule(accountId: number, id: number, scheduledAt: string, userId?: number | null) {
    const c = this.get(accountId, id, false);
    if (!['scheduled', 'draft'].includes(c.status)) throw invalid('Solo se pueden mover campañas programadas o borradores.');
    const at = new Date(scheduledAt);
    if (Number.isNaN(at.getTime()) || at <= this.ctx.clock.now()) throw invalid('La nueva fecha debe ser futura.');
    if (c.status === 'scheduled') {
      const next = c.recurrence ? nextOccurrence(c.recurrence, c.timezone, at, new Date(at.getTime() - 1), c.run_count) : at;
      this.ctx.db.prepare('UPDATE campaigns SET scheduled_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?').run(at.toISOString(), next?.toISOString() ?? null, this.ctx.clock.now().toISOString(), id);
    } else {
      this.ctx.db.prepare('UPDATE campaigns SET scheduled_at = ?, updated_at = ? WHERE id = ?').run(at.toISOString(), this.ctx.clock.now().toISOString(), id);
    }
    this.d.history.audit('campaign.reschedule', { accountId, userId, entityType: 'campaign', entityId: id, details: { scheduledAt } });
    this.ctx.bus.emit('campaign.updated', { accountId, campaignId: id, status: c.status });
    return this.get(accountId, id);
  }

  // ---------- Eventos ----------
  onQueueFinished(e: { accountId: number; campaignId: number | null; runId: number | null; queueId: number }) {
    if (!e.campaignId) return;
    let runId = e.runId;
    if (!runId) runId = (this.ctx.db.prepare('SELECT run_id FROM message_queue WHERE id = ?').get(e.queueId) as { run_id: number } | undefined)?.run_id ?? null;
    this.ctx.bus.emit('campaign.progress', { accountId: e.accountId, campaignId: e.campaignId });
    if (runId) this.checkRunComplete(e.accountId, e.campaignId, runId);
  }

  private checkRunComplete(accountId: number, campaignId: number, runId: number) {
    const db = this.ctx.db;
    const pending = (db.prepare("SELECT COUNT(*) n FROM message_queue WHERE run_id = ? AND status IN ('queued','sending')").get(runId) as { n: number }).n;
    if (pending > 0) return;
    const run = db.prepare('SELECT status FROM campaign_runs WHERE id = ?').get(runId) as { status: string } | undefined;
    if (!run || run.status !== 'running') return;
    const now = this.ctx.clock.now().toISOString();
    db.prepare("UPDATE campaign_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(now, runId);
    const c = this.get(accountId, campaignId, false);
    const st = this.stats(campaignId, runId);
    if (c.status === 'cancelled') return;
    const allFailed = st.failed > 0 && st.sent === 0;
    if (c.recurrence && c.next_run_at && c.status !== 'paused') this.setStatus(c, 'scheduled', { completed_at: null });
    else if (c.recurrence && c.next_run_at) {
      /* sigue en pausa, conserva la próxima fecha */
    } else this.setStatus(c, allFailed ? 'failed' : 'completed', { completed_at: now, last_error: allFailed ? 'Todos los envíos fallaron' : null });
    this.ctx.bus.emit('campaign.finished', { accountId, campaignId, name: c.name, status: allFailed ? 'failed' : 'completed', failed: st.failed, sent: st.sent });
  }

  /** Marca como "respondido" al destinatario que contesta dentro de los 7 días siguientes al envío. */
  onInbound(accountId: number, contactId: number) {
    const now = this.ctx.clock.now();
    const since = new Date(now.getTime() - 7 * 86400000).toISOString();
    const rows = this.ctx.db
      .prepare(`SELECT cr.id, cr.campaign_id FROM campaign_recipients cr JOIN messages m ON m.id = cr.message_id
                WHERE cr.contact_id = ? AND cr.replied_at IS NULL AND cr.status IN ('sent','delivered','read') AND m.sent_at >= ?`)
      .all(contactId, since) as { id: number; campaign_id: number }[];
    for (const r of rows) {
      this.ctx.db.prepare('UPDATE campaign_recipients SET replied_at = ? WHERE id = ?').run(now.toISOString(), r.id);
      this.ctx.bus.emit('campaign.progress', { accountId, campaignId: r.campaign_id });
    }
  }

  /** Desconexión: pausar automáticamente todas las campañas en curso de la cuenta. */
  pauseAllForAccount(accountId: number, reason = 'disconnected'): number {
    const rows = this.ctx.db.prepare("SELECT id, account_id, status FROM campaigns WHERE account_id = ? AND status = 'running'").all(accountId) as Campaign[];
    for (const c of rows) this.setStatus(c, 'paused', { pause_reason: reason });
    return rows.length;
  }

  pausedByDisconnect(accountId: number): Campaign[] {
    return this.list(accountId, 'paused').filter((c) => c.pause_reason === 'disconnected' || c.pause_reason === 'disconnected_at_schedule');
  }

  /** Llamado periódicamente por el Scheduler: inicia campañas cuya hora llegó. */
  processDue(): number {
    const now = this.ctx.clock.now();
    const due = this.ctx.db.prepare("SELECT * FROM campaigns WHERE status = 'scheduled' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at").all(now.toISOString()).map((r) => this.row(r));
    let started = 0;
    for (const c of due) {
      try {
        const dueAt = new Date(c.next_run_at!);
        const grace = this.d.settings.get('sending', c.account_id).missedScheduleGraceHours * 3600000;
        const late = now.getTime() - dueAt.getTime();
        const activeRun = this.ctx.db.prepare(`SELECT id FROM campaign_runs WHERE campaign_id = ? AND ${ACTIVE_RUN}`).get(c.id);
        if (late > grace || activeRun) {
          if (c.recurrence) {
            // No se acumulan ejecuciones perdidas: se salta a la siguiente fecha futura.
            const next = nextOccurrence(c.recurrence, c.timezone, new Date(c.scheduled_at!), now, c.run_count);
            this.ctx.log.warn('campaigns', `Campaña ${c.id}: ejecución del ${dueAt.toISOString()} omitida (${activeRun ? 'la anterior sigue en curso' : 'la app estaba cerrada'})`);
            if (next) this.ctx.db.prepare('UPDATE campaigns SET next_run_at = ? WHERE id = ?').run(next.toISOString(), c.id);
            else this.setStatus(c, 'completed', { next_run_at: null, completed_at: now.toISOString() });
            continue;
          }
          this.setStatus(c, 'paused', { pause_reason: 'missed_schedule' });
          this.ctx.bus.emit('notify', { title: 'Campaña no enviada a tiempo', body: `"${c.name}" estaba programada para ${dueAt.toLocaleString('es-CO')} pero la aplicación estaba cerrada. Revísela y reanúdela si aún aplica.`, kind: 'warning', accountId: c.account_id, route: `/campaigns/${c.id}` });
          continue;
        }
        if (!this.d.isConnected(c.account_id)) {
          this.setStatus(c, 'paused', { pause_reason: 'disconnected_at_schedule' });
          this.ctx.bus.emit('notify', { title: 'Campaña en pausa', body: `"${c.name}" no se inició porque WhatsApp está desconectado.`, kind: 'error', accountId: c.account_id, route: `/campaigns/${c.id}` });
          continue;
        }
        if (this.startRun(c.account_id, c.id, dueAt)) started++;
      } catch (e) {
        this.ctx.log.error('campaigns', `Error iniciando campaña programada ${c.id}`, e);
        this.setStatus(c, 'failed', { last_error: (e as Error).message, next_run_at: null });
        this.ctx.bus.emit('notify', { title: 'Campaña fallida', body: `"${c.name}" no pudo iniciarse: ${(e as any).userMessage ?? 'error interno'}`, kind: 'error', accountId: c.account_id });
      }
    }
    return started;
  }

  recipients(accountId: number, id: number, opts: { status?: string; limit?: number; offset?: number } = {}) {
    this.get(accountId, id, false);
    return this.ctx.db
      .prepare(`SELECT cr.*, c.name, c.phone, m.status AS message_status, m.error_message, m.sent_at, m.delivered_at, m.read_at FROM campaign_recipients cr
                JOIN contacts c ON c.id = cr.contact_id LEFT JOIN messages m ON m.id = cr.message_id
                WHERE cr.campaign_id = ? ${opts.status ? 'AND cr.status = ?' : ''} ORDER BY cr.id DESC LIMIT ? OFFSET ?`)
      .all(...(opts.status ? [id, opts.status] : [id]), opts.limit ?? 100, opts.offset ?? 0);
  }

  runs(accountId: number, id: number) {
    this.get(accountId, id, false);
    return (this.ctx.db.prepare('SELECT * FROM campaign_runs WHERE campaign_id = ? ORDER BY run_number DESC').all(id) as any[]).map((r) => ({ ...r, stats: this.stats(id, r.id) }));
  }
}

import fs from 'node:fs';
import {
  CLOUD_MEDIA_LIMITS,
  ProviderError,
  WhatsAppProvider,
  type InboundMessage,
  type OutboundMedia,
  type OutboundMessage,
  type ProviderCapabilities,
  type ProviderErrorKind,
  type ProviderTemplateInfo,
  type SendResult,
  type StatusUpdate,
} from './provider';

export interface CloudApiConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string | null;
  appSecret?: string | null; // para verificar la firma de los webhooks
  verifyToken: string; // token de verificación del webhook
  apiVersion?: string;
}

type FetchLike = typeof fetch;

/** Clasificación de códigos de error de la WhatsApp Cloud API. */
export function classifyCloudError(code: number | string | null | undefined, httpStatus?: number): ProviderErrorKind {
  const c = code === null || code === undefined || code === '' ? NaN : Number(code);
  if ([130429, 131056, 80007, 4, 17, 32, 613].includes(c) || httpStatus === 429) return 'RATE_LIMIT';
  if ([190, 0, 10, 200, 102, 3].includes(c) || httpStatus === 401) return 'AUTH';
  if (c === 131047) return 'OUTSIDE_WINDOW';
  if (c === 131050) return 'OPTED_OUT';
  if ([131026, 131030, 131021, 131045, 131009].includes(c)) return 'INVALID_RECIPIENT';
  if (c >= 132000 && c <= 132999) return 'TEMPLATE';
  if ([131051, 131052, 131053].includes(c)) return 'MEDIA';
  if ([131031, 131042, 368, 131048, 131057].includes(c)) return 'ACCOUNT_BLOCKED';
  if ([131000, 1, 2, 131016, 133004, 135000].includes(c) || (httpStatus && httpStatus >= 500)) return 'TRANSIENT';
  return 'REJECTED';
}

const GRAPH = 'https://graph.facebook.com';

/**
 * Conector oficial: WhatsApp Business Platform — Cloud API (Meta).
 * - Envío vía Graph API.
 * - Recepción y estados vía webhook (ver WebhookServer).
 * - No permite sincronizar agenda, etiquetas ni historial (limitación de la API oficial).
 */
export class CloudApiProvider extends WhatsAppProvider {
  readonly kind = 'cloud_api' as const;
  readonly capabilities: ProviderCapabilities = {
    sendText: true,
    sendMedia: true,
    sendAudio: true,
    templates: true,
    deliveryReceipts: true,
    readReceipts: true,
    contactSync: false,
    labelsSync: false,
    historySync: false,
    qrLogin: false,
    customerServiceWindowHours: 24,
    mediaLimits: CLOUD_MEDIA_LIMITS,
  };

  constructor(
    private cfg: CloudApiConfig,
    private fetchImpl: FetchLike = fetch,
  ) {
    super();
  }

  get config() {
    return this.cfg;
  }

  private url(path: string) {
    return `${GRAPH}/${this.cfg.apiVersion || 'v23.0'}/${path.replace(/^\//, '')}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path), {
        ...init,
        headers: { Authorization: `Bearer ${this.cfg.accessToken}`, ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e: any) {
      throw new ProviderError('TRANSIENT', 'NETWORK', `Error de red: ${e?.message ?? e}`);
    }
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!res.ok || body?.error) {
      const err = body?.error ?? {};
      const kind = classifyCloudError(err.code, res.status);
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new ProviderError(kind, err.code !== undefined ? String(err.code) : String(res.status), `${res.status} ${err.type ?? ''} ${err.message ?? ''} ${err.error_data?.details ?? ''}`.trim(), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
    }
    return body as T;
  }

  /** Valida credenciales consultando el número de teléfono registrado. */
  async connect(): Promise<void> {
    if (!this.cfg.accessToken || !this.cfg.phoneNumberId) {
      this.setStatus({ status: 'disconnected', detail: 'Faltan credenciales (token y Phone Number ID).' });
      throw new ProviderError('AUTH', null, 'Faltan credenciales');
    }
    this.setStatus({ status: 'connecting', detail: 'Verificando credenciales…' });
    try {
      const info = await this.request<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
        `${encodeURIComponent(this.cfg.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
      );
      this.setStatus({
        status: 'connected',
        detail: null,
        phoneNumber: info.display_phone_number ? info.display_phone_number.replace(/\D/g, '') : null,
        displayName: info.verified_name ?? null,
        qualityRating: info.quality_rating ?? null,
      });
    } catch (e) {
      const pe = e as ProviderError;
      this.setStatus({ status: pe.kind === 'AUTH' ? 'error' : 'disconnected', detail: pe.message });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.setStatus({ status: 'disconnected', detail: 'Desconectado por el usuario.' });
  }

  /** Comprobación periódica de salud de la conexión. */
  async healthCheck(): Promise<void> {
    await this.connect();
  }

  private async uploadMedia(m: OutboundMedia): Promise<string> {
    const data = await fs.promises.readFile(m.filePath);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', m.mimeType);
    form.append('file', new Blob([data], { type: m.mimeType }), m.fileName);
    const r = await this.request<{ id: string }>(`${encodeURIComponent(this.cfg.phoneNumberId)}/media`, { method: 'POST', body: form });
    return r.id;
  }

  private mediaObject(m: OutboundMedia, id: string) {
    const o: Record<string, string> = { id };
    if (m.caption && m.kind !== 'audio' && m.kind !== 'sticker') o.caption = m.caption;
    if (m.kind === 'document') o.filename = m.fileName;
    return o;
  }

  async sendMessage(msg: OutboundMessage): Promise<SendResult> {
    if (this.info.status !== 'connected') throw new ProviderError('DISCONNECTED', null, 'Proveedor no conectado');
    const body: Record<string, unknown> = { messaging_product: 'whatsapp', recipient_type: 'individual', to: msg.to };
    if (msg.replyToProviderId) body.context = { message_id: msg.replyToProviderId };
    let uploadedMediaId: string | null = null;
    if (msg.kind === 'text') {
      body.type = 'text';
      body.text = { body: msg.text ?? '', preview_url: /https?:\/\//.test(msg.text ?? '') };
    } else if (msg.kind === 'media' && msg.media) {
      const id = msg.media.providerMediaId || (uploadedMediaId = await this.uploadMedia(msg.media));
      body.type = msg.media.kind;
      body[msg.media.kind] = this.mediaObject(msg.media, id);
    } else if (msg.kind === 'template' && msg.template) {
      const components: unknown[] = [];
      if (msg.template.headerMedia) {
        const hm = msg.template.headerMedia;
        const id = hm.providerMediaId || (uploadedMediaId = await this.uploadMedia(hm));
        components.push({ type: 'header', parameters: [{ type: hm.kind, [hm.kind]: hm.kind === 'document' ? { id, filename: hm.fileName } : { id } }] });
      }
      if (msg.template.bodyParams.length) components.push({ type: 'body', parameters: msg.template.bodyParams.map((t) => ({ type: 'text', text: t || '-' })) });
      body.type = 'template';
      body.template = { name: msg.template.name, language: { code: msg.template.language }, ...(components.length ? { components } : {}) };
    } else {
      throw new ProviderError('REJECTED', null, 'Mensaje sin contenido');
    }
    const r = await this.request<{ messages?: { id: string }[] }>(`${encodeURIComponent(this.cfg.phoneNumberId)}/messages`, { method: 'POST', body: JSON.stringify(body) });
    const id = r.messages?.[0]?.id;
    if (!id) throw new ProviderError('TRANSIENT', null, 'Respuesta sin id de mensaje');
    return { providerMessageId: id, uploadedMediaId };
  }

  async downloadMedia(providerMediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const meta = await this.request<{ url: string; mime_type: string; file_size?: number }>(encodeURIComponent(providerMediaId));
    if (meta.file_size && meta.file_size > 100 * 1024 * 1024) throw new ProviderError('MEDIA', null, 'Archivo demasiado grande');
    let res: Response;
    try {
      res = await this.fetchImpl(meta.url, { headers: { Authorization: `Bearer ${this.cfg.accessToken}` }, signal: AbortSignal.timeout(120000) });
    } catch (e: any) {
      throw new ProviderError('TRANSIENT', 'NETWORK', `Descarga fallida: ${e?.message ?? e}`);
    }
    if (!res.ok) throw new ProviderError(classifyCloudError(null, res.status), String(res.status), 'Descarga de multimedia fallida');
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type };
  }

  async listTemplates(): Promise<ProviderTemplateInfo[]> {
    if (!this.cfg.wabaId) throw new ProviderError('AUTH', null, 'Configure el WhatsApp Business Account ID para sincronizar plantillas.');
    const out: ProviderTemplateInfo[] = [];
    let path: string | null = `${encodeURIComponent(this.cfg.wabaId)}/message_templates?fields=name,language,status,category,components&limit=100`;
    for (let page = 0; path && page < 50; page++) {
      const r: any = await this.request<any>(path);
      for (const t of r.data ?? []) {
        const bodyC = (t.components ?? []).find((c: any) => c.type === 'BODY');
        const header = (t.components ?? []).find((c: any) => c.type === 'HEADER');
        const text: string | null = bodyC?.text ?? null;
        const params = text ? new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size : 0;
        out.push({ name: t.name, language: t.language, category: t.category ?? null, status: t.status, bodyText: text, paramCount: params, headerType: header?.format ?? null, raw: t });
      }
      const next: string | undefined = r.paging?.next;
      path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '') : null;
    }
    return out;
  }

  handleWebhook(payload: any): { inbound: InboundMessage[]; statuses: StatusUpdate[]; profileNames: Record<string, string> } {
    const inbound: InboundMessage[] = [];
    const statuses: StatusUpdate[] = [];
    const profileNames: Record<string, string> = {};
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const v = change?.value;
        if (change?.field !== 'messages' || !v) continue;
        if (v.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== String(this.cfg.phoneNumberId)) continue;
        for (const c of v.contacts ?? []) if (c?.wa_id && c?.profile?.name) profileNames[String(c.wa_id)] = String(c.profile.name);
        for (const m of v.messages ?? []) {
          const parsed = parseInbound(m, profileNames);
          if (parsed) inbound.push(parsed);
        }
        for (const s of v.statuses ?? []) {
          if (!['sent', 'delivered', 'read', 'failed'].includes(s?.status)) continue;
          const err = s.errors?.[0];
          statuses.push({
            providerMessageId: String(s.id),
            status: s.status,
            timestamp: new Date(Number(s.timestamp) * 1000 || Date.now()),
            recipient: s.recipient_id ? String(s.recipient_id) : undefined,
            errorCode: err?.code !== undefined ? String(err.code) : null,
            errorMessage: err ? `${err.title ?? ''} ${err.message ?? ''} ${err.error_data?.details ?? ''}`.trim() : null,
          });
        }
      }
    }
    return { inbound, statuses, profileNames };
  }
}

function parseInbound(m: any, names: Record<string, string>): InboundMessage | null {
  if (!m?.from || !m?.id) return null;
  const base = {
    from: String(m.from).replace(/\D/g, ''),
    profileName: names[String(m.from)] ?? null,
    providerMessageId: String(m.id),
    timestamp: new Date(Number(m.timestamp) * 1000 || Date.now()),
    type: String(m.type ?? 'unknown'),
    replyToProviderId: m.context?.id ?? null,
  };
  switch (m.type) {
    case 'text':
      return { ...base, text: m.text?.body ?? '' };
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const o = m[m.type] ?? {};
      return {
        ...base,
        text: o.caption ?? null,
        media: { providerMediaId: String(o.id), mimeType: o.mime_type ?? 'application/octet-stream', fileName: o.filename ?? null, caption: o.caption ?? null, kind: m.type },
      };
    }
    case 'button':
      return { ...base, type: 'text', text: m.button?.text ?? m.button?.payload ?? '' };
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return { ...base, type: 'text', text: r?.title ?? '' };
    }
    case 'location': {
      const l = m.location ?? {};
      return { ...base, text: `📍 ${l.name ? l.name + ' — ' : ''}${l.address ? l.address + ' ' : ''}(${l.latitude}, ${l.longitude})` };
    }
    case 'reaction':
      return { ...base, text: m.reaction?.emoji ? `Reaccionó ${m.reaction.emoji}` : 'Quitó una reacción' };
    case 'contacts':
      return { ...base, text: `👤 Contacto compartido: ${(m.contacts ?? []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(', ')}` };
    default:
      return { ...base, type: 'unknown', text: 'Mensaje no compatible con la API (tipo: ' + String(m.type) + ')' };
  }
}

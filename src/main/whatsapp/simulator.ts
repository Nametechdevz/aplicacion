import crypto from 'node:crypto';
import {
  CLOUD_MEDIA_LIMITS,
  ProviderError,
  WhatsAppProvider,
  type InboundMessage,
  type OutboundMessage,
  type ProviderCapabilities,
  type ProviderErrorKind,
  type ProviderTemplateInfo,
  type SendResult,
} from './provider';

export interface SimulatorOptions {
  phoneNumber?: string;
  displayName?: string;
  connectDelayMs?: number;
  deliveredAfterMs?: number | null; // null = no simula entrega
  readAfterMs?: number | null;
}

/**
 * Proveedor SIMULADOR para pruebas y demostraciones internas.
 * No envía mensajes reales: acepta envíos, simula estados entregado/leído y permite inyectar
 * mensajes entrantes. Está claramente identificado en la interfaz como "Simulador (pruebas)".
 */
export class SimulatorProvider extends WhatsAppProvider {
  readonly kind = 'simulator' as const;
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
    customerServiceWindowHours: null,
    mediaLimits: CLOUD_MEDIA_LIMITS,
  };
  readonly sent: (OutboundMessage & { providerMessageId: string; at: Date })[] = [];
  private failQueue: { kind: ProviderErrorKind; code?: string }[] = [];
  private timers = new Set<NodeJS.Timeout>();
  private opts: Required<SimulatorOptions>;

  constructor(opts: SimulatorOptions = {}) {
    super();
    this.opts = {
      phoneNumber: opts.phoneNumber ?? '15550000000',
      displayName: opts.displayName ?? 'Simulador',
      connectDelayMs: opts.connectDelayMs ?? 300,
      deliveredAfterMs: opts.deliveredAfterMs === undefined ? 1500 : opts.deliveredAfterMs,
      readAfterMs: opts.readAfterMs === undefined ? 5000 : opts.readAfterMs,
    };
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
  }

  async connect(): Promise<void> {
    this.setStatus({ status: 'connecting', detail: 'Conectando simulador…' });
    if (this.opts.connectDelayMs) await new Promise((r) => setTimeout(r, this.opts.connectDelayMs));
    this.setStatus({ status: 'connected', detail: null, phoneNumber: this.opts.phoneNumber, displayName: this.opts.displayName, qualityRating: 'GREEN' });
  }

  async disconnect(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.setStatus({ status: 'disconnected', detail: 'Desconectado por el usuario.' });
  }

  /** Simula una caída de conexión (prueba de reconexión / pausa de campañas). */
  simulateConnectionLoss(detail = 'Conexión perdida (simulada)') {
    this.setStatus({ status: 'disconnected', detail });
  }

  /** Programa fallos para los próximos envíos (ej. RATE_LIMIT) para probar la política de reintentos. */
  failNext(kind: ProviderErrorKind, times = 1, code?: string) {
    for (let i = 0; i < times; i++) this.failQueue.push({ kind, code });
  }

  async sendMessage(msg: OutboundMessage): Promise<SendResult> {
    if (this.info.status !== 'connected') throw new ProviderError('DISCONNECTED', null, 'Simulador desconectado');
    const f = this.failQueue.shift();
    if (f) throw new ProviderError(f.kind, f.code ?? null, `Fallo simulado ${f.kind}`, f.kind === 'RATE_LIMIT' ? 1000 : undefined);
    if (msg.kind === 'text' && !msg.text?.trim()) throw new ProviderError('REJECTED', '100', 'Texto vacío');
    const providerMessageId = 'sim.' + crypto.randomBytes(10).toString('hex');
    this.sent.push({ ...msg, providerMessageId, at: new Date() });
    const { deliveredAfterMs, readAfterMs } = this.opts;
    if (deliveredAfterMs !== null) this.later(deliveredAfterMs, () => this.emit('statusUpdate', { providerMessageId, status: 'delivered', timestamp: new Date(), recipient: msg.to }));
    if (readAfterMs !== null) this.later(readAfterMs, () => this.emit('statusUpdate', { providerMessageId, status: 'read', timestamp: new Date(), recipient: msg.to }));
    return { providerMessageId, uploadedMediaId: msg.media ? 'sim-media-' + crypto.randomBytes(4).toString('hex') : null };
  }

  /** Inyecta un mensaje entrante como si lo hubiera enviado un cliente. */
  simulateInbound(from: string, text: string, profileName: string | null = null): InboundMessage {
    const msg: InboundMessage = {
      from: from.replace(/\D/g, ''),
      profileName,
      providerMessageId: 'sim.in.' + crypto.randomBytes(8).toString('hex'),
      timestamp: new Date(),
      type: 'text',
      text,
    };
    this.emit('inbound', msg);
    return msg;
  }

  async listTemplates(): Promise<ProviderTemplateInfo[]> {
    return [
      { name: 'promo_general', language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'Hola {{1}} 👋 Tenemos una promoción especial para ti hasta {{2}}.', paramCount: 2, headerType: null, raw: null },
      { name: 'recordatorio_cita', language: 'es', category: 'UTILITY', status: 'APPROVED', bodyText: 'Hola {{1}}, te recordamos tu cita del {{2}}.', paramCount: 2, headerType: null, raw: null },
    ];
  }
}

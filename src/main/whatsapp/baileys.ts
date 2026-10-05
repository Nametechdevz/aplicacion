import QRCode from 'qrcode';
import type { DB } from '../db/database';
import type { SecretBox } from '../core/crypto';
import type { Logger } from '../core/logger';
import {
  CLOUD_MEDIA_LIMITS,
  ProviderError,
  WhatsAppProvider,
  type ExternalMessage,
  type InboundMessage,
  type OutboundMessage,
  type ProviderCapabilities,
  type SendResult,
  type StatusUpdate,
  type SyncedContact,
} from './provider';

/**
 * Conector NO OFICIAL basado en Baileys (protocolo de WhatsApp Web, vinculación por QR).
 *
 * ⚠️ Usar un cliente no oficial incumple los Términos de WhatsApp y puede provocar el bloqueo del
 * número, en especial con envíos masivos. El usuario debe aceptar ese riesgo al crear la cuenta.
 * Este conector NO incluye mecanismos para ocultarse ni para evadir los controles de WhatsApp:
 * usa los mismos límites de envío, opt-out y lista negra que el resto de la aplicación.
 */

type Lib = typeof import('baileys');

/** Logger compatible con el que espera Baileys (pino-like), redirigido al logger de la app. */
function makeBaileysLogger(log: Logger, accountId: number): any {
  const write = (level: 'warn' | 'error') => (obj: unknown, msg?: string) => {
    const text = typeof obj === 'string' ? obj : msg ?? '';
    log.write('whatsapp', level, `[baileys:${accountId}] ${text}`, typeof obj === 'object' && obj && !(obj instanceof Error) ? undefined : obj instanceof Error ? obj : undefined);
  };
  const logger: any = { level: 'warn', trace() {}, debug() {}, info() {}, warn: write('warn'), error: write('error'), fatal: write('error') };
  logger.child = () => logger;
  return logger;
}

/**
 * Sesión de Baileys guardada en SQLite, cifrada clave por clave con el SecretBox de la app
 * (DPAPI en Windows). Así la sesión no queda en texto plano en el disco.
 */
export async function createDbAuthState(lib: Lib, db: DB, secrets: SecretBox, accountId: number) {
  const { initAuthCreds, BufferJSON, proto } = lib;
  const read = (key: string) => {
    const row = db.prepare('SELECT value FROM baileys_auth WHERE account_id = ? AND key = ?').get(accountId, key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(secrets.decrypt(row.value), BufferJSON.reviver);
    } catch {
      return null;
    }
  };
  const upsert = db.prepare('INSERT INTO baileys_auth(account_id, key, value) VALUES (?,?,?) ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value');
  const del = db.prepare('DELETE FROM baileys_auth WHERE account_id = ? AND key = ?');
  const write = (key: string, value: unknown) => upsert.run(accountId, key, secrets.encrypt(JSON.stringify(value, BufferJSON.replacer)));
  const creds = read('creds') || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, any> = {};
          for (const id of ids) {
            let value = read(`${type}:${id}`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }
          return data;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          db.transaction(() => {
            for (const category of Object.keys(data)) {
              for (const id of Object.keys(data[category])) {
                const value = data[category][id];
                if (value) write(`${category}:${id}`, value);
                else del.run(accountId, `${category}:${id}`);
              }
            }
          })();
        },
      },
    },
    saveCreds: async () => {
      write('creds', creds);
    },
  };
}

export function hasBaileysSession(db: DB, accountId: number): boolean {
  return !!db.prepare("SELECT 1 FROM baileys_auth WHERE account_id = ? AND key = 'creds'").get(accountId);
}

export function clearBaileysSession(db: DB, accountId: number) {
  db.prepare('DELETE FROM baileys_auth WHERE account_id = ?').run(accountId);
}

export interface BaileysDeps {
  accountId: number;
  db: DB;
  secrets: SecretBox;
  log: Logger;
  /** Texto de un mensaje propio ya enviado (Baileys lo pide para reintentar descifrados). */
  getMessageBody?: (providerMessageId: string) => string | null;
  /** Inyectables para pruebas. */
  loadLib?: () => Promise<Lib>;
  makeSocket?: (lib: Lib, config: any) => any;
  fetchVersion?: boolean;
}

const MAX_MEDIA_CACHE = 300;

export class BaileysProvider extends WhatsAppProvider {
  readonly kind = 'baileys' as const;
  readonly capabilities: ProviderCapabilities = {
    sendText: true,
    sendMedia: true,
    sendAudio: true,
    templates: false,
    deliveryReceipts: true,
    readReceipts: true,
    contactSync: true,
    labelsSync: false,
    historySync: true,
    qrLogin: true,
    customerServiceWindowHours: null,
    mediaLimits: CLOUD_MEDIA_LIMITS,
  };
  private sock: any = null;
  private lib: Lib | null = null;
  private generation = 0;
  private ownSent = new Set<string>();
  private mediaCache = new Map<string, any>();
  private existsCache = new Map<string, boolean>();
  private manualClose = false;

  constructor(private d: BaileysDeps) {
    super();
  }

  private async loadLib(): Promise<Lib> {
    if (!this.lib) this.lib = await (this.d.loadLib ?? (() => import('baileys')))();
    return this.lib;
  }

  private phoneFromJid(jid: string | null | undefined): string | null {
    if (!jid || !this.lib) return null;
    if (!this.lib.isPnUser(jid)) return null;
    const user = this.lib.jidDecode(jid)?.user;
    return user && /^\d{6,15}$/.test(user) ? user : null;
  }

  /** Resuelve el teléfono de un chat 1:1 (incluye chats con identificador LID). Nunca inventa números. */
  private async resolvePhone(jid: string | null | undefined, alt?: string | null): Promise<string | null> {
    if (!jid || !this.lib) return null;
    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return null;
    const direct = this.phoneFromJid(jid) ?? this.phoneFromJid(alt ?? null);
    if (direct) return direct;
    if (this.lib.isLidUser(jid)) {
      try {
        const pn = await this.sock?.signalRepository?.lidMapping?.getPNForLID(jid);
        return this.phoneFromJid(pn ?? null);
      } catch {
        return null;
      }
    }
    return null;
  }

  async connect(): Promise<void> {
    const lib = await this.loadLib();
    const gen = ++this.generation;
    this.manualClose = false;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners?.();
        await this.sock.end(undefined);
      } catch {
        /* ignorar */
      }
      this.sock = null;
    }
    this.setStatus({ status: 'connecting', detail: 'Conectando con WhatsApp…' });
    const { state, saveCreds } = await createDbAuthState(lib, this.d.db, this.d.secrets, this.d.accountId);
    const logger = makeBaileysLogger(this.d.log, this.d.accountId);
    let version: any;
    if (this.d.fetchVersion !== false) {
      try {
        version = (await Promise.race([lib.fetchLatestBaileysVersion(), new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 6000))])).version;
      } catch {
        version = undefined; // usa la versión incluida en la librería
      }
    }
    const config = {
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: lib.makeCacheableSignalKeyStore(state.keys as any, logger) },
      logger,
      browser: lib.Browsers.windows('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key: any) => {
        const body = key?.id ? this.d.getMessageBody?.(key.id) : null;
        return body ? { conversation: body } : undefined;
      },
    };
    const sock = (this.d.makeSocket ?? ((l: Lib, c: any) => (l as any).default(c)))(lib, config);
    this.sock = sock;
    const alive = () => gen === this.generation;

    sock.ev.on('creds.update', () => alive() && void saveCreds());

    sock.ev.on('connection.update', async (u: any) => {
      if (!alive()) return;
      if (u.qr) {
        let dataUrl: string;
        try {
          dataUrl = await QRCode.toDataURL(u.qr, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
        } catch {
          return;
        }
        if (!alive()) return;
        this.setStatus({ status: 'qr_required', qr: dataUrl, detail: 'Escanee el código QR desde WhatsApp → Dispositivos vinculados.', noAutoReconnect: true });
      }
      if (u.connection === 'open') {
        const phone = this.phoneFromJid(lib.jidNormalizedUser(sock.user?.id)) ?? null;
        this.setStatus({ status: 'connected', detail: null, phoneNumber: phone, displayName: sock.user?.name ?? sock.user?.verifiedName ?? null, qr: null });
      }
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as any)?.output?.statusCode;
        const R = lib.DisconnectReason;
        if (this.manualClose) return;
        if (code === R.restartRequired) {
          // Ocurre justo después de escanear el QR: hay que abrir un socket nuevo.
          void this.connect().catch((e) => this.d.log.warn('whatsapp', `Reinicio tras vincular falló: ${e?.message}`));
          return;
        }
        if (code === R.loggedOut) {
          clearBaileysSession(this.d.db, this.d.accountId);
          this.setStatus({ status: 'disconnected', detail: 'La sesión se cerró desde el teléfono. Pulse "Conectar" y escanee el QR de nuevo.', noAutoReconnect: true });
          return;
        }
        if (code === R.connectionReplaced) {
          this.setStatus({ status: 'disconnected', detail: 'La sesión se abrió en otro lugar con este mismo vínculo. Pulse "Reconectar" para retomarla.', noAutoReconnect: true });
          return;
        }
        if (code === R.forbidden) {
          this.setStatus({ status: 'error', detail: 'WhatsApp rechazó la conexión (posible restricción o bloqueo del número).', noAutoReconnect: true });
          return;
        }
        if (this.info.status === 'qr_required' || code === 408) {
          this.setStatus({ status: 'disconnected', detail: 'El código QR expiró sin ser escaneado. Pulse "Conectar" para generar otro.', noAutoReconnect: true });
          return;
        }
        if (code === R.badSession || code === R.multideviceMismatch) {
          clearBaileysSession(this.d.db, this.d.accountId);
          this.setStatus({ status: 'disconnected', detail: 'La sesión guardada no es válida. Pulse "Conectar" y escanee el QR de nuevo.', noAutoReconnect: true });
          return;
        }
        this.setStatus({ status: 'disconnected', detail: 'Conexión con WhatsApp perdida. Reintentando…' });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (!alive()) return;
      for (const m of messages ?? []) {
        try {
          await this.handleUpsert(m, type);
        } catch (e) {
          this.d.log.warn('whatsapp', `No se pudo procesar un mensaje de Baileys: ${(e as Error).message}`);
        }
      }
    });

    sock.ev.on('messages.update', (updates: any[]) => {
      if (!alive()) return;
      for (const { key, update } of updates ?? []) {
        if (!key?.fromMe || !key.id || update?.status === undefined || update?.status === null) continue;
        const map: Record<number, StatusUpdate['status'] | undefined> = { 0: 'failed', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };
        const status = map[Number(update.status)];
        if (status) this.emit('statusUpdate', { providerMessageId: key.id, status, timestamp: new Date(), errorMessage: status === 'failed' ? 'WhatsApp no pudo entregar el mensaje.' : null });
      }
    });

    const onContacts = (list: any[]) => {
      if (!alive()) return;
      const out: SyncedContact[] = [];
      for (const c of list ?? []) {
        const phone = this.phoneFromJid(c.phoneNumber ?? null) ?? this.phoneFromJid(c.id ?? null);
        if (!phone) continue;
        const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null;
        const notify = typeof c.notify === 'string' && c.notify.trim() ? c.notify.trim() : null;
        if (!name && !notify) continue; // sin datos que aportar
        out.push({ phone, name, notify });
      }
      if (out.length) this.emit('contacts', out);
    };
    sock.ev.on('contacts.upsert', onContacts);
    sock.ev.on('contacts.update', onContacts);

    sock.ev.on('messaging-history.set', async ({ contacts, messages }: any) => {
      if (!alive()) return;
      onContacts(contacts ?? []);
      const out: ExternalMessage[] = [];
      for (const m of (messages ?? []).slice(0, 5000)) {
        const phone = await this.resolvePhone(m.key?.remoteJid, m.key?.remoteJidAlt);
        const parsed = phone ? this.parseContent(m) : null;
        if (!phone || !parsed || !m.key?.id) continue;
        out.push({ phone, direction: m.key.fromMe ? 'out' : 'in', providerMessageId: m.key.id, timestamp: this.ts(m), type: parsed.type, text: parsed.text, profileName: m.key.fromMe ? null : m.pushName ?? null });
      }
      if (out.length) this.emit('history', out);
    });
  }

  private ts(m: any): Date {
    const t = Number(m.messageTimestamp?.toNumber?.() ?? m.messageTimestamp);
    return t > 0 ? new Date(t * 1000) : new Date();
  }

  /** Extrae tipo y texto de un mensaje. Devuelve null para mensajes de protocolo (no visibles). */
  private parseContent(m: any): { type: string; text: string | null; mediaKind?: 'image' | 'video' | 'audio' | 'document' | 'sticker'; mime?: string; fileName?: string | null; replyTo?: string | null } | null {
    const lib = this.lib!;
    const content = lib.normalizeMessageContent(m.message);
    if (!content) return null;
    const ct = lib.getContentType(content) as string | undefined;
    if (!ct) return null;
    const c: any = (content as any)[ct];
    const replyTo = c?.contextInfo?.stanzaId ?? null;
    switch (ct) {
      case 'conversation':
        return { type: 'text', text: String(content.conversation ?? '') };
      case 'extendedTextMessage':
        return { type: 'text', text: c?.text ?? '', replyTo };
      case 'imageMessage':
        return { type: 'image', text: c?.caption ?? null, mediaKind: 'image', mime: c?.mimetype ?? 'image/jpeg', replyTo };
      case 'videoMessage':
        return { type: 'video', text: c?.caption ?? null, mediaKind: 'video', mime: c?.mimetype ?? 'video/mp4', replyTo };
      case 'audioMessage':
        return { type: 'audio', text: null, mediaKind: 'audio', mime: c?.mimetype ?? 'audio/ogg', replyTo };
      case 'documentMessage':
      case 'documentWithCaptionMessage': {
        const doc = ct === 'documentMessage' ? c : c?.message?.documentMessage;
        return { type: 'document', text: doc?.caption ?? null, mediaKind: 'document', mime: doc?.mimetype ?? 'application/octet-stream', fileName: doc?.fileName ?? null, replyTo };
      }
      case 'stickerMessage':
        return { type: 'sticker', text: null, mediaKind: 'sticker', mime: c?.mimetype ?? 'image/webp' };
      case 'locationMessage':
      case 'liveLocationMessage':
        return { type: 'location', text: `📍 ${c?.name ? c.name + ' — ' : ''}${c?.address ? c.address + ' ' : ''}(${c?.degreesLatitude}, ${c?.degreesLongitude})` };
      case 'contactMessage':
        return { type: 'contacts', text: `👤 Contacto compartido: ${c?.displayName ?? ''}` };
      case 'contactsArrayMessage':
        return { type: 'contacts', text: `👤 Contactos compartidos: ${(c?.contacts ?? []).map((x: any) => x?.displayName).filter(Boolean).join(', ')}` };
      case 'reactionMessage':
        return { type: 'reaction', text: c?.text ? `Reaccionó ${c.text}` : 'Quitó una reacción' };
      case 'buttonsResponseMessage':
        return { type: 'text', text: c?.selectedDisplayText ?? c?.selectedButtonId ?? '' };
      case 'listResponseMessage':
        return { type: 'text', text: c?.title ?? c?.singleSelectReply?.selectedRowId ?? '' };
      case 'templateButtonReplyMessage':
        return { type: 'text', text: c?.selectedDisplayText ?? '' };
      case 'pollCreationMessage':
      case 'pollCreationMessageV3':
        return { type: 'unknown', text: `📊 Encuesta: ${c?.name ?? ''}` };
      case 'protocolMessage':
      case 'senderKeyDistributionMessage':
      case 'messageContextInfo':
      case 'pollUpdateMessage':
      case 'editedMessage':
        return null;
      default:
        return { type: 'unknown', text: `Mensaje no compatible (${ct})` };
    }
  }

  private async handleUpsert(m: any, type: string) {
    const id = m?.key?.id;
    if (!id) return;
    const phone = await this.resolvePhone(m.key.remoteJid, m.key.remoteJidAlt);
    if (!phone) return; // grupos, estados, canales o LID sin teléfono conocido
    const parsed = this.parseContent(m);
    if (!parsed) return;
    if (m.key.fromMe) {
      if (this.ownSent.has(id)) return; // lo envió esta aplicación
      // Mensaje escrito desde el teléfono u otro dispositivo vinculado
      this.emit('outboundExternal', { phone, direction: 'out', providerMessageId: id, timestamp: this.ts(m), type: parsed.type, text: parsed.text });
      return;
    }
    if (type !== 'notify' && type !== 'append') return;
    if (parsed.mediaKind) {
      this.mediaCache.set(id, m);
      if (this.mediaCache.size > MAX_MEDIA_CACHE) this.mediaCache.delete(this.mediaCache.keys().next().value!);
    }
    const msg: InboundMessage = {
      from: phone,
      profileName: m.pushName ?? null,
      providerMessageId: id,
      timestamp: this.ts(m),
      type: parsed.type,
      text: parsed.text,
      media: parsed.mediaKind ? { providerMediaId: id, mimeType: parsed.mime ?? 'application/octet-stream', fileName: parsed.fileName ?? null, caption: parsed.text, kind: parsed.mediaKind } : null,
      replyToProviderId: parsed.replyTo ?? null,
    };
    this.emit('inbound', msg);
  }

  async downloadMedia(providerMediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const m = this.mediaCache.get(providerMediaId);
    if (!m || !this.lib) throw new ProviderError('MEDIA', null, 'El archivo ya no está disponible para descargar');
    try {
      const data = (await this.lib.downloadMediaMessage(m, 'buffer', {}, { logger: makeBaileysLogger(this.d.log, this.d.accountId), reuploadRequest: this.sock?.updateMediaMessage } as any)) as Buffer;
      const parsed = this.parseContent(m);
      this.mediaCache.delete(providerMediaId);
      return { data, mimeType: parsed?.mime ?? 'application/octet-stream' };
    } catch (e: any) {
      throw new ProviderError('MEDIA', null, `Descarga fallida: ${e?.message ?? e}`);
    }
  }

  private mapError(e: any): ProviderError {
    if (e instanceof ProviderError) return e;
    const code = e?.output?.statusCode ?? e?.data?.statusCode;
    const msg = String(e?.message ?? e);
    if (code === 429 || /rate-overlimit/i.test(msg)) return new ProviderError('RATE_LIMIT', '429', msg, 60000);
    if (code === 401 || code === 403) return new ProviderError('ACCOUNT_BLOCKED', String(code), msg);
    if (code === 428 || /connection closed|not connected/i.test(msg)) return new ProviderError('DISCONNECTED', String(code ?? ''), msg);
    return new ProviderError('TRANSIENT', code ? String(code) : null, msg);
  }

  async sendMessage(msg: OutboundMessage): Promise<SendResult> {
    if (this.info.status !== 'connected' || !this.sock || !this.lib) throw new ProviderError('DISCONNECTED', null, 'WhatsApp no conectado');
    if (msg.kind === 'template') throw new ProviderError('TEMPLATE', null, 'Las plantillas de Meta solo están disponibles con la Cloud API');
    const jid = `${msg.to}@s.whatsapp.net`;
    let exists = this.existsCache.get(msg.to);
    if (exists === undefined) {
      try {
        const [r] = (await this.sock.onWhatsApp(msg.to)) ?? [];
        exists = !!r?.exists;
        this.existsCache.set(msg.to, exists);
      } catch (e) {
        throw this.mapError(e);
      }
    }
    if (!exists) throw new ProviderError('INVALID_RECIPIENT', 'NOT_ON_WHATSAPP', 'El número no tiene WhatsApp');
    let content: any;
    if (msg.kind === 'text') content = { text: msg.text ?? '' };
    else if (msg.media) {
      const m = msg.media;
      const caption = m.caption || undefined;
      if (m.kind === 'image') content = { image: { url: m.filePath }, caption, mimetype: m.mimeType };
      else if (m.kind === 'video') content = { video: { url: m.filePath }, caption, mimetype: m.mimeType };
      else if (m.kind === 'audio') content = { audio: { url: m.filePath }, mimetype: m.mimeType };
      else if (m.kind === 'sticker') content = { sticker: { url: m.filePath } };
      else content = { document: { url: m.filePath }, mimetype: m.mimeType, fileName: m.fileName, caption };
    } else throw new ProviderError('REJECTED', null, 'Mensaje sin contenido');
    const messageId = this.lib.generateMessageIDV2(this.sock.user?.id);
    this.ownSent.add(messageId);
    if (this.ownSent.size > 5000) this.ownSent.delete(this.ownSent.values().next().value!);
    try {
      const res = await this.sock.sendMessage(jid, content, { messageId });
      const id = res?.key?.id ?? messageId;
      this.ownSent.add(id);
      return { providerMessageId: id };
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    this.generation++;
    try {
      await this.sock?.end(undefined);
    } catch {
      /* ignorar */
    }
    this.sock = null;
    this.setStatus({ status: 'disconnected', detail: 'Desconectado por el usuario.', noAutoReconnect: true });
  }

  override dispose(): void {
    this.manualClose = true;
    this.generation++;
    const sock = this.sock;
    this.sock = null;
    try {
      sock?.ev.removeAllListeners?.();
      void Promise.resolve(sock?.end(undefined)).catch(() => {});
    } catch {
      /* ignorar */
    }
    super.dispose();
  }

  /** Cierra la sesión en WhatsApp (desvincula este dispositivo) y borra la sesión guardada. */
  async logout(): Promise<void> {
    this.manualClose = true;
    this.generation++;
    try {
      await this.sock?.logout();
    } catch {
      /* puede estar desconectado: igual se borra la sesión local */
    }
    try {
      await this.sock?.end(undefined);
    } catch {
      /* ignorar */
    }
    this.sock = null;
    clearBaileysSession(this.d.db, this.d.accountId);
    this.setStatus({ status: 'disconnected', detail: 'Sesión cerrada. Pulse "Conectar" y escanee el QR para vincular de nuevo.', noAutoReconnect: true, phoneNumber: null });
  }
}

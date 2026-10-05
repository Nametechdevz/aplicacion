import { EventEmitter } from 'node:events';
import type { ConnectionStatus, ProviderKind } from '../../shared/types';

/**
 * Contrato que cualquier conector de WhatsApp debe cumplir. El CRM, la cola, las campañas y las
 * automatizaciones SOLO dependen de esta interfaz, nunca de un proveedor concreto.
 */
export interface ProviderCapabilities {
  sendText: boolean;
  sendMedia: boolean;
  sendAudio: boolean;
  templates: boolean; // plantillas aprobadas por Meta
  deliveryReceipts: boolean;
  readReceipts: boolean;
  contactSync: boolean; // sincronizar agenda
  labelsSync: boolean;
  historySync: boolean;
  qrLogin: boolean;
  customerServiceWindowHours: number | null; // 24 en Cloud API, null = sin restricción
  mediaLimits: Record<'image' | 'video' | 'audio' | 'document' | 'sticker', { maxBytes: number; mimeTypes: string[] | null }>;
}

export interface ConnectionInfo {
  status: ConnectionStatus;
  detail?: string | null;
  phoneNumber?: string | null; // E.164 sin '+'
  displayName?: string | null;
  qualityRating?: string | null;
  qr?: string | null;
}

export interface OutboundMedia {
  kind: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  filePath: string;
  mimeType: string;
  fileName: string;
  caption?: string | null;
  providerMediaId?: string | null;
}

export interface OutboundMessage {
  to: string;
  kind: 'text' | 'media' | 'template';
  text?: string;
  media?: OutboundMedia;
  template?: { name: string; language: string; bodyParams: string[]; headerMedia?: OutboundMedia | null };
  replyToProviderId?: string | null;
}

export interface SendResult {
  providerMessageId: string;
  uploadedMediaId?: string | null;
}

export interface InboundMessage {
  from: string;
  profileName: string | null;
  providerMessageId: string;
  timestamp: Date;
  type: string;
  text: string | null;
  media?: { providerMediaId: string; mimeType: string; fileName?: string | null; caption?: string | null; kind: 'image' | 'video' | 'audio' | 'document' | 'sticker' } | null;
  replyToProviderId?: string | null;
}

export interface StatusUpdate {
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  recipient?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ProviderTemplateInfo {
  name: string;
  language: string;
  category: string | null;
  status: string;
  bodyText: string | null;
  paramCount: number;
  headerType: string | null;
  raw: unknown;
}

export type ProviderErrorKind =
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'DISCONNECTED'
  | 'INVALID_RECIPIENT'
  | 'OUTSIDE_WINDOW'
  | 'TEMPLATE'
  | 'MEDIA'
  | 'OPTED_OUT'
  | 'TRANSIENT'
  | 'ACCOUNT_BLOCKED'
  | 'REJECTED';

/** Mensajes para el usuario final por tipo de error (el detalle técnico va a logs). */
export const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorKind, string> = {
  RATE_LIMIT: 'WhatsApp limitó temporalmente la velocidad de envío. Se reintentará automáticamente.',
  AUTH: 'Las credenciales de WhatsApp no son válidas o expiraron.',
  DISCONNECTED: 'Cuenta desconectada.',
  INVALID_RECIPIENT: 'El número no existe en WhatsApp o no puede recibir mensajes.',
  OUTSIDE_WINDOW: 'Fuera de la ventana de 24 h: solo se pueden enviar plantillas aprobadas a este contacto.',
  TEMPLATE: 'La plantilla fue rechazada (no existe, no está aprobada o los parámetros no coinciden).',
  MEDIA: 'El archivo multimedia no es compatible o no pudo procesarse.',
  OPTED_OUT: 'El contacto bloqueó los mensajes de marketing de esta empresa.',
  TRANSIENT: 'Error temporal del proveedor. Se reintentará automáticamente.',
  ACCOUNT_BLOCKED: 'La cuenta de WhatsApp está restringida por el proveedor.',
  REJECTED: 'El proveedor rechazó el envío.',
};

export class ProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    public providerCode: string | null,
    public technical: string,
    public retryAfterMs?: number,
  ) {
    super(PROVIDER_ERROR_MESSAGES[kind]);
    this.name = 'ProviderError';
  }
  get retryable() {
    return this.kind === 'RATE_LIMIT' || this.kind === 'TRANSIENT' || this.kind === 'DISCONNECTED';
  }
}

export interface ProviderEvents {
  status: (info: ConnectionInfo) => void;
  inbound: (msg: InboundMessage) => void;
  statusUpdate: (u: StatusUpdate) => void;
}

export abstract class WhatsAppProvider extends EventEmitter {
  abstract readonly kind: ProviderKind;
  abstract readonly capabilities: ProviderCapabilities;
  protected info: ConnectionInfo = { status: 'disconnected' };

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(msg: OutboundMessage): Promise<SendResult>;
  downloadMedia?(providerMediaId: string): Promise<{ data: Buffer; mimeType: string }>;
  listTemplates?(): Promise<ProviderTemplateInfo[]>;
  /** Normaliza un payload de webhook a eventos internos (solo proveedores basados en webhooks). */
  handleWebhook?(payload: unknown): { inbound: InboundMessage[]; statuses: StatusUpdate[]; profileNames: Record<string, string> };

  getStatus(): ConnectionInfo {
    return { ...this.info };
  }

  protected setStatus(next: Partial<ConnectionInfo> & { status: ConnectionStatus }) {
    this.info = { ...this.info, ...next };
    this.emit('status', this.getStatus());
  }

  override on<K extends keyof ProviderEvents>(event: K, listener: ProviderEvents[K]): this {
    return super.on(event, listener);
  }
}

const MB = 1024 * 1024;
/** Límites oficiales de la Cloud API para multimedia. */
export const CLOUD_MEDIA_LIMITS: ProviderCapabilities['mediaLimits'] = {
  image: { maxBytes: 5 * MB, mimeTypes: ['image/jpeg', 'image/png'] },
  video: { maxBytes: 16 * MB, mimeTypes: ['video/mp4', 'video/3gpp'] },
  audio: { maxBytes: 16 * MB, mimeTypes: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'] },
  document: { maxBytes: 100 * MB, mimeTypes: null },
  sticker: { maxBytes: 500 * 1024, mimeTypes: ['image/webp'] },
};

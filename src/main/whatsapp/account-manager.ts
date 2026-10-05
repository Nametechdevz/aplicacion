import type { Ctx } from '../context';
import { AppError, invalid, notFound } from '../core/errors';
import { randomId } from '../core/crypto';
import type { ConnectionStatus, ProviderKind, WhatsAppAccount } from '../../shared/types';
import { CloudApiProvider, type CloudApiConfig } from './cloud-api';
import { SimulatorProvider } from './simulator';
import { ProviderError, type WhatsAppProvider } from './provider';
import type { ConversationService } from '../services/conversations';
import type { TemplateService } from '../services/templates';
import type { TagService } from '../services/tags';
import type { TaskService } from '../services/tasks';

interface AccountRow {
  id: number;
  name: string;
  provider: ProviderKind;
  phone_number: string | null;
  display_name: string | null;
  config_encrypted: string | null;
  webhook_key: string | null;
  status: ConnectionStatus;
  status_detail: string | null;
  quality_rating: string | null;
  auto_connect: number;
  last_connected_at: string | null;
  last_sync_at: string | null;
  created_at: string;
}

export type ProviderFactory = (row: { provider: ProviderKind; config: any }) => WhatsAppProvider;

export const defaultProviderFactory: ProviderFactory = ({ provider, config }) =>
  provider === 'cloud_api' ? new CloudApiProvider(config as CloudApiConfig) : new SimulatorProvider(config ?? {});

const HEALTH_INTERVAL_MS = 5 * 60000;
const MAX_BACKOFF_MS = 10 * 60000;

/**
 * Administra las cuentas de WhatsApp (multi-cuenta), sus proveedores, el estado de conexión,
 * la reconexión automática con backoff y el enrutamiento de eventos entrantes.
 */
export class AccountManager {
  private providers = new Map<number, WhatsAppProvider>();
  private reconnectTimers = new Map<number, NodeJS.Timeout>();
  private backoff = new Map<number, number>();
  private healthTimer: NodeJS.Timeout | null = null;
  private manualDisconnect = new Set<number>();

  constructor(
    private ctx: Ctx,
    private deps: { conversations: ConversationService; templates: TemplateService; tags: TagService; tasks: TaskService },
    private factory: ProviderFactory = defaultProviderFactory,
  ) {}

  private toPublic(r: AccountRow): WhatsAppAccount {
    const p = this.providers.get(r.id);
    const info = p?.getStatus();
    return {
      id: r.id,
      name: r.name,
      provider: r.provider,
      phone_number: r.phone_number,
      display_name: r.display_name,
      status: info?.status ?? 'disconnected',
      status_detail: info?.detail ?? r.status_detail,
      last_connected_at: r.last_connected_at,
      last_sync_at: r.last_sync_at,
      created_at: r.created_at,
      has_credentials: !!r.config_encrypted,
      quality_rating: info?.qualityRating ?? r.quality_rating,
      qr: info?.qr ?? null,
    };
  }

  private rows(): AccountRow[] {
    return this.ctx.db.prepare('SELECT * FROM whatsapp_accounts WHERE deleted_at IS NULL ORDER BY id').all() as AccountRow[];
  }

  private row(id: number): AccountRow {
    const r = this.ctx.db.prepare('SELECT * FROM whatsapp_accounts WHERE id = ? AND deleted_at IS NULL').get(id) as AccountRow | undefined;
    if (!r) throw notFound('La cuenta de WhatsApp');
    return r;
  }

  list(): WhatsAppAccount[] {
    return this.rows().map((r) => this.toPublic(r));
  }

  get(id: number): WhatsAppAccount {
    return this.toPublic(this.row(id));
  }

  getProvider(id: number): WhatsAppProvider | null {
    return this.providers.get(id) ?? null;
  }

  isConnected(id: number) {
    return this.providers.get(id)?.getStatus().status === 'connected';
  }

  windowHours(id: number): number | null {
    const p = this.providers.get(id);
    if (p) return p.capabilities.customerServiceWindowHours;
    const r = this.ctx.db.prepare('SELECT provider FROM whatsapp_accounts WHERE id = ?').get(id) as { provider: ProviderKind } | undefined;
    return r?.provider === 'simulator' ? null : 24;
  }

  capabilities(id: number) {
    const p = this.providers.get(id) ?? this.buildProvider(this.row(id));
    return p.capabilities;
  }

  /** Configuración descifrada (solo uso interno; nunca se envía a la UI con secretos). */
  private config(r: AccountRow): any {
    if (!r.config_encrypted) return r.provider === 'simulator' ? {} : null;
    return JSON.parse(this.ctx.secrets.decrypt(r.config_encrypted));
  }

  publicConfig(id: number) {
    const r = this.row(id);
    if (r.provider !== 'cloud_api') return { provider: r.provider };
    let cfg: Partial<CloudApiConfig> = {};
    try {
      cfg = this.config(r) ?? {};
    } catch {
      return { provider: r.provider, error: 'No se pudieron descifrar las credenciales en este equipo. Vuelva a ingresarlas.' };
    }
    return {
      provider: r.provider,
      phoneNumberId: cfg.phoneNumberId ?? '',
      wabaId: cfg.wabaId ?? '',
      apiVersion: cfg.apiVersion ?? 'v23.0',
      verifyToken: cfg.verifyToken ?? '',
      hasAccessToken: !!cfg.accessToken,
      hasAppSecret: !!cfg.appSecret,
      accessTokenHint: cfg.accessToken ? '••••' + cfg.accessToken.slice(-4) : '',
    };
  }

  create(input: { name: string; provider: ProviderKind; config?: Partial<CloudApiConfig> }): WhatsAppAccount {
    const name = input.name?.trim();
    if (!name) throw invalid('Ponga un nombre a la cuenta (ej. "Ventas").');
    if (!['cloud_api', 'simulator'].includes(input.provider)) throw invalid('Proveedor no soportado.');
    let enc: string | null = null;
    if (input.provider === 'cloud_api') {
      const cfg = this.validateCloudConfig(input.config ?? {}, null);
      enc = this.ctx.secrets.encrypt(JSON.stringify(cfg));
    }
    const r = this.ctx.db
      .prepare('INSERT INTO whatsapp_accounts(name, provider, config_encrypted, webhook_key, created_at) VALUES (?,?,?,?,?)')
      .run(name, input.provider, enc, randomId(12), this.ctx.clock.now().toISOString());
    const id = Number(r.lastInsertRowid);
    this.deps.tags.ensureSystemTags(id, true);
    this.deps.tasks.ensureDefaultPipeline(id);
    this.ctx.log.info('whatsapp', `Cuenta ${id} creada (${input.provider})`);
    return this.get(id);
  }

  private validateCloudConfig(cfg: Partial<CloudApiConfig>, prev: CloudApiConfig | null): CloudApiConfig {
    const out: CloudApiConfig = {
      accessToken: cfg.accessToken?.trim() || prev?.accessToken || '',
      phoneNumberId: (cfg.phoneNumberId ?? prev?.phoneNumberId ?? '').toString().trim(),
      wabaId: (cfg.wabaId ?? prev?.wabaId ?? '')?.toString().trim() || null,
      appSecret: cfg.appSecret?.trim() || prev?.appSecret || null,
      verifyToken: (cfg.verifyToken ?? prev?.verifyToken ?? '').trim() || randomId(16),
      apiVersion: (cfg.apiVersion ?? prev?.apiVersion ?? 'v23.0').trim(),
    };
    if (!out.accessToken) throw invalid('Ingrese el token de acceso (System User token) de la Cloud API.');
    if (!/^\d{6,20}$/.test(out.phoneNumberId)) throw invalid('El Phone Number ID debe ser numérico.');
    if (out.wabaId && !/^\d{6,20}$/.test(out.wabaId)) throw invalid('El WhatsApp Business Account ID debe ser numérico.');
    if (!/^v\d{1,2}\.\d$/.test(out.apiVersion!)) throw invalid('Versión de API inválida (ej. v23.0).');
    if (!out.appSecret) throw invalid('Ingrese el App Secret: es necesario para verificar la autenticidad de los webhooks.');
    return out;
  }

  updateConfig(id: number, input: { name?: string; config?: Partial<CloudApiConfig>; auto_connect?: boolean }) {
    const r = this.row(id);
    if (input.name !== undefined) {
      if (!input.name.trim()) throw invalid('El nombre no puede estar vacío.');
      this.ctx.db.prepare('UPDATE whatsapp_accounts SET name = ? WHERE id = ?').run(input.name.trim(), id);
    }
    if (input.auto_connect !== undefined) this.ctx.db.prepare('UPDATE whatsapp_accounts SET auto_connect = ? WHERE id = ?').run(input.auto_connect ? 1 : 0, id);
    if (input.config && r.provider === 'cloud_api') {
      let prev: CloudApiConfig | null = null;
      try {
        prev = this.config(r);
      } catch {
        prev = null;
      }
      const cfg = this.validateCloudConfig(input.config, prev);
      this.ctx.db.prepare('UPDATE whatsapp_accounts SET config_encrypted = ? WHERE id = ?').run(this.ctx.secrets.encrypt(JSON.stringify(cfg)), id);
      // Credenciales nuevas: reconstruir el proveedor
      const old = this.providers.get(id);
      if (old) {
        old.removeAllListeners();
        void old.disconnect().catch(() => {});
        this.providers.delete(id);
      }
    }
    return this.get(id);
  }

  async remove(id: number) {
    this.row(id);
    await this.disconnect(id);
    this.providers.delete(id);
    this.ctx.db.prepare('UPDATE whatsapp_accounts SET deleted_at = ?, config_encrypted = NULL, status = ? WHERE id = ?').run(this.ctx.clock.now().toISOString(), 'disconnected', id);
  }

  private buildProvider(r: AccountRow): WhatsAppProvider {
    let cfg: any;
    try {
      cfg = this.config(r);
    } catch {
      throw new AppError('SECRETS', 'No se pudieron descifrar las credenciales en este equipo. Vuelva a ingresarlas en Configuración → WhatsApp.');
    }
    if (r.provider === 'cloud_api' && !cfg) throw new AppError('NO_CREDENTIALS', 'Configure las credenciales de la Cloud API.');
    return this.factory({ provider: r.provider, config: cfg });
  }

  private attach(id: number, p: WhatsAppProvider) {
    p.on('status', (info) => {
      const prev = (this.ctx.db.prepare('SELECT status FROM whatsapp_accounts WHERE id = ?').get(id) as { status: string } | undefined)?.status ?? 'disconnected';
      const now = this.ctx.clock.now().toISOString();
      this.ctx.db
        .prepare(`UPDATE whatsapp_accounts SET status = ?, status_detail = ?, phone_number = COALESCE(?, phone_number), display_name = COALESCE(?, display_name), quality_rating = COALESCE(?, quality_rating),
                  last_connected_at = CASE WHEN ? = 'connected' THEN ? ELSE last_connected_at END, last_sync_at = CASE WHEN ? = 'connected' THEN ? ELSE last_sync_at END WHERE id = ?`)
        .run(info.status, info.detail ?? null, info.phoneNumber ?? null, info.displayName ?? null, info.qualityRating ?? null, info.status, now, info.status, now, id);
      if (prev !== info.status) {
        this.ctx.log.info('whatsapp', `Cuenta ${id}: ${prev} → ${info.status}${info.detail ? ` (${info.detail})` : ''}`);
        this.ctx.bus.emit('account.status', { accountId: id, status: info.status, previous: prev, detail: info.detail });
      }
      if (info.status === 'connected') this.backoff.delete(id);
      if ((info.status === 'disconnected' || info.status === 'error') && !this.manualDisconnect.has(id) && info.status !== 'error') this.scheduleReconnect(id);
    });
    p.on('inbound', (msg) => {
      void this.deps.conversations.ingestInbound(id, msg, p).catch((e) => this.ctx.log.error('whatsapp', 'Error procesando mensaje entrante', e));
      this.touchSync(id);
    });
    p.on('statusUpdate', (u) => {
      try {
        this.deps.conversations.applyStatus(id, u);
      } catch (e) {
        this.ctx.log.error('whatsapp', 'Error aplicando estado de mensaje', e);
      }
    });
  }

  private touchSync(id: number) {
    this.ctx.db.prepare('UPDATE whatsapp_accounts SET last_sync_at = ? WHERE id = ?').run(this.ctx.clock.now().toISOString(), id);
  }

  async connect(id: number): Promise<WhatsAppAccount> {
    const r = this.row(id);
    this.manualDisconnect.delete(id);
    this.clearReconnect(id);
    let p = this.providers.get(id);
    if (!p) {
      p = this.buildProvider(r);
      this.attach(id, p);
      this.providers.set(id, p);
    }
    try {
      await p.connect();
      if (p.capabilities.templates && p.listTemplates) await this.syncTemplates(id).catch((e) => this.ctx.log.warn('whatsapp', `No se pudieron sincronizar plantillas: ${(e as Error).message}`));
    } catch (e) {
      if (e instanceof ProviderError) throw new AppError('CONNECT_FAILED', `${e.message}`, e.technical);
      throw e;
    }
    return this.get(id);
  }

  async disconnect(id: number) {
    this.manualDisconnect.add(id);
    this.clearReconnect(id);
    const p = this.providers.get(id);
    if (p) await p.disconnect();
    else this.ctx.db.prepare("UPDATE whatsapp_accounts SET status = 'disconnected' WHERE id = ?").run(id);
    return this.get(id);
  }

  /** Error grave durante un envío (token inválido, cuenta bloqueada, sin conexión). */
  onProviderFatal(id: number, err: ProviderError) {
    const p = this.providers.get(id);
    if (!p) return;
    if (err.kind === 'DISCONNECTED' && p.getStatus().status === 'connected') {
      (p as any).setStatus?.({ status: 'disconnected', detail: 'Conexión perdida durante un envío' });
      return;
    }
    if (err.kind === 'AUTH' || err.kind === 'ACCOUNT_BLOCKED') (p as any).setStatus?.({ status: 'error', detail: err.message });
  }

  private clearReconnect(id: number) {
    const t = this.reconnectTimers.get(id);
    if (t) clearTimeout(t);
    this.reconnectTimers.delete(id);
  }

  /** Reconexión automática con backoff exponencial (5 s … 10 min). */
  private scheduleReconnect(id: number) {
    if (this.reconnectTimers.has(id)) return;
    const delay = Math.min(MAX_BACKOFF_MS, this.backoff.get(id) ?? 5000);
    this.backoff.set(id, Math.min(MAX_BACKOFF_MS, delay * 2));
    const t = setTimeout(() => {
      this.reconnectTimers.delete(id);
      if (this.manualDisconnect.has(id)) return;
      this.connect(id).catch((e) => this.ctx.log.warn('whatsapp', `Reconexión fallida (cuenta ${id}): ${e?.message}`));
    }, delay);
    t.unref?.();
    this.reconnectTimers.set(id, t);
  }

  /** Al iniciar la app: conectar las cuentas con auto-conexión. */
  async startAll() {
    for (const r of this.rows()) {
      this.deps.tags.ensureSystemTags(r.id);
      if (!r.auto_connect || !r.config_encrypted && r.provider === 'cloud_api') continue;
      if (r.status === 'disconnected' && r.status_detail === 'Desconectado por el usuario.') continue;
      this.connect(r.id).catch((e) => {
        this.ctx.log.warn('whatsapp', `No se pudo conectar la cuenta ${r.id} al iniciar: ${e?.message}`);
        if (!(e instanceof AppError && ['NO_CREDENTIALS', 'SECRETS'].includes(e.code))) this.scheduleReconnect(r.id);
      });
    }
    this.healthTimer = setInterval(() => void this.healthCheck(), HEALTH_INTERVAL_MS);
    this.healthTimer.unref?.();
  }

  private async healthCheck() {
    for (const [id, p] of this.providers) {
      if (p instanceof CloudApiProvider && p.getStatus().status === 'connected') {
        await p.healthCheck().catch(() => {
          /* el estado ya se actualizó a desconectado → reconexión programada */
        });
      }
    }
  }

  async syncTemplates(id: number) {
    const p = this.providers.get(id);
    if (!p?.listTemplates) throw new AppError('UNSUPPORTED', 'Este proveedor no expone plantillas.');
    try {
      const list = await p.listTemplates();
      this.deps.templates.storeProviderTemplates(id, list);
      this.touchSync(id);
      return list.length;
    } catch (e) {
      if (e instanceof ProviderError) throw new AppError('SYNC_FAILED', e.technical.includes('WhatsApp Business Account ID') ? e.technical : `No se pudieron sincronizar las plantillas: ${e.message}`, e.technical);
      throw e;
    }
  }

  /** Para el servidor de webhooks: cuentas Cloud API con su configuración descifrada. */
  cloudAccounts(): { id: number; provider: CloudApiProvider; config: CloudApiConfig }[] {
    const out: { id: number; provider: CloudApiProvider; config: CloudApiConfig }[] = [];
    for (const r of this.rows()) {
      if (r.provider !== 'cloud_api' || !r.config_encrypted) continue;
      let cfg: CloudApiConfig;
      try {
        cfg = this.config(r);
      } catch {
        continue;
      }
      let p = this.providers.get(r.id) as CloudApiProvider | undefined;
      if (!p) {
        p = this.buildProvider(r) as CloudApiProvider;
        this.attach(r.id, p);
        this.providers.set(r.id, p);
      }
      out.push({ id: r.id, provider: p, config: cfg });
    }
    return out;
  }

  /** Proveedor simulador de una cuenta (para inyectar mensajes de prueba desde la UI). */
  simulator(id: number): SimulatorProvider {
    const p = this.providers.get(id);
    if (!(p instanceof SimulatorProvider)) throw invalid('Esta acción solo está disponible para cuentas del simulador.');
    return p;
  }

  shutdown() {
    if (this.healthTimer) clearInterval(this.healthTimer);
    for (const id of this.reconnectTimers.keys()) this.clearReconnect(id);
  }
}

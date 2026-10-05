import http from 'node:http';
import crypto from 'node:crypto';
import type { Ctx } from '../context';
import type { AccountManager } from './account-manager';

const MAX_BODY = 2 * 1024 * 1024;
const RATE_PER_MIN = 1200;

export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex'), 'utf8');
  const got = Buffer.from(header.slice(7), 'utf8');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/**
 * Servidor HTTP local que recibe los webhooks oficiales de la WhatsApp Cloud API.
 * - GET  /webhook: verificación (hub.mode / hub.verify_token / hub.challenge).
 * - POST /webhook: eventos. Se verifica la firma HMAC-SHA256 con el App Secret de la cuenta.
 * Debe exponerse por HTTPS con un túnel o proxy inverso (ver README).
 */
export class WebhookServer {
  private server: http.Server | null = null;
  private hits = new Map<string, { n: number; reset: number }>();
  lastEventAt: string | null = null;
  lastError: string | null = null;

  constructor(private ctx: Ctx, private accounts: AccountManager) {}

  get listening() {
    return !!this.server?.listening;
  }

  address() {
    const a = this.server?.address();
    return a && typeof a === 'object' ? { host: a.address, port: a.port } : null;
  }

  private limited(ip: string): boolean {
    const now = Date.now();
    const h = this.hits.get(ip);
    if (!h || h.reset < now) {
      this.hits.set(ip, { n: 1, reset: now + 60000 });
      return false;
    }
    h.n++;
    return h.n > RATE_PER_MIN;
  }

  async start(port: number, host = '127.0.0.1'): Promise<void> {
    await this.stop();
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.requestTimeout = 15000;
    this.server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', (e) => {
        this.lastError = (e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso.` : (e as Error).message;
        reject(e);
      });
      this.server!.listen(port, host, () => resolve());
    });
    this.lastError = null;
    this.ctx.log.info('whatsapp', `Servidor de webhooks escuchando en http://${host}:${port}/webhook`);
  }

  async stop() {
    if (!this.server) return;
    await new Promise<void>((r) => this.server!.close(() => r()));
    this.server = null;
  }

  private send(res: http.ServerResponse, code: number, body = '') {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (this.limited(ip)) return this.send(res, 429, 'Too Many Requests');
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') return this.send(res, 200, 'ok');
    if (url.pathname !== '/webhook') return this.send(res, 404, 'Not Found');

    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge') ?? '';
      const ok = mode === 'subscribe' && !!token && this.accounts.cloudAccounts().some((a) => a.config.verifyToken && crypto.timingSafeEqual(Buffer.from(sha(a.config.verifyToken)), Buffer.from(sha(token))));
      if (ok && /^[\w-]{1,200}$/.test(challenge)) {
        this.ctx.log.info('whatsapp', 'Webhook verificado por Meta');
        return this.send(res, 200, challenge);
      }
      this.ctx.log.warn('whatsapp', 'Intento de verificación de webhook rechazado');
      return this.send(res, 403, 'Forbidden');
    }
    if (req.method !== 'POST') return this.send(res, 405, 'Method Not Allowed');

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        this.send(res, 413, 'Payload Too Large');
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks);
      let payload: any;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return this.send(res, 400, 'Bad Request');
      }
      const phoneIds = new Set<string>();
      for (const e of payload?.entry ?? []) for (const c of e?.changes ?? []) if (c?.value?.metadata?.phone_number_id) phoneIds.add(String(c.value.metadata.phone_number_id));
      const targets = this.accounts.cloudAccounts().filter((a) => phoneIds.has(String(a.config.phoneNumberId)));
      const sig = req.headers['x-hub-signature-256'] as string | undefined;
      const verified = targets.filter((a) => a.config.appSecret && verifySignature(raw, sig, a.config.appSecret));
      if (!verified.length) {
        this.ctx.log.warn('whatsapp', `Webhook rechazado: firma inválida o número no configurado (${phoneIds.size} ids)`);
        return this.send(res, targets.length ? 401 : 200, targets.length ? 'Invalid signature' : 'ignored');
      }
      // Responder rápido (Meta reintenta si tardamos); el procesamiento continúa.
      this.send(res, 200, 'EVENT_RECEIVED');
      this.lastEventAt = new Date().toISOString();
      for (const a of verified) {
        try {
          const { inbound, statuses } = a.provider.handleWebhook(payload);
          for (const m of inbound) a.provider.emit('inbound', m);
          for (const s of statuses) a.provider.emit('statusUpdate', s);
        } catch (e) {
          this.ctx.log.error('whatsapp', 'Error procesando webhook', e);
        }
      }
    });
  }
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

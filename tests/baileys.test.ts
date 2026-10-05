import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as lib from 'baileys';
import { drainQueue, makeEnv, settle, type TestEnv } from './helpers';
import { BaileysProvider, hasBaileysSession } from '../src/main/whatsapp/baileys';
import { migrate } from '../src/main/db/database';
import { MIGRATIONS } from '../src/main/db/schema';

/** Socket falso que imita la superficie de Baileys usada por el conector. */
class FakeSock {
  ev = new EventEmitter();
  user: any = null;
  config: any;
  sent: { jid: string; content: any; opts: any }[] = [];
  notOnWhatsApp = new Set<string>();
  lid = new Map<string, string>();
  ended = false;
  loggedOut = false;
  signalRepository = { lidMapping: { getPNForLID: async (l: string) => this.lid.get(l) ?? null } };
  async onWhatsApp(phone: string) {
    return [{ jid: `${phone}@s.whatsapp.net`, exists: !this.notOnWhatsApp.has(phone) }];
  }
  async sendMessage(jid: string, content: any, opts: any) {
    this.sent.push({ jid, content, opts });
    return { key: { id: opts.messageId, fromMe: true, remoteJid: jid } };
  }
  async end() {
    this.ended = true;
  }
  async logout() {
    this.loggedOut = true;
  }
  emit(ev: string, data: any) {
    this.ev.emit(ev, data);
  }
}

let env: TestEnv;
let sockets: FakeSock[];
let acc: number;
const sock = () => sockets[sockets.length - 1];
const wait = () => new Promise((r) => setTimeout(r, 20));
/** Espera hasta que se cumpla la condición (la generación del QR es asíncrona). */
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
}

beforeEach(async () => {
  sockets = [];
  env = makeEnv({
    memory: true,
    providerFactory: ({ accountId, ctx }) =>
      new BaileysProvider({
        accountId,
        db: ctx.db,
        secrets: ctx.secrets,
        log: ctx.log,
        fetchVersion: false,
        loadLib: async () => lib,
        makeSocket: (_l, cfg) => {
          const s = new FakeSock();
          s.config = cfg;
          sockets.push(s);
          return s;
        },
      }),
  });
  acc = env.app.accounts.create({ name: 'Mi WhatsApp', provider: 'baileys' }).id;
});
afterEach(async () => env.close());

async function linkPhone(phone = '573001112233') {
  await env.app.accounts.connect(acc);
  sock().emit('connection.update', { qr: '2@abcdefghijklmnopqrstuvwxyz,1234567890' });
  await until(() => env.app.accounts.get(acc).status === 'qr_required');
  expect(env.app.accounts.get(acc)).toMatchObject({ status: 'qr_required' });
  expect(env.app.accounts.get(acc).qr).toMatch(/^data:image\/png;base64,/);
  sock().user = { id: `${phone}:7@s.whatsapp.net`, name: 'Mi Negocio' };
  sock().emit('creds.update', {});
  sock().emit('connection.update', { connection: 'open' });
  await until(() => env.app.accounts.get(acc).status === 'connected');
}

const inMsg = (id: string, jid: string, text: string, extra: any = {}) => ({ key: { id, remoteJid: jid, fromMe: false, ...extra.key }, pushName: extra.pushName ?? 'Cliente', messageTimestamp: Math.floor(env.clock.now().getTime() / 1000), message: extra.message ?? { conversation: text } });

describe('Conector Baileys (QR)', () => {
  it('muestra el QR, conecta, guarda la sesión cifrada y usa límites de envío prudentes', async () => {
    await linkPhone();
    expect(env.app.accounts.get(acc)).toMatchObject({ status: 'connected', phone_number: '573001112233', display_name: 'Mi Negocio', qr: null });
    const rows = env.app.db.prepare('SELECT key, value FROM baileys_auth WHERE account_id = ?').all(acc) as any[];
    expect(rows.some((r) => r.key === 'creds')).toBe(true);
    expect(rows.every((r) => r.value.startsWith('gcm:'))).toBe(true); // cifrado, no texto plano
    expect(hasBaileysSession(env.app.db, acc)).toBe(true);
    expect(env.app.settings.get('sending', acc)).toMatchObject({ ratePerMinute: 6, dailyCap: 150 });
    expect(env.app.accounts.capabilities(acc)).toMatchObject({ qrLogin: true, templates: false, contactSync: true, customerServiceWindowHours: null });
    expect(sock().config.markOnlineOnConnect).toBe(false);
  });

  it('recibe mensajes (incluye LID), ignora grupos y dispara automatizaciones', async () => {
    await linkPhone();
    const interesado = env.app.tags.findByName(acc, 'Interesado')!;
    env.app.automation.save(acc, {
      name: 'Precio',
      enabled: true,
      nodes: [
        { id: 't', type: 'trigger', subtype: 'message_received', config: {}, position: { x: 0, y: 0 } },
        { id: 'c', type: 'condition', subtype: 'message_contains', config: { keywords: ['precio'] }, position: { x: 0, y: 0 } },
        { id: 'a', type: 'action', subtype: 'send_message', config: { text: 'Hola {{nombre}}, el precio es…' }, position: { x: 0, y: 0 } },
        { id: 'b', type: 'action', subtype: 'add_tag', config: { tagId: interesado.id }, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: '1', source: 't', target: 'c' },
        { id: '2', source: 'c', target: 'a', sourceHandle: 'true' },
        { id: '3', source: 'a', target: 'b' },
      ],
    });
    sock().lid.set('99887766@lid', '573005550000@s.whatsapp.net');
    sock().emit('messages.upsert', {
      type: 'notify',
      messages: [
        inMsg('M1', '573009998877@s.whatsapp.net', '¿Cuál es el precio?', { pushName: 'Ana Ruiz' }),
        inMsg('M2', '120363000000@g.us', 'mensaje de grupo'),
        inMsg('M3', '99887766@lid', 'hola desde LID', { pushName: 'Pedro' }),
        { key: { id: 'M4', remoteJid: 'status@broadcast', fromMe: false }, message: { conversation: 'estado' } },
      ],
    });
    await wait();
    await settle(env);
    await drainQueue(env, acc);
    const ana = env.app.contacts.findByPhone(acc, '573009998877')!;
    expect(ana.name).toBe('Ana Ruiz');
    expect(env.app.contacts.findByPhone(acc, '573005550000')!.name).toBe('Pedro');
    expect(env.app.contacts.list(acc).total).toBe(2); // el grupo y el estado se ignoran
    expect(sock().sent.map((s) => [s.jid, s.content.text])).toEqual([['573009998877@s.whatsapp.net', 'Hola Ana, el precio es…']]);
    expect(env.app.contacts.get(acc, ana.id).tags!.map((t) => t.name)).toContain('Interesado');
  });

  it('estados entregado/leído, número sin WhatsApp y mensajes enviados desde el teléfono', async () => {
    await linkPhone();
    const c = env.app.contacts.create(acc, { name: 'Luis', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola Luis', source: 'manual', idempotencyKey: 'manual:bly-0001' });
    await drainQueue(env, acc);
    const pid = (env.app.db.prepare('SELECT provider_message_id p FROM messages WHERE id = ?').get(r.messageId) as any).p;
    // El propio envío vuelve como "upsert" fromMe: no debe duplicarse
    sock().emit('messages.upsert', { type: 'append', messages: [{ key: { id: pid, remoteJid: '573001234567@s.whatsapp.net', fromMe: true }, message: { conversation: 'Hola Luis' } }] });
    sock().emit('messages.update', [{ key: { id: pid, fromMe: true }, update: { status: 3 } }]);
    sock().emit('messages.update', [{ key: { id: pid, fromMe: true }, update: { status: 4 } }]);
    await wait();
    expect((env.app.db.prepare('SELECT status FROM messages WHERE id = ?').get(r.messageId) as any).status).toBe('read');
    // Mensaje escrito desde el teléfono → aparece en la conversación y activa el modo humano
    sock().emit('messages.upsert', { type: 'append', messages: [{ key: { id: 'PHONE1', remoteJid: '573001234567@s.whatsapp.net', fromMe: true }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'Te llamo en 5 min' } }] });
    await wait();
    const msgs = env.app.db.prepare('SELECT body, source FROM messages WHERE contact_id = ? ORDER BY id').all(c.id) as any[];
    expect(msgs).toEqual([{ body: 'Hola Luis', source: 'manual' }, { body: 'Te llamo en 5 min', source: 'phone' }]);
    expect(env.app.conversations.isBotPaused(acc, c.id)).toBe(true);
    // Número sin WhatsApp → fallo claro, sin reintentos
    const x = env.app.contacts.create(acc, { name: 'Sin WA', phone: '3009990000' });
    sock().notOnWhatsApp.add('573009990000');
    const r2 = env.app.messaging.enqueue({ accountId: acc, contactId: x.id, kind: 'text', text: 'hola', source: 'manual', idempotencyKey: 'manual:bly-0002' });
    await drainQueue(env, acc);
    const m2 = env.app.db.prepare('SELECT status, error_message FROM messages WHERE id = ?').get(r2.messageId) as any;
    expect(m2).toEqual({ status: 'failed', error_message: 'El número no existe en WhatsApp o no puede recibir mensajes.' });
  });

  it('sincroniza contactos e historial reciente sin disparar automatizaciones', async () => {
    env.app.contacts.create(acc, { phone: '3000000001' }); // existente sin nombre
    await linkPhone();
    env.app.automation.save(acc, {
      name: 'Bienvenida',
      enabled: true,
      nodes: [
        { id: 't', type: 'trigger', subtype: 'contact_created', config: {}, position: { x: 0, y: 0 } },
        { id: 'a', type: 'action', subtype: 'add_note', config: { text: 'nuevo' }, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: '1', source: 't', target: 'a' }],
    });
    sock().emit('contacts.upsert', [
      { id: '573000000001@s.whatsapp.net', name: 'María (agenda)' },
      { id: '573000000002@s.whatsapp.net', notify: 'Carlos' },
      { id: '12345@lid' }, // sin teléfono ni nombre → se ignora
      { id: '120363@g.us', name: 'Grupo' },
    ]);
    sock().emit('messaging-history.set', {
      contacts: [],
      messages: [
        { key: { id: 'H1', remoteJid: '573000000002@s.whatsapp.net', fromMe: false }, pushName: 'Carlos', messageTimestamp: 1759000000, message: { conversation: 'Hola, ayer pregunté' } },
        { key: { id: 'H2', remoteJid: '573000000002@s.whatsapp.net', fromMe: true }, messageTimestamp: 1759000100, message: { extendedTextMessage: { text: 'Claro, te cuento' } } },
      ],
    });
    await wait();
    await settle(env);
    expect(env.app.contacts.findByPhone(acc, '573000000001')!.name).toBe('María (agenda)');
    expect(env.app.contacts.findByPhone(acc, '573000000002')!.name).toBe('Carlos');
    expect(env.app.contacts.list(acc).total).toBe(2);
    const carlos = env.app.contacts.findByPhone(acc, '573000000002')!;
    const conv = env.app.conversations.byContact(acc, carlos.id);
    expect(conv.unread_count).toBe(0);
    expect(env.app.conversations.messages(acc, conv.id).map((m) => [m.direction, m.body])).toEqual([
      ['in', 'Hola, ayer pregunté'],
      ['out', 'Claro, te cuento'],
    ]);
    expect((env.app.db.prepare('SELECT COUNT(*) n FROM automation_runs').get() as any).n).toBe(0);
  });

  it('cierre de sesión desde el teléfono: borra la sesión y no reintenta en bucle', async () => {
    await linkPhone();
    sock().emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: lib.DisconnectReason.loggedOut } } } });
    await wait();
    expect(env.app.accounts.get(acc)).toMatchObject({ status: 'disconnected' });
    expect(env.app.accounts.get(acc).status_detail).toMatch(/escanee el QR/);
    expect(hasBaileysSession(env.app.db, acc)).toBe(false);
    const before = sockets.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(sockets.length).toBe(before); // sin reconexión automática
  });

  it('tras escanear (restartRequired) abre un socket nuevo; desconexión de red pausa campañas', async () => {
    await linkPhone();
    const n = sockets.length;
    sock().emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: lib.DisconnectReason.restartRequired } } } });
    await wait();
    expect(sockets.length).toBe(n + 1);
    sock().user = { id: '573001112233:7@s.whatsapp.net' };
    sock().emit('connection.update', { connection: 'open' });
    await wait();
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    env.app.contacts.create(acc, { name: 'A', phone: '3001000001', tagIds: [tag.id] });
    env.app.contacts.create(acc, { name: 'B', phone: '3001000002', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Sin ventana', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola {{nombre}}' });
    expect(env.app.campaigns.preview(acc, camp.id).eligible).toBe(2); // sin ventana de 24 h con QR
    env.app.campaigns.confirm(acc, camp.id, 2);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    sock().emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } });
    await wait();
    await settle(env);
    expect(env.app.campaigns.get(acc, camp.id)).toMatchObject({ status: 'paused', pause_reason: 'disconnected' });
  });
});

describe('Migración de base de datos v1 → v2', () => {
  it('conserva datos y relaciones al agregar el proveedor Baileys', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATIONS[0] as string);
    db.pragma('user_version = 1');
    db.prepare("INSERT INTO whatsapp_accounts(id, name, provider) VALUES (1, 'Vieja', 'simulator')").run();
    db.prepare("INSERT INTO contacts(account_id, name, phone) VALUES (1, 'Ana', '573001112233')").run();
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    expect(db.prepare('SELECT name FROM contacts').get()).toEqual({ name: 'Ana' });
    db.prepare("INSERT INTO whatsapp_accounts(name, provider) VALUES ('QR', 'baileys')").run();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    // La FK de contactos sigue activa contra la tabla reconstruida
    expect(() => db.prepare("INSERT INTO contacts(account_id, phone) VALUES (999, '1234567890')").run()).toThrow(/FOREIGN KEY/);
    db.prepare('DELETE FROM whatsapp_accounts WHERE id = 1').run();
    expect((db.prepare('SELECT COUNT(*) n FROM contacts').get() as any).n).toBe(0); // ON DELETE CASCADE
  });
});

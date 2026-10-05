import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, tmpDir, type TestEnv } from './helpers';
import { CloudApiProvider, classifyCloudError } from '../src/main/whatsapp/cloud-api';
import { verifySignature } from '../src/main/whatsapp/webhook-server';
import { applyPendingRestore } from '../src/main/services/backup';
import { ROLE_PERMISSIONS, hasPermission } from '../src/shared/permissions';
import { redact } from '../src/main/core/logger';

let env: TestEnv | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const CFG = { accessToken: 'EAAtoken123', phoneNumberId: '1234567890', appSecret: 'app-secret', verifyToken: 'mi-token', wabaId: '99887766' };

function webhookPayload(extra: any) {
  return { object: 'whatsapp_business_account', entry: [{ id: '99887766', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1234567890' }, ...extra } }] }] };
}

describe('Conector oficial Cloud API', () => {
  it('clasifica errores de Meta en políticas de reintento', () => {
    expect(classifyCloudError(130429)).toBe('RATE_LIMIT');
    expect(classifyCloudError(null, 429)).toBe('RATE_LIMIT');
    expect(classifyCloudError(190)).toBe('AUTH');
    expect(classifyCloudError(131047)).toBe('OUTSIDE_WINDOW');
    expect(classifyCloudError(131026)).toBe('INVALID_RECIPIENT');
    expect(classifyCloudError(132001)).toBe('TEMPLATE');
    expect(classifyCloudError(131050)).toBe('OPTED_OUT');
    expect(classifyCloudError(131000)).toBe('TRANSIENT');
    expect(classifyCloudError(null, 503)).toBe('TRANSIENT');
  });

  it('conecta, envía texto y plantilla con el formato de la Graph API', async () => {
    const calls: { url: string; body: any }[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes('?fields=')) return new Response(JSON.stringify({ display_phone_number: '+57 300 000 0000', verified_name: 'Mi Negocio', quality_rating: 'GREEN' }));
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }));
    }) as any;
    const p = new CloudApiProvider(CFG, fetchMock);
    await p.connect();
    expect(p.getStatus()).toMatchObject({ status: 'connected', phoneNumber: '573000000000', displayName: 'Mi Negocio' });
    expect((await p.sendMessage({ to: '573001112233', kind: 'text', text: 'Hola https://x.co' })).providerMessageId).toBe('wamid.ABC');
    expect(calls[1].url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect(calls[1].body).toMatchObject({ messaging_product: 'whatsapp', to: '573001112233', type: 'text', text: { body: 'Hola https://x.co', preview_url: true } });
    await p.sendMessage({ to: '573001112233', kind: 'template', template: { name: 'promo', language: 'es', bodyParams: ['Ana', ''] } });
    expect(calls[2].body.template).toEqual({ name: 'promo', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '-' }] }] });
  });

  it('traduce errores HTTP a ProviderError con mensaje legible', async () => {
    const p = new CloudApiProvider(CFG, (async (url: string) =>
      String(url).includes('?fields=')
        ? new Response(JSON.stringify({ display_phone_number: '1' }))
        : new Response(JSON.stringify({ error: { message: 'Rate limit hit', type: 'OAuthException', code: 130429 } }), { status: 400, headers: { 'retry-after': '30' } })) as any);
    await p.connect();
    await expect(p.sendMessage({ to: '1', kind: 'text', text: 'x' })).rejects.toMatchObject({ kind: 'RATE_LIMIT', retryAfterMs: 30000 });
    const bad = new CloudApiProvider(CFG, (async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), { status: 401 })) as any);
    await expect(bad.connect()).rejects.toMatchObject({ kind: 'AUTH' });
    expect(bad.getStatus().status).toBe('error');
  });

  it('normaliza webhooks: mensajes entrantes (texto, imagen, botón) y estados', () => {
    const p = new CloudApiProvider(CFG, fetch);
    const r = p.handleWebhook(
      webhookPayload({
        contacts: [{ wa_id: '573001112233', profile: { name: 'Juan' } }],
        messages: [
          { from: '573001112233', id: 'wamid.1', timestamp: '1760000000', type: 'text', text: { body: 'precio?' } },
          { from: '573001112233', id: 'wamid.2', timestamp: '1760000001', type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'foto' } },
          { from: '573001112233', id: 'wamid.3', timestamp: '1760000002', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Sí, me interesa' } } },
        ],
        statuses: [{ id: 'wamid.OUT', status: 'failed', timestamp: '1760000003', recipient_id: '573001112233', errors: [{ code: 131047, title: 'Re-engagement message' }] }],
      }),
    );
    expect(r.inbound.map((m) => [m.type, m.text, m.profileName])).toEqual([
      ['text', 'precio?', 'Juan'],
      ['image', 'foto', 'Juan'],
      ['text', 'Sí, me interesa', 'Juan'],
    ]);
    expect(r.inbound[1].media).toMatchObject({ providerMediaId: 'MEDIA1', kind: 'image' });
    expect(r.statuses[0]).toMatchObject({ providerMessageId: 'wamid.OUT', status: 'failed', errorCode: '131047' });
  });

  it('servidor de webhooks: verificación GET, firma HMAC obligatoria, ingesta idempotente', async () => {
    env = makeEnv({ memory: true });
    const cloud = env.app.accounts.create({ name: 'Cloud', provider: 'cloud_api', config: CFG });
    await env.app.webhooks.start(0, '127.0.0.1');
    const { port } = env.app.webhooks.address()!;
    const base = `http://127.0.0.1:${port}/webhook`;
    expect((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=12345`)).status).toBe(200);
    expect(await (await fetch(`${base}?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=12345`)).text()).toBe('12345');
    expect((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`)).status).toBe(403);
    const body = JSON.stringify(webhookPayload({ contacts: [{ wa_id: '573001112233', profile: { name: 'Juan' } }], messages: [{ from: '573001112233', id: 'wamid.X1', timestamp: '1760000000', type: 'text', text: { body: 'hola' } }] }));
    const sig = 'sha256=' + crypto.createHmac('sha256', CFG.appSecret).update(body).digest('hex');
    expect((await fetch(base, { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=deadbeef' } })).status).toBe(401);
    expect((await fetch(base, { method: 'POST', body, headers: { 'X-Hub-Signature-256': sig } })).status).toBe(200);
    expect((await fetch(base, { method: 'POST', body, headers: { 'X-Hub-Signature-256': sig } })).status).toBe(200); // reintento de Meta
    await new Promise((r) => setTimeout(r, 50));
    await settle(env);
    const contact = env.app.contacts.findByPhone(cloud.id, '573001112233')!;
    expect(contact.name).toBe('Juan');
    expect((env.app.db.prepare('SELECT COUNT(*) n FROM messages WHERE account_id = ?').get(cloud.id) as any).n).toBe(1);
    expect(verifySignature(Buffer.from(body), sig, CFG.appSecret)).toBe(true);
  });

  it('las credenciales se guardan cifradas y no se exponen a la UI', () => {
    env = makeEnv({ memory: true });
    const cloud = env.app.accounts.create({ name: 'Cloud', provider: 'cloud_api', config: CFG });
    const raw = env.app.db.prepare('SELECT config_encrypted FROM whatsapp_accounts WHERE id = ?').get(cloud.id) as any;
    expect(raw.config_encrypted).not.toContain('EAAtoken123');
    expect(raw.config_encrypted).not.toContain('app-secret');
    const pub = env.app.accounts.publicConfig(cloud.id) as any;
    expect(pub.accessTokenHint).toBe('••••n123');
    expect(JSON.stringify(pub)).not.toContain('EAAtoken123');
    expect(JSON.stringify(env.app.accounts.list())).not.toContain('EAAtoken123');
    expect(redact('Authorization: Bearer EAAtoken1234567890abcdefghijk tel 573001234567')).not.toMatch(/EAAtoken|3001234567/);
  });
});

describe('IA (respuestas automáticas)', () => {
  function aiFactory(reply: { reply: string; needs_human: boolean; reason: string }, calls: any[]) {
    return () => ({ beta: { messages: { create: async (req: any) => (calls.push(req), { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }] }) } } }) as any;
  }

  it('responde usando instrucciones + base de conocimiento y respeta modo humano/opt-out', async () => {
    const calls: any[] = [];
    env = makeEnv({ memory: true, aiClientFactory: aiFactory({ reply: 'El plan premium cuesta $50.000 al mes.', needs_human: false, reason: 'precio' }, calls) });
    const acc = await simAccount(env);
    env.app.ai.setApiKey('sk-ant-api03-' + 'x'.repeat(40));
    const kb = env.app.knowledge.saveBase(acc, { name: 'Productos' });
    env.app.knowledge.addFaq(acc, kb, 'FAQ', [{ q: '¿Cuánto cuesta el plan premium?', a: 'El plan premium cuesta $50.000 mensuales.' }, { q: '¿Métodos de pago?', a: 'Transferencia y tarjeta.' }]);
    expect(env.app.knowledge.search([kb], 'cuanto cuesta el premium')[0].content).toMatch(/50\.000/);
    env.app.ai.save(acc, { name: 'Asistente de ventas', instructions: 'Eres un asistente de ventas. No inventes precios.', enabled: true as any, knowledge_base_ids: [kb] });
    const sim = env.sims.get(acc)!;
    sim.simulateInbound('573001112233', '¿Cuánto cuesta el plan premium?', 'Ana');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent.map((s) => s.text)).toEqual(['El plan premium cuesta $50.000 al mes.']);
    expect(calls[0].model).toBe('claude-opus-5-5');
    expect(calls[0].system).toContain('No inventes precios');
    expect(calls[0].system).toContain('$50.000 mensuales');
    expect(calls[0].messages.at(-1)).toEqual({ role: 'user', content: '¿Cuánto cuesta el plan premium?' });
    // Modo humano: no responde
    const c = env.app.contacts.findByPhone(acc, '573001112233')!;
    env.app.conversations.setBotPause(acc, env.app.conversations.byContact(acc, c.id).id, new Date(env.clock.now().getTime() + 600000));
    sim.simulateInbound('573001112233', '¿y el básico?');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(1);
  });

  it('deriva a humano: crea tarea, pausa el bot y notifica', async () => {
    const calls: any[] = [];
    env = makeEnv({ memory: true, aiClientFactory: aiFactory({ reply: 'Te comunico con un asesor.', needs_human: true, reason: 'Quiere comprar' }, calls) });
    const acc = await simAccount(env);
    env.app.ai.setApiKey('sk-ant-api03-' + 'y'.repeat(40));
    env.app.ai.save(acc, { name: 'Ventas', instructions: 'Si quiere comprar, deriva.', enabled: true as any });
    env.sims.get(acc)!.simulateInbound('573009998877', 'Quiero comprar ya');
    await settle(env);
    const c = env.app.contacts.findByPhone(acc, '573009998877')!;
    expect(env.app.conversations.isBotPaused(acc, c.id)).toBe(true);
    expect(env.app.tasks.list(acc)[0].title).toMatch(/Atención humana/);
    expect(env.notifications.some((n) => n.title.includes('asesor'))).toBe(true);
  });
});

describe('Backup, usuarios y permisos', () => {
  it('crea un backup y lo restaura sobre una instalación nueva', async () => {
    const dir = tmpDir();
    env = makeEnv({ dir });
    const acc = await simAccount(env);
    env.app.contacts.create(acc, { name: 'Respaldado', phone: '3001010101' });
    env.app.templates.save(acc, { name: 'Bienvenida', category: 'Bienvenida', body: 'Hola {{nombre}}' });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(10)]);
    const media = env.app.media.importBuffer(acc, png, { fileName: 'logo.png', inLibrary: true });
    const { file } = await env.app.backup.create();
    await env.close();
    env = null;

    const dir2 = tmpDir();
    const env2 = makeEnv({ dir: dir2 });
    env2.app.backup.stageRestore(file);
    await env2.close();
    const paths = { db: path.join(dir2, 'data', 'whatsapp-crm.db'), media: path.join(dir2, 'media'), backups: path.join(dir2, 'backups') };
    expect(applyPendingRestore(dir2, paths.db, paths.media, paths.backups)).toBe(true);
    env = makeEnv({ dir: dir2 });
    expect(env.app.contacts.list(acc).rows[0].name).toBe('Respaldado');
    expect(env.app.templates.list(acc)[0].name).toBe('Bienvenida');
    expect(fs.existsSync(env.app.media.get(acc, media.id).file_path)).toBe(true);
    expect(fs.readdirSync(paths.backups).some((f) => f.startsWith('pre-restore-'))).toBe(true);
  });

  it('rechaza archivos que no son backups', () => {
    env = makeEnv({ memory: true });
    const bad = path.join(env.dir, 'x.zip');
    fs.writeFileSync(bad, 'no es zip');
    expect(() => env!.app.backup.stageRestore(bad)).toThrow(/backup/);
  });

  it('usuarios: contraseñas con scrypt, bloqueo por intentos fallidos y permisos por rol', () => {
    env = makeEnv({ memory: true });
    const u = env.app.users.create({ username: 'admin', display_name: 'Admin', password: 'Clave12345', role: 'admin' });
    const raw = env.app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id) as any;
    expect(raw.password_hash).toMatch(/^scrypt\$/);
    expect(raw.password_hash).not.toContain('Clave12345');
    expect(() => env!.app.users.create({ username: 'xyz', display_name: 'X', password: 'corta', role: 'agent' })).toThrow(/8 caracteres/);
    expect(env.app.users.login('admin', 'Clave12345').role).toBe('admin');
    for (let i = 0; i < 5; i++) expect(() => env!.app.users.login('admin', 'mala')).toThrow(/incorrectos/);
    expect(() => env!.app.users.login('admin', 'Clave12345')).toThrow(/Demasiados intentos/);
    env.clock.advance(2 * 60000);
    expect(env.app.users.login('admin', 'Clave12345').username).toBe('admin');
    expect(() => env!.app.users.update(u.id, { role: 'agent' })).toThrow(/al menos un administrador/);
    expect(hasPermission('agent', 'campaigns.manage')).toBe(false);
    expect(hasPermission('agent', 'messages.send')).toBe(true);
    expect(hasPermission('supervisor', 'users.manage')).toBe(false);
    expect(ROLE_PERMISSIONS.admin).toContain('backup.manage');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, type TestEnv } from './helpers';
import { buildRouter, dispatch, type DesktopBridge, type Session } from '../src/main/ipc/router';

const desktop: DesktopBridge = {
  openFile: async () => null,
  saveFile: async () => null,
  openPath: async () => {},
  openExternal: async () => {},
  relaunch: () => {},
  quit: () => {},
  appInfo: () => ({ version: 'test', userData: '', platform: 'test', electron: '0' }),
  checkForUpdates: async () => ({ available: false, message: '' }),
  setLoginItem: () => {},
};

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

function session(): Session {
  return { user: null, accountId: null, fileTokens: new Map() };
}

describe('Router IPC: sesión, permisos y validación', () => {
  it('exige sesión, aplica permisos por rol y devuelve errores legibles', async () => {
    const H = buildRouter(env.app, desktop);
    const admin = session();
    // Sin usuarios: configuración inicial pública
    expect((await dispatch(env.app, H, admin, 'auth.status', {})) as any).toMatchObject({ ok: true, data: { hasUsers: false } });
    expect(await dispatch(env.app, H, admin, 'auth.setup', { username: 'admin', display_name: 'Admin', password: 'Clave12345' })).toMatchObject({ ok: true });
    // Una segunda configuración inicial está prohibida
    expect(await dispatch(env.app, H, session(), 'auth.setup', { username: 'x2', display_name: 'X', password: 'Clave12345' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(admin.accountId).toBe(acc);
    // Sin sesión
    expect(await dispatch(env.app, H, session(), 'contacts.list', {})).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    // Validación zod → mensaje claro, sin detalles técnicos
    const bad = (await dispatch(env.app, H, admin, 'contacts.create', { phone: 123 })) as any;
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('VALIDATION');
    expect(bad.error.message).toMatch(/^Datos inválidos/);
    // Error de negocio
    expect(await dispatch(env.app, H, admin, 'contacts.create', { phone: 'abc' })).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Teléfono inválido/) } });
    // Agente: puede ver/enviar pero no gestionar campañas ni usuarios
    await dispatch(env.app, H, admin, 'users.create', { username: 'agente', display_name: 'Agente', password: 'Clave12345', role: 'agent' });
    const agent = session();
    expect(await dispatch(env.app, H, agent, 'auth.login', { username: 'agente', password: 'Clave12345' })).toMatchObject({ ok: true });
    expect(await dispatch(env.app, H, agent, 'contacts.list', {})).toMatchObject({ ok: true });
    expect(await dispatch(env.app, H, agent, 'campaigns.save', { name: 'x', audience: { type: 'all' }, message_type: 'text', body: 'hola' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await dispatch(env.app, H, agent, 'users.list', {})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await dispatch(env.app, H, agent, 'backup.create', {})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    // Un usuario desactivado pierde el acceso de inmediato
    const agentId = agent.user!.id;
    await dispatch(env.app, H, admin, 'users.update', { id: agentId, active: false });
    expect(await dispatch(env.app, H, agent, 'contacts.list', {})).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    // Método desconocido
    expect(await dispatch(env.app, H, admin, 'sistema.borrarTodo', {})).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('la configuración nunca expone la API key de IA', async () => {
    const H = buildRouter(env.app, desktop);
    const s = session();
    await dispatch(env.app, H, s, 'auth.setup', { username: 'admin', display_name: 'Admin', password: 'Clave12345' });
    await dispatch(env.app, H, s, 'ai.setApiKey', { apiKey: 'sk-ant-api03-' + 'z'.repeat(40) });
    const r = (await dispatch(env.app, H, s, 'settings.get', { key: 'ai' })) as any;
    expect(r.data.configured).toBe(true);
    expect(JSON.stringify(r)).not.toContain('sk-ant');
    expect(JSON.stringify(r)).not.toContain('apiKeyEncrypted":"');
    // Validación de configuración
    expect(await dispatch(env.app, H, s, 'settings.set', { key: 'sending', value: { ratePerMinute: -5 } })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await dispatch(env.app, H, s, 'settings.set', { key: 'sending', value: { ratePerMinute: 30 } })).toMatchObject({ ok: true, data: { ratePerMinute: 30 } });
  });

  it('envío manual: falla con mensaje claro si la cuenta está desconectada', async () => {
    const H = buildRouter(env.app, desktop);
    const s = session();
    await dispatch(env.app, H, s, 'auth.setup', { username: 'admin', display_name: 'Admin', password: 'Clave12345' });
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    await env.app.accounts.disconnect(acc);
    expect(await dispatch(env.app, H, s, 'inbox.send', { contactId: c.id, text: 'hola', clientKey: 'abcdef12-3456' })).toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } });
    await env.app.accounts.connect(acc);
    const ok = (await dispatch(env.app, H, s, 'inbox.send', { contactId: c.id, text: 'hola', clientKey: 'abcdef12-3456' })) as any;
    const again = (await dispatch(env.app, H, s, 'inbox.send', { contactId: c.id, text: 'hola', clientKey: 'abcdef12-3456' })) as any; // doble clic
    expect(again.data.duplicate).toBe(true);
    expect(again.data.messageId).toBe(ok.data.messageId);
  });
});

describe('Mensajes programados y estados', () => {
  it('un mensaje programado se envía a su hora y puede cancelarse o moverse', async () => {
    const c = env.app.contacts.create(acc, { name: 'Prog', phone: '3001110000' });
    const at = new Date(env.clock.now().getTime() + 3600000).toISOString();
    const id = env.app.messaging.schedule(acc, { contactId: c.id, body: 'Recordatorio para {{nombre}}', scheduledAt: at });
    const id2 = env.app.messaging.schedule(acc, { contactId: c.id, body: 'Cancelado', scheduledAt: at });
    env.app.messaging.cancelScheduled(acc, id2);
    expect(() => env.app.messaging.schedule(acc, { contactId: c.id, body: 'x', scheduledAt: '2020-01-01T00:00:00Z' })).toThrow(/ya pasó/);
    env.app.messaging.reschedule(acc, id, new Date(env.clock.now().getTime() + 7200000).toISOString());
    env.clock.advance(3600000 + 1000);
    expect(env.app.messaging.releaseDueScheduled(() => null)).toBe(0);
    env.clock.advance(3600000);
    expect(env.app.messaging.releaseDueScheduled(() => null)).toBe(1);
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent.map((s) => s.text)).toEqual(['Recordatorio para Prog']);
  });

  it('un estado que llega antes de registrar el id del proveedor se aplica después', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const sim = env.sims.get(acc)!;
    const orig = sim.sendMessage.bind(sim);
    sim.sendMessage = async (m) => {
      const r = await orig(m);
      // El webhook "read" llega antes de que la cola guarde el id
      env.app.conversations.applyStatus(acc, { providerMessageId: r.providerMessageId, status: 'read', timestamp: env.clock.now() });
      return r;
    };
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'hola', source: 'manual', idempotencyKey: 'manual:race-0001' });
    await drainQueue(env, acc);
    const m = env.app.db.prepare('SELECT status FROM messages WHERE id = ?').get(r.messageId) as any;
    expect(m.status).toBe('read');
  });

  it('webhooks repetidos no duplican mensajes entrantes', async () => {
    const msg = { from: '573001234567', profileName: 'Ana', providerMessageId: 'wamid.DUP', timestamp: env.clock.now(), type: 'text', text: 'hola' };
    await env.app.conversations.ingestInbound(acc, msg);
    await env.app.conversations.ingestInbound(acc, msg);
    await settle(env);
    expect((env.app.db.prepare('SELECT COUNT(*) n FROM messages').get() as any).n).toBe(1);
  });

  it('trigger "Evento programado" por fecha de campo personalizado', async () => {
    env.app.fields.create(acc, { label: 'Fecha compra', type: 'date' });
    const c = env.app.contacts.create(acc, { name: 'Comprador', phone: '3005556666', custom: { fecha_compra: '2026-09-28' } });
    env.app.automation.save(acc, {
      name: 'Una semana después de la compra',
      enabled: true,
      nodes: [
        { id: 't', type: 'trigger', subtype: 'date_field', config: { fieldKey: 'fecha_compra', offsetDays: 7, time: '10:00' }, position: { x: 0, y: 0 } },
        { id: 'n', type: 'action', subtype: 'create_task', config: { title: 'Pedir reseña a {{nombre}}' }, position: { x: 0, y: 100 } },
      ],
      edges: [{ id: 'e', source: 't', target: 'n' }],
    });
    expect(await env.app.automation.processTimeTriggers()).toBe(1); // 5 oct 10:00 Bogotá = compra + 7 días
    expect(env.app.tasks.list(acc, { contactId: c.id })[0].title).toBe('Pedir reseña a Comprador');
  });
});

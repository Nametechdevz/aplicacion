import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, type TestEnv } from './helpers';
import { nextOccurrence } from '../src/main/campaigns/recurrence';

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

function seed(env: TestEnv, n: number, tagName = 'Cliente VIP') {
  const tag = env.app.tags.findByName(acc, tagName)!;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(env.app.contacts.create(acc, { name: `Cliente ${i} Apellido`, phone: `30055500${String(i).padStart(2, '0')}`, tagIds: [tag.id] }).id);
  return { tag, ids };
}

describe('Campañas', () => {
  it('flujo completo: borrador → vista previa → confirmación → envío con variables', async () => {
    const { tag } = seed(env, 5);
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Promoción octubre', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola {{nombre}} 👋 promo hasta {{fecha}}' });
    expect(camp.status).toBe('draft');
    const pv = env.app.campaigns.preview(acc, camp.id);
    expect(pv.eligible).toBe(5);
    expect(pv.sample[0].text).toMatch(/^Hola Cliente 👋 promo hasta /);
    expect(() => env.app.campaigns.confirm(acc, camp.id, 4)).toThrow(/audiencia cambió/);
    const c2 = env.app.campaigns.confirm(acc, camp.id, 5);
    expect(c2.status).toBe('running');
    await drainQueue(env, acc);
    const done = env.app.campaigns.get(acc, camp.id);
    expect(done.status).toBe('completed');
    expect(done.stats).toMatchObject({ total: 5, sent: 5, failed: 0, pending: 0 });
    expect(env.sims.get(acc)!.sent[0].text).toMatch(/^Hola Cliente 👋/);
    expect(env.notifications.some((n) => n.title === 'Campaña terminada')).toBe(true);
  });

  it('excluye opt-out, lista negra, "No contactar" y no duplica destinatarios', async () => {
    const { tag, ids } = seed(env, 6);
    env.app.contacts.setConsent(acc, ids[0], 'opted_out', 'test');
    env.app.contacts.setBlacklist(acc, [ids[1]], true, 'spam');
    env.app.tags.assign(acc, [ids[2]], env.app.tags.noContactTagId(acc));
    const camp = env.app.campaigns.saveDraft(acc, { name: 'X', audience: { type: 'manual', contactIds: [...ids, ids[3], ids[3]] }, message_type: 'text', body: 'Hola' });
    const pv = env.app.campaigns.preview(acc, camp.id);
    expect(pv.total).toBe(6);
    expect(pv.eligible).toBe(3);
    expect(pv.excluded).toMatchObject({ opted_out: 1, blacklisted: 1, no_contact_tag: 1 });
    env.app.campaigns.confirm(acc, camp.id, 3);
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(3);
    void tag;
  });

  it('pausar detiene los envíos; reanudar continúa desde la cola pendiente; detener cancela', async () => {
    const { tag } = seed(env, 6);
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Pausable', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 6);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    await env.app.worker.processNext(acc, { ignorePacing: true });
    env.app.campaigns.pause(acc, camp.id);
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(false);
    expect(env.app.campaigns.get(acc, camp.id).stats!.pending).toBe(4);
    env.app.campaigns.resume(acc, camp.id);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    expect(env.sims.get(acc)!.sent).toHaveLength(3);
    const c = env.app.campaigns.cancel(acc, camp.id);
    expect(c.status).toBe('cancelled');
    expect(c.stats).toMatchObject({ sent: 3, cancelled: 3, pending: 0 });
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(3);
  });

  it('desconexión: pausa automáticamente; al reconectar se puede reanudar', async () => {
    const { tag } = seed(env, 4);
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Dc', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 4);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    env.sims.get(acc)!.simulateConnectionLoss();
    await settle(env);
    const paused = env.app.campaigns.get(acc, camp.id);
    expect(paused.status).toBe('paused');
    expect(paused.pause_reason).toBe('disconnected');
    expect(env.notifications.some((n) => n.title.includes('desconectado'))).toBe(true);
    expect(() => env.app.campaigns.resume(acc, camp.id)).toThrow(/desconectado/);
    await env.app.accounts.connect(acc);
    await settle(env);
    expect(env.notifications.some((n) => n.title.includes('Conexión restaurada'))).toBe(true);
    env.app.campaigns.resume(acc, camp.id);
    await drainQueue(env, acc);
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('completed');
    expect(env.sims.get(acc)!.sent).toHaveLength(4);
  });

  it('programada: se ejecuta cuando llega la hora (Scheduler)', async () => {
    const { tag } = seed(env, 2);
    const at = new Date(env.clock.now().getTime() + 3600000).toISOString();
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Prog', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola', scheduled_at: at });
    expect(env.app.campaigns.confirm(acc, camp.id, 2).status).toBe('scheduled');
    expect(env.app.campaigns.processDue()).toBe(0);
    env.clock.advance(3600000 + 1000);
    expect(env.app.campaigns.processDue()).toBe(1);
    await drainQueue(env, acc);
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('completed');
  });

  it('registra respuestas (respondidos) y estados entregado/leído', async () => {
    const { tag, ids } = seed(env, 2);
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Resp', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 2);
    await drainQueue(env, acc);
    const sent = env.sims.get(acc)!.sent;
    env.app.conversations.applyStatus(acc, { providerMessageId: sent[0].providerMessageId, status: 'delivered', timestamp: env.clock.now() });
    env.app.conversations.applyStatus(acc, { providerMessageId: sent[1].providerMessageId, status: 'read', timestamp: env.clock.now() });
    env.sims.get(acc)!.simulateInbound('57' + '30055500' + '00', 'Me interesa');
    await settle(env);
    const st = env.app.campaigns.get(acc, camp.id).stats!;
    expect(st).toMatchObject({ sent: 2, delivered: 2, read: 1, replied: 1 });
    void ids;
  });

  it('ventana de 24 h (Cloud API): mensajes libres solo a quien escribió; plantillas para el resto', async () => {
    const cloud = env.app.accounts.create({ name: 'Cloud', provider: 'cloud_api', config: { accessToken: 'EAAtest', phoneNumberId: '1234567890', appSecret: 's3cret', verifyToken: 'vt' } });
    const a = env.app.contacts.create(cloud.id, { name: 'Escribió', phone: '3001000001' });
    env.app.contacts.create(cloud.id, { name: 'Frío', phone: '3001000002' });
    env.app.db.prepare('UPDATE contacts SET last_inbound_at = ? WHERE id = ?').run(new Date(env.clock.now().getTime() - 3600000).toISOString(), a.id);
    const camp = env.app.campaigns.saveDraft(cloud.id, { name: 'Libre', audience: { type: 'all' }, message_type: 'text', body: 'Hola' });
    const pv = env.app.campaigns.preview(cloud.id, camp.id);
    expect(pv.eligible).toBe(1);
    expect(pv.excluded.outside_window).toBe(1);
    env.app.templates.storeProviderTemplates(cloud.id, [{ name: 'promo', language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'Hola {{1}}', paramCount: 1, headerType: null, raw: null }]);
    const tpl = env.app.templates.providerTemplates(cloud.id)[0];
    const camp2 = env.app.campaigns.saveDraft(cloud.id, { name: 'Plantilla', audience: { type: 'all' }, message_type: 'template', provider_template_id: tpl.id, template_params: ['{{nombre}}'] });
    const pv2 = env.app.campaigns.preview(cloud.id, camp2.id);
    expect(pv2.eligible).toBe(2);
    expect(pv2.sample.map((s) => s.text)).toEqual(['Hola Escribió', 'Hola Frío']);
  });

  it('una campaña programada cuya hora pasó con la app cerrada (fuera de gracia) queda en pausa', async () => {
    const { tag } = seed(env, 1);
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Perdida', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola', scheduled_at: new Date(env.clock.now().getTime() + 60000).toISOString() });
    env.app.campaigns.confirm(acc, camp.id, 1);
    env.clock.advance(7 * 3600000); // gracia por defecto: 6 h
    env.app.campaigns.processDue();
    const c = env.app.campaigns.get(acc, camp.id);
    expect(c.status).toBe('paused');
    expect(c.pause_reason).toBe('missed_schedule');
    expect(env.sims.get(acc)!.sent).toHaveLength(0);
    env.app.campaigns.resume(acc, camp.id); // el usuario decide enviarla igual
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(1);
  });

  it('recurrente: calcula ocurrencias, ejecuta cada lunes y no acumula ejecuciones perdidas', async () => {
    const { tag } = seed(env, 2);
    // Lunes 5 oct 2026, 10:30 Bogotá = 15:30Z. Reloj: 15:00Z
    const start = '2026-10-05T15:30:00.000Z';
    const rec = { freq: 'weekly' as const, interval: 1, byWeekday: [1], time: '10:30' };
    expect(nextOccurrence(rec, 'America/Bogota', new Date(start), new Date('2026-10-05T15:30:00.000Z'))!.toISOString()).toBe('2026-10-12T15:30:00.000Z');
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Lunes', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Buen lunes', scheduled_at: start, recurrence: rec, timezone: 'America/Bogota' });
    const c = env.app.campaigns.confirm(acc, camp.id, 2);
    expect(c.status).toBe('scheduled');
    expect(c.next_run_at).toBe(start);
    env.clock.set('2026-10-05T15:31:00.000Z');
    env.app.campaigns.processDue();
    await drainQueue(env, acc);
    let cur = env.app.campaigns.get(acc, camp.id);
    expect(cur.status).toBe('scheduled');
    expect(cur.next_run_at).toBe('2026-10-12T15:30:00.000Z');
    expect(cur.run_count).toBe(1);
    // App cerrada 3 semanas: al abrir no se envían 3 ejecuciones atrasadas
    env.clock.set('2026-11-02T20:00:00.000Z');
    env.app.campaigns.processDue();
    cur = env.app.campaigns.get(acc, camp.id);
    expect(cur.run_count).toBe(1);
    expect(cur.next_run_at).toBe('2026-11-09T15:30:00.000Z');
    expect(env.sims.get(acc)!.sent).toHaveLength(2);
  });

  it('recurrente: si la audiencia crece demasiado se pausa para reconfirmar', async () => {
    const { tag } = seed(env, 2);
    const start = new Date(env.clock.now().getTime() + 60000).toISOString();
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Crece', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'x', scheduled_at: start, recurrence: { freq: 'daily', interval: 1, time: '10:01' }, timezone: 'America/Bogota' });
    env.app.campaigns.confirm(acc, camp.id, 2);
    for (let i = 0; i < 20; i++) env.app.contacts.create(acc, { name: 'Nuevo' + i, phone: '30099900' + String(i).padStart(2, '0'), tagIds: [tag.id] });
    env.clock.advance(120000);
    env.app.campaigns.processDue();
    const c = env.app.campaigns.get(acc, camp.id);
    expect(c.status).toBe('paused');
    expect(c.pause_reason).toMatch(/^audience_grew/);
    expect(env.sims.get(acc)!.sent).toHaveLength(0);
  });
});

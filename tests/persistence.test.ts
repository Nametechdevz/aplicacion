import { describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, tmpDir } from './helpers';
import { ManualClock } from '../src/main/core/clock';

/**
 * Prueba clave: cerrar la aplicación mientras existe una campaña programada / en curso y volver a abrir.
 * Usa una base de datos en archivo real y dos instancias consecutivas de la aplicación.
 */
describe('Persistencia tras cerrar y reabrir la aplicación', () => {
  it('campaña PROGRAMADA: sobrevive al cierre y se ejecuta al llegar la hora tras reabrir', async () => {
    const dir = tmpDir();
    const clock = new ManualClock(new Date('2026-10-05T15:00:00Z').getTime());
    let env = makeEnv({ dir, clock });
    const acc = await simAccount(env);
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    for (let i = 0; i < 3; i++) env.app.contacts.create(acc, { name: 'P' + i, phone: '30012300' + i + '0', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Programada', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola {{nombre}}', scheduled_at: '2026-10-05T17:00:00.000Z' });
    env.app.campaigns.confirm(acc, camp.id, 3);
    await env.close(); // ← la aplicación se cierra

    clock.set('2026-10-05T16:00:00Z');
    env = makeEnv({ dir, clock }); // ← se vuelve a abrir (antes de la hora)
    await env.app.start({ webhook: false, queueIntervalMs: 60_000_000, schedulerIntervalMs: 60_000_000 });
    await settle(env);
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('scheduled');
    await env.app.accounts.connect(acc);

    clock.set('2026-10-05T17:00:30Z');
    await env.app.scheduler.tick();
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('running');
    await drainQueue(env, acc);
    const c = env.app.campaigns.get(acc, camp.id);
    expect(c.status).toBe('completed');
    expect(c.stats).toMatchObject({ total: 3, sent: 3 });
    expect(env.sims.get(acc)!.sent).toHaveLength(3);
    await env.close();
  });

  it('campaña EN CURSO: al reabrir continúa solo con lo pendiente, sin duplicar lo ya enviado', async () => {
    const dir = tmpDir();
    const clock = new ManualClock(new Date('2026-10-05T15:00:00Z').getTime());
    let env = makeEnv({ dir, clock });
    const acc = await simAccount(env);
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    for (let i = 0; i < 5; i++) env.app.contacts.create(acc, { name: 'R' + i, phone: '30045600' + i + '0', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'En curso', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 5);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    await env.app.worker.processNext(acc, { ignorePacing: true });
    const firstRunSent = env.sims.get(acc)!.sent.map((s) => s.to);
    // Simula un cierre abrupto con un mensaje "en vuelo"
    const inflight = env.app.db.prepare("SELECT id FROM message_queue WHERE campaign_id = ? AND status = 'queued' ORDER BY id LIMIT 1").get(camp.id) as { id: number };
    env.app.db.prepare("UPDATE message_queue SET status = 'sending' WHERE id = ?").run(inflight.id);
    await env.close();

    env = makeEnv({ dir, clock });
    await env.app.start({ webhook: false, queueIntervalMs: 60_000_000, schedulerIntervalMs: 60_000_000 });
    await env.app.accounts.connect(acc);
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('running');
    await drainQueue(env, acc);
    const c = env.app.campaigns.get(acc, camp.id);
    expect(c.status).toBe('completed');
    // 2 enviados antes + 2 después; el "en vuelo" queda fallido (incierto) y no se reenvía
    expect(c.stats).toMatchObject({ total: 5, sent: 4, failed: 1 });
    const secondRunSent = env.sims.get(acc)!.sent.map((s) => s.to);
    expect(secondRunSent).toHaveLength(2);
    expect(secondRunSent.some((to) => firstRunSent.includes(to))).toBe(false);
    await env.close();
  });

  it('campaña PAUSADA: sigue pausada tras reabrir; esperas de automatización se reanudan', async () => {
    const dir = tmpDir();
    const clock = new ManualClock(new Date('2026-10-05T15:00:00Z').getTime());
    let env = makeEnv({ dir, clock });
    const acc = await simAccount(env);
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    const ct = env.app.contacts.create(acc, { name: 'W', phone: '3007770000', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Pausada', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 1);
    env.app.campaigns.pause(acc, camp.id);
    // Automatización con espera de 1 hora
    env.app.automation.save(acc, {
      name: 'Seguimiento',
      enabled: true,
      nodes: [
        { id: 't', type: 'trigger', subtype: 'message_received', config: {}, position: { x: 0, y: 0 } },
        { id: 'w', type: 'action', subtype: 'wait', config: { amount: 1, unit: 'hours' }, position: { x: 0, y: 100 } },
        { id: 's', type: 'action', subtype: 'send_message', config: { text: '¿Pudiste revisar, {{nombre}}?' }, position: { x: 0, y: 200 } },
      ],
      edges: [
        { id: 'e1', source: 't', target: 'w' },
        { id: 'e2', source: 'w', target: 's' },
      ],
    });
    env.sims.get(acc)!.simulateInbound(ct.phone, 'hola');
    await settle(env);
    expect((env.app.db.prepare("SELECT COUNT(*) n FROM automation_runs WHERE status = 'waiting'").get() as any).n).toBe(1);
    await env.close();

    clock.advance(2 * 3600000);
    env = makeEnv({ dir, clock });
    await env.app.start({ webhook: false, queueIntervalMs: 60_000_000, schedulerIntervalMs: 60_000_000 });
    await env.app.accounts.connect(acc);
    expect(env.app.campaigns.get(acc, camp.id).status).toBe('paused');
    await env.app.scheduler.tick();
    await drainQueue(env, acc);
    const texts = env.sims.get(acc)!.sent.map((s) => s.text);
    expect(texts).toEqual(['¿Pudiste revisar, W?']); // la campaña pausada no envió nada
    await env.close();
  });
});

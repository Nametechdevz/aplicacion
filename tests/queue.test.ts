import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, simAccount, type TestEnv } from './helpers';

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

const q = (env: TestEnv, id: number) => env.app.db.prepare('SELECT * FROM message_queue WHERE id = ?').get(id) as any;
const m = (env: TestEnv, id: number) => env.app.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as any;

describe('Cola de mensajes', () => {
  it('idempotency_key: la misma clave nunca genera dos envíos', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r1 = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'camp:1:1:' + c.id });
    const r2 = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'camp:1:1:' + c.id });
    expect(r2.duplicate).toBe(true);
    expect(r2.queueId).toBe(r1.queueId);
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(1);
    expect((env.app.db.prepare('SELECT COUNT(*) n FROM message_queue').get() as any).n).toBe(1);
  });

  it('procesa en orden, con estados queued → sent → delivered → read', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'manual', idempotencyKey: 'manual:abc12345' });
    expect(m(env, r.messageId).status).toBe('queued');
    await drainQueue(env, acc);
    const msg = m(env, r.messageId);
    expect(msg.status).toBe('sent');
    expect(msg.provider_message_id).toMatch(/^sim\./);
    env.app.conversations.applyStatus(acc, { providerMessageId: msg.provider_message_id, status: 'read', timestamp: env.clock.now() });
    env.app.conversations.applyStatus(acc, { providerMessageId: msg.provider_message_id, status: 'delivered', timestamp: env.clock.now() }); // llega tarde: no retrocede
    const after = m(env, r.messageId);
    expect(after.status).toBe('read');
    expect(after.delivered_at).toBeTruthy();
  });

  it('respeta el ritmo configurado (mensajes por minuto)', async () => {
    env.app.settings.set('sending', { ratePerMinute: 2 }, acc);
    for (let i = 0; i < 3; i++) {
      const c = env.app.contacts.create(acc, { name: 'C' + i, phone: '300123450' + i });
      env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'x', source: 'campaign', idempotencyKey: 'k' + i });
    }
    expect(await env.app.worker.processNext(acc)).toBe(true);
    expect(await env.app.worker.processNext(acc)).toBe(false); // demasiado pronto
    env.clock.advance(29000);
    expect(await env.app.worker.processNext(acc)).toBe(false);
    env.clock.advance(1500);
    expect(await env.app.worker.processNext(acc)).toBe(true);
  });

  it('RATE_LIMIT: pausa la cuenta, no consume intentos y reintenta después', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'rl1' });
    env.sims.get(acc)!.failNext('RATE_LIMIT', 1, '130429');
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(true);
    let item = q(env, r.queueId);
    expect(item.status).toBe('queued');
    expect(item.attempts).toBe(0);
    expect(item.last_error_code).toBe('130429');
    expect(env.app.worker.isAccountPaused(acc)).toBeTruthy();
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(false); // en pausa
    env.clock.advance(61000);
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(true);
    item = q(env, r.queueId);
    expect(item.status).toBe('sent');
    expect(env.sims.get(acc)!.sent).toHaveLength(1);
  });

  it('errores transitorios: reintentos con backoff y fallo definitivo tras el máximo', async () => {
    env.app.settings.set('sending', { maxAttempts: 3, retryBaseSeconds: 10 }, acc);
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'tr1' });
    env.sims.get(acc)!.failNext('TRANSIENT', 3);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    expect(q(env, r.queueId).status).toBe('queued');
    env.clock.advance(10500);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    expect(q(env, r.queueId).status).toBe('queued');
    env.clock.advance(15000);
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(false); // backoff 20 s aún no vence
    env.clock.advance(6000);
    await env.app.worker.processNext(acc, { ignorePacing: true });
    const item = q(env, r.queueId);
    expect(item.status).toBe('failed');
    expect(item.attempts).toBe(3);
    expect(m(env, r.messageId).error_message).toMatch(/Error temporal/);
  });

  it('error permanente: falla sin reintentar y con mensaje legible', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'inv1' });
    env.sims.get(acc)!.failNext('INVALID_RECIPIENT', 1, '131026');
    await env.app.worker.processNext(acc, { ignorePacing: true });
    const msg = m(env, r.messageId);
    expect(msg.status).toBe('failed');
    expect(msg.error_message).toBe('El número no existe en WhatsApp o no puede recibir mensajes.');
    expect(q(env, r.queueId).attempts).toBe(1);
  });

  it('no envía si la cuenta está desconectada y continúa al reconectar', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'manual', idempotencyKey: 'dc1' });
    await env.app.accounts.disconnect(acc);
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(false);
    await env.app.accounts.connect(acc);
    expect(await env.app.worker.processNext(acc, { ignorePacing: true })).toBe(true);
  });

  it('caída de red: no consume intentos, marca la cuenta desconectada y pausa campañas', async () => {
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    const c = env.app.contacts.create(acc, { name: 'Red', phone: '3001239999', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Red', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Hola' });
    env.app.campaigns.confirm(acc, camp.id, 1);
    env.sims.get(acc)!.failNext('TRANSIENT', 1, 'NETWORK');
    await env.app.worker.processNext(acc, { ignorePacing: true });
    await env.app.bus.drain();
    const item = env.app.db.prepare('SELECT status, attempts FROM message_queue WHERE campaign_id = ?').get(camp.id) as any;
    expect(item).toMatchObject({ status: 'queued', attempts: 0 });
    expect(env.app.accounts.getProvider(acc)!.getStatus().status).toBe('disconnected');
    expect(env.app.campaigns.get(acc, camp.id)).toMatchObject({ status: 'paused', pause_reason: 'disconnected' });
    await env.app.accounts.connect(acc);
    env.app.campaigns.resume(acc, camp.id);
    env.clock.advance(11000); // reintento programado a +10 s
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent.map((s) => s.to)).toEqual([c.phone]);
  });

  it('tope diario: frena envíos masivos pero deja pasar respuestas manuales', async () => {
    env.app.settings.set('sending', { dailyCap: 1 }, acc);
    const ids = [0, 1, 2].map((i) => env.app.contacts.create(acc, { name: 'C' + i, phone: '300777000' + i }).id);
    env.app.messaging.enqueue({ accountId: acc, contactId: ids[0], kind: 'text', text: 'x', source: 'campaign', idempotencyKey: 'cap0' });
    env.app.messaging.enqueue({ accountId: acc, contactId: ids[1], kind: 'text', text: 'x', source: 'campaign', idempotencyKey: 'cap1' });
    await drainQueue(env, acc, 10);
    expect(env.sims.get(acc)!.sent).toHaveLength(1);
    env.app.messaging.enqueue({ accountId: acc, contactId: ids[2], kind: 'text', text: 'respuesta', source: 'manual', idempotencyKey: 'manual:cap2-abcdef' });
    await drainQueue(env, acc, 10);
    expect(env.sims.get(acc)!.sent.map((s) => s.text)).toEqual(['x', 'respuesta']);
  });

  it('tras un cierre inesperado NO reenvía lo que estaba "sending" (evita duplicados)', async () => {
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    const r = env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Hola', source: 'campaign', idempotencyKey: 'crash1' });
    env.app.db.prepare("UPDATE message_queue SET status = 'sending' WHERE id = ?").run(r.queueId);
    expect(env.app.worker.recoverInterrupted()).toBe(1);
    expect(q(env, r.queueId).status).toBe('failed');
    expect(q(env, r.queueId).last_error_code).toBe('INTERRUPTED');
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(0);
    // El usuario puede reintentarlo manualmente
    expect(env.app.worker.retry(acc, r.messageId)).toBe(true);
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(1);
  });

  it('multimedia: valida formato/tamaño y envía imagen y documento', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
    const img = env.app.media.importBuffer(acc, png, { fileName: 'promo.png', inLibrary: true });
    expect(img.kind).toBe('image');
    const pdf = env.app.media.importBuffer(acc, Buffer.from('%PDF-1.4 test'), { fileName: 'catalogo.pdf', inLibrary: true });
    expect(pdf.kind).toBe('document');
    const webp = env.app.media.importBuffer(acc, Buffer.from('RIFF....WEBP'), { fileName: 'foto.webp', inLibrary: true });
    expect(webp.kind).toBe('document'); // la Cloud API no acepta WEBP como imagen
    expect(() => env.app.media.importBuffer(acc, Buffer.from('no es png'), { fileName: 'falso.png' })).toThrow(/no coincide/);
    expect(() => env.app.media.importBuffer(acc, Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), { fileName: 'grande.png' })).toThrow(/máximo/);
    const c = env.app.contacts.create(acc, { name: 'A', phone: '3001234567' });
    env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'media', mediaId: img.id, text: 'Mira esto', source: 'manual', idempotencyKey: 'manual:media-1-xx' });
    env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'media', mediaId: pdf.id, source: 'manual', idempotencyKey: 'manual:media-2-xx' });
    await drainQueue(env, acc);
    const sent = env.sims.get(acc)!.sent;
    expect(sent.map((s) => s.media?.kind)).toEqual(['image', 'document']);
    expect(sent[0].media?.caption).toBe('Mira esto');
    expect(env.app.media.list(acc)).toHaveLength(3);
  });
});

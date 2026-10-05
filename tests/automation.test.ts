import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, type TestEnv } from './helpers';
import type { AutomationEdge, AutomationNode } from '../src/shared/types';

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

const node = (id: string, type: AutomationNode['type'], subtype: string, config: any = {}): AutomationNode => ({ id, type, subtype, config, position: { x: 0, y: 0 } });
const edge = (source: string, target: string, sourceHandle?: 'true' | 'false'): AutomationEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });

function precioAutomation(env: TestEnv) {
  const interesado = env.app.tags.findByName(acc, 'Interesado')!;
  return env.app.automation.save(acc, {
    name: 'Consulta de precios',
    enabled: true,
    nodes: [
      node('t', 'trigger', 'message_received'),
      node('c', 'condition', 'message_contains', { keywords: ['precio', 'cuánto cuesta'] }),
      node('a1', 'action', 'send_message', { text: 'Hola {{nombre}} 👋 Claro, te comparto nuestros precios...' }),
      node('a2', 'action', 'add_tag', { tagId: interesado.id }),
    ],
    edges: [edge('t', 'c'), edge('c', 'a1', 'true'), edge('a1', 'a2')],
  });
}

describe('Automatizaciones', () => {
  it('ejemplo "Consulta de precios": responde y agrega etiqueta (sin distinguir mayúsculas/acentos)', async () => {
    precioAutomation(env);
    const sim = env.sims.get(acc)!;
    sim.simulateInbound('573001112233', 'Hola, ¿cuál es el PRECIO?', 'Juan Pérez');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent.map((s) => s.text)).toEqual(['Hola Juan 👋 Claro, te comparto nuestros precios...']);
    const contact = env.app.contacts.findByPhone(acc, '573001112233')!;
    expect(env.app.contacts.get(acc, contact.id).tags!.map((t) => t.name)).toContain('Interesado');
    // Mensaje sin la palabra: no responde
    sim.simulateInbound('573001112233', 'gracias');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(1);
  });

  it('modo humano: si un agente responde, la automatización se pausa X minutos', async () => {
    precioAutomation(env);
    env.app.settings.set('humanMode', { enabled: true, pauseMinutes: 30 }, acc);
    const sim = env.sims.get(acc)!;
    sim.simulateInbound('573001112233', 'precio?', 'Ana');
    await settle(env);
    const c = env.app.contacts.findByPhone(acc, '573001112233')!;
    const agent = env.app.users.create({ username: 'carlos', display_name: 'Carlos', password: 'Secreta123', role: 'agent' });
    env.app.messaging.sendManual(acc, { contactId: c.id, text: 'Hola Ana, soy Carlos' }, agent.id, null);
    expect(env.app.conversations.isBotPaused(acc, c.id)).toBe(true);
    sim.simulateInbound('573001112233', 'y el precio del otro?');
    await settle(env);
    await drainQueue(env, acc);
    // (el mensaje manual tiene prioridad en la cola)
    expect(sim.sent.map((s) => s.text).sort()).toEqual(['Hola Ana 👋 Claro, te comparto nuestros precios...', 'Hola Ana, soy Carlos'].sort());
    env.clock.advance(31 * 60000);
    expect(env.app.conversations.isBotPaused(acc, c.id)).toBe(false);
    sim.simulateInbound('573001112233', 'precio');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(3);
  });

  it('condiciones Sí/No, etiquetas, número y horario', async () => {
    const vip = env.app.tags.findByName(acc, 'Cliente VIP')!;
    env.app.automation.save(acc, {
      name: 'VIP',
      enabled: true,
      nodes: [
        node('t', 'trigger', 'message_received'),
        node('c', 'condition', 'has_tag', { tagId: vip.id }),
        node('yes', 'action', 'send_message', { text: 'Atención VIP' }),
        node('no', 'action', 'send_message', { text: 'Atención estándar' }),
      ],
      edges: [edge('t', 'c'), edge('c', 'yes', 'true'), edge('c', 'no', 'false')],
    });
    const a = env.app.contacts.create(acc, { name: 'Vip', phone: '3001000001', tagIds: [vip.id] });
    const b = env.app.contacts.create(acc, { name: 'Normal', phone: '3001000002' });
    const sim = env.sims.get(acc)!;
    sim.simulateInbound(a.phone, 'hola');
    sim.simulateInbound(b.phone, 'hola');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent.map((s) => `${s.to}:${s.text}`).sort()).toEqual([`${a.phone}:Atención VIP`, `${b.phone}:Atención estándar`].sort());
    const ev = (n: AutomationNode, text = '') => env.app.automation.evaluateConditions(acc, a.id, n, { text, isNewContact: false });
    expect(ev(node('x', 'condition', 'phone_matches', { value: '+57 300' }))).toBe(true);
    expect(ev(node('x', 'condition', 'message_starts_with', { text: 'Hola' }), 'hola buenas')).toBe(true);
    expect(ev(node('x', 'condition', 'message_ends_with', { text: 'gracias' }), 'muchas GRACIAS')).toBe(true);
    // 15:00Z lunes = 10:00 Bogotá → dentro del horario por defecto (08–18)
    expect(ev(node('x', 'condition', 'business_hours', { inside: true }))).toBe(true);
    expect(ev(node('x', 'condition', 'day_of_week', { days: [1] }))).toBe(true);
    expect(ev(node('x', 'condition', 'time_range', { from: '09:00', to: '11:00' }))).toBe(true);
  });

  it('trigger "Etiqueta agregada" + crear tarea + quitar etiqueta + esperar', async () => {
    const pend = env.app.tags.findByName(acc, 'Pendiente')!;
    env.app.automation.save(acc, {
      name: 'Seguimiento pendiente',
      enabled: true,
      nodes: [
        node('t', 'trigger', 'tag_added', { tagId: pend.id }),
        node('task', 'action', 'create_task', { title: 'Llamar a {{nombre}}', dueInHours: 24 }),
        node('w', 'action', 'wait', { amount: 2, unit: 'days' }),
        node('r', 'action', 'remove_tag', { tagId: pend.id }),
      ],
      edges: [edge('t', 'task'), edge('task', 'w'), edge('w', 'r')],
    });
    const c = env.app.contacts.create(acc, { name: 'Laura Ruiz', phone: '3002223344' });
    env.app.tags.assign(acc, [c.id], pend.id);
    await settle(env);
    const tasks = env.app.tasks.list(acc);
    expect(tasks[0].title).toBe('Llamar a Laura');
    expect(env.app.tags.contactHasTag(c.id, pend.id)).toBe(true);
    env.clock.advance(2 * 86400000 + 1000);
    await env.app.automation.resumeDue();
    expect(env.app.tags.contactHasTag(c.id, pend.id)).toBe(false);
  });

  it('valida el grafo: un trigger, sin ciclos, una salida por puerto', () => {
    expect(() => env.app.automation.save(acc, { name: 'x', nodes: [node('a', 'action', 'stop')], edges: [] })).toThrow(/disparador/);
    expect(() =>
      env.app.automation.save(acc, {
        name: 'ciclo',
        nodes: [node('t', 'trigger', 'message_received'), node('a', 'action', 'add_note', { text: 'x' }), node('b', 'action', 'add_note', { text: 'y' })],
        edges: [edge('t', 'a'), edge('a', 'b'), edge('b', 'a')],
      }),
    ).toThrow(/ciclo|salida/);
    expect(() =>
      env.app.automation.save(acc, {
        name: 'vacío',
        nodes: [node('t', 'trigger', 'message_received'), node('a', 'action', 'send_message', { text: '' })],
        edges: [edge('t', 'a')],
      }),
    ).toThrow(/Escriba el mensaje/);
  });

  it('protección anti-bucle: encadenamiento limitado y límite de ejecuciones por contacto/hora', async () => {
    const a = env.app.tags.findByName(acc, 'Prospecto')!;
    const b = env.app.tags.findByName(acc, 'Interesado')!;
    // A agrega B, B quita A y agrega A… cadena que se cortaría por profundidad
    env.app.automation.save(acc, { name: 'A→B', enabled: true, nodes: [node('t', 'trigger', 'tag_added', { tagId: a.id }), node('x', 'action', 'add_tag', { tagId: b.id })], edges: [edge('t', 'x')] });
    env.app.automation.save(acc, {
      name: 'B→A',
      enabled: true,
      nodes: [node('t', 'trigger', 'tag_added', { tagId: b.id }), node('r1', 'action', 'remove_tag', { tagId: b.id }), node('r2', 'action', 'remove_tag', { tagId: a.id }), node('x', 'action', 'add_tag', { tagId: a.id })],
      edges: [edge('t', 'r1'), edge('r1', 'r2'), edge('r2', 'x')],
    });
    const c = env.app.contacts.create(acc, { name: 'Loop', phone: '3009998888' });
    env.app.tags.assign(acc, [c.id], a.id);
    await settle(env);
    const runs = (env.app.db.prepare('SELECT COUNT(*) n FROM automation_runs').get() as any).n;
    expect(runs).toBeLessThanOrEqual(8);
  });

  it('no se dispara para contactos con opt-out y una automatización desactivada no se ejecuta', async () => {
    const auto = precioAutomation(env);
    const c = env.app.contacts.create(acc, { name: 'Baja', phone: '3005554444' });
    env.app.contacts.setConsent(acc, c.id, 'opted_out', 'test');
    const sim = env.sims.get(acc)!;
    sim.simulateInbound(c.phone, 'precio');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(0);
    env.app.automation.pause(acc, auto.id);
    sim.simulateInbound('573001231231', 'precio');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(0);
    env.app.automation.resume(acc, auto.id);
    sim.simulateInbound('573001231231', 'precio');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent).toHaveLength(1);
  });

  it('duplicar automatización y trigger "Horario determinado"', async () => {
    const vip = env.app.tags.findByName(acc, 'Cliente VIP')!;
    const c = env.app.contacts.create(acc, { name: 'Sched', phone: '3001212121', tagIds: [vip.id] });
    env.app.automation.save(acc, {
      name: 'Nota diaria',
      enabled: true,
      nodes: [node('t', 'trigger', 'schedule', { time: '10:00', days: [1, 2, 3, 4, 5], tagId: vip.id }), node('n', 'action', 'add_note', { text: 'Revisión semanal' })],
      edges: [edge('t', 'n')],
    });
    // 15:00Z = 10:00 en Bogotá (lunes)
    expect(await env.app.automation.processTimeTriggers()).toBe(1);
    expect(await env.app.automation.processTimeTriggers()).toBe(0); // no se repite en el mismo horario
    expect(env.app.contacts.notes(acc, c.id)).toHaveLength(1);
    const copy = env.app.automation.duplicate(acc, env.app.automation.list(acc)[0].id);
    expect(copy.enabled).toBe(0);
    expect(copy.nodes).toHaveLength(2);
  });
});

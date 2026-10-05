import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeEnv, simAccount, type TestEnv } from './helpers';

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

describe('Contactos', () => {
  it('crea, normaliza el teléfono y rechaza duplicados e inválidos', () => {
    const c = env.app.contacts.create(acc, { name: 'Juan Pérez', phone: '300 123 4567' });
    expect(c.phone).toBe('573001234567');
    expect(() => env.app.contacts.create(acc, { name: 'Otro', phone: '+57 300-123-4567' })).toThrow(/Ya existe/);
    expect(() => env.app.contacts.create(acc, { name: 'Malo', phone: 'abc' })).toThrow(/inválido/);
    expect(() => env.app.contacts.create(acc, { name: 'Corto', phone: '123' })).toThrow(/inválido/);
    expect(() => env.app.contacts.create(acc, { phone: '3009999999', email: 'no-es-email' })).toThrow(/email/);
  });

  it('edita, busca, filtra, archiva y elimina', () => {
    const a = env.app.contacts.create(acc, { name: 'Ana Gómez', phone: '3001110000', company: 'ACME' });
    env.app.contacts.create(acc, { name: 'Bruno Díaz', phone: '3002220000' });
    env.app.contacts.update(acc, a.id, { company: 'Globex', email: 'ana@globex.com' });
    expect(env.app.contacts.get(acc, a.id).company).toBe('Globex');
    expect(env.app.contacts.list(acc, { search: 'globex' }).total).toBe(1);
    expect(env.app.contacts.list(acc, { search: '2220' }).total).toBe(1);
    env.app.contacts.archive(acc, [a.id], true);
    expect(env.app.contacts.list(acc).total).toBe(1);
    expect(env.app.contacts.list(acc, { status: 'archived' }).total).toBe(1);
    expect(env.app.contacts.delete(acc, [a.id])).toBe(1);
    expect(() => env.app.contacts.get(acc, a.id)).toThrow();
  });

  it('aísla los datos por cuenta de WhatsApp', async () => {
    const acc2 = await simAccount(env, 'Otra');
    const c = env.app.contacts.create(acc, { name: 'Solo cuenta 1', phone: '3005550000' });
    expect(() => env.app.contacts.get(acc2, c.id)).toThrow();
    expect(env.app.contacts.list(acc2).total).toBe(0);
    // El mismo número puede existir en ambas cuentas
    expect(env.app.contacts.create(acc2, { name: 'X', phone: '3005550000' }).id).not.toBe(c.id);
  });

  it('campos personalizados con validación y notas con historial', () => {
    env.app.fields.create(acc, { label: 'Producto' });
    env.app.fields.create(acc, { label: 'Monto', type: 'number' });
    const c = env.app.contacts.create(acc, { name: 'Ana', phone: '3001112233', custom: { producto: 'Plan Premium', monto: '150000' } });
    expect(env.app.contacts.get(acc, c.id).custom).toMatchObject({ producto: 'Plan Premium', monto: '150000' });
    expect(() => env.app.contacts.update(acc, c.id, { custom: { monto: 'mucho' } })).toThrow(/numérico/);
    expect(() => env.app.fields.create(acc, { label: 'Nombre' })).toThrow(/reservada/);
    env.app.contacts.addNote(acc, c.id, 'Interesado en el plan premium');
    expect(env.app.contacts.notes(acc, c.id)).toHaveLength(1);
    const timeline = env.app.history.contactTimeline(c.id).map((e: any) => e.type);
    expect(timeline).toContain('note_added');
    expect(timeline).toContain('created');
  });
});

describe('Etiquetas', () => {
  it('crea etiquetas, asigna/desasigna y selecciona contactos por etiqueta', () => {
    const vip = env.app.tags.findByName(acc, 'Cliente VIP')!; // etiqueta inicial
    expect(vip).toBeTruthy();
    const ids = [1, 2, 3, 4].map((i) => env.app.contacts.create(acc, { name: 'C' + i, phone: '30000000' + i + '0' }).id);
    expect(env.app.tags.assign(acc, ids.slice(0, 3), vip.id)).toBe(3);
    expect(env.app.tags.assign(acc, ids.slice(0, 3), vip.id)).toBe(0); // idempotente
    expect(env.app.tags.list(acc).find((t) => t.id === vip.id)!.contact_count).toBe(3);
    expect(env.app.contacts.ids(acc, { tagIds: [vip.id] })).toEqual(ids.slice(0, 3));
    const nueva = env.app.tags.create(acc, { name: 'Curso Excel', color: '#ff0000', emoji: '📗' });
    env.app.tags.assign(acc, [ids[0], ids[3]], nueva.id);
    expect(env.app.contacts.ids(acc, { tagIds: [vip.id, nueva.id], tagMode: 'all' })).toEqual([ids[0]]);
    expect(env.app.contacts.ids(acc, { tagIds: [vip.id, nueva.id], tagMode: 'any' })).toHaveLength(4);
    expect(env.app.tags.unassign(acc, [ids[0]], vip.id)).toBe(1);
    expect(() => env.app.tags.create(acc, { name: 'curso excel' })).toThrow(/Ya existe/);
    env.app.tags.update(acc, nueva.id, { name: 'Curso Excel Avanzado' });
    env.app.tags.delete(acc, nueva.id);
    expect(env.app.tags.findByName(acc, 'Curso Excel Avanzado')).toBeUndefined();
  });

  it('la etiqueta del sistema "No contactar" no se puede eliminar', () => {
    const id = env.app.tags.noContactTagId(acc);
    expect(() => env.app.tags.delete(acc, id)).toThrow(/sistema/);
  });
});

describe('Segmentos', () => {
  it('Clientes VIP inactivos: etiqueta = VIP Y último contacto > 30 días', () => {
    const vip = env.app.tags.findByName(acc, 'Cliente VIP')!;
    const a = env.app.contacts.create(acc, { name: 'Activo', phone: '3001000001' });
    const b = env.app.contacts.create(acc, { name: 'Inactivo', phone: '3001000002' });
    const c = env.app.contacts.create(acc, { name: 'No VIP', phone: '3001000003' });
    env.app.tags.assign(acc, [a.id, b.id], vip.id);
    const now = env.clock.now().getTime();
    env.app.db.prepare('UPDATE contacts SET last_message_at = ? WHERE id = ?').run(new Date(now - 5 * 86400000).toISOString(), a.id);
    env.app.db.prepare('UPDATE contacts SET last_message_at = ? WHERE id = ?').run(new Date(now - 45 * 86400000).toISOString(), b.id);
    env.app.db.prepare('UPDATE contacts SET last_message_at = ? WHERE id = ?').run(new Date(now - 45 * 86400000).toISOString(), c.id);
    const seg = env.app.segments.save(acc, {
      name: 'Clientes VIP inactivos',
      definition: { match: 'all', rules: [{ field: 'tag', op: 'is', value: vip.id }, { field: 'last_message_at', op: 'older_than_days', value: 30 }] },
    });
    expect(env.app.segments.contactIds(acc, seg.definition)).toEqual([b.id]);
    expect(env.app.contacts.list(acc, { segmentId: seg.id }).total).toBe(1);
    const any = env.app.segments.count(acc, { match: 'any', rules: [{ field: 'name', op: 'contains', value: 'activo' }, { field: 'phone', op: 'starts_with', value: '5730010000' }] });
    expect(any).toBe(3);
  });

  it('no permite inyección SQL en valores de reglas', () => {
    env.app.contacts.create(acc, { name: "O'Brien", phone: '3001000009' });
    const n = env.app.segments.count(acc, { match: 'all', rules: [{ field: 'name', op: 'contains', value: "'; DROP TABLE contacts; --" }] });
    expect(n).toBe(0);
    expect(env.app.segments.count(acc, { match: 'all', rules: [{ field: 'name', op: 'contains', value: "O'Brien" }] })).toBe(1);
    expect(env.app.contacts.list(acc).total).toBe(1);
  });
});

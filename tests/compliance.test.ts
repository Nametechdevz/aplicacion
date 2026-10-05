import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drainQueue, makeEnv, settle, simAccount, type TestEnv } from './helpers';
import { renderTemplate } from '../src/shared/variables';
import { normalizePhone } from '../src/shared/phone';

let env: TestEnv;
let acc: number;
beforeEach(async () => {
  env = makeEnv({ memory: true });
  acc = await simAccount(env);
});
afterEach(async () => env.close());

describe('Opt-out y lista negra', () => {
  it('"STOP" marca opt-out, agrega NO CONTACTAR, cancela envíos pendientes y confirma la baja', async () => {
    const tag = env.app.tags.findByName(acc, 'Cliente')!;
    const c = env.app.contacts.create(acc, { name: 'Pedro', phone: '3001231234', tagIds: [tag.id] });
    const other = env.app.contacts.create(acc, { name: 'Otro', phone: '3001231235', tagIds: [tag.id] });
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Promo', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Promo' });
    env.app.campaigns.confirm(acc, camp.id, 2);
    env.app.campaigns.pause(acc, camp.id);
    env.sims.get(acc)!.simulateInbound(c.phone, '  Stop!  ');
    await settle(env);
    const after = env.app.contacts.get(acc, c.id);
    expect(after.consent_status).toBe('opted_out');
    expect(after.consent_source).toMatch(/^keyword:/);
    expect(after.tags!.some((t) => t.system_key === 'no_contact')).toBe(true);
    env.app.campaigns.resume(acc, camp.id);
    await drainQueue(env, acc);
    const sent = env.sims.get(acc)!.sent;
    expect(sent.filter((s) => s.to === c.phone).map((s) => s.text)).toEqual([env.app.settings.get('optOut', acc).replyMessage]);
    expect(sent.filter((s) => s.to === other.phone).map((s) => s.text)).toEqual(['Promo']);
    // Excluido de futuras campañas
    const camp2 = env.app.campaigns.saveDraft(acc, { name: 'Promo 2', audience: { type: 'tag', tagIds: [tag.id] }, message_type: 'text', body: 'Promo 2' });
    expect(env.app.campaigns.preview(acc, camp2.id).excluded.opted_out).toBe(1);
  });

  it('no confunde frases normales con una baja', async () => {
    const c = env.app.contacts.create(acc, { name: 'Lucía', phone: '3009871234' });
    env.sims.get(acc)!.simulateInbound(c.phone, 'No pares, quiero saber más de la baja de precios');
    await settle(env);
    expect(env.app.contacts.get(acc, c.id).consent_status).toBe('unknown');
  });

  it('el error 131050 del proveedor (bloqueó marketing) se registra como opt-out', async () => {
    const c = env.app.contacts.create(acc, { name: 'Bloq', phone: '3001110000' });
    env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Promo', source: 'campaign', idempotencyKey: 'x131050' });
    env.sims.get(acc)!.failNext('OPTED_OUT', 1, '131050');
    await drainQueue(env, acc);
    expect(env.app.contacts.get(acc, c.id).consent_status).toBe('opted_out');
  });

  it('la lista negra excluye de campañas y el worker bloquea aunque algo quede en cola', async () => {
    const c = env.app.contacts.create(acc, { name: 'Negra', phone: '3002220000' });
    env.app.messaging.enqueue({ accountId: acc, contactId: c.id, kind: 'text', text: 'Promo', source: 'automation', idempotencyKey: 'bl1' });
    env.app.db.prepare('UPDATE contacts SET blacklisted = 1 WHERE id = ?').run(c.id); // sin pasar por el servicio
    await drainQueue(env, acc);
    expect(env.sims.get(acc)!.sent).toHaveLength(0);
    const q = env.app.db.prepare("SELECT status, last_error FROM message_queue WHERE idempotency_key = 'bl1'").get() as any;
    expect(q.status).toBe('cancelled');
    expect(q.last_error).toMatch(/lista negra/);
  });

  it('respuesta fuera de horario (una sola vez por periodo)', async () => {
    env.app.settings.set('businessHours', { outOfHoursReply: { enabled: true, message: 'Fuera de horario, {{nombre}}', cooldownHours: 12 } }, acc);
    env.clock.set('2026-10-05T03:00:00Z'); // 22:00 domingo en Bogotá
    const sim = env.sims.get(acc)!;
    sim.simulateInbound('573004445566', 'hola', 'Marta');
    sim.simulateInbound('573004445566', '¿hay alguien?', 'Marta');
    await settle(env);
    await drainQueue(env, acc);
    expect(sim.sent.map((s) => s.text)).toEqual(['Fuera de horario, Marta']);
  });
});

describe('Variables y teléfonos', () => {
  it('reemplaza variables, campos personalizados, valores por defecto y reporta faltantes', () => {
    const r = renderTemplate('Hola {{nombre}}, vimos que estás interesado en {{producto}}. Empresa: {{empresa|tu empresa}} {{codigo}}', {
      name: 'Juan Pérez',
      phone: '573001234567',
      custom: { producto: 'Plan Premium' },
    });
    expect(r.text).toBe('Hola Juan, vimos que estás interesado en Plan Premium. Empresa: tu empresa ');
    expect(r.missing).toEqual(['codigo']);
    expect(renderTemplate('{{apellido}} {{telefono}}', { name: 'Juan Pérez Gómez', phone: '573001234567' }).text).toBe('Pérez Gómez +573001234567');
  });

  it('normaliza teléfonos con distintos formatos', () => {
    expect(normalizePhone('+57 (300) 123-4567').e164).toBe('573001234567');
    expect(normalizePhone('0057 300 123 4567').e164).toBe('573001234567');
    expect(normalizePhone('3001234567', '57').e164).toBe('573001234567');
    expect(normalizePhone('+1 415 555 0100').e164).toBe('14155550100');
    expect(normalizePhone('12ab').ok).toBe(false);
    expect(normalizePhone('').ok).toBe(false);
  });
});

describe('Importación y exportación', () => {
  it('importa CSV detectando duplicados, números inválidos y filas incompletas', () => {
    env.app.fields.create(acc, { label: 'Ciudad' });
    env.app.contacts.create(acc, { name: 'Existente', phone: '3000000001' });
    const csv = [
      'nombre,telefono,email,empresa,etiqueta,ciudad',
      'Ana,3001112222,ana@x.com,ACME,Cliente;VIP Nuevo,Bogotá',
      'Beto,+57 300 111 3333,,Globex,,Medellín',
      'Repetida,3001112222,,,,',
      'Sin teléfono,,,,,',
      'Inválido,12ab,,,,',
      'Existente,3000000001,,,,',
      'Mail malo,3001114444,no-mail,,,',
    ].join('\n');
    const file = path.join(env.dir, 'contactos.csv');
    fs.writeFileSync(file, '﻿' + csv);
    const a = env.app.importExport.analyze(acc, file);
    expect(a.mapping).toMatchObject({ nombre: 'name', telefono: 'phone', email: 'email', empresa: 'company', etiqueta: 'tags', ciudad: 'custom:ciudad' });
    expect(a.totalRows).toBe(7);
    expect(a.counts).toMatchObject({ duplicate_file: 1, incomplete: 1, invalid_phone: 1, duplicate_existing: 1, invalid_email: 1 });
    const r = env.app.importExport.execute(acc, file, { mapping: a.mapping, updateExisting: false, consent: 'opted_in', consentSource: 'formulario web' });
    expect(r).toMatchObject({ created: 3, updated: 0, skipped: 1 });
    const ana = env.app.contacts.findByPhone(acc, '573001112222')!;
    const full = env.app.contacts.get(acc, ana.id);
    expect(full.tags!.map((t) => t.name).sort()).toEqual(['Cliente', 'VIP Nuevo']);
    expect(full.custom!.ciudad).toBe('Bogotá');
    expect(full.consent_status).toBe('opted_in');
    expect(full.consent_source).toBe('formulario web');
    // Campaña dirigida a "Importados"
    const camp = env.app.campaigns.saveDraft(acc, { name: 'Importados', audience: { type: 'import', importBatchId: r.batchId }, message_type: 'text', body: 'Hola' });
    expect(env.app.campaigns.preview(acc, camp.id).eligible).toBe(3);
  });

  it('exporta CSV (con protección contra fórmulas) y Excel con filtros aplicados', async () => {
    const vip = env.app.tags.findByName(acc, 'Cliente VIP')!;
    env.app.contacts.create(acc, { name: '=HYPERLINK("x")', phone: '3001000001', tagIds: [vip.id] });
    env.app.contacts.create(acc, { name: 'Sin VIP', phone: '3001000002' });
    const csvFile = path.join(env.dir, 'out.csv');
    const r = await env.app.importExport.exportContacts(acc, { tagIds: [vip.id] }, 'csv', csvFile);
    expect(r.count).toBe(1);
    const text = fs.readFileSync(csvFile, 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).not.toContain('Sin VIP');
    const xlsx = path.join(env.dir, 'out.xlsx');
    await env.app.importExport.exportContacts(acc, {}, 'xlsx', xlsx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsx);
    expect(wb.getWorksheet('Contactos')!.rowCount).toBe(3);
  });
});

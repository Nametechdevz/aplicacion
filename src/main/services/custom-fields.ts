import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { json } from '../db/database';
import type { CustomField } from '../../shared/types';
import { BUILTIN_VARIABLES } from '../../shared/variables';
import { normalizeText } from '../../shared/text';

export function slugKey(label: string): string {
  return normalizeText(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export class CustomFieldService {
  constructor(private ctx: Ctx) {}

  list(accountId: number): CustomField[] {
    return (this.ctx.db.prepare('SELECT * FROM custom_fields WHERE account_id = ? ORDER BY position, id').all(accountId) as any[]).map((f) => ({ ...f, options: json(f.options, null) }));
  }

  get(accountId: number, id: number): CustomField {
    const f = this.ctx.db.prepare('SELECT * FROM custom_fields WHERE id = ? AND account_id = ?').get(id, accountId) as any;
    if (!f) throw notFound('El campo');
    return { ...f, options: json(f.options, null) };
  }

  byKey(accountId: number, key: string): CustomField | undefined {
    const f = this.ctx.db.prepare('SELECT * FROM custom_fields WHERE account_id = ? AND key = ?').get(accountId, key) as any;
    return f ? { ...f, options: json(f.options, null) } : undefined;
  }

  create(accountId: number, input: { label: string; key?: string; type?: CustomField['type']; options?: string[] | null }): CustomField {
    const label = input.label.trim();
    if (!label) throw invalid('El nombre del campo es obligatorio.');
    const key = slugKey(input.key || label);
    if (!key) throw invalid('Nombre de campo inválido.');
    if (BUILTIN_VARIABLES.some((v) => v.key === key)) throw invalid(`"${key}" es una variable reservada del sistema.`);
    if (this.byKey(accountId, key)) throw invalid(`Ya existe un campo con la clave "${key}".`);
    const type = input.type ?? 'text';
    if (type === 'select' && !input.options?.length) throw invalid('Un campo de selección necesita opciones.');
    const pos = (this.ctx.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 p FROM custom_fields WHERE account_id = ?').get(accountId) as { p: number }).p;
    const r = this.ctx.db
      .prepare('INSERT INTO custom_fields(account_id, key, label, type, options, position) VALUES (?,?,?,?,?,?)')
      .run(accountId, key, label, type, input.options?.length ? JSON.stringify(input.options) : null, pos);
    return this.get(accountId, Number(r.lastInsertRowid));
  }

  update(accountId: number, id: number, patch: { label?: string; options?: string[] | null; position?: number }) {
    this.get(accountId, id);
    this.ctx.db
      .prepare('UPDATE custom_fields SET label = COALESCE(?, label), options = COALESCE(?, options), position = COALESCE(?, position) WHERE id = ?')
      .run(patch.label?.trim() || null, patch.options ? JSON.stringify(patch.options) : null, patch.position ?? null, id);
    return this.get(accountId, id);
  }

  delete(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('DELETE FROM custom_fields WHERE id = ?').run(id);
  }

  valuesFor(contactId: number): Record<string, string | null> {
    const rows = this.ctx.db
      .prepare('SELECT f.key, v.value FROM contact_custom_fields v JOIN custom_fields f ON f.id = v.field_id WHERE v.contact_id = ?')
      .all(contactId) as { key: string; value: string | null }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  valuesForMany(contactIds: number[]): Map<number, Record<string, string | null>> {
    const map = new Map<number, Record<string, string | null>>();
    for (let i = 0; i < contactIds.length; i += 500) {
      const chunk = contactIds.slice(i, i + 500);
      if (!chunk.length) continue;
      const rows = this.ctx.db
        .prepare(`SELECT v.contact_id, f.key, v.value FROM contact_custom_fields v JOIN custom_fields f ON f.id = v.field_id WHERE v.contact_id IN (${chunk.map(() => '?').join(',')})`)
        .all(...chunk) as { contact_id: number; key: string; value: string | null }[];
      for (const r of rows) {
        if (!map.has(r.contact_id)) map.set(r.contact_id, {});
        map.get(r.contact_id)![r.key] = r.value;
      }
    }
    return map;
  }

  setValues(accountId: number, contactId: number, values: Record<string, string | number | null | undefined>) {
    const fields = new Map(this.list(accountId).map((f) => [f.key, f]));
    const up = this.ctx.db.prepare('INSERT INTO contact_custom_fields(contact_id, field_id, value) VALUES (?,?,?) ON CONFLICT(contact_id, field_id) DO UPDATE SET value = excluded.value');
    const del = this.ctx.db.prepare('DELETE FROM contact_custom_fields WHERE contact_id = ? AND field_id = ?');
    for (const [key, raw] of Object.entries(values)) {
      const f = fields.get(key);
      if (!f) continue;
      const v = raw === null || raw === undefined ? '' : String(raw).trim();
      if (!v) {
        del.run(contactId, f.id);
        continue;
      }
      if (f.type === 'number' && Number.isNaN(Number(v.replace(',', '.')))) throw invalid(`El campo "${f.label}" debe ser numérico.`);
      if (f.type === 'date' && Number.isNaN(Date.parse(v))) throw invalid(`El campo "${f.label}" debe ser una fecha válida (AAAA-MM-DD).`);
      if (f.type === 'select' && f.options && !f.options.includes(v)) throw invalid(`Valor no permitido para "${f.label}".`);
      up.run(contactId, f.id, f.type === 'number' ? String(Number(v.replace(',', '.'))) : v);
    }
  }
}

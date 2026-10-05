import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { json } from '../db/database';
import type { Segment, SegmentDefinition, SegmentRule } from '../../shared/types';

const TEXT_FIELDS: Record<string, string> = { name: 'c.name', phone: 'c.phone', email: 'c.email', company: 'c.company' };
const DATE_FIELDS: Record<string, string> = { last_message_at: 'c.last_message_at', last_inbound_at: 'c.last_inbound_at', created_at: 'c.created_at' };

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

/**
 * Convierte reglas de segmento en un WHERE parametrizado sobre el alias `c` (contacts).
 * Nunca se interpola texto del usuario en el SQL: todo va como parámetro.
 */
export function buildSegmentWhere(def: SegmentDefinition, now: Date): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const daysAgo = (n: unknown) => new Date(now.getTime() - Number(n) * 86400000).toISOString();

  for (const r of def.rules) {
    const v = r.value;
    if (r.field === 'tag') {
      const sub = 'EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)';
      parts.push(r.op === 'is_not' ? `NOT ${sub}` : sub);
      params.push(Number(v));
    } else if (TEXT_FIELDS[r.field]) {
      const col = TEXT_FIELDS[r.field];
      textOp(col, r, parts, params);
    } else if (DATE_FIELDS[r.field]) {
      const col = DATE_FIELDS[r.field];
      switch (r.op) {
        case 'older_than_days':
          parts.push(`(${col} IS NULL OR ${col} < ?)`);
          params.push(daysAgo(v));
          break;
        case 'within_days':
          parts.push(`${col} >= ?`);
          params.push(daysAgo(v));
          break;
        case 'before':
          parts.push(`${col} < ?`);
          params.push(new Date(String(v)).toISOString());
          break;
        case 'after':
          parts.push(`${col} > ?`);
          params.push(new Date(String(v)).toISOString());
          break;
        case 'is_empty':
          parts.push(`${col} IS NULL`);
          break;
        case 'not_empty':
          parts.push(`${col} IS NOT NULL`);
          break;
        default:
          throw invalid(`Operador no válido para fechas: ${r.op}`);
      }
    } else if (r.field === 'consent_status' || r.field === 'status') {
      parts.push(`c.${r.field} ${r.op === 'is_not' ? '!=' : '='} ?`);
      params.push(String(v));
    } else if (r.field === 'assigned_to') {
      if (r.op === 'is_empty') parts.push('c.assigned_to IS NULL');
      else if (r.op === 'not_empty') parts.push('c.assigned_to IS NOT NULL');
      else {
        parts.push(`COALESCE(c.assigned_to, 0) ${r.op === 'is_not' ? '!=' : '='} ?`);
        params.push(Number(v));
      }
    } else if (r.field === 'custom_field') {
      if (!r.fieldKey) throw invalid('Seleccione el campo personalizado.');
      const val = `(SELECT v.value FROM contact_custom_fields v JOIN custom_fields f ON f.id = v.field_id WHERE v.contact_id = c.id AND f.key = ? AND f.account_id = c.account_id)`;
      switch (r.op) {
        case 'is_empty':
          parts.push(`COALESCE(${val}, '') = ''`);
          params.push(r.fieldKey);
          break;
        case 'not_empty':
          parts.push(`COALESCE(${val}, '') != ''`);
          params.push(r.fieldKey);
          break;
        case 'gt':
        case 'lt':
          parts.push(`CAST(${val} AS REAL) ${r.op === 'gt' ? '>' : '<'} ?`);
          params.push(r.fieldKey, Number(v));
          break;
        case 'before':
        case 'after':
          parts.push(`${val} ${r.op === 'before' ? '<' : '>'} ?`);
          params.push(r.fieldKey, String(v));
          break;
        default:
          textOp(val, r, parts, params, [r.fieldKey]);
      }
    } else if (r.field === 'pipeline_stage') {
      const sub = 'EXISTS (SELECT 1 FROM contact_pipeline cp WHERE cp.contact_id = c.id AND cp.stage_id = ?)';
      parts.push(r.op === 'is_not' ? `NOT ${sub}` : sub);
      params.push(Number(v));
    } else if (r.field === 'campaign_received') {
      const sub = "EXISTS (SELECT 1 FROM campaign_recipients cr WHERE cr.contact_id = c.id AND cr.campaign_id = ? AND cr.status IN ('sent','delivered','read'))";
      parts.push(r.op === 'is_not' ? `NOT ${sub}` : sub);
      params.push(Number(v));
    } else if (r.field === 'replied') {
      // Interacción: el contacto escribió dentro de los últimos N días
      parts.push(r.op === 'older_than_days' ? '(c.last_inbound_at IS NULL OR c.last_inbound_at < ?)' : 'c.last_inbound_at >= ?');
      params.push(daysAgo(v ?? 30));
    } else {
      throw invalid(`Condición de segmento no soportada: ${r.field}`);
    }
  }
  if (!parts.length) return { sql: '1=1', params: [] };
  return { sql: '(' + parts.join(def.match === 'any' ? ' OR ' : ' AND ') + ')', params };
}

function textOp(col: string, r: SegmentRule, parts: string[], params: unknown[], pre: unknown[] = []) {
  const v = String(r.value ?? '');
  switch (r.op) {
    case 'contains':
      parts.push(`${col} LIKE ? ESCAPE '\\'`);
      params.push(...pre, `%${likeEscape(v)}%`);
      break;
    case 'not_contains':
      parts.push(`COALESCE(${col}, '') NOT LIKE ? ESCAPE '\\'`);
      params.push(...pre, `%${likeEscape(v)}%`);
      break;
    case 'starts_with':
      parts.push(`${col} LIKE ? ESCAPE '\\'`);
      params.push(...pre, `${likeEscape(v)}%`);
      break;
    case 'equals':
    case 'is':
      parts.push(`${col} = ? COLLATE NOCASE`);
      params.push(...pre, v);
      break;
    case 'not_equals':
    case 'is_not':
      parts.push(`COALESCE(${col}, '') != ? COLLATE NOCASE`);
      params.push(...pre, v);
      break;
    case 'is_empty':
      parts.push(`COALESCE(${col}, '') = ''`);
      params.push(...pre);
      break;
    case 'not_empty':
      parts.push(`COALESCE(${col}, '') != ''`);
      params.push(...pre);
      break;
    default:
      throw invalid(`Operador no válido para texto: ${r.op}`);
  }
}

export class SegmentService {
  constructor(private ctx: Ctx) {}

  private row(r: any): Segment {
    return { ...r, definition: json(r.definition, { match: 'all', rules: [] }) };
  }

  list(accountId: number): Segment[] {
    const rows = (this.ctx.db.prepare('SELECT * FROM segments WHERE account_id = ? ORDER BY name').all(accountId) as any[]).map((r) => this.row(r));
    for (const s of rows) {
      try {
        s.contact_count = this.count(accountId, s.definition);
      } catch {
        s.contact_count = 0;
      }
    }
    return rows;
  }

  get(accountId: number, id: number): Segment {
    const r = this.ctx.db.prepare('SELECT * FROM segments WHERE id = ? AND account_id = ?').get(id, accountId);
    if (!r) throw notFound('El segmento');
    return this.row(r);
  }

  validate(def: SegmentDefinition) {
    if (!def || !Array.isArray(def.rules)) throw invalid('Definición de segmento inválida.');
    if (def.rules.length > 30) throw invalid('Máximo 30 condiciones por segmento.');
    buildSegmentWhere(def, this.ctx.clock.now());
  }

  save(accountId: number, input: { id?: number; name: string; description?: string | null; definition: SegmentDefinition }, actorId?: number | null): Segment {
    const name = input.name.trim();
    if (!name) throw invalid('El segmento necesita un nombre.');
    this.validate(input.definition);
    const now = this.ctx.clock.now().toISOString();
    if (input.id) {
      this.get(accountId, input.id);
      this.ctx.db.prepare('UPDATE segments SET name = ?, description = ?, definition = ?, updated_at = ? WHERE id = ?').run(name, input.description ?? null, JSON.stringify(input.definition), now, input.id);
      return this.get(accountId, input.id);
    }
    const r = this.ctx.db
      .prepare('INSERT INTO segments(account_id, name, description, definition, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(accountId, name, input.description ?? null, JSON.stringify(input.definition), actorId ?? null, now, now);
    return this.get(accountId, Number(r.lastInsertRowid));
  }

  delete(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('DELETE FROM segments WHERE id = ?').run(id);
  }

  count(accountId: number, def: SegmentDefinition): number {
    const w = buildSegmentWhere(def, this.ctx.clock.now());
    return (this.ctx.db.prepare(`SELECT COUNT(*) n FROM contacts c WHERE c.account_id = ? AND c.status = 'active' AND ${w.sql}`).get(accountId, ...w.params) as { n: number }).n;
  }

  contactIds(accountId: number, def: SegmentDefinition): number[] {
    const w = buildSegmentWhere(def, this.ctx.clock.now());
    return (this.ctx.db.prepare(`SELECT c.id FROM contacts c WHERE c.account_id = ? AND c.status = 'active' AND ${w.sql} ORDER BY c.id`).all(accountId, ...w.params) as { id: number }[]).map((r) => r.id);
  }
}

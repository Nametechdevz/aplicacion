import fs from 'node:fs';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import type { Ctx } from '../context';
import { invalid } from '../core/errors';
import { randomId } from '../core/crypto';
import { normalizePhone } from '../../shared/phone';
import { normalizeText } from '../../shared/text';
import type { ContactFilter } from '../../shared/types';
import type { ContactService } from './contacts';
import type { TagService } from './tags';
import type { CustomFieldService } from './custom-fields';
import type { SettingsService } from './settings';
import type { HistoryService } from './history';

export type ImportField = 'name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'company' | 'tags' | 'ignore' | `custom:${string}`;

const ALIASES: Record<string, ImportField> = {
  nombre: 'name', name: 'name', 'nombre completo': 'name', cliente: 'name',
  'primer nombre': 'first_name', first_name: 'first_name',
  apellido: 'last_name', apellidos: 'last_name', last_name: 'last_name',
  telefono: 'phone', phone: 'phone', celular: 'phone', movil: 'phone', whatsapp: 'phone', numero: 'phone', 'numero de telefono': 'phone',
  email: 'email', correo: 'email', 'correo electronico': 'email', 'e-mail': 'email',
  empresa: 'company', company: 'company', compania: 'company',
  etiqueta: 'tags', etiquetas: 'tags', tag: 'tags', tags: 'tags',
};

export interface ImportRowIssue {
  row: number;
  kind: 'invalid_phone' | 'duplicate_file' | 'duplicate_existing' | 'incomplete' | 'invalid_email';
  message: string;
  value?: string;
}

export interface ImportAnalysis {
  headers: string[];
  mapping: Record<string, ImportField>;
  totalRows: number;
  valid: number;
  issues: ImportRowIssue[];
  counts: { invalid_phone: number; duplicate_file: number; duplicate_existing: number; incomplete: number; invalid_email: number };
  sample: Record<string, string>[];
}

const MAX_ROWS = 50000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Protección contra inyección de fórmulas al abrir el CSV en Excel. */
export function safeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export class ImportExportService {
  constructor(
    private ctx: Ctx,
    private contacts: ContactService,
    private tags: TagService,
    private fields: CustomFieldService,
    private settings: SettingsService,
    private history: HistoryService,
  ) {}

  private parse(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
    const st = fs.statSync(filePath);
    if (st.size > 30 * 1024 * 1024) throw invalid('El archivo CSV supera 30 MB.');
    const text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
    const headers = (res.meta.fields ?? []).filter(Boolean);
    if (!headers.length) throw invalid('El archivo no tiene encabezados. La primera fila debe contener los nombres de las columnas.');
    if (res.data.length > MAX_ROWS) throw invalid(`El archivo tiene ${res.data.length} filas; el máximo por importación es ${MAX_ROWS}.`);
    return { headers, rows: res.data };
  }

  suggestMapping(accountId: number, headers: string[]): Record<string, ImportField> {
    const fields = this.fields.list(accountId);
    const out: Record<string, ImportField> = {};
    for (const h of headers) {
      const n = normalizeText(h);
      const f = fields.find((x) => x.key === n.replace(/\s+/g, '_') || normalizeText(x.label) === n);
      out[h] = ALIASES[n] ?? (f ? (`custom:${f.key}` as ImportField) : 'ignore');
    }
    return out;
  }

  private analyzeRows(accountId: number, rows: Record<string, string>[], mapping: Record<string, ImportField>) {
    const phoneCol = Object.keys(mapping).find((h) => mapping[h] === 'phone');
    if (!phoneCol) throw invalid('Indique qué columna contiene el teléfono.');
    const cc = this.settings.get('general').defaultCountryCode;
    const seen = new Map<string, number>();
    const issues: ImportRowIssue[] = [];
    const parsed: { row: number; phone: string; data: Record<string, string>; existingId: number | null }[] = [];
    rows.forEach((r, i) => {
      const rowNum = i + 2; // +1 encabezado, +1 base 1
      const rawPhone = (r[phoneCol] ?? '').trim();
      if (!rawPhone) {
        issues.push({ row: rowNum, kind: 'incomplete', message: 'Fila sin teléfono' });
        return;
      }
      const ph = normalizePhone(rawPhone, cc);
      if (!ph.ok) {
        issues.push({ row: rowNum, kind: 'invalid_phone', message: ph.reason!, value: rawPhone });
        return;
      }
      const emailCol = Object.keys(mapping).find((h) => mapping[h] === 'email');
      if (emailCol && r[emailCol]?.trim() && !EMAIL_RE.test(r[emailCol].trim())) issues.push({ row: rowNum, kind: 'invalid_email', message: 'Email inválido (se importará sin email)', value: r[emailCol] });
      if (seen.has(ph.e164!)) {
        issues.push({ row: rowNum, kind: 'duplicate_file', message: `Número repetido (ya aparece en la fila ${seen.get(ph.e164!)})`, value: rawPhone });
        return;
      }
      seen.set(ph.e164!, rowNum);
      const existing = this.contacts.findByPhone(accountId, ph.e164!);
      if (existing) issues.push({ row: rowNum, kind: 'duplicate_existing', message: `Ya existe como "${existing.name ?? '+' + existing.phone}"`, value: rawPhone });
      parsed.push({ row: rowNum, phone: ph.e164!, data: r, existingId: existing?.id ?? null });
    });
    const counts = { invalid_phone: 0, duplicate_file: 0, duplicate_existing: 0, incomplete: 0, invalid_email: 0 };
    for (const is of issues) counts[is.kind]++;
    return { parsed, issues, counts };
  }

  analyze(accountId: number, filePath: string, mapping?: Record<string, ImportField>): ImportAnalysis {
    const { headers, rows } = this.parse(filePath);
    const map = mapping ?? this.suggestMapping(accountId, headers);
    const hasPhone = Object.values(map).includes('phone');
    const a = hasPhone ? this.analyzeRows(accountId, rows, map) : { parsed: [], issues: [], counts: { invalid_phone: 0, duplicate_file: 0, duplicate_existing: 0, incomplete: 0, invalid_email: 0 } };
    return {
      headers,
      mapping: map,
      totalRows: rows.length,
      valid: a.parsed.filter((p) => !p.existingId).length,
      issues: a.issues.slice(0, 500),
      counts: a.counts,
      sample: rows.slice(0, 5),
    };
  }

  execute(
    accountId: number,
    filePath: string,
    opts: { mapping: Record<string, ImportField>; updateExisting: boolean; tagIds?: number[]; consent?: 'unknown' | 'opted_in'; consentSource?: string; runAutomations?: boolean },
    actorId?: number | null,
  ) {
    const { rows } = this.parse(filePath);
    const { parsed, issues, counts } = this.analyzeRows(accountId, rows, opts.mapping);
    const batchId = 'imp_' + this.ctx.clock.now().toISOString().slice(0, 10) + '_' + randomId(4);
    const result = { batchId, created: 0, updated: 0, skipped: 0, failed: 0, issues: [...issues], counts };
    const colsOf = (f: ImportField) => Object.keys(opts.mapping).filter((h) => opts.mapping[h] === f);
    const val = (r: Record<string, string>, f: ImportField) => colsOf(f).map((h) => (r[h] ?? '').trim()).find(Boolean) ?? '';
    const tagCache = new Map<string, number>();
    const fieldKeys = new Set(this.fields.list(accountId).map((f) => f.key));
    for (const p of parsed) {
      try {
        const r = p.data;
        const custom: Record<string, string> = {};
        for (const [h, f] of Object.entries(opts.mapping)) if (f.startsWith('custom:') && fieldKeys.has(f.slice(7)) && r[h]?.trim()) custom[f.slice(7)] = r[h].trim();
        const email = val(r, 'email');
        const tagNames = colsOf('tags').flatMap((h) => (r[h] ?? '').split(/[;|,]/)).map((t) => t.trim()).filter(Boolean);
        const tagIds = [...(opts.tagIds ?? [])];
        for (const tn of tagNames) {
          const key = tn.toLowerCase();
          if (!tagCache.has(key)) tagCache.set(key, this.tags.ensure(accountId, tn.slice(0, 40)).id);
          tagIds.push(tagCache.get(key)!);
        }
        const base = {
          name: val(r, 'name') || null,
          first_name: val(r, 'first_name') || null,
          last_name: val(r, 'last_name') || null,
          email: email && EMAIL_RE.test(email) ? email : null,
          company: val(r, 'company') || null,
        };
        if (p.existingId) {
          if (!opts.updateExisting) {
            result.skipped++;
            continue;
          }
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(base)) if (v) patch[k] = v;
          if (Object.keys(custom).length) patch.custom = custom;
          this.contacts.update(accountId, p.existingId, patch as any, actorId);
          for (const t of new Set(tagIds)) this.tags.assign(accountId, [p.existingId], t, { actorId, source: 'import' });
          result.updated++;
        } else {
          this.contacts.create(
            accountId,
            { ...base, phone: p.phone, custom, tagIds: [...new Set(tagIds)], consent_status: opts.consent ?? 'unknown', consent_source: opts.consentSource ?? 'import_csv', source: opts.runAutomations ? 'import_auto' : 'import', import_batch_id: batchId },
            actorId,
          );
          result.created++;
        }
      } catch (e: any) {
        result.failed++;
        result.issues.push({ row: p.row, kind: 'incomplete', message: e?.userMessage ?? 'Error al importar la fila' });
      }
    }
    this.history.audit('contacts.import', { accountId, userId: actorId, details: { batchId, created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed } });
    this.ctx.log.info('application', `Importación ${batchId}: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} omitidos, ${result.failed} fallidos`);
    result.issues = result.issues.slice(0, 1000);
    return result;
  }

  importBatches(accountId: number) {
    return this.ctx.db
      .prepare("SELECT import_batch_id AS id, COUNT(*) AS count, MIN(created_at) AS created_at FROM contacts WHERE account_id = ? AND import_batch_id IS NOT NULL GROUP BY import_batch_id ORDER BY created_at DESC LIMIT 50")
      .all(accountId);
  }

  private rowsForExport(accountId: number, filter: ContactFilter) {
    const ids = this.contacts.ids(accountId, filter);
    const fields = this.fields.list(accountId);
    const header = ['nombre', 'apellido', 'nombre_completo', 'telefono', 'email', 'empresa', 'etiquetas', 'consentimiento', 'fuente_consentimiento', 'fecha_consentimiento', 'lista_negra', 'asignado_a', 'creado', 'ultimo_mensaje', ...fields.map((f) => f.key)];
    const out: string[][] = [];
    const custom = this.fields.valuesForMany(ids);
    const tagMap = this.tags.tagsFor(ids);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = this.ctx.db
        .prepare(`SELECT c.*, u.display_name AS assigned_name FROM contacts c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.id IN (${chunk.map(() => '?').join(',')}) ORDER BY c.id`)
        .all(...chunk) as any[];
      for (const c of rows) {
        out.push([
          c.first_name ?? '',
          c.last_name ?? '',
          c.name ?? '',
          '+' + c.phone,
          c.email ?? '',
          c.company ?? '',
          (tagMap.get(c.id) ?? []).map((t) => t.name).join('; '),
          c.consent_status,
          c.consent_source ?? '',
          c.consent_date ?? '',
          c.blacklisted ? 'sí' : 'no',
          c.assigned_name ?? '',
          c.created_at,
          c.last_message_at ?? '',
          ...fields.map((f) => custom.get(c.id)?.[f.key] ?? ''),
        ]);
      }
    }
    return { header, rows: out };
  }

  async exportContacts(accountId: number, filter: ContactFilter, format: 'csv' | 'xlsx', filePath: string, actorId?: number | null) {
    const { header, rows } = this.rowsForExport(accountId, filter);
    if (format === 'csv') {
      const csv = Papa.unparse({ fields: header, data: rows.map((r) => r.map(safeCell)) });
      fs.writeFileSync(filePath, '﻿' + csv, 'utf8');
    } else {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'WhatsApp CRM';
      const ws = wb.addWorksheet('Contactos');
      ws.addRow(header);
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(r.map(safeCell));
      ws.columns.forEach((col) => {
        col.width = 18;
      });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      await wb.xlsx.writeFile(filePath);
    }
    this.history.audit('contacts.export', { accountId, userId: actorId, details: { count: rows.length, format } });
    return { count: rows.length, filePath };
  }
}

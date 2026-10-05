import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { inList } from '../db/database';

export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > size && cur) {
      chunks.push(cur.trim());
      cur = cur.slice(-overlap) + '\n\n' + p;
    } else cur = cur ? cur + '\n\n' + p : p;
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size).trim());
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Convierte texto libre en una consulta FTS5 segura (solo palabras, entre comillas, unidas con OR). */
export function ftsQuery(q: string): string | null {
  const words = (q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9ñ]{3,}/g) ?? []).slice(0, 24);
  const stop = new Set(['que', 'para', 'con', 'los', 'las', 'del', 'una', 'por', 'como', 'esta', 'este', 'hola', 'buenas', 'quiero', 'tienen', 'tiene', 'cual', 'cuanto', 'the', 'and']);
  const useful = [...new Set(words.filter((w) => !stop.has(w)))];
  if (!useful.length) return null;
  return useful.map((w) => `"${w}"*`).join(' OR ');
}

/** Base de conocimiento: documentos (PDF/TXT/DOCX/FAQ) troceados e indexados con SQLite FTS5. */
export class KnowledgeService {
  constructor(private ctx: Ctx) {}

  bases(accountId: number) {
    return this.ctx.db
      .prepare(`SELECT kb.*, (SELECT COUNT(*) FROM knowledge_documents d WHERE d.knowledge_base_id = kb.id) AS document_count,
                (SELECT COALESCE(SUM(char_count),0) FROM knowledge_documents d WHERE d.knowledge_base_id = kb.id) AS char_count
                FROM knowledge_bases kb WHERE kb.account_id = ? ORDER BY kb.name`)
      .all(accountId);
  }

  private base(accountId: number, id: number) {
    const b = this.ctx.db.prepare('SELECT * FROM knowledge_bases WHERE id = ? AND account_id = ?').get(id, accountId);
    if (!b) throw notFound('La base de conocimiento');
    return b;
  }

  saveBase(accountId: number, input: { id?: number; name: string; description?: string | null }) {
    if (!input.name?.trim()) throw invalid('La base de conocimiento necesita un nombre.');
    if (input.id) {
      this.base(accountId, input.id);
      this.ctx.db.prepare('UPDATE knowledge_bases SET name = ?, description = ? WHERE id = ?').run(input.name.trim(), input.description ?? null, input.id);
      return input.id;
    }
    return Number(this.ctx.db.prepare('INSERT INTO knowledge_bases(account_id, name, description) VALUES (?,?,?)').run(accountId, input.name.trim(), input.description ?? null).lastInsertRowid);
  }

  deleteBase(accountId: number, id: number) {
    this.base(accountId, id);
    this.ctx.db.transaction(() => {
      this.ctx.db.prepare('DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?').run(id);
      this.ctx.db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id);
    })();
  }

  documents(accountId: number, kbId: number) {
    this.base(accountId, kbId);
    return this.ctx.db.prepare('SELECT id, knowledge_base_id, title, source_type, file_name, char_count, created_at, substr(content, 1, 400) AS excerpt FROM knowledge_documents WHERE knowledge_base_id = ? ORDER BY id DESC').all(kbId);
  }

  document(accountId: number, id: number) {
    const d = this.ctx.db.prepare('SELECT d.* FROM knowledge_documents d JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id WHERE d.id = ? AND kb.account_id = ?').get(id, accountId);
    if (!d) throw notFound('El documento');
    return d;
  }

  addText(accountId: number, kbId: number, input: { title: string; content: string; sourceType?: 'text' | 'faq' | 'txt' | 'pdf' | 'docx' | 'md'; fileName?: string | null }) {
    this.base(accountId, kbId);
    const content = input.content.trim();
    if (!content) throw invalid('El documento no contiene texto legible.');
    if (content.length > 2_000_000) throw invalid('El documento es demasiado grande (máx. 2 millones de caracteres).');
    const chunks = chunkText(content);
    return this.ctx.db.transaction(() => {
      const id = Number(
        this.ctx.db
          .prepare('INSERT INTO knowledge_documents(knowledge_base_id, title, source_type, file_name, content, char_count, created_at) VALUES (?,?,?,?,?,?,?)')
          .run(kbId, input.title.trim() || 'Documento', input.sourceType ?? 'text', input.fileName ?? null, content, content.length, this.ctx.clock.now().toISOString()).lastInsertRowid,
      );
      const ins = this.ctx.db.prepare('INSERT INTO knowledge_chunks(document_id, knowledge_base_id, ordinal, content) VALUES (?,?,?,?)');
      chunks.forEach((c, i) => ins.run(id, kbId, i, c));
      return id;
    })();
  }

  addFaq(accountId: number, kbId: number, title: string, items: { q: string; a: string }[]) {
    const valid = items.filter((i) => i.q?.trim() && i.a?.trim());
    if (!valid.length) throw invalid('Agregue al menos una pregunta con su respuesta.');
    const content = valid.map((i) => `Pregunta: ${i.q.trim()}\nRespuesta: ${i.a.trim()}`).join('\n\n');
    return this.addText(accountId, kbId, { title: title || 'Preguntas frecuentes', content, sourceType: 'faq' });
  }

  async addFile(accountId: number, kbId: number, filePath: string) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const st = fs.statSync(filePath);
    if (st.size > 30 * 1024 * 1024) throw invalid('El archivo supera 30 MB.');
    let text = '';
    if (ext === 'txt' || ext === 'md' || ext === 'csv') text = fs.readFileSync(filePath, 'utf8');
    else if (ext === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(filePath)) });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy?.();
      }
      if (!text.trim()) throw invalid('El PDF no contiene texto seleccionable (¿es un escaneo?). Conviértalo con OCR antes de cargarlo.');
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      text = (await (mammoth as any).extractRawText({ path: filePath })).value;
    } else throw invalid('Formato no soportado. Use PDF, DOCX, TXT o MD.');
    return this.addText(accountId, kbId, { title: path.basename(filePath, path.extname(filePath)), content: text, sourceType: ext === 'csv' ? 'txt' : (ext as any), fileName: path.basename(filePath) });
  }

  deleteDocument(accountId: number, id: number) {
    this.document(accountId, id);
    this.ctx.db.transaction(() => {
      this.ctx.db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(id);
      this.ctx.db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
    })();
  }

  search(kbIds: number[], query: string, k = 6): { content: string; title: string; score: number }[] {
    if (!kbIds.length) return [];
    const q = ftsQuery(query);
    if (!q) return [];
    return this.ctx.db
      .prepare(`SELECT kc.content, d.title, bm25(knowledge_fts) AS score FROM knowledge_fts JOIN knowledge_chunks kc ON kc.id = knowledge_fts.rowid
                JOIN knowledge_documents d ON d.id = kc.document_id
                WHERE knowledge_fts MATCH ? AND kc.knowledge_base_id IN ${inList(kbIds)} ORDER BY score LIMIT ?`)
      .all(q, ...kbIds, k) as { content: string; title: string; score: number }[];
  }
}

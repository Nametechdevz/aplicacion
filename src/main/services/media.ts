import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { sha256 } from '../core/crypto';
import { CLOUD_MEDIA_LIMITS } from '../whatsapp/provider';
import type { MediaItem } from '../../shared/types';

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4', amr: 'audio/amr',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};
const MIME_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_MIME).map(([e, m]) => [m, e]));

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export function mimeFromName(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

/**
 * Determina cómo se enviará un archivo por WhatsApp. Las imágenes WEBP/GIF no son imágenes válidas
 * para la Cloud API, así que se envían como documento (el destinatario recibe el archivo intacto).
 */
export function kindForMime(mime: string): MediaKind {
  if (CLOUD_MEDIA_LIMITS.image.mimeTypes!.includes(mime)) return 'image';
  if (CLOUD_MEDIA_LIMITS.video.mimeTypes!.includes(mime)) return 'video';
  if (CLOUD_MEDIA_LIMITS.audio.mimeTypes!.includes(mime)) return 'audio';
  return 'document';
}

function checkMagic(buf: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'application/pdf') return buf.subarray(0, 4).toString() === '%PDF';
  return true;
}

const fmtMB = (n: number) => (n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 0) + ' MB';

export class MediaService {
  constructor(private ctx: Ctx) {}

  private store(accountId: number, data: Buffer, ext: string) {
    const hash = sha256(data);
    const dir = path.join(this.ctx.paths.media, String(accountId));
    fs.mkdirSync(dir, { recursive: true });
    const rel = `${accountId}/${hash}${ext ? '.' + ext : ''}`;
    const file = path.join(this.ctx.paths.media, rel);
    if (!fs.existsSync(file)) fs.writeFileSync(file, data);
    // Se guarda la ruta RELATIVA a la carpeta de medios para que los backups sean portables.
    return { hash, file: rel };
  }

  importBuffer(accountId: number, data: Buffer, opts: { fileName: string; mimeType?: string; inLibrary?: boolean; title?: string | null; kind?: MediaKind; validate?: boolean }): MediaItem {
    const mime = opts.mimeType || mimeFromName(opts.fileName);
    const kind = opts.kind ?? kindForMime(mime);
    if (opts.validate !== false) {
      const lim = CLOUD_MEDIA_LIMITS[kind];
      if (data.length === 0) throw invalid('El archivo está vacío.');
      if (data.length > lim.maxBytes) throw invalid(`El archivo pesa ${fmtMB(data.length)}; el máximo para ${kind === 'image' ? 'imágenes' : kind === 'video' ? 'videos' : kind === 'audio' ? 'audios' : 'documentos'} en WhatsApp es ${fmtMB(lim.maxBytes)}.`);
      if (!checkMagic(data, mime)) throw invalid('El contenido del archivo no coincide con su extensión.');
    }
    const ext = path.extname(opts.fileName).slice(1).toLowerCase() || MIME_EXT[mime] || '';
    const { hash, file } = this.store(accountId, data, ext);
    if (opts.inLibrary) {
      const dup = this.ctx.db.prepare('SELECT id FROM media_library WHERE account_id = ? AND sha256 = ? AND in_library = 1').get(accountId, hash) as { id: number } | undefined;
      if (dup) return this.get(accountId, dup.id);
    }
    const r = this.ctx.db
      .prepare('INSERT INTO media_library(account_id, kind, file_name, file_path, mime_type, size, sha256, title, in_library, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(accountId, kind, path.basename(opts.fileName).slice(0, 200), file, mime, data.length, hash, opts.title ?? null, opts.inLibrary ? 1 : 0, this.ctx.clock.now().toISOString());
    return this.get(accountId, Number(r.lastInsertRowid));
  }

  importFile(accountId: number, srcPath: string, opts: { inLibrary?: boolean; title?: string | null } = {}): MediaItem {
    const st = fs.statSync(srcPath);
    if (!st.isFile()) throw invalid('Ruta de archivo inválida.');
    if (st.size > 100 * 1024 * 1024) throw invalid('El archivo supera el máximo de 100 MB.');
    return this.importBuffer(accountId, fs.readFileSync(srcPath), { fileName: path.basename(srcPath), inLibrary: opts.inLibrary, title: opts.title });
  }

  get(accountId: number, id: number): MediaItem & { file_path: string; provider_media_id: string | null; provider_media_uploaded_at: string | null } {
    const m = this.ctx.db.prepare('SELECT * FROM media_library WHERE id = ? AND account_id = ?').get(id, accountId) as any;
    if (!m) throw notFound('El archivo');
    return { ...m, file_path: this.abs(m.file_path) };
  }

  abs(p: string) {
    return path.isAbsolute(p) ? p : path.join(this.ctx.paths.media, p);
  }

  getAny(id: number) {
    const m = this.ctx.db.prepare('SELECT * FROM media_library WHERE id = ?').get(id) as (MediaItem & { file_path: string; account_id: number }) | undefined;
    return m ? { ...m, file_path: this.abs(m.file_path) } : undefined;
  }

  list(accountId: number, kind?: string): MediaItem[] {
    return this.ctx.db
      .prepare(`SELECT m.id, m.account_id, m.kind, m.file_name, m.mime_type, m.size, m.title, m.created_at,
                  (SELECT COUNT(*) FROM campaigns c WHERE c.media_id = m.id) + (SELECT COUNT(*) FROM templates t WHERE t.media_id = m.id) + (SELECT COUNT(*) FROM messages x WHERE x.media_id = m.id) AS usage_count
                FROM media_library m WHERE m.account_id = ? AND m.in_library = 1 ${kind ? 'AND m.kind = ?' : ''} ORDER BY m.id DESC`)
      .all(...(kind ? [accountId, kind] : [accountId])) as MediaItem[];
  }

  rename(accountId: number, id: number, title: string) {
    this.get(accountId, id);
    this.ctx.db.prepare('UPDATE media_library SET title = ? WHERE id = ?').run(title.trim().slice(0, 120) || null, id);
  }

  delete(accountId: number, id: number) {
    const m = this.get(accountId, id);
    const busy = this.ctx.db
      .prepare(`SELECT
        (SELECT COUNT(*) FROM campaigns WHERE media_id = ? AND status IN ('draft','scheduled','running','paused')) +
        (SELECT COUNT(*) FROM message_queue WHERE media_id = ? AND status IN ('queued','sending')) +
        (SELECT COUNT(*) FROM scheduled_messages WHERE media_id = ? AND status = 'scheduled') AS n`)
      .get(id, id, id) as { n: number };
    if (busy.n > 0) throw invalid('Este archivo está en uso por campañas o envíos pendientes. Quítelo de ellos antes de eliminarlo.');
    const usedInHistory = (this.ctx.db.prepare('SELECT COUNT(*) n FROM messages WHERE media_id = ?').get(id) as { n: number }).n;
    if (usedInHistory) {
      // Se conserva el archivo para el historial de conversaciones, pero sale de la biblioteca.
      this.ctx.db.prepare('UPDATE media_library SET in_library = 0 WHERE id = ?').run(id);
      return;
    }
    const rel = (this.ctx.db.prepare('SELECT file_path FROM media_library WHERE id = ?').get(id) as { file_path: string }).file_path;
    this.ctx.db.prepare('DELETE FROM media_library WHERE id = ?').run(id);
    const stillUsed = this.ctx.db.prepare('SELECT 1 FROM media_library WHERE file_path = ?').get(rel);
    if (!stillUsed) fs.rmSync(m.file_path, { force: true });
  }

  /** Guarda el id de multimedia del proveedor para reutilizarlo (Cloud API: válido ~30 días). */
  rememberProviderId(id: number, providerMediaId: string) {
    this.ctx.db.prepare('UPDATE media_library SET provider_media_id = ?, provider_media_uploaded_at = ? WHERE id = ?').run(providerMediaId, this.ctx.clock.now().toISOString(), id);
  }

  reusableProviderId(m: { provider_media_id: string | null; provider_media_uploaded_at: string | null }): string | null {
    if (!m.provider_media_id || !m.provider_media_uploaded_at) return null;
    const age = this.ctx.clock.now().getTime() - new Date(m.provider_media_uploaded_at).getTime();
    return age < 25 * 86400000 ? m.provider_media_id : null;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Ctx } from '../context';
import { invalid } from '../core/errors';
import { MIGRATIONS } from '../db/schema';
import type { SettingsService } from './settings';

export interface BackupManifest {
  app: 'whatsapp-crm';
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  includesMedia: boolean;
  secretsBackend: string;
}

const PENDING_DIR = 'restore-pending';

/**
 * Copias de seguridad completas: base de datos (contactos, campañas, automatizaciones, plantillas,
 * configuración…) + archivos multimedia, en un único .zip. La restauración se aplica al reiniciar.
 */
export class BackupService {
  constructor(private ctx: Ctx, private settings: SettingsService, private appVersion: string) {}

  private stamp() {
    return this.ctx.clock.now().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async create(opts: { destPath?: string; includeMedia?: boolean; auto?: boolean } = {}): Promise<{ file: string; size: number }> {
    fs.mkdirSync(this.ctx.paths.backups, { recursive: true });
    const file = opts.destPath ?? path.join(this.ctx.paths.backups, `${opts.auto ? 'auto' : 'backup'}-${this.stamp()}.wcrm.zip`);
    const tmpDb = path.join(this.ctx.paths.temp, `snapshot-${Date.now()}.db`);
    fs.mkdirSync(this.ctx.paths.temp, { recursive: true });
    await this.ctx.db.backup(tmpDb); // copia consistente en caliente (API de SQLite)
    const manifest: BackupManifest = {
      app: 'whatsapp-crm',
      appVersion: this.appVersion,
      schemaVersion: MIGRATIONS.length,
      createdAt: this.ctx.clock.now().toISOString(),
      includesMedia: opts.includeMedia !== false,
      secretsBackend: this.ctx.secrets.backend,
    };
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addLocalFile(tmpDb, '', 'data.db');
    if (manifest.includesMedia && fs.existsSync(this.ctx.paths.media)) zip.addLocalFolder(this.ctx.paths.media, 'media');
    zip.writeZip(file);
    fs.rmSync(tmpDb, { force: true });
    const size = fs.statSync(file).size;
    this.ctx.log.info('application', `Backup creado: ${path.basename(file)} (${Math.round(size / 1024)} KB)`);
    return { file, size };
  }

  list() {
    if (!fs.existsSync(this.ctx.paths.backups)) return [];
    return fs
      .readdirSync(this.ctx.paths.backups)
      .filter((f) => f.endsWith('.wcrm.zip'))
      .map((f) => {
        const st = fs.statSync(path.join(this.ctx.paths.backups, f));
        return { name: f, path: path.join(this.ctx.paths.backups, f), size: st.size, created_at: st.mtime.toISOString(), auto: f.startsWith('auto-') };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  delete(name: string) {
    if (!/^[\w.-]+\.wcrm\.zip$/.test(name)) throw invalid('Nombre de backup inválido.');
    fs.rmSync(path.join(this.ctx.paths.backups, name), { force: true });
  }

  /** Backup automático periódico con retención. */
  async autoBackupIfDue() {
    const s = this.settings.get('backup');
    if (!s.autoEnabled) return null;
    const last = s.lastAutoBackupAt ? new Date(s.lastAutoBackupAt).getTime() : 0;
    if (this.ctx.clock.now().getTime() - last < s.intervalHours * 3600000) return null;
    const r = await this.create({ auto: true, includeMedia: true });
    this.settings.set('backup', { lastAutoBackupAt: this.ctx.clock.now().toISOString() });
    const autos = this.list().filter((b) => b.auto);
    for (const b of autos.slice(Math.max(1, s.keep))) fs.rmSync(b.path, { force: true });
    return r;
  }

  /** Valida el archivo y lo deja preparado; se aplica en el próximo inicio (la BD está abierta ahora). */
  stageRestore(zipPath: string): BackupManifest {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      throw invalid('El archivo no es un backup válido.');
    }
    const mEntry = zip.getEntry('manifest.json');
    const dbEntry = zip.getEntry('data.db');
    if (!mEntry || !dbEntry) throw invalid('El archivo no es un backup de WhatsApp CRM.');
    const manifest = JSON.parse(mEntry.getData().toString('utf8')) as BackupManifest;
    if (manifest.app !== 'whatsapp-crm') throw invalid('El archivo no es un backup de WhatsApp CRM.');
    if (manifest.schemaVersion > MIGRATIONS.length) throw invalid('El backup fue creado con una versión más nueva de la aplicación. Actualice antes de restaurar.');
    const dir = path.join(this.ctx.paths.userData, PENDING_DIR);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const e of zip.getEntries()) {
      const target = path.resolve(dir, e.entryName);
      if (!target.startsWith(path.resolve(dir) + path.sep)) throw invalid('El backup contiene rutas inválidas.'); // zip-slip
    }
    zip.extractAllTo(dir, true);
    this.ctx.log.info('application', `Restauración preparada desde backup del ${manifest.createdAt}`);
    return manifest;
  }
}

/**
 * Aplica una restauración pendiente ANTES de abrir la base de datos. La BD actual se conserva como
 * copia `pre-restore-*.db` por seguridad.
 */
export function applyPendingRestore(userData: string, dbFile: string, mediaDir: string, backupsDir: string): boolean {
  const dir = path.join(userData, PENDING_DIR);
  const newDb = path.join(dir, 'data.db');
  if (!fs.existsSync(newDb)) return false;
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(dbFile)) fs.copyFileSync(dbFile, path.join(backupsDir, `pre-restore-${ts}.db`));
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
  fs.copyFileSync(newDb, dbFile);
  const media = path.join(dir, 'media');
  if (fs.existsSync(media)) fs.cpSync(media, mediaDir, { recursive: true, force: false, errorOnExist: false });
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

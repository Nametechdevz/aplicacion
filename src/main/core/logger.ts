import fs from 'node:fs';
import path from 'node:path';

export type LogCategory = 'application' | 'whatsapp' | 'campaigns' | 'automation' | 'errors';
type Level = 'debug' | 'info' | 'warn' | 'error';

const SECRET_PATTERNS: [RegExp, string][] = [
  [/(Bearer\s+)[A-Za-z0-9._\-]+/g, '$1[REDACTED]'],
  [/\bEAA[A-Za-z0-9]{20,}\b/g, '[REDACTED_TOKEN]'],
  [/\bsk-ant-[A-Za-z0-9_\-]+/g, '[REDACTED_KEY]'],
  [/("?(?:access_?token|accessToken|appSecret|app_secret|apiKey|api_key|password|verifyToken)"?\s*[:=]\s*)"[^"]*"/gi, '$1"[REDACTED]"'],
  // Teléfonos: deja visibles solo los últimos 4 dígitos
  [/\+?\b(\d{2})\d{4,9}(\d{4})\b/g, '+$1****$2'],
];

export function redact(s: string): string {
  let out = s;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export interface LoggerOptions {
  dir: string | null; // null = sin archivos (pruebas)
  maxBytes?: number;
  maxFiles?: number;
  console?: boolean;
}

/** Logger con archivos por categoría y rotación por tamaño. Nunca registra cuerpos de mensajes. */
export class Logger {
  private maxBytes: number;
  private maxFiles: number;
  constructor(private opts: LoggerOptions) {
    this.maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
    this.maxFiles = opts.maxFiles ?? 5;
    if (opts.dir) for (const c of ['application', 'whatsapp', 'campaigns', 'automation', 'errors']) fs.mkdirSync(path.join(opts.dir, c), { recursive: true });
  }

  get dir() {
    return this.opts.dir;
  }

  private file(cat: LogCategory) {
    return path.join(this.opts.dir!, cat, `${cat}.log`);
  }

  private rotate(file: string) {
    try {
      const st = fs.statSync(file);
      if (st.size < this.maxBytes) return;
    } catch {
      return;
    }
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = `${file}.${i}`;
      if (fs.existsSync(src)) {
        if (i === this.maxFiles - 1) fs.rmSync(src);
        else fs.renameSync(src, `${file}.${i + 1}`);
      }
    }
    fs.renameSync(file, `${file}.1`);
  }

  write(cat: LogCategory, level: Level, msg: string, meta?: unknown) {
    let metaStr = '';
    if (meta !== undefined) {
      if (meta instanceof Error) metaStr = ` ${meta.name}: ${meta.message}${meta.stack ? '\n' + meta.stack : ''}`;
      else {
        try {
          metaStr = ' ' + JSON.stringify(meta);
        } catch {
          metaStr = ' [meta no serializable]';
        }
      }
    }
    const line = redact(`${new Date().toISOString()} [${level.toUpperCase()}] ${msg}${metaStr}`) + '\n';
    if (this.opts.console) process.stdout.write(`[${cat}] ${line}`);
    if (!this.opts.dir) return;
    try {
      const f = this.file(cat);
      this.rotate(f);
      fs.appendFileSync(f, line);
      if (level === 'error' && cat !== 'errors') {
        const ef = this.file('errors');
        this.rotate(ef);
        fs.appendFileSync(ef, `[${cat}] ${line}`);
      }
    } catch {
      /* el log nunca debe romper la app */
    }
  }

  info(cat: LogCategory, msg: string, meta?: unknown) {
    this.write(cat, 'info', msg, meta);
  }
  warn(cat: LogCategory, msg: string, meta?: unknown) {
    this.write(cat, 'warn', msg, meta);
  }
  error(cat: LogCategory, msg: string, meta?: unknown) {
    this.write(cat, 'error', msg, meta);
  }
  debug(cat: LogCategory, msg: string, meta?: unknown) {
    if (process.env.WCRM_DEBUG) this.write(cat, 'debug', msg, meta);
  }
}

import crypto from 'node:crypto';
import fs from 'node:fs';

/** Cifrado de secretos (tokens de WhatsApp, API keys). */
export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
  readonly backend: string;
}

/** Interfaz mínima de Electron.safeStorage para no acoplar este módulo a Electron. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}

/**
 * Usa safeStorage de Electron (DPAPI en Windows) cuando está disponible; si no, AES-256-GCM con una
 * clave local aleatoria guardada en el perfil del usuario (permisos 0600).
 */
export function createSecretBox(opts: { safeStorage?: SafeStorageLike | null; keyFile?: string; key?: Buffer }): SecretBox {
  const ss = opts.safeStorage && opts.safeStorage.isEncryptionAvailable() ? opts.safeStorage : null;
  let key: Buffer | null = opts.key ?? null;
  const getKey = () => {
    if (key) return key;
    if (!opts.keyFile) throw new Error('No hay clave de cifrado disponible');
    if (fs.existsSync(opts.keyFile)) key = Buffer.from(fs.readFileSync(opts.keyFile, 'utf8'), 'base64');
    else {
      key = crypto.randomBytes(32);
      fs.writeFileSync(opts.keyFile, key.toString('base64'), { mode: 0o600 });
    }
    return key;
  };
  const gcmEncrypt = (plain: string) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return 'gcm:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
  };
  const gcmDecrypt = (s: string) => {
    const raw = Buffer.from(s.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', getKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  };
  return {
    backend: ss ? 'safeStorage' : 'aes-256-gcm',
    encrypt(plain: string) {
      if (ss) return 'ss:' + ss.encryptString(plain).toString('base64');
      return gcmEncrypt(plain);
    },
    decrypt(cipher: string) {
      if (cipher.startsWith('ss:')) {
        if (!ss) throw new Error('Los secretos fueron cifrados en otro equipo/usuario y no pueden descifrarse aquí.');
        return ss.decryptString(Buffer.from(cipher.slice(3), 'base64'));
      }
      if (cipher.startsWith('gcm:')) return gcmDecrypt(cipher);
      throw new Error('Formato de secreto desconocido');
    },
  };
}

const SCRYPT_N = 16384;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export const randomId = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (buf: Buffer | string) => crypto.createHash('sha256').update(buf).digest('hex');

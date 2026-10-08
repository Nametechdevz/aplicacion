import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb, nowIso } from '../db';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
}

interface UserRow extends User {
  password_hash: string;
  failed_logins: number;
  locked_until: string | null;
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

function toUser(r: UserRow): User {
  return { id: r.id, email: r.email, name: r.name, role: r.role, created_at: r.created_at };
}

export function countUsers(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as UserRow | undefined;
}

export function getUserById(id: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function getPasswordHash(id: string): string | null {
  const r = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as { password_hash: string } | undefined;
  return r?.password_hash ?? null;
}

/** Crea un usuario. El primero de la instalación es administrador. */
export function createUser(input: { email: string; name: string; passwordHash: string }): User {
  const db = getDb();
  return db.transaction(() => {
    const role = countUsers() === 0 ? 'admin' : 'user';
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, input.email.trim().toLowerCase(), input.name.trim(), input.passwordHash, role, now, now);
    return getUserById(id)!;
  })();
}

export function updateUserProfile(id: string, name: string): void {
  getDb().prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), nowIso(), id);
}

export function updatePasswordHash(id: string, hash: string): void {
  getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, nowIso(), id);
}

export function isLocked(row: UserRow): boolean {
  return Boolean(row.locked_until && new Date(row.locked_until).getTime() > Date.now());
}

export function registerFailedLogin(row: UserRow): void {
  const failed = row.failed_logins + 1;
  const lockedUntil = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  getDb()
    .prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
    .run(lockedUntil ? 0 : failed, lockedUntil, row.id);
}

export function clearFailedLogins(id: string): void {
  getDb().prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}): {
  token: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  getDb()
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(hashToken(token), userId, now.toISOString(), expiresAt.toISOString(), now.toISOString(), meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null);
  return { token, expiresAt };
}

export function getUserBySessionToken(token: string | undefined | null): User | null {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, s.id AS session_id, s.expires_at, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(hashToken(token)) as (UserRow & { session_id: string; expires_at: string; last_seen_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  // Actualiza la última actividad como máximo una vez por minuto.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  }
  return toUser(row);
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function deleteOtherSessions(userId: string, keepToken: string | null): number {
  const res = keepToken
    ? getDb().prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, hashToken(keepToken))
    : getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return res.changes;
}

export function purgeExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

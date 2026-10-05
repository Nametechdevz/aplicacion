import type { Ctx } from '../context';
import { hashPassword, verifyPassword } from '../core/crypto';
import { AppError, invalid, notFound } from '../core/errors';
import { ROLE_PERMISSIONS, type Permission, type Role } from '../../shared/permissions';
import type { SessionUser } from '../../shared/types';
import { json } from '../db/database';
import type { HistoryService } from './history';

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
  extra_permissions: string | null;
  active: number;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

const MAX_ATTEMPTS = 5;

export class UserService {
  constructor(private ctx: Ctx, private history: HistoryService) {}

  hasUsers(): boolean {
    return !!this.ctx.db.prepare('SELECT 1 FROM users LIMIT 1').get();
  }

  toSession(u: UserRow): SessionUser {
    const extra = json<Permission[]>(u.extra_permissions, []);
    return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, permissions: [...new Set([...ROLE_PERMISSIONS[u.role], ...extra])] };
  }

  validatePassword(pw: string) {
    if (pw.length < 8) throw invalid('La contraseña debe tener al menos 8 caracteres.');
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw invalid('La contraseña debe combinar letras y números.');
  }

  create(input: { username: string; display_name: string; password: string; role: Role; extra_permissions?: Permission[] }, actorId?: number | null) {
    const username = input.username.trim();
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw invalid('El usuario debe tener 3–32 caracteres (letras, números, . _ -).');
    this.validatePassword(input.password);
    if (this.ctx.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw invalid('Ese nombre de usuario ya existe.');
    const r = this.ctx.db
      .prepare('INSERT INTO users(username, display_name, password_hash, role, extra_permissions, created_at) VALUES (?,?,?,?,?,?)')
      .run(username, input.display_name.trim() || username, hashPassword(input.password), input.role, input.extra_permissions?.length ? JSON.stringify(input.extra_permissions) : null, this.ctx.clock.now().toISOString());
    const id = Number(r.lastInsertRowid);
    this.history.audit('user.create', { userId: actorId, entityType: 'user', entityId: id, details: { username, role: input.role } });
    return this.get(id);
  }

  get(id: number) {
    const u = this.ctx.db.prepare('SELECT id, username, display_name, role, extra_permissions, active, last_login_at, created_at FROM users WHERE id = ?').get(id) as any;
    if (!u) throw notFound('El usuario');
    return { ...u, extra_permissions: json(u.extra_permissions, []) };
  }

  list() {
    return (this.ctx.db.prepare('SELECT id, username, display_name, role, extra_permissions, active, last_login_at, created_at FROM users ORDER BY id').all() as any[]).map((u) => ({
      ...u,
      extra_permissions: json(u.extra_permissions, []),
    }));
  }

  update(id: number, patch: { display_name?: string; role?: Role; active?: boolean; password?: string; extra_permissions?: Permission[] }, actorId?: number | null) {
    const cur = this.ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!cur) throw notFound('El usuario');
    if ((patch.role && patch.role !== 'admin') || patch.active === false) {
      if (cur.role === 'admin') {
        const admins = (this.ctx.db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(id) as { c: number }).c;
        if (admins === 0) throw invalid('Debe existir al menos un administrador activo.');
      }
    }
    if (patch.password) this.validatePassword(patch.password);
    this.ctx.db
      .prepare(`UPDATE users SET display_name = COALESCE(?, display_name), role = COALESCE(?, role), active = COALESCE(?, active),
                password_hash = COALESCE(?, password_hash), extra_permissions = COALESCE(?, extra_permissions), failed_attempts = CASE WHEN ? IS NOT NULL THEN 0 ELSE failed_attempts END,
                locked_until = CASE WHEN ? IS NOT NULL THEN NULL ELSE locked_until END WHERE id = ?`)
      .run(patch.display_name ?? null, patch.role ?? null, patch.active === undefined ? null : patch.active ? 1 : 0, patch.password ? hashPassword(patch.password) : null, patch.extra_permissions ? JSON.stringify(patch.extra_permissions) : null, patch.password ?? null, patch.password ?? null, id);
    this.history.audit('user.update', { userId: actorId, entityType: 'user', entityId: id, details: { ...patch, password: patch.password ? '***' : undefined } });
    return this.get(id);
  }

  /** Autenticación con bloqueo temporal tras intentos fallidos (protección contra fuerza bruta). */
  login(username: string, password: string): SessionUser {
    const now = this.ctx.clock.now();
    const u = this.ctx.db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim()) as UserRow | undefined;
    const fail = () => new AppError('AUTH_FAILED', 'Usuario o contraseña incorrectos.');
    if (!u || !u.active) {
      // Igualar el tiempo de respuesta para no revelar si el usuario existe
      verifyPassword(password, 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
      throw fail();
    }
    if (u.locked_until && new Date(u.locked_until) > now) {
      const mins = Math.ceil((new Date(u.locked_until).getTime() - now.getTime()) / 60000);
      throw new AppError('AUTH_LOCKED', `Demasiados intentos fallidos. Intente de nuevo en ${mins} minuto(s).`);
    }
    if (!verifyPassword(password, u.password_hash)) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + Math.min(30, 2 ** (attempts - MAX_ATTEMPTS)) * 60000).toISOString() : null;
      this.ctx.db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lock, u.id);
      this.history.audit('auth.failed', { userId: u.id, details: { attempts } });
      throw fail();
    }
    this.ctx.db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(now.toISOString(), u.id);
    this.history.audit('auth.login', { userId: u.id });
    return this.toSession(u);
  }

  sessionFor(id: number): SessionUser | null {
    const u = this.ctx.db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(id) as UserRow | undefined;
    return u ? this.toSession(u) : null;
  }

  changeOwnPassword(id: number, current: string, next: string) {
    const u = this.ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!u || !verifyPassword(current, u.password_hash)) throw new AppError('AUTH_FAILED', 'La contraseña actual no es correcta.');
    this.validatePassword(next);
    this.ctx.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), id);
    this.history.audit('auth.password_changed', { userId: id });
  }
}

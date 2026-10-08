import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { PublicUser, Role, UserStatus, Vehicle } from '../../shared/types';
import type { DB } from './db';
import { conflict, forbidden, unauthorized } from './errors';

export interface UserRow {
  id: number;
  role: Role;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  status: UserStatus;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  rating_sum: number;
  rating_count: number;
  created_at: string;
}

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  status: UserStatus;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function vehicleOf(row: UserRow): Vehicle | null {
  if (row.role !== 'driver' || !row.vehicle_plate) return null;
  return {
    make: row.vehicle_make ?? '',
    model: row.vehicle_model ?? '',
    plate: row.vehicle_plate,
    color: row.vehicle_color ?? '',
  };
}

export function ratingOf(row: Pick<UserRow, 'rating_sum' | 'rating_count'>): number | null {
  return row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    rating: ratingOf(row),
    ratingCount: row.rating_count,
    vehicle: vehicleOf(row),
    createdAt: row.created_at,
  };
}

export function getUser(db: DB, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByEmail(db: DB, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined;
}

export interface NewUser {
  role: Role;
  name: string;
  email: string;
  phone: string;
  password: string;
  status: UserStatus;
  vehicle?: Vehicle | null;
}

export function createUser(db: DB, u: NewUser): UserRow {
  if (getUserByEmail(db, u.email)) throw conflict('Ya existe una cuenta con ese correo.');
  const hash = bcrypt.hashSync(u.password, 10);
  const res = db
    .prepare(
      `INSERT INTO users (role, name, email, phone, password_hash, status, vehicle_make, vehicle_model, vehicle_plate, vehicle_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      u.role,
      u.name.trim(),
      u.email.toLowerCase().trim(),
      u.phone.trim(),
      hash,
      u.status,
      u.vehicle?.make ?? null,
      u.vehicle?.model ?? null,
      u.vehicle?.plate.toUpperCase() ?? null,
      u.vehicle?.color ?? null,
    );
  return getUser(db, Number(res.lastInsertRowid))!;
}

export function verifyPassword(row: UserRow, password: string): boolean {
  return bcrypt.compareSync(password, row.password_hash);
}

/**
 * Crea la cuenta de la central si no existe. Si ya existe y ADMIN_PASSWORD cambió, actualiza la contraseña:
 * así se puede cambiar (o recuperar) editando el archivo .env y reiniciando.
 */
export function ensureAdmin(db: DB, email: string, password: string, name: string): void {
  const existing = getUserByEmail(db, email);
  if (!password) {
    if (!existing) console.warn('[admin] ADMIN_PASSWORD no definido: no se crea la cuenta de la central.');
    return;
  }
  if (!existing) {
    createUser(db, { role: 'admin', name, email, phone: '', password, status: 'active' });
    console.log(`[admin] Cuenta de la central creada: ${email}`);
    return;
  }
  if (existing.role === 'admin' && !verifyPassword(existing, password)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), existing.id);
    console.log(`[admin] Contraseña de la central actualizada desde ADMIN_PASSWORD (${email}).`);
  }
}

export function signToken(secret: string, user: Pick<UserRow, 'id' | 'role'>): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, secret, { expiresIn: '30d' });
}

/** Valida el token y comprueba en la base de datos que la cuenta siga existiendo y no esté bloqueada. */
export function authenticateToken(db: DB, secret: string, token: string | undefined): AuthUser {
  if (!token) throw unauthorized();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret) as jwt.JwtPayload;
  } catch {
    throw unauthorized();
  }
  const row = getUser(db, Number(payload.sub));
  if (!row) throw unauthorized();
  if (row.status === 'blocked') throw forbidden('Tu cuenta está bloqueada. Contacta con el administrador.');
  return { id: row.id, role: row.role, name: row.name, status: row.status };
}

export function authMiddleware(db: DB, secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.user = authenticateToken(db, secret, token);
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export function addRating(db: DB, userId: number, stars: number): void {
  db.prepare('UPDATE users SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?').run(stars, userId);
}

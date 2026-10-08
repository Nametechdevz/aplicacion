#!/usr/bin/env node
// Restablece la contraseña de un usuario desde el servidor (no hay recuperación por email).
// Uso: npm run user:reset-password -- usuario@email.com "NuevaContraseña123"
import Database from 'better-sqlite3';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run user:reset-password -- <email> <nueva-contraseña>');
  process.exit(1);
}
if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
  console.error('La contraseña debe tener al menos 10 caracteres e incluir letras y números.');
  process.exit(1);
}
const file = path.resolve(process.env.DATABASE_PATH || './data/promptforge.db');
const db = new Database(file, { fileMustExist: true });
const N = 131072, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
const hash = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
if (!user) {
  console.error(`No existe ningún usuario con el email ${email}`);
  process.exit(1);
}
db.transaction(() => {
  db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  db.prepare("INSERT INTO audit_logs (user_id, action, detail, created_at) VALUES (?, 'auth.password_changed', 'reset_cli', ?)").run(user.id, new Date().toISOString());
})();
console.log(`Contraseña restablecida para ${email}. Se cerraron todas sus sesiones.`);

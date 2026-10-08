import { describe, expect, it } from 'vitest';
import { openDb } from '../server/src/db';
import { ensureAdmin, getUserByEmail, verifyPassword } from '../server/src/users';

describe('cuenta de la central', () => {
  it('se crea con ADMIN_PASSWORD y se actualiza si la contraseña cambia', () => {
    const db = openDb(':memory:');
    ensureAdmin(db, 'central@test.local', 'primera-123', 'Central');
    const a = getUserByEmail(db, 'central@test.local')!;
    expect(a.role).toBe('admin');
    expect(verifyPassword(a, 'primera-123')).toBe(true);

    ensureAdmin(db, 'central@test.local', 'segunda-456', 'Central');
    const b = getUserByEmail(db, 'central@test.local')!;
    expect(b.id).toBe(a.id);
    expect(verifyPassword(b, 'segunda-456')).toBe(true);
    expect(verifyPassword(b, 'primera-123')).toBe(false);
  });

  it('no crea la cuenta sin contraseña', () => {
    const db = openDb(':memory:');
    ensureAdmin(db, 'central@test.local', '', 'Central');
    expect(getUserByEmail(db, 'central@test.local')).toBeUndefined();
  });
});

import { NextResponse } from 'next/server';
import { clientIp, enforceRateLimit, HttpError, readJson, requireApiUser, route, sessionTokenFrom } from '@/lib/server/http';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { audit } from '@/lib/server/repos/audit';
import { deleteOtherSessions, getPasswordHash, updatePasswordHash } from '@/lib/server/repos/users';
import { changePasswordSchema } from '@/lib/validation';

export const PUT = route(async (req) => {
  const user = requireApiUser(req);
  enforceRateLimit(`password:${user.id}`, 5, 15 * 60 * 1000);
  const body = await readJson(req, changePasswordSchema, 10_000);
  const hash = getPasswordHash(user.id);
  if (!hash || !(await verifyPassword(body.currentPassword, hash))) {
    throw new HttpError(400, 'La contraseña actual no es correcta.', { currentPassword: 'La contraseña actual no es correcta.' });
  }
  updatePasswordHash(user.id, await hashPassword(body.newPassword));
  // Por seguridad se cierran las demás sesiones.
  const closed = deleteOtherSessions(user.id, sessionTokenFrom(req));
  audit('auth.password_changed', { userId: user.id, ip: clientIp(req), detail: `sessions_closed=${closed}` });
  return NextResponse.json({ ok: true, closedSessions: closed });
});

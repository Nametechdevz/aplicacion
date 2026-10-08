import { NextResponse } from 'next/server';
import { clientIp, enforceRateLimit, HttpError, readJson, route, setSessionCookie } from '@/lib/server/http';
import { getDummyHash, verifyPassword } from '@/lib/server/password';
import { audit } from '@/lib/server/repos/audit';
import { clearFailedLogins, createSession, findUserByEmail, isLocked, purgeExpiredSessions, registerFailedLogin } from '@/lib/server/repos/users';
import { loginSchema } from '@/lib/validation';

const INVALID = 'Email o contraseña incorrectos.';

export const POST = route(async (req) => {
  const ip = clientIp(req);
  enforceRateLimit(`login:${ip}`, 10, 60 * 1000);
  const body = await readJson(req, loginSchema, 10_000);
  enforceRateLimit(`login-email:${body.email}`, 20, 60 * 60 * 1000);

  const user = findUserByEmail(body.email);
  if (!user) {
    await verifyPassword(body.password, await getDummyHash()); // tiempo constante
    audit('auth.login_failed', { ip, detail: 'unknown_email' });
    throw new HttpError(401, INVALID);
  }
  if (isLocked(user)) {
    audit('auth.locked', { userId: user.id, ip });
    throw new HttpError(423, 'Cuenta bloqueada temporalmente por varios intentos fallidos. Inténtalo en 15 minutos.');
  }
  if (!(await verifyPassword(body.password, user.password_hash))) {
    registerFailedLogin(user);
    audit('auth.login_failed', { userId: user.id, ip });
    throw new HttpError(401, INVALID);
  }
  clearFailedLogins(user.id);
  purgeExpiredSessions();
  const { token, expiresAt } = createSession(user.id, { userAgent: req.headers.get('user-agent'), ip });
  audit('auth.login', { userId: user.id, ip });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  setSessionCookie(res, token, expiresAt);
  return res;
});

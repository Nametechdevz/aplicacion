import { NextResponse } from 'next/server';
import { env } from '@/lib/server/env';
import { clientIp, enforceRateLimit, HttpError, readJson, route, setSessionCookie } from '@/lib/server/http';
import { hashPassword } from '@/lib/server/password';
import { audit } from '@/lib/server/repos/audit';
import { countUsers, createSession, createUser, findUserByEmail } from '@/lib/server/repos/users';
import { registerSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const ip = clientIp(req);
  enforceRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  const body = await readJson(req, registerSchema, 10_000);
  if (!env.allowRegistration && countUsers() > 0) {
    throw new HttpError(403, 'El registro de nuevas cuentas está desactivado en esta instalación.');
  }
  if (findUserByEmail(body.email)) {
    throw new HttpError(409, 'Ya existe una cuenta con ese email.', { email: 'Ya existe una cuenta con ese email.' });
  }
  const user = createUser({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) });
  audit('auth.register', { userId: user.id, ip });
  const { token, expiresAt } = createSession(user.id, { userAgent: req.headers.get('user-agent'), ip });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });
  setSessionCookie(res, token, expiresAt);
  return res;
});

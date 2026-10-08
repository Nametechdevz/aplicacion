import { NextResponse } from 'next/server';
import { clearSessionCookie, clientIp, route, sessionTokenFrom } from '@/lib/server/http';
import { audit } from '@/lib/server/repos/audit';
import { deleteSession, getUserBySessionToken } from '@/lib/server/repos/users';

export const POST = route(async (req) => {
  const token = sessionTokenFrom(req);
  if (token) {
    const user = getUserBySessionToken(token);
    deleteSession(token);
    if (user) audit('auth.logout', { userId: user.id, ip: clientIp(req) });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});

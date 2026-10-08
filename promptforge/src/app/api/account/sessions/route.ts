import { NextResponse } from 'next/server';
import { clientIp, requireApiUser, route, sessionTokenFrom } from '@/lib/server/http';
import { audit } from '@/lib/server/repos/audit';
import { deleteOtherSessions } from '@/lib/server/repos/users';

/** Cierra todas las sesiones excepto la actual. */
export const DELETE = route(async (req) => {
  const user = requireApiUser(req);
  const closed = deleteOtherSessions(user.id, sessionTokenFrom(req));
  audit('auth.sessions_revoked', { userId: user.id, ip: clientIp(req), detail: `closed=${closed}` });
  return NextResponse.json({ ok: true, closed });
});

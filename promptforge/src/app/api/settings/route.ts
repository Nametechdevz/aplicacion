import { NextResponse } from 'next/server';
import { clientIp, readJson, requireApiUser, route } from '@/lib/server/http';
import { env } from '@/lib/server/env';
import { audit } from '@/lib/server/repos/audit';
import { getSettings, saveSettings } from '@/lib/server/repos/settings';
import { settingsSchema } from '@/lib/settings';

export const GET = route(async (req) => {
  const user = requireApiUser(req);
  return NextResponse.json({ settings: getSettings(user.id), aiAvailable: env.anthropicConfigured });
});

export const PUT = route(async (req) => {
  const user = requireApiUser(req);
  const body = await readJson(req, settingsSchema, 10_000);
  const settings = saveSettings(user.id, body);
  audit('settings.updated', { userId: user.id, ip: clientIp(req) });
  const res = NextResponse.json({ settings });
  // Copia del tema en una cookie legible para pintarlo sin parpadeo en el primer render.
  res.cookies.set('pf_theme', settings.theme, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return res;
});

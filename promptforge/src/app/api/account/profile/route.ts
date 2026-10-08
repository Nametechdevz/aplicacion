import { NextResponse } from 'next/server';
import { readJson, requireApiUser, route } from '@/lib/server/http';
import { updateUserProfile } from '@/lib/server/repos/users';
import { profileSchema } from '@/lib/validation';

export const PUT = route(async (req) => {
  const user = requireApiUser(req);
  const body = await readJson(req, profileSchema, 5_000);
  updateUserProfile(user.id, body.name);
  return NextResponse.json({ ok: true, name: body.name });
});

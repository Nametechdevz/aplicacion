import { NextResponse } from 'next/server';
import { HttpError, requireApiUser, route } from '@/lib/server/http';
import { listVersions } from '@/lib/server/repos/prompts';

export const GET = route<{ id: string }>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  const versions = listVersions(user.id, id);
  if (!versions) throw new HttpError(404, 'Prompt no encontrado');
  return NextResponse.json({ versions });
});

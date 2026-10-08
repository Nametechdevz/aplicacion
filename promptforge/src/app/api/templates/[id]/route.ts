import { NextResponse } from 'next/server';
import { HttpError, requireApiUser, route } from '@/lib/server/http';
import { deleteUserTemplate } from '@/lib/server/repos/settings';

export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  if (!deleteUserTemplate(user.id, id)) throw new HttpError(404, 'Plantilla no encontrada');
  return NextResponse.json({ ok: true });
});

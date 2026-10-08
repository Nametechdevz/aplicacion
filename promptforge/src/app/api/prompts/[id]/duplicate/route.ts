import { NextResponse } from 'next/server';
import { HttpError, requireApiUser, route } from '@/lib/server/http';
import { duplicatePrompt } from '@/lib/server/repos/prompts';

export const POST = route<{ id: string }>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  const prompt = duplicatePrompt(user.id, id);
  if (!prompt) throw new HttpError(404, 'Prompt no encontrado');
  return NextResponse.json({ prompt }, { status: 201 });
});

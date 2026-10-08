import { NextResponse } from 'next/server';
import { clientIp, HttpError, readJson, requireApiUser, route } from '@/lib/server/http';
import { deriveMeta } from '@/lib/server/prompt-meta';
import { audit } from '@/lib/server/repos/audit';
import { deletePrompt, getPrompt, updatePrompt } from '@/lib/server/repos/prompts';
import { updatePromptSchema } from '@/lib/validation';

type Params = { id: string };

export const GET = route<Params>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  const prompt = getPrompt(user.id, id);
  if (!prompt) throw new HttpError(404, 'Prompt no encontrado');
  return NextResponse.json({ prompt });
});

export const PATCH = route<Params>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  const current = getPrompt(user.id, id);
  if (!current) throw new HttpError(404, 'Prompt no encontrado');
  const body = await readJson(req, updatePromptSchema, 2_000_000);

  const spec = body.spec !== undefined ? body.spec : current.spec;
  const activeVariant = body.activeVariant ?? current.activeVariant;
  const content = body.variants?.[activeVariant] ?? current.variants[activeVariant];
  const contentChanged = body.variants !== undefined || body.activeVariant !== undefined || body.spec !== undefined;
  const meta = contentChanged ? deriveMeta(spec, content, current.projectType) : {};

  const prompt = updatePrompt(user.id, id, {
    ...body,
    ...meta,
    // Un prompt sin especificación (importado o escrito a mano) conserva su categoría.
    ...(spec ? {} : { category: current.category, projectType: current.projectType, stack: current.stack }),
  });
  return NextResponse.json({ prompt });
});

export const DELETE = route<Params>(async (req, { params }) => {
  const user = requireApiUser(req);
  const { id } = await params;
  const prompt = getPrompt(user.id, id);
  if (!prompt || !deletePrompt(user.id, id)) throw new HttpError(404, 'Prompt no encontrado');
  audit('prompt.deleted', { userId: user.id, ip: clientIp(req), detail: prompt.name });
  return NextResponse.json({ ok: true });
});

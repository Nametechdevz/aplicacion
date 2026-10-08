import { NextResponse } from 'next/server';
import { enforceRateLimit, readJson, requireApiUser, route } from '@/lib/server/http';
import { createUserTemplate, listUserTemplates } from '@/lib/server/repos/settings';
import { templateCreateSchema } from '@/lib/validation';

export const GET = route(async (req) => {
  const user = requireApiUser(req);
  return NextResponse.json({ templates: listUserTemplates(user.id) });
});

export const POST = route(async (req) => {
  const user = requireApiUser(req);
  enforceRateLimit(`template-create:${user.id}`, 30, 60 * 1000);
  const body = await readJson(req, templateCreateSchema, 500_000);
  const template = createUserTemplate(user.id, { ...body, spec: { ...body.spec, templateId: null } });
  return NextResponse.json({ template }, { status: 201 });
});

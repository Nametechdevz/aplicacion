import { NextResponse } from 'next/server';
import { enforceRateLimit, readJson, requireApiUser, route } from '@/lib/server/http';
import { deriveMeta } from '@/lib/server/prompt-meta';
import { createPrompt, listPrompts, type PromptFilters } from '@/lib/server/repos/prompts';
import { createPromptSchema } from '@/lib/validation';

export const GET = route(async (req) => {
  const user = requireApiUser(req);
  const sp = new URL(req.url).searchParams;
  const variant = sp.get('variant');
  const sort = sp.get('sort');
  const filters: PromptFilters = {
    q: sp.get('q')?.slice(0, 200) ?? undefined,
    category: sp.get('category')?.slice(0, 60) || undefined,
    tag: sp.get('tag')?.slice(0, 40) || undefined,
    variant: variant === 'quick' || variant === 'pro' || variant === 'master' ? variant : undefined,
    favorite: sp.get('favorite') === '1',
    sort: sort === 'name' || sort === 'created' || sort === 'score' ? sort : 'updated',
  };
  return NextResponse.json({ prompts: listPrompts(user.id, filters) });
});

export const POST = route(async (req) => {
  const user = requireApiUser(req);
  enforceRateLimit(`prompt-create:${user.id}`, 60, 60 * 1000);
  const body = await readJson(req, createPromptSchema, 2_000_000);
  const meta = deriveMeta(body.spec, body.variants[body.activeVariant]);
  const prompt = createPrompt(user.id, {
    name: body.name,
    description: body.description,
    tags: body.tags,
    activeVariant: body.activeVariant,
    variants: body.variants,
    spec: body.spec,
    favorite: body.favorite,
    templateId: body.spec?.templateId ?? null,
    ...meta,
  });
  return NextResponse.json({ prompt }, { status: 201 });
});

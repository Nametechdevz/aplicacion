import { NextResponse } from 'next/server';
import { requireApiUser, route } from '@/lib/server/http';
import { allPromptsForExport } from '@/lib/server/repos/prompts';

export const GET = route(async (req) => {
  const user = requireApiUser(req);
  const prompts = allPromptsForExport(user.id).map((p) => ({
    name: p.name,
    description: p.description,
    category: p.category,
    projectType: p.projectType,
    stack: p.stack,
    tags: p.tags,
    activeVariant: p.activeVariant,
    variants: p.variants,
    spec: p.spec,
    favorite: p.favorite,
    templateId: p.templateId,
    createdAt: p.createdAt,
  }));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), prompts }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="promptforge-biblioteca-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

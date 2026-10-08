import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import { clientIp, enforceRateLimit, readJson, requireApiUser, route } from '@/lib/server/http';
import { deriveMeta } from '@/lib/server/prompt-meta';
import { audit } from '@/lib/server/repos/audit';
import { createPrompt } from '@/lib/server/repos/prompts';
import { importSchema } from '@/lib/validation';

export const POST = route(async (req) => {
  const user = requireApiUser(req);
  enforceRateLimit(`import:${user.id}`, 5, 60 * 1000);
  const body = await readJson(req, importSchema, 20_000_000);
  const db = getDb();
  const created = db.transaction(() =>
    body.prompts.map((p) => {
      const spec = p.spec ?? null;
      const meta = deriveMeta(spec, p.variants[p.activeVariant], p.projectType);
      return createPrompt(
        user.id,
        {
          name: p.name,
          description: p.description,
          tags: p.tags,
          activeVariant: p.activeVariant,
          variants: p.variants,
          spec,
          favorite: p.favorite,
          templateId: p.templateId ?? null,
          ...meta,
          // Sin especificación se respeta la categoría y el stack exportados.
          ...(spec ? {} : { category: p.category, stack: p.stack }),
        },
        'Importado',
      ).id;
    }),
  )();
  audit('library.imported', { userId: user.id, ip: clientIp(req), detail: `count=${created.length}` });
  return NextResponse.json({ imported: created.length });
});

import type { Metadata } from 'next';
import { TemplatesView } from '@/components/templates/templates-view';
import { PageHeader } from '@/components/ui/primitives';
import { categoryLabel, getProjectType } from '@/lib/engine/catalog';
import { generatePrompt } from '@/lib/engine/generator';
import { evaluatePrompt } from '@/lib/engine/quality';
import { featureCount } from '@/lib/engine/spec';
import { specFromTemplate, TEMPLATES } from '@/lib/engine/templates';
import { listUserTemplates } from '@/lib/server/repos/settings';
import { requireUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Plantillas' };

// Las tarjetas de plantillas predeterminadas son deterministas: se calculan una vez por proceso.
let builtinCache: ReturnType<typeof buildBuiltin> | null = null;
function buildBuiltin() {
  return TEMPLATES.map((t) => {
    const spec = specFromTemplate(t.id)!;
    const type = getProjectType(t.typeId);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      typeLabel: type.label,
      category: categoryLabel(type.category),
      features: featureCount(spec),
      score: evaluatePrompt(generatePrompt(spec, 'master'), spec).score,
    };
  });
}

export default async function TemplatesPage() {
  const user = await requireUser();
  builtinCache ??= buildBuiltin();
  const mine = listUserTemplates(user.id).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    typeLabel: getProjectType(t.projectType).label,
    createdAt: t.createdAt,
  }));
  return (
    <>
      <PageHeader eyebrow="Plantillas" title="Empieza con ventaja" description="Plantillas listas con funcionalidades, preguntas y stack sugerido. Elige una y ajusta las respuestas." />
      <TemplatesView builtin={builtinCache} mine={mine} />
    </>
  );
}

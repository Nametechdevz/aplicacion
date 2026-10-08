import 'server-only';
import { categoryLabel, getProjectType } from '@/lib/engine/catalog';
import { evaluatePrompt } from '@/lib/engine/quality';
import { techLabels } from '@/lib/engine/techs';
import type { ProjectSpec, Variant } from '@/lib/engine/types';

/** Metadatos derivados (categoría, stack, puntuación) calculados siempre en el servidor. */
export function deriveMeta(spec: ProjectSpec | null, content: string, projectTypeFallback = 'custom') {
  const type = getProjectType(spec?.projectType ?? projectTypeFallback);
  const stack = spec ? (spec.tech.mode === 'custom' && spec.tech.selected.length ? techLabels(spec.tech.selected) : ['Claude elige']) : [];
  return {
    category: categoryLabel(type.category),
    projectType: type.id,
    stack,
    qualityScore: evaluatePrompt(content, spec).score,
  };
}

export function activeContent(variants: Record<Variant, string>, v: Variant): string {
  return variants[v] ?? '';
}

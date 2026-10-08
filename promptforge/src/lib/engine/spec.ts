import { getProjectType } from './catalog';
import { answerEffects } from './questions';
import type { IntegrationId, ProjectSpec, ProjectType, Scope } from './types';

export const STYLE_OPTIONS = [
  'Moderno',
  'Minimalista',
  'Premium',
  'Tecnológico',
  'Elegante',
  'Corporativo',
  'Juvenil',
  'Editorial',
  'Deportivo',
  'Cálido / cercano',
  'Lujo',
  'Brutalista',
];

export const COUNTRY_PRESETS: { country: string; currency: string; language: string }[] = [
  { country: 'Colombia', currency: 'COP', language: 'Español' },
  { country: 'México', currency: 'MXN', language: 'Español' },
  { country: 'España', currency: 'EUR', language: 'Español' },
  { country: 'Argentina', currency: 'ARS', language: 'Español' },
  { country: 'Chile', currency: 'CLP', language: 'Español' },
  { country: 'Perú', currency: 'PEN', language: 'Español' },
  { country: 'Ecuador', currency: 'USD', language: 'Español' },
  { country: 'Estados Unidos', currency: 'USD', language: 'Inglés' },
  { country: 'Internacional', currency: 'USD', language: 'Español e inglés' },
];

/** Grupos de funcionalidades del tipo (y del dominio de negocio, si existe). */
export function featureGroupsFor(spec: Pick<ProjectSpec, 'projectType' | 'answers'>) {
  const type = getProjectType(spec.projectType);
  const groups = [...type.featureGroups];
  const domain = domainTypeOf(spec);
  if (domain && domain.id !== type.id) {
    for (const grp of domain.featureGroups) {
      if (/administra/i.test(grp.name)) continue;
      groups.push({ name: `${grp.name} — ${domain.label}`, items: grp.items });
    }
  }
  return groups;
}

/** Tipo de proyecto que describe el dominio de negocio (p. ej. "SaaS de facturación" → facturación). */
export function domainTypeOf(spec: Pick<ProjectSpec, 'answers'>): ProjectType | null {
  const id = spec.answers?.domain_type;
  return typeof id === 'string' && id ? getProjectType(id) : null;
}

export function defaultFeatures(typeId: string, scope: Scope, answers: ProjectSpec['answers'] = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const grp of featureGroupsFor({ projectType: typeId, answers })) {
    out[grp.name] = grp.items.filter((i) => scope !== 'mvp' || !i.advanced).map((i) => i.label);
  }
  return out;
}

export function createSpec(typeId: string, partial: Partial<ProjectSpec> = {}): ProjectSpec {
  const type = getProjectType(typeId);
  const scope = partial.scope ?? 'complete';
  const answers = partial.answers ?? {};
  return {
    idea: '',
    projectType: type.id,
    customTypeLabel: '',
    name: '',
    description: '',
    objective: '',
    audience: '',
    problem: '',
    country: '',
    language: 'Español',
    currency: '',
    scope,
    design: {
      styles: ['Moderno'],
      colors: '',
      typography: '',
      themeMode: 'both',
      references: '',
      inspirationSites: '',
    },
    tech: { mode: 'auto', selected: [], hosting: '' },
    features: defaultFeatures(type.id, scope, answers),
    integrations: [...type.integrations],
    roles: [...type.roles],
    seo: type.seo !== 'low',
    multilingual: false,
    notes: '',
    templateId: null,
    ...partial,
    answers,
  };
}

/** Especificación final: funcionalidades e integraciones elegidas + efectos de las respuestas. */
export function resolveSpec(spec: ProjectSpec): ProjectSpec {
  const fx = answerEffects(spec);
  const features: Record<string, string[]> = {};
  for (const [group, items] of Object.entries(spec.features)) {
    const clean = items.map((i) => i.trim()).filter(Boolean);
    if (clean.length) features[group] = [...new Set(clean)];
  }
  for (const [group, items] of Object.entries(fx.features)) {
    const existing = features[group] ?? [];
    features[group] = [...new Set([...existing, ...items])];
  }
  let integrations = [...new Set<IntegrationId>([...spec.integrations, ...fx.integrations])];
  // "Claude elige la pasarela": si no hay ninguna pasarela concreta, se deja la decisión a Claude.
  const gateways: IntegrationId[] = ['stripe', 'paypal', 'mercadopago', 'wompi', 'nequi'];
  const chosen = spec.answers.payment_gateways;
  if (Array.isArray(chosen) && chosen.length) {
    const explicit = chosen.filter((c): c is IntegrationId => gateways.includes(c as IntegrationId));
    if (explicit.length || chosen.includes('auto')) {
      // Con "Claude elige", solo se mantienen las pasarelas marcadas explícitamente.
      integrations = integrations.filter((i) => !gateways.includes(i) || explicit.includes(i));
    }
  }
  return { ...spec, features, integrations };
}

export function displayName(spec: ProjectSpec): string {
  if (spec.name.trim()) return spec.name.trim();
  const type = getProjectType(spec.projectType);
  return spec.customTypeLabel.trim() || type.label;
}

export function typeLabel(spec: ProjectSpec): string {
  const type = getProjectType(spec.projectType);
  if (type.id === 'custom' && spec.customTypeLabel.trim()) return spec.customTypeLabel.trim();
  const domain = domainTypeOf(spec);
  return domain && domain.id !== type.id ? `${type.label} de ${domain.label.toLowerCase()}` : type.label;
}

export function featureCount(spec: ProjectSpec): number {
  return Object.values(spec.features).reduce((n, items) => n + items.length, 0);
}

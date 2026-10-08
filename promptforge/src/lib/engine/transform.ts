import { buildContext, generatePrompt, SECTION_BUILDERS } from './generator';
import { featureGroupsFor } from './spec';
import { countKeywords, joinSections, splitSections, stripAccents, type MdSection } from './markdown-sections';
import { evaluatePrompt } from './quality';
import { createSpec } from './spec';
import type { ProjectSpec } from './types';

type Builder = keyof typeof SECTION_BUILDERS;

/** Relación entre los checks de calidad y la sección que los resuelve. */
const CHECK_TO_SECTION: Record<string, { builder: Builder; heading: RegExp }> = {
  objective: { builder: 'context', heading: /contexto/i },
  stack: { builder: 'stack', heading: /stack|tecnolog/i },
  features: { builder: 'features', heading: /funcionalidad/i },
  architecture: { builder: 'architecture', heading: /arquitectura/i },
  database: { builder: 'database', heading: /base de datos|modelo de datos/i },
  security: { builder: 'security', heading: /seguridad/i },
  responsive: { builder: 'responsive', heading: /responsive|pantallas/i },
  seo: { builder: 'seo', heading: /^seo/i },
  testing: { builder: 'testing', heading: /testing|pruebas/i },
  deploy: { builder: 'deploy', heading: /deploy|devops/i },
  integrations: { builder: 'integrations', heading: /integraciones/i },
  roles: { builder: 'rolesSection', heading: /roles|permisos/i },
  ux: { builder: 'uiux', heading: /^ui\b|\bux\b|diseño/i },
  claude_code: { builder: 'workflow', heading: /forma de trabajo/i },
};

/** Orden canónico para insertar secciones nuevas en su sitio. */
const ORDER: RegExp[] = [
  /^rol$/i,
  /contexto/i,
  /análisis inicial/i,
  /forma de trabajo/i,
  /reglas/i,
  /stack/i,
  /funcionalidad/i,
  /roles/i,
  /arquitectura/i,
  /base de datos/i,
  /^ui|ux|diseño/i,
  /responsive|pantallas/i,
  /seguridad/i,
  /^seo/i,
  /rendimiento/i,
  /integraciones/i,
  /testing/i,
  /deploy/i,
  /plan de implementación/i,
  /mejoras adicionales/i,
  /criterios de aceptación/i,
  /entrega/i,
  /importante/i,
];

function orderIndex(title: string): number {
  const i = ORDER.findIndex((r) => r.test(title));
  return i === -1 ? ORDER.length : i;
}

function toSection(markdown: string): MdSection | null {
  const [s] = splitSections(markdown).filter((x) => x.heading);
  return s ?? null;
}

function upsert(sections: MdSection[], incoming: MdSection, heading: RegExp): MdSection[] {
  const idx = sections.findIndex((s) => s.heading && heading.test(s.title));
  if (idx >= 0) {
    const copy = [...sections];
    copy[idx] = incoming;
    return copy;
  }
  const pos = orderIndex(incoming.title);
  const insertAt = sections.findIndex((s) => s.heading && orderIndex(s.title) > pos);
  const copy = [...sections];
  copy.splice(insertAt === -1 ? copy.length : insertAt, 0, incoming);
  return copy;
}

function fallbackSpec(text: string): ProjectSpec {
  const spec = createSpec('custom');
  const title = /^#\s+(?:PROMPT MAESTRO\s+—\s+)?(.+)$/m.exec(text)?.[1];
  if (title) spec.name = title.trim();
  return spec;
}

// ---------------------------------------------------------------------------
// MEJORAR
// ---------------------------------------------------------------------------
interface Improvement {
  area: string;
  key: string[];
  text: string;
}

const GENERIC_FEATURES = [
  'Centro de notificaciones en la app',
  'Exportación de datos a CSV',
  'Búsqueda global',
  'Cambio de contraseña y cierre de sesiones desde el perfil',
  'Registro de actividad visible para el administrador',
  'Página de ayuda / preguntas frecuentes',
];

const EXTRA_IMPROVEMENTS: Improvement[] = [
  { area: 'Requisitos técnicos', key: ['idempoten'], text: 'Operaciones críticas (pagos, webhooks, creación de pedidos) idempotentes para tolerar reintentos.' },
  { area: 'Requisitos técnicos', key: ['zona horaria', 'utc'], text: 'Fechas almacenadas en UTC y mostradas en la zona horaria del usuario.' },
  { area: 'Requisitos técnicos', key: ['health'], text: 'Endpoint de health check y validación de configuración al arrancar.' },
  { area: 'Mejoras UX', key: ['onboarding'], text: 'Onboarding breve para usuarios nuevos y estados vacíos con una acción clara.' },
  { area: 'Mejoras UX', key: ['ctrl+k', 'búsqueda global', 'atajos'], text: 'Búsqueda global y atajos de teclado en las áreas de gestión.' },
  { area: 'Mejoras UX', key: ['optimist'], text: 'Actualizaciones optimistas con reversión si la API falla, para que la interfaz se sienta instantánea.' },
  { area: 'Mejoras UX', key: ['wcag'], text: 'Accesibilidad WCAG 2.2 AA verificada con herramientas automáticas y navegación solo con teclado.' },
  { area: 'Seguridad', key: ['2fa', 'dos pasos', 'totp'], text: 'Autenticación en dos pasos (TOTP) opcional para cuentas con privilegios.' },
  { area: 'Seguridad', key: ['auditoría', 'audit'], text: 'Registro de auditoría inmutable de acciones sensibles (quién, qué, cuándo, desde dónde).' },
  { area: 'Seguridad', key: ['npm audit', 'dependencias sin vulnerabilidades'], text: 'Análisis de dependencias vulnerables en CI.' },
  { area: 'Escalabilidad', key: ['cola', 'colas', 'segundo plano'], text: 'Tareas lentas (emails, exportaciones, sincronizaciones) en una cola con reintentos.' },
  { area: 'Escalabilidad', key: ['sin estado', 'stateless'], text: 'Servidores sin estado en memoria para poder escalar horizontalmente.' },
  { area: 'Escalabilidad', key: ['feature flag'], text: 'Feature flags para activar funcionalidades de forma progresiva.' },
  { area: 'SEO', key: ['hreflang', 'datos estructurados'], text: 'Datos estructurados validados con la herramienta de resultados enriquecidos de Google.' },
  { area: 'SEO', key: ['404'], text: 'Página 404 útil y redirecciones 301 cuando cambien las URLs.' },
  { area: 'Rendimiento', key: ['lighthouse'], text: 'Presupuesto de rendimiento: Lighthouse ≥ 90 en móvil en las páginas principales.' },
  { area: 'Rendimiento', key: ['n+1'], text: 'Revisar consultas N+1 y añadir índices según los planes de ejecución.' },
  { area: 'Rendimiento', key: ['caché', 'cache'], text: 'Estrategia de caché explícita (qué se cachea, durante cuánto y cómo se invalida).' },
  { area: 'Testing', key: ['ci'], text: 'Ejecutar lint, type-check, tests y build en CI en cada cambio.' },
  { area: 'Testing', key: ['regresión visual', 'snapshot'], text: 'Pruebas de regresión visual de las pantallas clave en móvil y escritorio.' },
  { area: 'Testing', key: ['datos de prueba', 'factories', 'fixtures'], text: 'Factories/fixtures para crear datos de prueba de forma consistente.' },
];

export interface TransformResult {
  text: string;
  changes: string[];
}

export function improvePrompt(text: string, spec?: ProjectSpec | null): TransformResult {
  const s = spec ?? fallbackSpec(text);
  const ctx = buildContext(s, 'master');
  const report = evaluatePrompt(text, spec);
  let sections = splitSections(text);
  const changes: string[] = [];

  for (const check of report.checks) {
    if (check.status !== 'fail' && check.status !== 'partial') continue;
    const target = CHECK_TO_SECTION[check.id];
    if (!target) continue;
    const md = SECTION_BUILDERS[target.builder](ctx);
    const incoming = md ? toSection(md) : null;
    if (!incoming) continue;
    const existing = sections.find((x) => x.heading && target.heading.test(x.title));
    // Conserva lo que el usuario escribió y que no está en la versión completa.
    if (existing) {
      const extra = existing.body
        .split('\n')
        .filter((l) => l.trim() && !incoming.body.includes(l.trim()) && countKeywords(incoming.body, [l.trim().slice(0, 40)]) === 0)
        .filter((l) => /^\s*[-*]\s+/.test(l));
      if (extra.length) incoming.body += `\n\nRequisitos adicionales del cliente:\n${extra.join('\n')}`;
    }
    sections = upsert(sections, incoming, target.heading);
    changes.push(`${check.label.replace(/[¿?]/g, '')}: sección completada`);
  }

  // Funcionalidades del tipo (y genéricas útiles) que aún no aparecen
  const current = stripAccents(joinSections(sections));
  const missingFeatures = [...featureGroupsFor(s).flatMap((g) => g.items).map((i) => i.label), ...GENERIC_FEATURES]
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .filter((label) => !current.includes(stripAccents(label)));

  const fullText = stripAccents(joinSections(sections));
  const extras = EXTRA_IMPROVEMENTS.filter((imp) => !imp.key.some((k) => fullText.includes(stripAccents(k))));
  const existingExtra = sections.find((x) => /mejoras adicionales/i.test(x.title));
  const groups = new Map<string, string[]>();
  const featuresSection = sections.find((x) => x.heading && /funcionalidad/i.test(x.title));
  if (missingFeatures.length && featuresSection && !/### Funcionalidades recomendadas/.test(featuresSection.body)) {
    const added = missingFeatures.slice(0, 10);
    featuresSection.body += `\n\n### Funcionalidades recomendadas\n${added.map((f) => `- ${f}`).join('\n')}`;
    changes.push(`${added.length} funcionalidades recomendadas añadidas`);
  } else if (missingFeatures.length && !featuresSection) {
    groups.set('Funcionalidades recomendadas', missingFeatures.slice(0, 10));
  }
  for (const e of extras) groups.set(e.area, [...(groups.get(e.area) ?? []), e.text]);

  if (groups.size) {
    const body = [
      'Incorpora también estas mejoras, salvo que contradigan un requisito explícito:',
      ...[...groups.entries()].map(([area, items]) => `### ${area}\n${items.map((i) => `- ${i}`).join('\n')}`),
    ].join('\n\n');
    const merged: MdSection = existingExtra
      ? { ...existingExtra, body: `${existingExtra.body}\n\n${[...groups.entries()].map(([area, items]) => `### ${area}\n${items.map((i) => `- ${i}`).join('\n')}`).join('\n\n')}` }
      : { heading: '## MEJORAS ADICIONALES', title: 'MEJORAS ADICIONALES', body };
    sections = upsert(sections, merged, /mejoras adicionales/i);
    changes.push(`${[...groups.values()].reduce((n, l) => n + l.length, 0)} mejoras añadidas (${[...groups.keys()].join(', ')})`);
  }

  if (!changes.length) changes.push('El prompt ya cubre todas las áreas evaluadas; no se añadieron cambios.');
  return { text: joinSections(sections), changes };
}

// ---------------------------------------------------------------------------
// SIMPLIFICAR
// ---------------------------------------------------------------------------
const DROP_ON_SIMPLIFY = [/criterios de aceptación/i, /mejoras adicionales/i, /rendimiento/i, /análisis inicial/i];

function shortenLine(line: string): string {
  // "- **Título:** explicación larga." → "- Título"
  const bold = /^(\s*(?:[-*]|\d+\.)\s+)\*\*(.+?)[:：]?\*\*[:：]?\s*.*$/.exec(line);
  if (bold) return `${bold[1]}${bold[2].replace(/[:：]$/, '')}`;
  return line.length > 160 ? `${line.slice(0, 157).replace(/\s+\S*$/, '')}…` : line;
}

export function simplifyPrompt(text: string): TransformResult {
  const sections = splitSections(text);
  const changes: string[] = [];
  const out: MdSection[] = [];
  for (const s of sections) {
    if (s.heading && DROP_ON_SIMPLIFY.some((r) => r.test(s.title))) {
      changes.push(`Sección "${s.title}" eliminada`);
      continue;
    }
    if (!s.heading) {
      out.push(s);
      continue;
    }
    const lines = s.body.split('\n');
    const kept: string[] = [];
    let bulletsInBlock = 0;
    let paragraphs = 0;
    const isFeatures = /funcionalidad/i.test(s.title);
    const maxBullets = isFeatures ? 8 : 5;
    let dropped = 0;
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\|/.test(line)) {
        dropped++;
        continue; // tablas fuera
      }
      if (/^###\s/.test(line)) {
        bulletsInBlock = 0;
        kept.push(line);
        continue;
      }
      if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
        bulletsInBlock++;
        if (bulletsInBlock <= maxBullets) kept.push(shortenLine(line));
        else dropped++;
        continue;
      }
      if (!line.trim()) {
        bulletsInBlock = 0;
        kept.push('');
        continue;
      }
      if (/^\s+✔/.test(line)) {
        dropped++;
        continue;
      }
      paragraphs++;
      if (paragraphs <= 2) {
        const first = line.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? line;
        kept.push(first);
      } else dropped++;
    }
    out.push({ ...s, body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() });
    if (dropped) changes.push(`"${s.title}": ${dropped} líneas condensadas`);
  }
  const result = joinSections(out);
  if (result.length >= text.length) return { text, changes: ['El prompt ya es breve; no se pudo simplificar más.'] };
  return { text: result, changes };
}

// ---------------------------------------------------------------------------
// EXPANDIR
// ---------------------------------------------------------------------------
export function expandPrompt(text: string, spec?: ProjectSpec | null): TransformResult {
  const s = spec ?? fallbackSpec(text);
  const master = splitSections(generatePrompt(s, 'master'));
  let sections = splitSections(text);
  const changes: string[] = [];
  for (const m of master) {
    if (!m.heading) continue;
    const re = new RegExp(`^${m.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existing = sections.find((x) => x.heading && re.test(x.title));
    if (!existing) {
      sections = upsert(sections, m, re);
      changes.push(`Sección "${m.title}" añadida`);
    } else if (m.body.length > existing.body.length * 1.15) {
      const userLines = existing.body
        .split('\n')
        .filter((l) => /^\s*[-*]\s+/.test(l) && !stripAccents(m.body).includes(stripAccents(l.replace(/^\s*[-*]\s+/, '').trim())));
      const body = userLines.length ? `${m.body}\n\nRequisitos adicionales del cliente:\n${userLines.join('\n')}` : m.body;
      sections = upsert(sections, { ...m, body }, re);
      changes.push(`Sección "${m.title}" ampliada`);
    }
  }
  if (!changes.length) changes.push('El prompt ya está en su versión más completa.');
  return { text: joinSections(sections), changes };
}

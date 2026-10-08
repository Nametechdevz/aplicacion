import { getProjectType } from './catalog';
import { countBullets, countKeywords, findSection, splitSections, stripAccents, type MdSection } from './markdown-sections';
import type { CheckStatus, ProjectSpec, QualityCheck, QualityReport } from './types';

interface CheckDef {
  id: string;
  label: string;
  weight: number;
  heading: RegExp;
  evaluate: (ctx: EvalCtx) => { status: CheckStatus; hint: string };
}

interface EvalCtx {
  text: string;
  sections: MdSection[];
  spec?: ProjectSpec | null;
  section: MdSection | undefined;
}

const PASS = (hint = ''): { status: CheckStatus; hint: string } => ({ status: 'pass', hint });
const PARTIAL = (hint: string): { status: CheckStatus; hint: string } => ({ status: 'partial', hint });
const FAIL = (hint: string): { status: CheckStatus; hint: string } => ({ status: 'fail', hint });
const NA = (hint: string): { status: CheckStatus; hint: string } => ({ status: 'na', hint });

const len = (s?: MdSection) => (s ? s.body.length : 0);

const CHECKS: CheckDef[] = [
  {
    id: 'objective',
    label: '¿El objetivo está claro?',
    weight: 9,
    heading: /contexto|objetivo|descripci/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Añade una sección de CONTEXTO con qué se construye, para quién, problema y objetivos.');
      const n = countKeywords(section.body, ['qué se va a construir', 'para quién', 'problema', 'objetivo', 'alcance']);
      const unspecified = /no especificado/i.test(section.body);
      if (n >= 5 && !unspecified && len(section) > 400) return PASS();
      if (n >= 3) return PARTIAL(unspecified ? 'Describe el problema que resuelve el proyecto.' : 'Completa público objetivo, problema, objetivos y alcance.');
      return FAIL('El contexto es insuficiente: define qué, para quién, problema, objetivos y alcance.');
    },
  },
  {
    id: 'stack',
    label: '¿El stack está definido?',
    weight: 7,
    heading: /stack|tecnolog/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Define el stack o indica a Claude que elija y justifique la tecnología.');
      if (/claude elige|elige el stack|selecciona el stack/i.test(section.body)) {
        return /justific/i.test(section.body) && /criterios/i.test(section.body) ? PASS() : PARTIAL('Pide la justificación de la elección y los criterios de decisión.');
      }
      return len(section) > 60 ? PASS() : PARTIAL('Detalla las tecnologías del stack.');
    },
  },
  {
    id: 'features',
    label: '¿Las funcionalidades están completas?',
    weight: 12,
    heading: /funcionalidad/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Lista las funcionalidades por rol (cliente, administrador…).');
      const n = countBullets(section.body);
      const e2e = /extremo a extremo/i.test(section.body);
      if (n >= 15 && e2e) return PASS();
      if (n >= 15) return PARTIAL('Exige que cada funcionalidad se implemente de extremo a extremo (UI + API + datos + permisos).');
      if (n >= 6) return PARTIAL(`Hay ${n} funcionalidades; añade las que faltan por rol.`);
      return FAIL('Muy pocas funcionalidades definidas.');
    },
  },
  {
    id: 'architecture',
    label: '¿La arquitectura está definida?',
    weight: 8,
    heading: /arquitectura/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Pide la arquitectura: carpetas, módulos, backend, frontend, APIs, auth, logs y errores.');
      const n = countKeywords(section.body, ['carpetas', 'componentes', 'módulos', 'backend', 'frontend', 'base de datos', 'apis', 'autenticación', 'autorización', 'integraciones', 'archivos', 'logs', 'errores', 'escalable']);
      if (n >= 11 && len(section) > 700) return PASS();
      if (n >= 6) return PARTIAL('Detalla cada pieza de la arquitectura y sus principios.');
      return FAIL('La arquitectura está poco definida.');
    },
  },
  {
    id: 'database',
    label: '¿La base de datos está contemplada?',
    weight: 8,
    heading: /base de datos|modelo de datos/i,
    evaluate: ({ section, spec }) => {
      if (spec && !getProjectType(spec.projectType).needsDb) return NA('Este tipo de proyecto no requiere base de datos propia.');
      if (!section) return FAIL('Añade el modelo de datos: tablas, relaciones, índices, migraciones y seeders.');
      const n = countKeywords(section.body, ['relaciones', 'índices', 'claves primarias', 'claves foráneas', 'constraints', 'migraciones', 'seeders', 'datos de prueba', 'entidades']);
      if (n >= 8 && len(section) > 500) return PASS();
      if (n >= 4) return PARTIAL('Pide claves, constraints, migraciones, seeders y la explicación de decisiones.');
      return FAIL('La base de datos está poco detallada.');
    },
  },
  {
    id: 'security',
    label: '¿La seguridad está contemplada?',
    weight: 10,
    heading: /seguridad/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Añade requisitos de seguridad (XSS, CSRF, SQLi, rate limiting, hashing, sesiones, secretos).');
      const n = countKeywords(section.body, ['validación', 'sanitiz', 'xss', 'csrf', 'sql', 'rate limiting', 'hash', 'sesiones', 'roles', 'apis', 'variables de entorno', 'secretos', 'logs de seguridad', 'cabeceras']);
      if (n >= 12 && len(section) > 900) return PASS();
      if (n >= 7) return PARTIAL('Concreta cómo se implementa cada medida de seguridad.');
      return FAIL('Faltan medidas de seguridad esenciales.');
    },
  },
  {
    id: 'responsive',
    label: '¿Responsive?',
    weight: 6,
    heading: /responsive|pantallas|dispositivos/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Exige compatibilidad mobile, tablet, laptop, desktop y pantallas grandes.');
      const n = countKeywords(section.body, ['mobile', 'tablet', 'laptop', 'desktop', 'pantallas grandes', 'mobile first', 'táctil', '1080p', 'mando']);
      if (n >= 6 && len(section) > 300) return PASS();
      if (n >= 3) return PARTIAL('Indica tamaños concretos y la prueba en dispositivos móviles.');
      return FAIL('Responsive insuficiente.');
    },
  },
  {
    id: 'seo',
    label: '¿SEO?',
    weight: 5,
    heading: /^seo/i,
    evaluate: ({ section, spec }) => {
      if (spec && !spec.seo) return NA('SEO no aplica (área privada o app nativa).');
      if (!section) return FAIL('Añade SEO técnico: meta tags, Open Graph, Schema.org, sitemap, robots, canonical y Core Web Vitals.');
      const n = countKeywords(section.body, ['meta', 'open graph', 'schema', 'urls amigables', 'sitemap', 'robots', 'canonical', 'core web vitals', 'lcp']);
      if (n >= 8) return PASS();
      if (n >= 4) return PARTIAL('Completa los requisitos de SEO técnico y objetivos de Core Web Vitals.');
      return FAIL('SEO insuficiente.');
    },
  },
  {
    id: 'testing',
    label: '¿Testing?',
    weight: 7,
    heading: /testing|pruebas|tests/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Pide tests unitarios, de integración y E2E de los flujos críticos.');
      const n = countKeywords(section.body, ['unitari', 'integración', 'e2e', 'flujos críticos', 'permisos']);
      if (n >= 5 && len(section) > 350) return PASS();
      if (n >= 2) return PARTIAL('Enumera los flujos críticos que deben cubrir los tests.');
      return FAIL('Testing insuficiente.');
    },
  },
  {
    id: 'deploy',
    label: '¿Deploy?',
    weight: 5,
    heading: /deploy|devops|despliegue/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Añade requisitos de despliegue: build, entornos, migraciones, CI y backups.');
      const n = countKeywords(section.body, ['build', 'variables de entorno', 'migraciones', 'ci', 'docker', 'backups', 'monitoriz', 'https', 'health']);
      if (n >= 6) return PASS();
      if (n >= 2) return PARTIAL('Detalla CI, backups, monitorización y HTTPS.');
      return FAIL('Deploy poco definido.');
    },
  },
  {
    id: 'integrations',
    label: '¿Integraciones?',
    weight: 5,
    heading: /integraciones/i,
    evaluate: ({ section, spec }) => {
      const needs = spec ? spec.integrations.length > 0 || Array.isArray(spec.answers.payment_gateways) : true;
      if (!needs) return NA('El proyecto no requiere integraciones externas.');
      if (!section) return FAIL('Define las integraciones y sus variables de entorno.');
      const env = /variables de entorno|`[A-Z0-9_]{4,}`/.test(section.body);
      const noInvent = /no inventes|nunca inventes/i.test(section.body);
      if (env && noInvent && len(section) > 500) return PASS();
      if (env || noInvent) return PARTIAL('Indica variables de entorno por integración y prohíbe inventar APIs.');
      return FAIL('Integraciones sin requisitos técnicos.');
    },
  },
  {
    id: 'roles',
    label: '¿Roles y permisos?',
    weight: 6,
    heading: /roles|permisos/i,
    evaluate: ({ section, text }) => {
      if (!section) {
        return /roles y permisos/i.test(text) ? PARTIAL('Define los roles y qué puede hacer cada uno.') : FAIL('Define los roles y sus permisos.');
      }
      const matrix = /\|\s*Rol\s*\|/i.test(section.body);
      const server = /servidor/i.test(section.body);
      if (matrix && server) return PASS();
      if (server) return PARTIAL('Añade una matriz de permisos por rol.');
      return PARTIAL('Exige verificar los permisos en el servidor.');
    },
  },
  {
    id: 'ux',
    label: '¿Experiencia de usuario?',
    weight: 7,
    heading: /^ui\b|\bux\b|diseño/i,
    evaluate: ({ section }) => {
      if (!section) return FAIL('Define la identidad visual, componentes y estados de la interfaz.');
      const n = countKeywords(section.body, ['identidad visual', 'estados vacíos', 'loading', 'error', 'toast', 'modales', 'formularios', 'accesib', 'microinteracciones', 'tokens', 'consistente', 'genéric']);
      if (n >= 10) return PASS();
      if (n >= 5) return PARTIAL('Añade sistema de diseño, accesibilidad y microinteracciones.');
      return FAIL('Experiencia de usuario poco definida.');
    },
  },
  {
    id: 'claude_code',
    label: '¿Optimizado para Claude Code?',
    weight: 5,
    heading: /forma de trabajo|claude code|flujo de trabajo/i,
    evaluate: ({ section, text }) => {
      const t = stripAccents(text);
      const rules = ['funcionalidades falsas', 'no inventes', 'placeholders', 'decision tecnica razonable'].filter((k) => t.includes(k)).length;
      const phases = /fase\s*1/i.test(text);
      if (section && rules >= 3 && phases && countBullets(section.body) >= 10) return PASS();
      if (section || rules >= 2) return PARTIAL('Incluye el flujo paso a paso, las reglas de desarrollo y el plan por fases.');
      return FAIL('Faltan instrucciones de trabajo específicas para Claude Code.');
    },
  },
];

function levelFor(score: number): { label: string; level: QualityReport['level'] } {
  if (score >= 90) return { label: 'Prompt listo para Claude Code', level: 'ready' };
  if (score >= 75) return { label: 'Buen prompt — se recomienda mejorar', level: 'good' };
  if (score >= 50) return { label: 'Prompt incompleto', level: 'incomplete' };
  return { label: 'Prompt insuficiente', level: 'weak' };
}

export function evaluatePrompt(text: string, spec?: ProjectSpec | null): QualityReport {
  const sections = splitSections(text);
  const checks: QualityCheck[] = CHECKS.map((def) => {
    const section = findSection(sections, def.heading);
    const { status, hint } = def.evaluate({ text, sections, spec, section });
    const points = status === 'pass' ? def.weight : status === 'partial' ? def.weight / 2 : 0;
    return { id: def.id, label: def.label, status, weight: def.weight, points, hint };
  });
  const applicable = checks.filter((c) => c.status !== 'na');
  const max = applicable.reduce((n, c) => n + c.weight, 0);
  const earned = applicable.reduce((n, c) => n + c.points, 0);
  const raw = max ? (earned / max) * 100 : 0;
  // Penalización por longitud mínima: un prompt de pocas líneas no está listo.
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const score = Math.max(0, Math.min(100, Math.round(words < 120 ? raw * (words / 120) : raw)));
  const { label, level } = levelFor(score);
  return {
    score,
    label,
    level,
    checks,
    suggestions: checks.filter((c) => c.status === 'fail' || c.status === 'partial').map((c) => c.hint),
    stats: {
      words,
      chars: text.length,
      sections: sections.filter((s) => s.heading).length,
      approxTokens: Math.round(text.length / 3.6),
    },
  };
}

export function formatScore(r: QualityReport): string {
  return `${r.score}/100 — ${r.label}`;
}

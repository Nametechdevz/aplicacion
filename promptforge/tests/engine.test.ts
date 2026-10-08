import { describe, expect, it } from 'vitest';
import {
  createSpec,
  detectIdea,
  evaluatePrompt,
  expandPrompt,
  generateAll,
  generatePrompt,
  improvePrompt,
  PROJECT_TYPES,
  resolveSpec,
  simplifyPrompt,
  specFromIdea,
  specFromTemplate,
  stackWarnings,
  TEMPLATES,
} from '@/lib/engine';
import { renderMarkdown } from '@/lib/markdown';

const EXAMPLE = 'Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones, usuarios, dashboard administrativo y diseño premium.';

describe('detección de ideas', () => {
  it.each([
    ['Quiero una tienda online de ropa', 'custom_store'],
    ['Quiero una landing page para una agencia de marketing', 'landing'],
    ['Quiero un sistema de reservas para un hotel', 'bookings'],
    ['Quiero una tienda WooCommerce', 'woocommerce'],
    ['Quiero un marketplace', 'marketplace'],
    ['Quiero un panel administrativo', 'admin_panel'],
    ['Quiero una plataforma educativa', 'lms'],
    ['Quiero una aplicación web de streaming', 'streaming'],
    ['Quiero un sistema de membresías', 'memberships'],
    ['Quiero un CRM para mi equipo de ventas', 'crm'],
    ['Quiero una app para Android TV de películas', 'android_tv'],
  ])('"%s" → %s', (idea, type) => {
    expect(detectIdea(idea).typeId).toBe(type);
  });

  it('SaaS + dominio: "SaaS de facturación" es un SaaS con módulo de facturación', () => {
    const d = detectIdea('Quiero un SaaS de facturación');
    expect(d.typeId).toBe('saas_business');
    expect(d.domainTypeId).toBe('invoicing');
  });

  it('extrae stack, requisitos, estilo y nombre de la idea de ejemplo', () => {
    const { spec, detection } = specFromIdea(EXAMPLE);
    expect(detection.typeId).toBe('woocommerce');
    expect(detection.techs).toEqual(expect.arrayContaining(['wordpress', 'woocommerce', 'php', 'mysql']));
    expect(detection.styles).toContain('Premium');
    expect(detection.paymentsRequested).toBe(true);
    expect(spec.answers.payment_gateways).toEqual(['auto']);
    expect(spec.name).toBe('Tienda online de ropa deportiva');
    const all = Object.values(spec.features).flat().join(' | ');
    expect(all).toMatch(/Inventario/);
    expect(all).toMatch(/Cupones/);
  });

  it('detecta país, moneda y pasarelas explícitas', () => {
    const { spec } = specFromIdea('Quiero una tienda online en Colombia con pagos por Wompi y Nequi');
    expect(spec.country).toBe('Colombia');
    expect(spec.currency).toBe('COP');
    expect(spec.integrations).toEqual(expect.arrayContaining(['wompi', 'nequi']));
    expect(spec.integrations).not.toContain('stripe');
  });

  it('no confunde palabras cortas ("pos" dentro de "posible")', () => {
    expect(detectIdea('Quiero lo antes posible una web para mi empresa').typeId).not.toBe('pos');
  });
});

describe('generación de prompts', () => {
  const { spec } = specFromIdea(EXAMPLE);
  const all = generateAll(spec);

  it('MASTER contiene todas las secciones obligatorias', () => {
    for (const heading of [
      '## ROL',
      '## CONTEXTO DEL PROYECTO',
      '## ANÁLISIS INICIAL',
      '## FORMA DE TRABAJO (CLAUDE CODE)',
      '## REGLAS DE DESARROLLO',
      '## STACK TECNOLÓGICO',
      '## FUNCIONALIDADES',
      '## ROLES Y PERMISOS',
      '## ARQUITECTURA',
      '## BASE DE DATOS',
      '## UI/UX Y DISEÑO',
      '## RESPONSIVE',
      '## SEGURIDAD',
      '## SEO',
      '## INTEGRACIONES',
      '## TESTING',
      '## DEPLOY Y DEVOPS',
      '## PLAN DE IMPLEMENTACIÓN',
      '## CRITERIOS DE ACEPTACIÓN',
      '## ENTREGA FINAL',
    ]) {
      expect(all.master).toContain(heading);
    }
    expect(all.master).toContain('FASE 12');
    expect(all.master).toContain('No inventes APIs');
    expect(all.master).toContain('Senior Full Stack Developer');
    expect(all.master).toMatch(/\| Rol \| Puede \| No puede \|/);
  });

  it('el orden de tamaño es QUICK < PRO < MASTER', () => {
    expect(all.quick.length).toBeLessThan(all.pro.length);
    expect(all.pro.length).toBeLessThan(all.master.length);
  });

  it('es determinista', () => {
    expect(generatePrompt(spec, 'master')).toBe(all.master);
  });

  it('WooCommerce usa el esquema nativo de WordPress y no inventa ORMs', () => {
    expect(all.master).toContain('dbDelta');
    expect(all.master).toContain('tema hijo');
  });

  it('"Claude elige" pide justificar el stack', () => {
    const s = createSpec('crm');
    const text = generatePrompt(s, 'pro');
    expect(text).toContain('Claude elige la mejor tecnología');
    expect(text).toMatch(/Justifica la decisión/);
  });

  it('las respuestas añaden funcionalidades e integraciones', () => {
    const s = createSpec('custom_store', { answers: { payment_gateways: ['wompi'], variants: true } });
    const r = resolveSpec(s);
    expect(r.integrations).toContain('wompi');
    expect(r.integrations).not.toContain('stripe');
    expect(Object.values(r.features).flat()).toContain('Variantes con stock y precio por combinación (SKU por variante)');
    expect(generatePrompt(s, 'master')).toContain('WOMPI_EVENTS_SECRET');
  });

  it('avisa de combinaciones de stack incoherentes', () => {
    expect(stackWarnings(['woocommerce', 'postgresql'])).toHaveLength(2);
  });

  it('genera para todos los tipos de proyecto sin errores', () => {
    for (const t of PROJECT_TYPES) {
      const text = generatePrompt(createSpec(t.id), 'master');
      expect(text.length).toBeGreaterThan(5000);
    }
  });
});

describe('Prompt Quality Score', () => {
  it('todas las plantillas MASTER están listas para Claude Code (≥ 90)', () => {
    for (const tpl of TEMPLATES) {
      const spec = specFromTemplate(tpl.id)!;
      const r = evaluatePrompt(generatePrompt(spec, 'master'), spec);
      expect(r.score, tpl.id).toBeGreaterThanOrEqual(90);
      expect(r.level).toBe('ready');
    }
  });

  it('la puntuación crece con el nivel de detalle', () => {
    const { spec } = specFromIdea(EXAMPLE);
    const all = generateAll(spec);
    const [q, p, m] = (['quick', 'pro', 'master'] as const).map((v) => evaluatePrompt(all[v], spec).score);
    expect(q).toBeLessThan(p);
    expect(p).toBeLessThan(m);
    expect(m).toBeGreaterThanOrEqual(95);
  });

  it('un texto vacío o pobre puntúa bajo', () => {
    expect(evaluatePrompt('').score).toBe(0);
    expect(evaluatePrompt('Hazme una web bonita').score).toBeLessThan(10);
  });

  it('marca como "no aplica" la base de datos y el SEO cuando corresponde', () => {
    const spec = createSpec('android_tv');
    const r = evaluatePrompt(generatePrompt(spec, 'master'), spec);
    expect(r.checks.find((c) => c.id === 'database')?.status).toBe('na');
    expect(r.checks.find((c) => c.id === 'seo')?.status).toBe('na');
  });
});

describe('Mejorar / Simplificar / Expandir', () => {
  const { spec } = specFromIdea('Quiero un panel administrativo');
  const all = generateAll(spec);

  it('Mejorar sube la puntuación y añade mejoras', () => {
    const before = evaluatePrompt(all.pro, spec).score;
    const res = improvePrompt(all.pro, spec);
    expect(evaluatePrompt(res.text, spec).score).toBeGreaterThan(before);
    expect(res.text).toContain('## MEJORAS ADICIONALES');
    expect(res.text).toContain('### Funcionalidades recomendadas');
  });

  it('Mejorar es idempotente (no duplica secciones)', () => {
    const once = improvePrompt(all.pro, spec).text;
    const twice = improvePrompt(once, spec).text;
    expect(twice.match(/## MEJORAS ADICIONALES/g)).toHaveLength(1);
    expect(twice.match(/## SEGURIDAD/g)).toHaveLength(1);
  });

  it('Mejorar funciona sobre un prompt escrito a mano (sin especificación)', () => {
    const res = improvePrompt('# Mi app\n\nQuiero una app de tareas con login y listas compartidas entre usuarios.');
    expect(res.text).toContain('## SEGURIDAD');
    expect(evaluatePrompt(res.text).score).toBeGreaterThan(60);
  });

  it('Mejorar conserva los requisitos añadidos por el usuario', () => {
    const custom = all.pro.replace('## SEGURIDAD\n', '## SEGURIDAD\n- Requisito propio: cifrar los backups con AES-256\n');
    const res = improvePrompt(custom, spec);
    expect(res.text).toContain('cifrar los backups con AES-256');
  });

  it('Simplificar acorta el prompt', () => {
    const res = simplifyPrompt(all.master);
    expect(res.text.length).toBeLessThan(all.master.length * 0.75);
    expect(res.text).toContain('## SEGURIDAD');
  });

  it('Expandir lleva QUICK al nivel MASTER', () => {
    const res = expandPrompt(all.quick, spec);
    expect(evaluatePrompt(res.text, spec).score).toBeGreaterThan(evaluatePrompt(all.quick, spec).score);
    expect(res.text).toContain('## CRITERIOS DE ACEPTACIÓN');
  });
});

describe('vista previa Markdown', () => {
  it('escapa HTML (sin XSS)', () => {
    const html = renderMarkdown('## Hola <script>alert(1)</script>\n- **negrita** <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>negrita</strong>');
  });

  it('renderiza tablas', () => {
    expect(renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')).toContain('<td>1</td>');
  });
});

import { PROJECT_TYPES, getProjectType } from './catalog';
import { COUNTRY_PRESETS, createSpec, featureGroupsFor } from './spec';
import { INTEGRATIONS, TECHS } from './techs';
import type { IntegrationId, ProjectSpec, TechId } from './types';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, kw: string): boolean {
  const k = normalize(kw);
  // Palabras cortas: coincidencia de palabra completa para evitar falsos positivos ("pos" en "posible").
  if (k.length <= 4) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text);
  return text.includes(k);
}

/** Tipos genéricos: pesan menos para que gane un tipo más específico. */
const GENERIC_WEIGHT: Record<string, number> = {
  custom_store: 0.6,
  webapp: 0.5,
  saas_business: 0.5,
  corporate: 0.5,
  portal: 0.6,
  api: 0.5,
  dashboard: 0.7,
};

/** Tipos "plataforma": si aparecen junto a un dominio de negocio, el dominio se integra como módulo. */
const PLATFORM_TYPES = new Set(['saas_business', 'saas_subscriptions', 'saas_multiuser', 'saas_multitenant', 'saas_plans', 'pwa', 'webapp', 'android', 'app_api']);

interface Requirement {
  keywords: string[];
  /** Coincidencia con una funcionalidad existente del tipo. */
  match: RegExp;
  label: string;
  group: string;
}

const REQUIREMENTS: Requirement[] = [
  { keywords: ['inventario', 'stock'], match: /inventario|stock/i, label: 'Gestión de inventario con alertas de stock bajo', group: 'Administración' },
  { keywords: ['cupon', 'cupones', 'descuento'], match: /cup[oó]n|promoci/i, label: 'Cupones y descuentos', group: 'Administración' },
  { keywords: ['usuarios', 'roles', 'clientes registrados'], match: /usuarios|roles/i, label: 'Gestión de usuarios y roles', group: 'Administración' },
  { keywords: ['dashboard', 'panel administrativo', 'panel de administracion', 'panel admin'], match: /dashboard/i, label: 'Dashboard administrativo con KPIs reales', group: 'Administración' },
  { keywords: ['reportes', 'informes', 'estadisticas'], match: /report|estad[ií]stic|m[eé]tric/i, label: 'Reportes y estadísticas exportables', group: 'Administración' },
  { keywords: ['resenas', 'reseñas', 'valoraciones', 'opiniones'], match: /rese[ñn]as|valoraci/i, label: 'Reseñas y valoraciones', group: 'Usuarios' },
  { keywords: ['favoritos', 'lista de deseos', 'wishlist'], match: /favorit|deseos/i, label: 'Favoritos / lista de deseos', group: 'Usuarios' },
  { keywords: ['chat', 'mensajeria', 'mensajes'], match: /chat|mensaj/i, label: 'Mensajería interna entre usuarios', group: 'Usuarios' },
  { keywords: ['notificaciones'], match: /notificaci/i, label: 'Notificaciones por email y en la app', group: 'Usuarios' },
  { keywords: ['facturas', 'facturacion'], match: /factura/i, label: 'Generación de facturas PDF', group: 'Administración' },
  { keywords: ['blog'], match: /blog|art[ií]culos/i, label: 'Blog con categorías y SEO por artículo', group: 'Contenido' },
  { keywords: ['carrito'], match: /carrito/i, label: 'Carrito de compras persistente', group: 'Usuarios' },
  { keywords: ['mapa', 'geolocalizacion', 'ubicacion'], match: /mapa|ubicaci/i, label: 'Mapa y geolocalización', group: 'Usuarios' },
  { keywords: ['calendario', 'agenda'], match: /calendario|agenda/i, label: 'Calendario / agenda', group: 'Usuarios' },
  { keywords: ['exportar', 'excel', 'csv'], match: /export|csv/i, label: 'Exportación de datos a CSV/Excel', group: 'Administración' },
  { keywords: ['pagos online', 'pago online', 'pagos en linea', 'pasarela de pago', 'pagos con tarjeta', 'cobros online'], match: /pago online|pago\b|checkout/i, label: 'Pago online seguro', group: 'Usuarios' },
];

const STYLE_KEYWORDS: Record<string, string[]> = {
  Premium: ['premium', 'alta gama'],
  Minimalista: ['minimalista', 'minimal', 'limpio'],
  Moderno: ['moderno', 'moderna', 'actual'],
  'Tecnológico': ['tecnologico', 'tech', 'futurista'],
  Elegante: ['elegante', 'sofisticado'],
  Corporativo: ['corporativo', 'profesional'],
  Juvenil: ['juvenil', 'divertido', 'colorido'],
  Deportivo: ['deportivo', 'deportiva', 'fitness', 'gym', 'gimnasio'],
  Lujo: ['lujo', 'luxury', 'exclusivo'],
  Editorial: ['editorial', 'revista'],
};

const COLOR_WORDS = ['negro', 'blanco', 'dorado', 'plateado', 'rojo', 'azul', 'verde', 'amarillo', 'naranja', 'morado', 'violeta', 'rosa', 'gris', 'beige', 'turquesa', 'vino', 'cian', 'marron', 'crema', 'neon'];

const TECH_KEYWORDS: Record<TechId, string[]> = {
  wordpress: ['wordpress'],
  woocommerce: ['woocommerce', 'woo commerce'],
  php: ['php'],
  laravel: ['laravel'],
  nodejs: ['node.js', 'nodejs', 'node js', 'express'],
  react: ['react'],
  nextjs: ['next.js', 'nextjs', 'next js'],
  vue: ['vue', 'nuxt'],
  typescript: ['typescript'],
  javascript: ['javascript'],
  mysql: ['mysql', 'mariadb'],
  postgresql: ['postgres', 'postgresql'],
  mongodb: ['mongo', 'mongodb'],
  firebase: ['firebase'],
  supabase: ['supabase'],
  rest: ['api rest', 'rest api'],
  graphql: ['graphql'],
  tailwind: ['tailwind'],
  kotlin: ['kotlin', 'jetpack compose'],
};

export interface Detection {
  typeId: string;
  confidence: 'alta' | 'media' | 'baja';
  domainTypeId: string | null;
  candidates: { id: string; label: string; score: number }[];
  integrations: IntegrationId[];
  techs: TechId[];
  styles: string[];
  colors: string[];
  darkMode: boolean;
  country: (typeof COUNTRY_PRESETS)[number] | null;
  requirements: string[];
  paymentsRequested: boolean;
  multilingual: boolean;
  name: string;
  scope: ProjectSpec['scope'];
}

export function detectIdea(idea: string): Detection {
  const text = normalize(idea);

  const scores = PROJECT_TYPES.filter((t) => t.id !== 'custom')
    .map((t) => {
      let score = 0;
      for (const kw of t.keywords) if (has(text, kw)) score += normalize(kw).length;
      return { id: t.id, label: t.label, score: score * (GENERIC_WEIGHT[t.id] ?? 1) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  let typeId = scores[0]?.id ?? 'custom';
  let domainTypeId: string | null = null;

  // "Tienda ... con WooCommerce": la plataforma manda.
  if (has(text, 'woocommerce') || has(text, 'woo commerce')) typeId = 'woocommerce';

  // "SaaS de facturación", "app de reservas": plataforma + dominio de negocio.
  const saasWord = /\bsaas\b|software como servicio/.test(text);
  if (saasWord) {
    const domain = scores.find((s) => !PLATFORM_TYPES.has(s.id) && getProjectType(s.id).category !== 'saas');
    const platform = /multiempresa|multi.?tenant|marca blanca/.test(text)
      ? 'saas_multitenant'
      : /suscripci|mensualidad|planes/.test(text)
        ? 'saas_subscriptions'
        : /multiusuario|colaborativ|equipos/.test(text)
          ? 'saas_multiuser'
          : 'saas_business';
    typeId = platform;
    if (domain) domainTypeId = domain.id;
  } else if (PLATFORM_TYPES.has(typeId)) {
    const domain = scores.find((s) => !PLATFORM_TYPES.has(s.id));
    if (domain && domain.score >= 5) {
      // "Aplicación web de streaming" → el dominio es más específico que la plataforma.
      if (typeId === 'webapp') typeId = domain.id;
      else domainTypeId = domain.id;
    }
  }

  const integrations = INTEGRATIONS.filter((i) => i.keywords.some((k) => has(text, k))).map((i) => i.id);
  const techs = (Object.keys(TECH_KEYWORDS) as TechId[]).filter((id) => TECH_KEYWORDS[id].some((k) => has(text, k)));
  if (techs.includes('woocommerce') && !techs.includes('wordpress')) techs.unshift('wordpress');
  if (typeId === 'woocommerce' && !techs.includes('woocommerce')) techs.push('wordpress', 'woocommerce');
  if (techs.includes('wordpress')) for (const t of ['php', 'mysql'] as TechId[]) if (!techs.includes(t)) techs.push(t);

  const styles = Object.entries(STYLE_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => has(text, k)))
    .map(([s]) => s);
  const colors = COLOR_WORDS.filter((c) => has(text, c));
  const darkMode = /modo oscuro|dark mode|tema oscuro|fondo oscuro|dark/.test(text);

  const country =
    COUNTRY_PRESETS.find((c) => c.country !== 'Internacional' && text.includes(normalize(c.country))) ??
    (/\bcolombian/.test(text) ? COUNTRY_PRESETS[0] : /mexican/.test(text) ? COUNTRY_PRESETS[1] : null);

  const requirements = REQUIREMENTS.filter((r) => r.keywords.some((k) => has(text, k))).map((r) => r.label);
  const paymentsRequested = /pago|pagos|cobro|checkout|pasarela/.test(text);
  const multilingual = /multi.?idioma|multilenguaje|varios idiomas|bilingue|ingles y espanol|espanol e ingles/.test(text);

  const nameMatch = idea.match(/(?:llamad[oa]|de nombre|nombre(?: es)?)\s*[:"“']?\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&.\- ]{1,40}?)(?=["”',.;]|\s+(?:con|para|que|y)\s|$)/);
  const name = nameMatch ? nameMatch[1].trim() : '';

  const scope: ProjectSpec['scope'] = /mvp|prototipo|basico|sencill|simple/.test(text)
    ? 'mvp'
    : /empresarial|enterprise|escalable|robusto|gran escala|alto trafico/.test(text)
      ? 'enterprise'
      : 'complete';

  const top = scores[0]?.score ?? 0;
  const second = scores[1]?.score ?? 0;
  const confidence: Detection['confidence'] =
    typeId === 'custom' ? 'baja' : top >= 8 && top - second >= 3 ? 'alta' : top >= 4 ? 'media' : 'baja';

  return {
    typeId,
    confidence,
    domainTypeId,
    candidates: scores.slice(0, 5).map((s) => ({ ...s, score: Math.round(s.score * 10) / 10 })),
    integrations,
    techs,
    styles,
    colors,
    darkMode,
    country,
    requirements,
    paymentsRequested,
    multilingual,
    name,
    scope,
  };
}

/** Nombre de trabajo derivado de la idea: "Quiero una tienda online de ropa deportiva con…" → "Tienda online de ropa deportiva". */
export function suggestName(idea: string): string {
  let s = idea
    .trim()
    .replace(/^(quiero|necesito|me gustar[ií]a|deseo|busco)\s+(crear|hacer|construir|desarrollar|tener|montar)?\s*/i, '')
    .replace(/^(una?|el|la|los|las|mi)\s+/i, '');
  s = s.split(/\s+(?:con|que|donde|usando|en la que|en el que)\s+|[,.;:(]/i)[0] ?? s;
  s = s.trim();
  if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, '');
  return s ? capitalize(s) : '';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Crea una especificación inicial completa a partir de la idea en texto libre. */
export function specFromIdea(idea: string, overrides: Partial<ProjectSpec> = {}): { spec: ProjectSpec; detection: Detection } {
  const d = detectIdea(idea);
  const typeId = overrides.projectType ?? d.typeId;
  const type = getProjectType(typeId);
  const answers: ProjectSpec['answers'] = {};
  if (d.domainTypeId && typeId !== 'woocommerce') answers.domain_type = d.domainTypeId;

  const gateways = d.integrations.filter((i) => ['stripe', 'paypal', 'mercadopago', 'wompi', 'nequi'].includes(i));
  if (gateways.length) answers.payment_gateways = gateways;
  else if (d.paymentsRequested) answers.payment_gateways = ['auto'];

  const spec = createSpec(typeId, { scope: d.scope, answers });
  const cleanIdea = idea.trim();
  spec.idea = cleanIdea;
  spec.name = d.name || suggestName(cleanIdea);
  spec.description = capitalize(cleanIdea.replace(/^(quiero|necesito|me gustaria|deseo|busco)\s+(crear|hacer|construir|desarrollar|tener)?\s*/i, ''));
  spec.multilingual = d.multilingual;
  if (d.country) {
    spec.country = d.country.country;
    spec.currency = d.country.currency;
    spec.language = d.country.language;
  }
  if (d.styles.length) spec.design.styles = d.styles;
  if (d.colors.length) spec.design.colors = d.colors.map(capitalize).join(', ');
  if (d.darkMode) spec.design.themeMode = 'dark';
  if (d.techs.length) spec.tech = { mode: 'custom', selected: d.techs, hosting: '' };
  if (type.id === 'custom') spec.customTypeLabel = '';

  // Integraciones: las del tipo + las mencionadas explícitamente.
  const mentionedGateways = gateways.length > 0;
  const base = mentionedGateways
    ? spec.integrations.filter((i) => !['stripe', 'paypal', 'mercadopago', 'wompi', 'nequi'].includes(i))
    : spec.integrations;
  spec.integrations = [...new Set([...base, ...d.integrations])];

  // Requisitos de la idea: activar la funcionalidad equivalente o añadirla.
  const groups = featureGroupsFor(spec);
  for (const req of REQUIREMENTS) {
    if (!d.requirements.includes(req.label)) continue;
    let found = false;
    for (const grp of groups) {
      const item = grp.items.find((i) => req.match.test(i.label));
      if (item) {
        found = true;
        const list = spec.features[grp.name] ?? [];
        if (!list.includes(item.label)) spec.features[grp.name] = [...list, item.label];
        break;
      }
    }
    if (!found) {
      const group = 'Requisitos indicados en la idea';
      spec.features[group] = [...(spec.features[group] ?? []), req.label];
    }
  }

  return { spec: { ...spec, ...overrides, answers: { ...spec.answers, ...(overrides.answers ?? {}) } }, detection: d };
}

export function techIdsFromLabels(labels: string[]): TechId[] {
  const set = new Set(labels.map(normalize));
  return TECHS.filter((t) => set.has(normalize(t.label))).map((t) => t.id);
}

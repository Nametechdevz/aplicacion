import { getProjectType } from './catalog';
import type { AnswerValue, CategoryId, IntegrationId, ProjectSpec, Question } from './types';

const PAYMENT_OPTIONS = [
  { value: 'auto', label: 'Claude elige según el país' },
  { value: 'stripe', label: 'Stripe', addIntegrations: ['stripe'] as IntegrationId[] },
  { value: 'paypal', label: 'PayPal', addIntegrations: ['paypal'] as IntegrationId[] },
  { value: 'mercadopago', label: 'Mercado Pago', addIntegrations: ['mercadopago'] as IntegrationId[] },
  { value: 'wompi', label: 'Wompi (Colombia)', addIntegrations: ['wompi'] as IntegrationId[] },
  { value: 'nequi', label: 'Nequi (Colombia)', addIntegrations: ['nequi'] as IntegrationId[] },
  { value: 'cod', label: 'Pago contra entrega', addFeatures: [{ group: 'Pagos', items: ['Pago contra entrega con confirmación manual del pedido'] }] },
  { value: 'transfer', label: 'Transferencia bancaria', addFeatures: [{ group: 'Pagos', items: ['Pago por transferencia con subida de comprobante y validación manual'] }] },
];

export const QUESTIONS: Record<string, Question> = {
  // ---------------- E-commerce ----------------
  product_kind: {
    id: 'product_kind',
    label: '¿Qué tipo de productos se venden?',
    type: 'single',
    options: [
      { value: 'physical', label: 'Físicos (requieren envío)' },
      { value: 'digital', label: 'Digitales (descargables)', addFeatures: [{ group: 'Cliente', items: ['Descargas seguras con enlaces firmados'] }] },
      { value: 'mixed', label: 'Físicos y digitales', addFeatures: [{ group: 'Cliente', items: ['Descargas seguras con enlaces firmados'] }] },
    ],
  },
  variants: {
    id: 'variants',
    label: '¿Los productos tienen variantes (talla, color, material)?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'Administrador', items: ['Variantes con stock y precio por combinación (SKU por variante)'] }] },
  },
  payment_gateways: {
    id: 'payment_gateways',
    label: 'Pasarelas o métodos de pago',
    help: 'Si no estás seguro, deja que Claude elija la pasarela más adecuada para el país.',
    type: 'multi',
    options: PAYMENT_OPTIONS,
  },
  shipping: {
    id: 'shipping',
    label: '¿Cómo se gestionan los envíos?',
    type: 'single',
    options: [
      { value: 'flat', label: 'Tarifa fija / por zonas', addFeatures: [{ group: 'Administrador', items: ['Zonas de envío con tarifas configurables'] }] },
      { value: 'free_threshold', label: 'Gratis a partir de un importe', addFeatures: [{ group: 'Administrador', items: ['Envío gratis a partir de un importe configurable'] }] },
      { value: 'carrier', label: 'Integración con transportadora', addIntegrations: ['external_api'], addFeatures: [{ group: 'Administrador', items: ['Cotización y guías de envío con la API documentada de la transportadora'] }] },
      { value: 'pickup', label: 'Recogida en tienda', addFeatures: [{ group: 'Cliente', items: ['Opción de recogida en tienda'] }] },
      { value: 'none', label: 'Sin envíos' },
    ],
  },
  guest_checkout: {
    id: 'guest_checkout',
    label: '¿Permitir compra como invitado (sin registrarse)?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'Cliente', items: ['Checkout como invitado con opción de crear cuenta al final'] }] },
  },
  invoices_ecommerce: {
    id: 'invoices_ecommerce',
    label: '¿Se deben generar facturas de las ventas?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'Administrador', items: ['Generación de factura PDF por pedido con numeración consecutiva'] }] },
  },
  catalog_size: {
    id: 'catalog_size',
    label: 'Tamaño aproximado del catálogo',
    type: 'single',
    options: [
      { value: 'small', label: 'Menos de 100 productos' },
      { value: 'medium', label: '100 – 5.000 productos' },
      { value: 'large', label: 'Más de 5.000 productos', addFeatures: [{ group: 'Administrador', items: ['Importación y actualización masiva de productos por CSV'] }] },
    ],
  },

  // ---------------- Reservas ----------------
  booking_resource: {
    id: 'booking_resource',
    label: '¿Qué se reserva?',
    type: 'text',
    placeholder: 'Ej.: habitaciones de hotel, citas con profesionales, mesas, canchas…',
  },
  booking_payment: {
    id: 'booking_payment',
    label: 'Cobro de la reserva',
    type: 'single',
    options: [
      { value: 'full', label: 'Pago total online' },
      { value: 'deposit', label: 'Anticipo / depósito', addFeatures: [{ group: 'Cliente', items: ['Pago de anticipo configurable (porcentaje o importe)'] }] },
      { value: 'onsite', label: 'Pago en el lugar' },
    ],
  },
  booking_policy: {
    id: 'booking_policy',
    label: 'Política de cancelación',
    type: 'text',
    placeholder: 'Ej.: cancelación gratuita hasta 48 h antes; después se cobra el 50 %',
  },

  // ---------------- SaaS ----------------
  pricing_model: {
    id: 'pricing_model',
    label: 'Modelo de precios',
    type: 'single',
    options: [
      { value: 'flat', label: 'Planes fijos (mensual/anual)' },
      { value: 'per_seat', label: 'Por usuario (asiento)', addFeatures: [{ group: 'Facturación', items: ['Cobro por número de usuarios con ajuste automático'] }] },
      { value: 'usage', label: 'Por uso', addFeatures: [{ group: 'Facturación', items: ['Medición de uso y facturación por consumo'] }] },
      { value: 'freemium', label: 'Freemium', addFeatures: [{ group: 'Facturación', items: ['Plan gratuito con límites y upgrade dentro de la app'] }] },
      { value: 'none', label: 'Sin cobro por ahora' },
    ],
  },
  trial: {
    id: 'trial',
    label: '¿Ofrecer periodo de prueba?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'Facturación', items: ['Periodo de prueba con avisos antes del vencimiento'] }] },
  },
  tenancy: {
    id: 'tenancy',
    label: 'Aislamiento de datos entre clientes',
    type: 'single',
    options: [
      { value: 'row', label: 'Base de datos compartida con tenant_id (recomendado)' },
      { value: 'schema', label: 'Un esquema por cliente' },
      { value: 'auto', label: 'Claude decide y justifica' },
    ],
  },
  core_module: {
    id: 'core_module',
    label: '¿Cuál es la funcionalidad principal del producto?',
    help: 'Describe qué hace el usuario en el día a día dentro de la aplicación.',
    type: 'textarea',
    placeholder: 'Ej.: crear y enviar facturas electrónicas a sus clientes y controlar los cobros',
  },
  public_api: {
    id: 'public_api',
    label: '¿Necesita una API pública para terceros?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'API pública', items: ['API REST pública versionada con claves por organización', 'Documentación OpenAPI', 'Webhooks salientes'] }], addIntegrations: ['webhooks'] },
  },

  // ---------------- Sistemas ----------------
  users_count: {
    id: 'users_count',
    label: 'Usuarios simultáneos esperados',
    type: 'single',
    options: [
      { value: 'small', label: 'Menos de 50' },
      { value: 'medium', label: '50 – 1.000' },
      { value: 'large', label: 'Más de 1.000' },
    ],
  },
  multi_branch: {
    id: 'multi_branch',
    label: '¿Varias sedes o sucursales?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'Administración', items: ['Gestión multi-sucursal con datos y permisos por sede'] }] },
  },
  data_migration: {
    id: 'data_migration',
    label: '¿Hay datos existentes que migrar?',
    type: 'text',
    placeholder: 'Ej.: Excel con 3.000 clientes, base de datos MySQL antigua…',
  },
  reports_needed: {
    id: 'reports_needed',
    label: 'Reportes imprescindibles',
    type: 'textarea',
    placeholder: 'Ej.: ventas por vendedor mensual, cartera vencida, rotación de inventario',
  },

  // ---------------- Web ----------------
  pages_list: {
    id: 'pages_list',
    label: 'Páginas o secciones necesarias',
    type: 'textarea',
    placeholder: 'Ej.: Inicio, Servicios, Casos de éxito, Blog, Contacto',
  },
  main_cta: {
    id: 'main_cta',
    label: 'Acción principal que debe hacer el visitante (CTA)',
    type: 'text',
    placeholder: 'Ej.: solicitar una auditoría gratuita',
  },
  content_editing: {
    id: 'content_editing',
    label: '¿Quién editará el contenido?',
    type: 'single',
    options: [
      { value: 'cms', label: 'El cliente, desde un panel (CMS)' },
      { value: 'dev', label: 'Solo desarrolladores (contenido en código)' },
    ],
  },
  has_copy: {
    id: 'has_copy',
    label: '¿Ya existen textos e imágenes definitivos?',
    type: 'single',
    options: [
      { value: 'yes', label: 'Sí, se proporcionarán' },
      { value: 'no', label: 'No: Claude debe redactar textos realistas para el negocio' },
    ],
  },

  // ---------------- Apps ----------------
  offline: {
    id: 'offline',
    label: '¿Debe funcionar sin conexión?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'App', items: ['Modo offline con cola de sincronización y resolución de conflictos'] }] },
  },
  push: {
    id: 'push',
    label: '¿Notificaciones push?',
    type: 'boolean',
    whenTrue: { addFeatures: [{ group: 'App', items: ['Notificaciones push con preferencias por usuario'] }], addIntegrations: ['firebase'] },
  },
  platforms_target: {
    id: 'platforms_target',
    label: 'Versión mínima / dispositivos objetivo',
    type: 'text',
    placeholder: 'Ej.: Android 8+, tablets y teléfonos',
  },
  content_source: {
    id: 'content_source',
    label: 'Origen del contenido o datos',
    type: 'text',
    placeholder: 'Ej.: API propia, CMS headless, proveedor de video…',
  },

  // ---------------- Comunes ----------------
  notifications_channels: {
    id: 'notifications_channels',
    label: 'Canales de notificación',
    type: 'multi',
    options: [
      { value: 'email', label: 'Email', addIntegrations: ['email'] },
      { value: 'whatsapp', label: 'WhatsApp', addIntegrations: ['whatsapp'] },
      { value: 'telegram', label: 'Telegram', addIntegrations: ['telegram'] },
      { value: 'inapp', label: 'Dentro de la app', addFeatures: [{ group: 'Notificaciones', items: ['Centro de notificaciones en la app con leídas/no leídas'] }] },
    ],
  },
  compliance: {
    id: 'compliance',
    label: 'Requisitos legales o normativos',
    type: 'text',
    placeholder: 'Ej.: RGPD, Ley 1581 de Habeas Data (Colombia), facturación electrónica DIAN…',
  },
  deadline: {
    id: 'deadline',
    label: 'Prioridad de entrega',
    type: 'single',
    options: [
      { value: 'fast', label: 'Lo antes posible (MVP funcional)' },
      { value: 'balanced', label: 'Equilibrio entre rapidez y calidad' },
      { value: 'quality', label: 'Máxima calidad y robustez' },
    ],
  },
};

const BY_CATEGORY: Record<CategoryId, string[]> = {
  web: ['pages_list', 'main_cta', 'content_editing', 'has_copy', 'compliance'],
  ecommerce: ['product_kind', 'variants', 'payment_gateways', 'shipping', 'guest_checkout', 'invoices_ecommerce', 'catalog_size', 'notifications_channels', 'compliance'],
  sistemas: ['core_module', 'users_count', 'multi_branch', 'data_migration', 'reports_needed', 'notifications_channels', 'compliance'],
  saas: ['core_module', 'pricing_model', 'trial', 'tenancy', 'public_api', 'payment_gateways', 'notifications_channels', 'compliance'],
  apps: ['core_module', 'offline', 'push', 'platforms_target', 'content_source', 'notifications_channels'],
  custom: ['core_module', 'users_count', 'payment_gateways', 'notifications_channels', 'compliance', 'deadline'],
};

const BY_TYPE: Record<string, string[]> = {
  bookings: ['booking_resource', 'booking_payment', 'booking_policy', 'payment_gateways'],
  subscriptions: ['pricing_model', 'trial'],
  memberships: ['pricing_model', 'trial'],
  digital_store: ['payment_gateways'],
  invoicing: ['payment_gateways'],
  lms: ['pricing_model', 'payment_gateways'],
  streaming: ['pricing_model', 'payment_gateways'],
  pos: ['offline', 'payment_gateways'],
  inventory: ['offline'],
  landing: ['payment_gateways'],
};

const EXCLUDE_BY_TYPE: Record<string, string[]> = {
  digital_store: ['shipping', 'variants', 'product_kind'],
  subscriptions: ['catalog_size'],
  memberships: ['shipping', 'variants', 'catalog_size', 'product_kind', 'guest_checkout'],
  services_store: ['shipping', 'variants', 'catalog_size', 'product_kind'],
  api: ['pricing_model', 'trial', 'payment_gateways'],
  dashboard: ['pricing_model', 'trial', 'tenancy', 'payment_gateways'],
  android_tv: ['offline', 'push', 'notifications_channels'],
  landing: ['content_editing'],
};

/** Preguntas específicas para un tipo de proyecto (categoría + tipo, sin duplicados). */
export function questionsFor(typeId: string): Question[] {
  const type = getProjectType(typeId);
  const ids = [...(BY_TYPE[type.id] ?? []), ...BY_CATEGORY[type.category], ...(type.questions ?? [])];
  const excluded = new Set(EXCLUDE_BY_TYPE[type.id] ?? []);
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const id of ids) {
    if (seen.has(id) || excluded.has(id)) continue;
    seen.add(id);
    const q = QUESTIONS[id];
    if (q) out.push(q);
  }
  return out;
}

/** Texto legible de una respuesta. */
export function answerText(q: Question, value: AnswerValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (q.type === 'boolean') return value === true ? 'Sí' : value === false ? 'No' : null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(', ');
  }
  const s = String(value).trim();
  if (!s) return null;
  if (q.type === 'single') return q.options?.find((o) => o.value === s)?.label ?? s;
  return s;
}

/** Aplica los efectos de las respuestas: funcionalidades e integraciones adicionales. */
export function answerEffects(spec: Pick<ProjectSpec, 'answers' | 'projectType'>): {
  features: Record<string, string[]>;
  integrations: IntegrationId[];
} {
  const features: Record<string, string[]> = {};
  const integrations = new Set<IntegrationId>();
  const add = (fx?: { group: string; items: string[] }[], ints?: IntegrationId[]) => {
    for (const f of fx ?? []) {
      features[f.group] = [...(features[f.group] ?? []), ...f.items];
    }
    for (const i of ints ?? []) integrations.add(i);
  };
  for (const q of questionsFor(spec.projectType)) {
    const v = spec.answers[q.id];
    if (v === undefined) continue;
    if (q.type === 'boolean' && v === true) add(q.whenTrue?.addFeatures, q.whenTrue?.addIntegrations);
    const values = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    for (const val of values) {
      const opt = q.options?.find((o) => o.value === val);
      if (opt) add(opt.addFeatures, opt.addIntegrations);
    }
  }
  return { features, integrations: [...integrations] };
}

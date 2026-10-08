import { specFromIdea } from './detect';
import type { ProjectSpec } from './types';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  typeId: string;
  idea: string;
  icon: string;
  patch?: (spec: ProjectSpec) => void;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'tpl-landing',
    name: 'Landing Page',
    description: 'Landing de conversión con captación de leads, FAQ, precios y métricas.',
    typeId: 'landing',
    icon: 'rocket',
    idea: 'Quiero una landing page de alta conversión para una agencia de marketing digital, con formulario de leads y diseño moderno',
    patch: (s) => {
      s.answers.main_cta = 'Agendar una consultoría gratuita';
      s.design.styles = ['Moderno', 'Tecnológico'];
    },
  },
  {
    id: 'tpl-saas',
    name: 'SaaS',
    description: 'SaaS B2B con organizaciones, equipos, planes y facturación con Stripe.',
    typeId: 'saas_business',
    icon: 'cloud',
    idea: 'Quiero un SaaS para empresas con organizaciones, equipos, planes de suscripción y panel de superadmin',
    patch: (s) => {
      s.answers.pricing_model = 'per_seat';
      s.answers.trial = true;
      s.answers.tenancy = 'row';
    },
  },
  {
    id: 'tpl-woocommerce',
    name: 'WooCommerce',
    description: 'Tienda WordPress + WooCommerce con tema hijo, variantes, pagos e inventario.',
    typeId: 'woocommerce',
    icon: 'shopping-bag',
    idea: 'Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones, usuarios, dashboard administrativo y diseño premium',
    patch: (s) => {
      s.answers.variants = true;
      s.answers.product_kind = 'physical';
    },
  },
  {
    id: 'tpl-ecommerce',
    name: 'E-commerce',
    description: 'Tienda a medida con catálogo, carrito, checkout, pagos y panel completo.',
    typeId: 'custom_store',
    icon: 'store',
    idea: 'Quiero una tienda online a medida con catálogo, carrito, checkout, pagos online, cupones y panel administrativo',
    patch: (s) => {
      s.answers.product_kind = 'physical';
      s.answers.guest_checkout = true;
    },
  },
  {
    id: 'tpl-marketplace',
    name: 'Marketplace',
    description: 'Plataforma multivendedor con comisiones, sub-pedidos y liquidaciones.',
    typeId: 'marketplace',
    icon: 'store',
    idea: 'Quiero un marketplace multivendedor donde los vendedores publiquen productos y la plataforma cobre comisión',
  },
  {
    id: 'tpl-dashboard',
    name: 'Dashboard',
    description: 'Panel de analítica con KPIs, gráficos, filtros y exportaciones.',
    typeId: 'dashboard',
    icon: 'chart',
    idea: 'Quiero un dashboard de analítica con KPIs, gráficos, filtros por fecha y exportación de reportes',
  },
  {
    id: 'tpl-crm',
    name: 'CRM',
    description: 'Contactos, empresas, pipeline Kanban, actividades y reportes comerciales.',
    typeId: 'crm',
    icon: 'users',
    idea: 'Quiero un CRM para un equipo de ventas con pipeline de oportunidades, actividades y reportes',
  },
  {
    id: 'tpl-erp',
    name: 'ERP',
    description: 'Ventas, compras, inventario y finanzas en un solo sistema.',
    typeId: 'erp',
    icon: 'building',
    idea: 'Quiero un ERP para una pyme con ventas, compras, inventario, cuentas por cobrar y reportes',
  },
  {
    id: 'tpl-blog',
    name: 'Blog',
    description: 'Blog con editor, categorías, comentarios moderados, newsletter y SEO.',
    typeId: 'blog',
    icon: 'pen',
    idea: 'Quiero un blog profesional con categorías, comentarios, newsletter y SEO avanzado',
  },
  {
    id: 'tpl-portfolio',
    name: 'Portfolio',
    description: 'Portafolio personal con proyectos, servicios y contacto.',
    typeId: 'portfolio',
    icon: 'image',
    idea: 'Quiero un portafolio minimalista para un diseñador freelance con proyectos y formulario de contacto',
  },
  {
    id: 'tpl-lms',
    name: 'LMS',
    description: 'Cursos online con lecciones, cuestionarios, progreso y certificados.',
    typeId: 'lms',
    icon: 'graduation',
    idea: 'Quiero una plataforma educativa con cursos online, lecciones en video, cuestionarios y certificados',
  },
  {
    id: 'tpl-bookings',
    name: 'Sistema de reservas',
    description: 'Disponibilidad, reservas, depósitos y calendario de ocupación.',
    typeId: 'bookings',
    icon: 'calendar',
    idea: 'Quiero un sistema de reservas para un hotel con disponibilidad en tiempo real, pagos y check-in',
    patch: (s) => {
      s.answers.booking_resource = 'Habitaciones de hotel';
      s.answers.booking_payment = 'deposit';
    },
  },
  {
    id: 'tpl-invoicing',
    name: 'Sistema de facturación',
    description: 'Cotizaciones, facturas, pagos parciales y cartera.',
    typeId: 'invoicing',
    icon: 'receipt',
    idea: 'Quiero un sistema de facturación con clientes, cotizaciones, facturas en PDF y control de pagos',
  },
  {
    id: 'tpl-api',
    name: 'API',
    description: 'API REST documentada con OpenAPI, claves, rate limiting y webhooks.',
    typeId: 'api',
    icon: 'code',
    idea: 'Quiero una API REST versionada con autenticación por claves, documentación OpenAPI y webhooks',
  },
  {
    id: 'tpl-pwa',
    name: 'PWA',
    description: 'App instalable, offline y con notificaciones push.',
    typeId: 'pwa',
    icon: 'smartphone',
    idea: 'Quiero una PWA instalable que funcione sin conexión y envíe notificaciones push',
    patch: (s) => {
      s.answers.offline = true;
      s.answers.push = true;
    },
  },
  {
    id: 'tpl-wordpress',
    name: 'WordPress',
    description: 'Sitio corporativo en WordPress con tema a medida y editor de bloques.',
    typeId: 'corporate',
    icon: 'globe',
    idea: 'Quiero una página corporativa en WordPress con tema a medida, blog y formulario de contacto',
    patch: (s) => {
      s.tech = { mode: 'custom', selected: ['wordpress', 'php', 'mysql'], hosting: '' };
      s.answers.content_editing = 'cms';
    },
  },
  {
    id: 'tpl-digital',
    name: 'Tienda digital',
    description: 'Venta de productos descargables con entrega segura y licencias.',
    typeId: 'digital_store',
    icon: 'download',
    idea: 'Quiero una tienda de productos digitales para vender plantillas y ebooks con descargas seguras',
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function specFromTemplate(id: string): ProjectSpec | null {
  const tpl = getTemplate(id);
  if (!tpl) return null;
  const { spec } = specFromIdea(tpl.idea, { projectType: tpl.typeId });
  tpl.patch?.(spec);
  spec.templateId = tpl.id;
  return spec;
}

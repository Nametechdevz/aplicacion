import type { IntegrationId, TechId } from './types';

export interface TechDef {
  id: TechId;
  label: string;
  group: 'Plataforma' | 'Backend' | 'Frontend' | 'Lenguaje' | 'Base de datos' | 'BaaS' | 'API' | 'Estilos' | 'Móvil';
}

export const TECHS: TechDef[] = [
  { id: 'wordpress', label: 'WordPress', group: 'Plataforma' },
  { id: 'woocommerce', label: 'WooCommerce', group: 'Plataforma' },
  { id: 'php', label: 'PHP', group: 'Backend' },
  { id: 'laravel', label: 'Laravel', group: 'Backend' },
  { id: 'nodejs', label: 'Node.js', group: 'Backend' },
  { id: 'react', label: 'React', group: 'Frontend' },
  { id: 'nextjs', label: 'Next.js', group: 'Frontend' },
  { id: 'vue', label: 'Vue', group: 'Frontend' },
  { id: 'typescript', label: 'TypeScript', group: 'Lenguaje' },
  { id: 'javascript', label: 'JavaScript', group: 'Lenguaje' },
  { id: 'mysql', label: 'MySQL', group: 'Base de datos' },
  { id: 'postgresql', label: 'PostgreSQL', group: 'Base de datos' },
  { id: 'mongodb', label: 'MongoDB', group: 'Base de datos' },
  { id: 'firebase', label: 'Firebase', group: 'BaaS' },
  { id: 'supabase', label: 'Supabase', group: 'BaaS' },
  { id: 'rest', label: 'API REST', group: 'API' },
  { id: 'graphql', label: 'GraphQL', group: 'API' },
  { id: 'tailwind', label: 'Tailwind CSS', group: 'Estilos' },
  { id: 'kotlin', label: 'Kotlin (Android)', group: 'Móvil' },
];

export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechDef>;

export function techLabels(ids: TechId[]): string[] {
  return ids.map((id) => TECH_BY_ID[id]?.label ?? id);
}

/** Avisos de coherencia del stack elegido manualmente. */
export function stackWarnings(ids: TechId[]): string[] {
  const s = new Set(ids);
  const w: string[] = [];
  if (s.has('woocommerce') && !s.has('wordpress')) {
    w.push('WooCommerce es un plugin de WordPress: se asumirá WordPress como base.');
  }
  if (s.has('typescript') && s.has('javascript')) {
    w.push('TypeScript y JavaScript a la vez: se usará TypeScript como lenguaje principal.');
  }
  const dbs = ['mysql', 'postgresql', 'mongodb'].filter((d) => s.has(d as TechId));
  if (dbs.length > 1) {
    w.push('Hay varias bases de datos seleccionadas: Claude debe justificar el rol de cada una o elegir una principal.');
  }
  if ((s.has('wordpress') || s.has('woocommerce')) && (s.has('postgresql') || s.has('mongodb'))) {
    w.push('WordPress solo es compatible oficialmente con MySQL/MariaDB.');
  }
  const fronts = ['react', 'vue'].filter((d) => s.has(d as TechId));
  if (fronts.length > 1) w.push('React y Vue a la vez: elige un único framework de UI salvo que haya un motivo claro.');
  return w;
}

export interface IntegrationDef {
  id: IntegrationId;
  label: string;
  kind: 'Pagos' | 'Mensajería' | 'Identidad' | 'Backend' | 'Comunicación' | 'Integración';
  description: string;
  envVars: string[];
  /** Requisitos técnicos verificables para Claude. */
  requirements: string[];
  /** Palabras clave de detección en la idea. */
  keywords: string[];
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'stripe',
    label: 'Stripe',
    kind: 'Pagos',
    description: 'Pagos con tarjeta, Checkout, suscripciones y facturación recurrente.',
    envVars: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    requirements: [
      'Usar el SDK oficial de Stripe y Stripe Checkout o Payment Intents (nunca procesar datos de tarjeta en el servidor propio).',
      'Confirmar el estado del pago exclusivamente vía webhook verificado con la firma (STRIPE_WEBHOOK_SECRET), no por redirección del cliente.',
      'Procesar webhooks de forma idempotente (registrar el event.id procesado).',
      'Para suscripciones: Products/Prices de Stripe, Customer Portal y sincronización de estados (active, past_due, canceled).',
    ],
    keywords: ['stripe'],
  },
  {
    id: 'paypal',
    label: 'PayPal',
    kind: 'Pagos',
    description: 'Cobros con cuenta PayPal y tarjetas mediante PayPal Checkout.',
    envVars: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_ENV'],
    requirements: [
      'Integrar PayPal Checkout con la API de Orders v2 (crear y capturar la orden en el servidor).',
      'Verificar los webhooks con la API de verificación de firmas de PayPal usando PAYPAL_WEBHOOK_ID.',
      'Separar sandbox y producción con PAYPAL_ENV.',
    ],
    keywords: ['paypal'],
  },
  {
    id: 'mercadopago',
    label: 'Mercado Pago',
    kind: 'Pagos',
    description: 'Pasarela de pagos para Latinoamérica (Checkout Pro / Checkout API).',
    envVars: ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_WEBHOOK_SECRET'],
    requirements: [
      'Usar el SDK oficial de Mercado Pago (Checkout Pro o Checkout API según el flujo).',
      'Confirmar pagos mediante notificaciones (webhooks) validando la firma x-signature con MERCADOPAGO_WEBHOOK_SECRET y consultando el pago en la API.',
      'Mapear estados approved / pending / rejected / refunded a los estados internos del pedido.',
    ],
    keywords: ['mercado pago', 'mercadopago'],
  },
  {
    id: 'wompi',
    label: 'Wompi',
    kind: 'Pagos',
    description: 'Pasarela de pagos de Colombia (tarjetas, PSE, Nequi, Bancolombia).',
    envVars: ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY', 'WOMPI_EVENTS_SECRET', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_ENV'],
    requirements: [
      'Integrar el Widget/Web Checkout de Wompi generando la firma de integridad en el servidor con WOMPI_INTEGRITY_SECRET.',
      'Confirmar transacciones con los eventos de Wompi validando el checksum con WOMPI_EVENTS_SECRET.',
      'Consultar la documentación oficial (docs.wompi.co) y separar sandbox y producción con WOMPI_ENV.',
    ],
    keywords: ['wompi', 'pse'],
  },
  {
    id: 'nequi',
    label: 'Nequi',
    kind: 'Pagos',
    description: 'Pagos con Nequi (Colombia).',
    envVars: ['NEQUI_CLIENT_ID', 'NEQUI_CLIENT_SECRET', 'NEQUI_API_KEY', 'NEQUI_ENV'],
    requirements: [
      'La API directa de Nequi requiere convenio comercial; si no hay credenciales, ofrecer Nequi a través de Wompi (que lo soporta como medio de pago).',
      'Si se integra directamente: encapsular el cliente en un adaptador de pagos, sin simular respuestas ni aprobar pagos localmente.',
      'Deshabilitar el medio de pago por configuración cuando falten credenciales, mostrando un estado claro al administrador.',
    ],
    keywords: ['nequi'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    kind: 'Mensajería',
    description: 'Notificaciones y atención por WhatsApp.',
    envVars: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
    requirements: [
      'Usar la WhatsApp Cloud API oficial de Meta; los mensajes iniciados por el negocio requieren plantillas aprobadas.',
      'Verificar el webhook (hub.verify_token) y la firma X-Hub-Signature-256 con WHATSAPP_APP_SECRET.',
      'Como mínimo, ofrecer un botón de contacto con enlace wa.me cuando no haya credenciales de la API.',
    ],
    keywords: ['whatsapp', 'wasap'],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    kind: 'Mensajería',
    description: 'Bot de Telegram para notificaciones o comandos.',
    envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'],
    requirements: [
      'Usar la Telegram Bot API oficial con webhook (setWebhook) y validar X-Telegram-Bot-Api-Secret-Token.',
      'Encolar los envíos y respetar los límites de tasa de la API.',
    ],
    keywords: ['telegram'],
  },
  {
    id: 'google',
    label: 'Google',
    kind: 'Identidad',
    description: 'Login con Google (OAuth 2.0), Google Maps y/o Google Analytics 4.',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GOOGLE_MAPS_API_KEY'],
    requirements: [
      'Login con Google mediante OAuth 2.0 / OpenID Connect con validación de state y nonce.',
      'Restringir la clave de Google Maps por dominio/referer.',
      'Cargar Analytics solo tras el consentimiento de cookies cuando la normativa lo exija.',
    ],
    keywords: ['google', 'gmail', 'maps', 'analytics'],
  },
  {
    id: 'firebase',
    label: 'Firebase',
    kind: 'Backend',
    description: 'Auth, Firestore, Cloud Messaging (push) o Storage.',
    envVars: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'],
    requirements: [
      'Definir reglas de seguridad de Firestore/Storage restrictivas y probarlas con el emulador.',
      'Usar el Admin SDK solo en el servidor; las credenciales de servicio nunca llegan al cliente.',
    ],
    keywords: ['firebase', 'firestore', 'push'],
  },
  {
    id: 'supabase',
    label: 'Supabase',
    kind: 'Backend',
    description: 'Postgres gestionado, Auth, Storage y Realtime.',
    envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    requirements: [
      'Activar Row Level Security en todas las tablas y escribir políticas por rol.',
      'SUPABASE_SERVICE_ROLE_KEY solo en el servidor; el cliente usa la clave anon.',
      'Versionar el esquema con migraciones de Supabase CLI.',
    ],
    keywords: ['supabase'],
  },
  {
    id: 'email',
    label: 'Email transaccional',
    kind: 'Comunicación',
    description: 'Emails de registro, recuperación de contraseña, pedidos y notificaciones.',
    envVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'],
    requirements: [
      'Enviar emails mediante SMTP o un proveedor transaccional configurado por variables de entorno.',
      'Plantillas HTML responsive con versión de texto plano.',
      'Envío asíncrono (cola o tarea en segundo plano) con reintentos y registro de fallos.',
    ],
    keywords: ['email', 'correo', 'newsletter', 'mail'],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    kind: 'Integración',
    description: 'Webhooks entrantes y salientes para integrarse con otros sistemas.',
    envVars: ['WEBHOOK_SIGNING_SECRET'],
    requirements: [
      'Firmar webhooks salientes con HMAC-SHA256 y marca de tiempo; verificar la firma de los entrantes.',
      'Reintentos con backoff exponencial, idempotencia y registro de entregas.',
    ],
    keywords: ['webhook', 'zapier', 'make.com', 'n8n'],
  },
  {
    id: 'external_api',
    label: 'APIs externas',
    kind: 'Integración',
    description: 'Consumo de APIs de terceros documentadas.',
    envVars: ['EXTERNAL_API_BASE_URL', 'EXTERNAL_API_KEY'],
    requirements: [
      'Usar solo APIs reales y documentadas; si un endpoint no está claro, detenerse a consultar la documentación oficial en lugar de suponerlo.',
      'Cliente HTTP encapsulado con timeouts, reintentos con backoff, validación del esquema de respuesta y manejo de errores.',
    ],
    keywords: ['api externa', 'apis externas', 'integración con', 'erp externo', 'sincronizar con'],
  },
];

export const INTEGRATION_BY_ID = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i])) as Record<
  IntegrationId,
  IntegrationDef
>;

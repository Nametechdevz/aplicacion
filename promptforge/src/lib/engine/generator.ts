import { categoryLabel, getProjectType } from './catalog';
import { answerText, questionsFor } from './questions';
import { displayName, domainTypeOf, resolveSpec, typeLabel } from './spec';
import { INTEGRATION_BY_ID, stackWarnings, techLabels } from './techs';
import type { ProjectSpec, ProjectType, Variant } from './types';
import { VARIANT_LABEL } from './types';

interface Ctx {
  spec: ProjectSpec;
  type: ProjectType;
  domain: ProjectType | null;
  v: Variant;
  name: string;
  label: string;
  entities: string[];
  domainNotes: string[];
  needsDb: boolean;
  isWp: boolean;
  isAndroid: boolean;
  isTv: boolean;
  hasPayments: boolean;
}

const bullets = (items: string[], indent = '') => items.filter(Boolean).map((i) => `${indent}- ${i}`).join('\n');
const numbered = (items: string[]) => items.filter(Boolean).map((i, n) => `${n + 1}. ${i}`).join('\n');
const isMaster = (c: Ctx) => c.v === 'master';
const isQuick = (c: Ctx) => c.v === 'quick';

const SCOPE_TEXT: Record<ProjectSpec['scope'], string> = {
  mvp: 'MVP funcional: el conjunto mínimo de funcionalidades que aporta valor real, implementado con calidad de producción (no un prototipo).',
  complete: 'Producto completo: todas las funcionalidades listadas, listas para usuarios reales.',
  enterprise: 'Nivel empresarial: todas las funcionalidades, más escalabilidad horizontal, observabilidad, auditoría completa y alta disponibilidad.',
};

function defaultAudience(c: Ctx): string {
  const roles = c.spec.roles.filter((r) => !/admin|superadmin/i.test(r));
  const base = '(No especificado) Define en el análisis inicial los perfiles de usuario concretos a partir de la idea del negocio.';
  return roles.length ? `${base} Roles que usarán el sistema: ${roles.join(', ')}.` : base;
}

function defaultObjectives(c: Ctx): string[] {
  switch (c.type.category) {
    case 'ecommerce':
      return ['Vender online de forma fiable y segura', 'Ofrecer una experiencia de compra rápida, clara y confiable en móvil', 'Dar al equipo control total de productos, pedidos, inventario y clientes', 'Medir ventas y conversión con datos reales'];
    case 'web':
      return ['Comunicar la propuesta de valor con claridad', 'Convertir visitantes en contactos o clientes', 'Posicionar en buscadores (SEO) y cargar muy rápido', 'Permitir actualizar el contenido sin fricción'];
    case 'sistemas':
      return ['Digitalizar y centralizar el proceso del negocio', 'Reducir errores manuales y tiempos de operación', 'Dar visibilidad con reportes basados en datos reales', 'Controlar el acceso por roles y dejar trazabilidad'];
    case 'saas':
      return ['Resolver el problema central del cliente con un producto usable desde el primer día', 'Monetizar mediante planes de forma sostenible', 'Escalar a muchos clientes con aislamiento y seguridad de datos', 'Medir activación, uso y retención'];
    case 'apps':
      return ['Ofrecer una experiencia fluida en el dispositivo objetivo', 'Funcionar de forma fiable incluso con mala conectividad cuando aplique', 'Integrarse con un backend seguro y mantenible'];
    default:
      return ['Construir un sistema funcional y mantenible que resuelva la necesidad descrita'];
  }
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------
function header(c: Ctx): string {
  const lines = [
    `# PROMPT MAESTRO — ${c.name}`,
    '',
    `> Generado con PROMPTFORGE AI · Versión ${VARIANT_LABEL[c.v]} · Tipo: ${c.label} (${categoryLabel(c.type.category)}) · Optimizado para Claude Code`,
  ];
  return lines.join('\n');
}

function role(c: Ctx): string {
  const roles = [
    'Senior Full Stack Developer',
    'Software Architect',
    'UI/UX Designer',
    'Database Architect',
    'Security Engineer',
    'DevOps Engineer',
    'QA Engineer',
  ];
  if (c.isWp) roles.splice(1, 0, 'Especialista senior en WordPress y WooCommerce');
  if (c.isAndroid) roles.splice(1, 0, `Android Engineer senior (Kotlin, Jetpack Compose${c.isTv ? ' for TV' : ''})`);
  if (c.type.seo === 'high' && c.spec.seo) roles.push('Especialista en SEO técnico');
  if (isQuick(c)) {
    return `## ROL\nActúa como ${roles.slice(0, -1).join(', ')} y ${roles[roles.length - 1]}. Eres responsable de todo el proyecto, de principio a fin.`;
  }
  return [
    '## ROL',
    'Actúa como un equipo técnico senior completo y asume personalmente cada uno de estos roles:',
    bullets(roles),
    '',
    'Asumes la responsabilidad total del proyecto: decisiones de arquitectura, calidad del código, seguridad, experiencia de usuario, pruebas y entrega de un sistema que funciona de verdad. Cuando haya varias opciones razonables, decide como lo haría un líder técnico con experiencia y documenta brevemente el porqué.',
  ].join('\n');
}

function context(c: Ctx): string {
  const s = c.spec;
  const out: string[] = ['## CONTEXTO DEL PROYECTO'];
  const what = s.description.trim() || c.type.summary;
  out.push(`**Qué se va a construir:** ${what.replace(/\.?$/, '.')} Tipo de proyecto: ${c.label} (${categoryLabel(c.type.category)})${s.name ? `. Nombre: "${s.name}"` : ''}.`);
  if (s.idea && s.idea !== s.description && !isQuick(c)) out.push(`**Idea original del cliente:** "${s.idea}"`);
  out.push(`**Para quién:** ${s.audience.trim() || defaultAudience(c)}`);
  out.push(`**Problema que resuelve:** ${s.problem.trim() || `(No especificado) Deduce el problema principal a partir de la idea y del tipo de proyecto (${c.label.toLowerCase()}), y descríbelo en tu análisis inicial.`}`);
  const objectives = s.objective.trim() ? [s.objective.trim(), ...(isQuick(c) ? [] : defaultObjectives(c).slice(0, 2))] : defaultObjectives(c);
  out.push(`**Objetivos:**\n${bullets(isQuick(c) ? objectives.slice(0, 3) : objectives)}`);
  out.push(`**Alcance:** ${SCOPE_TEXT[s.scope]}`);
  const locale = [s.country && `País: ${s.country}`, s.language && `Idioma de la interfaz: ${s.language}`, s.currency && `Moneda: ${s.currency}`, s.multilingual && 'Sitio multilenguaje (i18n desde el inicio)'].filter(Boolean) as string[];
  if (locale.length) out.push(`**Localización:** ${locale.join(' · ')}. Formatos de fecha, número y moneda según el país.`);

  const answers = questionsFor(s.projectType)
    .map((q) => {
      const t = answerText(q, s.answers[q.id]);
      return t ? `${q.label.replace(/[¿?]/g, '')}: ${t}` : null;
    })
    .filter(Boolean) as string[];
  if (answers.length && !isQuick(c)) out.push(`**Requisitos específicos del negocio:**\n${bullets(answers)}`);
  if (s.notes.trim()) out.push(`**Notas adicionales del cliente:** ${s.notes.trim()}`);
  if (s.scope === 'mvp' && !isQuick(c)) {
    out.push('**Fuera de alcance en esta fase:** funcionalidades marcadas como avanzadas no incluidas en la lista. Deja la arquitectura preparada para añadirlas sin reescrituras.');
  }
  if (c.domainNotes.length && !isQuick(c)) out.push(`**Consideraciones del dominio:**\n${bullets(c.domainNotes)}`);
  return out.join('\n\n');
}

function initialAnalysis(c: Ctx): string {
  const items = [
    'Arquitectura propuesta (diagrama en texto o Mermaid)',
    'Stack elegido y justificación breve',
    'Estructura del proyecto (árbol de carpetas)',
    'Módulos principales y sus responsabilidades',
    c.needsDb ? 'Modelo de base de datos (entidades y relaciones clave)' : 'Modelo de datos y persistencia local',
    'Flujo de usuario principal de cada rol',
    'Plan de implementación por fases',
  ];
  return [
    '## ANÁLISIS INICIAL (ANTES DE PROGRAMAR)',
    'Antes de escribir código, analiza los requisitos y presenta brevemente:',
    numbered(items),
    '',
    'Sé conciso (no más de una pantalla por punto). Después **comienza el desarrollo de inmediato**; solo detente a preguntar si existe una ambigüedad que bloquee por completo una decisión irreversible.',
  ].join('\n');
}

function workflow(c: Ctx): string {
  const steps: [string, string][] = [
    ['Analiza el proyecto', 'lee estos requisitos completos y, si el repositorio ya tiene código, explóralo antes de cambiar nada'],
    ['Crea la arquitectura', 'define capas, módulos y contratos entre frontend, backend y datos'],
    ['Crea la estructura de carpetas', 'organizada por módulos/funcionalidades, con nombres consistentes'],
    ['Implementa por módulos', 'termina cada módulo de extremo a extremo antes de pasar al siguiente'],
    ['Crea los archivos necesarios', 'código, configuración, migraciones, tests y documentación'],
    ['Instala las dependencias', 'solo las necesarias, versiones estables y mantenidas; justifica las no obvias'],
    ['Configura las variables de entorno', 'crea `.env.example` documentado; nunca subas secretos al repositorio'],
    ['Crea la base de datos', c.needsDb ? 'migraciones versionadas, seeders y datos de prueba de desarrollo' : 'persistencia local si aplica'],
    ['Implementa el backend', 'lógica de negocio, validación, autorización y APIs'],
    ['Implementa el frontend', 'interfaz completa conectada a datos reales'],
    ['Implementa la autenticación', 'registro, login, sesiones/tokens, recuperación de contraseña y roles'],
    ['Implementa las funcionalidades', 'todas las de la lista, funcionando de verdad'],
    ['Ejecuta las pruebas', 'unitarias, de integración y E2E de los flujos críticos'],
    ['Detecta errores', 'compila, ejecuta linters y el type-checker, revisa la consola y los logs'],
    ['Corrige los errores', 'en la causa raíz, sin silenciar warnings ni desactivar tests'],
    ['Revisa la seguridad', 'recorre la checklist de seguridad de este documento'],
    ['Revisa el responsive', 'en móvil, tablet, laptop, desktop y pantallas grandes'],
    ['Revisa el rendimiento', 'consultas, tamaño de bundles, imágenes y caché'],
    ['Revisa el código duplicado', 'extrae utilidades y componentes compartidos; elimina código muerto'],
    ['Entrega el proyecto funcionando', 'con documentación y un resumen honesto de lo realizado'],
  ];
  if (isQuick(c)) {
    return [
      '## FORMA DE TRABAJO (CLAUDE CODE)',
      'Analiza → diseña la arquitectura → crea la estructura → implementa por módulos (backend, frontend, autenticación, funcionalidades) → configura `.env.example` y la base de datos → ejecuta pruebas → corrige errores → revisa seguridad, responsive y rendimiento → entrega el proyecto funcionando.',
    ].join('\n');
  }
  const body = isMaster(c) ? numbered(steps.map(([a, b]) => `**${a}:** ${b}.`)) : numbered(steps.map(([a]) => a));
  return [
    '## FORMA DE TRABAJO (CLAUDE CODE)',
    'Trabaja de forma autónoma dentro del repositorio siguiendo este orden:',
    body,
    '',
    isMaster(c)
      ? 'Ejecuta los comandos tú mismo (instalación, migraciones, build, tests) y verifica la salida. Cuando una fase termine, comprueba que compila y que sus pruebas pasan antes de continuar. Haz commits pequeños y descriptivos por módulo si trabajas con git.'
      : 'Ejecuta tú mismo los comandos (instalación, migraciones, build, tests) y verifica cada fase antes de continuar.',
  ].join('\n');
}

function rules(c: Ctx): string {
  const r = [
    'No crees funcionalidades falsas ni botones decorativos: todo elemento interactivo debe hacer algo real.',
    'No utilices datos simulados cuando pueda implementarse funcionalidad real (los seeders de desarrollo están permitidos y deben identificarse como tales).',
    'No dejes TODOs innecesarios.',
    'No inventes APIs, endpoints, librerías ni opciones de configuración: usa solo documentación oficial.',
    'No reemplaces funcionalidades reales por placeholders.',
    'Si falta información, toma una decisión técnica razonable, documéntala y continúa.',
    'Antes de modificar una parte existente, analiza cómo afecta al resto del sistema.',
    'Mantén una arquitectura limpia, tipada y escalable.',
  ];
  if (!isQuick(c)) {
    r.push('Si algo no puede implementarse (p. ej., faltan credenciales de un tercero), explícalo con claridad, deja la integración lista para activarse por configuración y muéstralo deshabilitado en la interfaz; nunca finjas que funciona.');
  }
  if (isMaster(c)) {
    r.push('No mezcles responsabilidades: la lógica de negocio no vive en los componentes de UI ni en los controladores.');
    r.push('Todo texto visible al usuario debe ser real y coherente con el negocio (sin "Lorem ipsum").');
  }
  return ['## REGLAS DE DESARROLLO (OBLIGATORIAS)', bullets(r)].join('\n');
}

function stack(c: Ctx): string {
  const t = c.spec.tech;
  const out = ['## STACK TECNOLÓGICO'];
  if (t.mode === 'custom' && t.selected.length) {
    out.push(`Usa este stack definido por el cliente: **${techLabels(t.selected).join(', ')}**.`);
    const warnings = stackWarnings(t.selected);
    if (warnings.length) out.push(`Ten en cuenta:\n${bullets(warnings)}`);
    out.push(
      c.isWp
        ? 'Completa lo necesario con herramientas del ecosistema WordPress: tema hijo, plugin propio para la lógica de negocio, WP-CLI, Composer y PHPUnit/WP test suite. Justifica cada plugin de terceros que instales y prefiere los oficiales y mantenidos.'
        : 'Completa las piezas que falten (ORM, validación, testing, estilos, autenticación) con opciones maduras y bien mantenidas, justificando brevemente cada elección.',
    );
  } else {
    out.push('**Claude elige la mejor tecnología.** Analiza los requisitos y selecciona el stack más apropiado para este proyecto. Justifica la decisión en 3–5 líneas (por qué encaja, alternativas descartadas y por qué).');
    if (!isQuick(c)) {
      out.push(`Orientación (no obligatoria): ${c.type.stackHint}`);
      out.push(`Criterios de decisión:\n${bullets(['Madurez y mantenimiento activo de cada tecnología', 'Adecuación al tipo de proyecto y a sus requisitos de SEO, tiempo real o rendimiento', 'Seguridad por defecto y ecosistema de autenticación', 'Facilidad de despliegue y coste de operación', 'Productividad y mantenibilidad a largo plazo (tipado, testing)'])}`);
    }
  }
  if (t.hosting.trim()) out.push(`**Hosting / despliegue previsto:** ${t.hosting.trim()}`);
  return out.join('\n\n');
}

function features(c: Ctx): string {
  const groups = Object.entries(c.spec.features).filter(([, items]) => items.length);
  const out = ['## FUNCIONALIDADES'];
  if (!isQuick(c)) {
    out.push('Implementa **todas** las funcionalidades siguientes de extremo a extremo: interfaz + API + base de datos + validación + permisos + estados de carga, vacío y error.');
  }
  for (const [group, items] of groups) {
    out.push(`### ${group}\n${bullets(items)}`);
  }
  if (!groups.length) out.push('Deduce las funcionalidades necesarias a partir del contexto y lístalas en el análisis inicial.');
  if (isMaster(c)) {
    out.push('Si al analizar detectas una funcionalidad imprescindible que no está en la lista (por ejemplo, un paso necesario para completar un flujo), impleméntala y menciónala en el resumen final.');
  }
  return out.join('\n\n');
}

function rolesSection(c: Ctx): string {
  const roles = c.spec.roles.filter(Boolean);
  if (!roles.length) return '';
  const out = ['## ROLES Y PERMISOS'];
  out.push(`Roles del sistema: ${roles.map((r) => `**${r}**`).join(', ')}.`);
  if (isMaster(c)) {
    const groups = Object.keys(c.spec.features);
    const rows = roles.map((r) => {
      const isAdmin = /admin|superadmin|propietario de organizaci/i.test(r);
      const own = groups.filter((g) => g.toLowerCase().includes(r.toLowerCase().split(' ')[0]) || r.toLowerCase().includes(g.toLowerCase().split(' ')[0]));
      const can = isAdmin
        ? 'Acceso completo a la administración, configuración, usuarios y auditoría'
        : own.length
          ? `Funcionalidades de: ${own.join(', ')}; solo sobre sus propios datos`
          : 'Funcionalidades propias de su rol; solo sobre sus propios datos';
      const cannot = isAdmin ? 'Saltarse la auditoría o ver secretos/credenciales en claro' : 'Acceder a datos de otros usuarios o a la administración';
      return `| ${r} | ${can} | ${cannot} |`;
    });
    out.push(['| Rol | Puede | No puede |', '|---|---|---|', ...rows].join('\n'));
  }
  out.push(bullets([
    'Autorización verificada en el servidor en cada endpoint y acción (nunca solo ocultando botones en la UI).',
    'Principio de mínimo privilegio; los permisos se definen en un único lugar.',
    ...(isQuick(c) ? [] : ['Las acciones sensibles (borrados, cambios de rol, reembolsos) quedan registradas en auditoría.', 'Tests que verifiquen que cada rol NO puede acceder a lo que no le corresponde.']),
  ]));
  return out.join('\n\n');
}

function architecture(c: Ctx): string {
  const items = [
    ['Arquitectura del sistema', 'capas bien definidas (presentación, aplicación/dominio, datos) y límites claros entre módulos'],
    ['Estructura de carpetas', 'por funcionalidad/módulo, predecible y documentada'],
    ['Componentes', 'reutilizables, pequeños y tipados; sistema de diseño propio'],
    ['Módulos', 'uno por área de negocio, con su lógica, validaciones y tests'],
    ['Backend', 'servicios con la lógica de negocio; controladores/rutas delgados'],
    ['Frontend', 'vistas conectadas a datos reales, con manejo de estado mínimo y claro'],
    ['Base de datos', c.needsDb ? 'acceso a datos centralizado (ORM o capa de repositorios) con migraciones' : 'almacenamiento local o remoto según el caso'],
    ['APIs', 'contratos consistentes, validación de entrada/salida y códigos HTTP correctos'],
    ['Autenticación', 'mecanismo probado (sesiones seguras o tokens con rotación)'],
    ['Autorización', 'roles y permisos centralizados'],
    ['Integraciones', 'cada servicio externo detrás de un adaptador con su propia configuración'],
    ['Sistema de archivos', 'subidas validadas (tipo, tamaño), nombres aleatorios y almacenamiento fuera de la carpeta pública o en almacenamiento de objetos'],
    ['Logs', 'logs estructurados con niveles; sin datos sensibles'],
    ['Manejo de errores', 'errores tipados, mensajes amables al usuario y detalle técnico solo en logs'],
  ];
  if (isQuick(c)) {
    return ['## ARQUITECTURA', 'Diseña una arquitectura escalable y mantenible: arquitectura del sistema, estructura de carpetas, módulos, backend, frontend, base de datos, APIs, autenticación, autorización, integraciones, archivos, logs y manejo de errores.'].join('\n\n');
  }
  const out = ['## ARQUITECTURA', 'Diseña e implementa una arquitectura **escalable y mantenible** que cubra:'];
  out.push(isMaster(c) ? bullets(items.map(([a, b]) => `**${a}:** ${b}.`)) : bullets(items.map(([a]) => a)));
  if (isMaster(c)) {
    out.push(`Principios:\n${bullets([
      'Configuración por variables de entorno validadas al arrancar (falla rápido si falta algo obligatorio).',
      'Validación de datos en los bordes del sistema (peticiones, formularios, webhooks).',
      'Sin dependencias circulares entre módulos.',
      'Código y nombres consistentes; el idioma del código es inglés y el de la interfaz el del proyecto.',
      c.spec.scope === 'enterprise' ? 'Preparado para escalar horizontalmente: sin estado en memoria de la instancia, colas para tareas pesadas y caché distribuida.' : 'Tareas lentas (emails, sincronizaciones) fuera del ciclo de la petición.',
    ])}`);
  }
  return out.join('\n\n');
}

function database(c: Ctx): string {
  if (!c.needsDb) return '';
  const reqs = [
    'Modelo de datos completo',
    'Tablas/colecciones con tipos adecuados',
    'Relaciones',
    'Índices para las consultas frecuentes',
    'Claves primarias',
    'Claves foráneas con reglas ON DELETE explícitas',
    'Constraints (unicidad, NOT NULL, CHECK)',
    'Migraciones versionadas',
    'Seeders',
    'Datos de prueba realistas para desarrollo (y un usuario administrador inicial documentado)',
  ];
  const out = ['## BASE DE DATOS'];
  if (c.isWp) {
    out.push('Usa el esquema nativo de WordPress/WooCommerce (con HPOS para pedidos) y no modifiques sus tablas.');
    if (!isQuick(c)) {
      out.push(`Para datos propios del negocio:\n${bullets(['Tablas personalizadas creadas con `dbDelta` en la activación del plugin, con versión de esquema y migraciones incrementales', 'Claves primarias, índices, relaciones y constraints definidos explícitamente', 'Consultas con `$wpdb->prepare` o las APIs de WooCommerce (CRUD de productos y pedidos)', 'Seeders con WP-CLI: productos, categorías, atributos (talla, color), cupones y clientes de prueba', 'Datos de prueba realistas solo en desarrollo'])}`);
      out.push(`Entidades nativas implicadas:\n${bullets(c.entities.map((e) => `\`${e}\``))}`);
      out.push('Explica las decisiones importantes: qué va en meta, qué va en tablas propias y por qué.');
    }
    return out.join('\n\n');
  }
  if (isQuick(c)) {
    out.push(`Diseña el modelo de datos con relaciones, índices, claves foráneas, constraints, migraciones y seeders. Entidades principales: ${c.entities.join(', ')}.`);
    return out.join('\n\n');
  }
  out.push(`Diseña e implementa:\n${bullets(reqs)}`);
  out.push(`Entidades principales sugeridas (ajústalas tras el análisis):\n${bullets(c.entities.map((e) => `\`${e}\``))}`);
  out.push('Explica las decisiones importantes del modelo de datos (normalización, tipos monetarios, borrado lógico vs. físico, estrategia de índices).');
  if (isMaster(c)) {
    out.push(bullets([
      'Campos `created_at` / `updated_at` en todas las tablas y `deleted_at` donde el borrado lógico tenga sentido.',
      'Importes monetarios con tipo decimal exacto o en unidades mínimas (centavos), nunca float.',
      'Operaciones que modifican varias tablas dentro de transacciones.',
      'Los seeders de desarrollo nunca se ejecutan en producción.',
    ]));
  }
  return out.join('\n\n');
}

function uiux(c: Ctx): string {
  const d = c.spec.design;
  const identity = [
    d.styles.length && `Estilo visual: ${d.styles.join(', ')}`,
    d.colors.trim() && `Colores: ${d.colors.trim()}`,
    d.typography.trim() && `Tipografía: ${d.typography.trim()}`,
    `Tema: ${d.themeMode === 'both' ? 'modo claro y modo oscuro con selector (respetando la preferencia del sistema)' : d.themeMode === 'dark' ? 'modo oscuro como principal' : 'modo claro como principal'}`,
    d.references.trim() && `Referencias visuales: ${d.references.trim()}`,
    d.inspirationSites.trim() && `Sitios de inspiración: ${d.inspirationSites.trim()} (inspírate en su calidad, NO copies su interfaz)`,
  ].filter(Boolean) as string[];
  const components = c.isTv
    ? ['Filas/carruseles navegables con D-pad', 'Tarjetas con estado de foco muy visible', 'Pantallas de detalle', 'Reproductor con controles accesibles desde el mando', 'Diálogos', 'Estados vacíos, de carga y de error']
    : ['Header', 'Navbar', 'Sidebar (en áreas de gestión)', 'Footer', 'Cards', 'Modales', 'Formularios con validación en línea', 'Botones (primario, secundario, destructivo, fantasma)', 'Tablas (con versión adaptada a móvil)', 'Dashboard', 'Estados vacíos', 'Loading states (skeletons)', 'Error states', 'Toast notifications'];
  const out = ['## UI/UX Y DISEÑO'];
  if (isQuick(c)) {
    out.push(`Diseño profesional, moderno, responsive, mobile first, accesible y consistente, con identidad visual propia (evita interfaces genéricas de plantilla). ${identity.join('. ')}.`);
    out.push('Incluye header, navegación, footer, cards, modales, formularios con validación, tablas, estados vacíos, loading states, error states y toast notifications.');
    return out.join('\n\n');
  }
  out.push('El diseño debe ser **profesional, moderno, responsive, mobile first, accesible y consistente**. Crea una **identidad visual propia y coherente**; evita interfaces genéricas de plantilla.');
  out.push(`Identidad visual:\n${bullets(identity)}`);
  out.push(`Define y usa de forma consistente estos componentes:\n${bullets(components)}`);
  if (isMaster(c)) {
    out.push(`Sistema de diseño:\n${bullets([
      'Tokens de diseño (colores, espaciado, radios, sombras, tipografía) definidos en un solo lugar.',
      'Escala tipográfica clara y jerarquía visual evidente.',
      'Microinteracciones sutiles (hover, focus, transiciones de 150–250 ms); respeta `prefers-reduced-motion`.',
      'Accesibilidad WCAG 2.2 AA: contraste suficiente, foco visible, navegación por teclado, etiquetas y `aria-*` correctos.',
      'Formularios: mensajes de error claros junto al campo, estados deshabilitados y de envío, prevención de doble envío.',
      'Confirmación antes de acciones destructivas.',
      'Textos reales del negocio, sin "Lorem ipsum".',
    ])}`);
  }
  return out.join('\n\n');
}

function responsive(c: Ctx): string {
  if (c.isTv) {
    return ['## PANTALLAS Y DISPOSITIVOS', bullets(['Diseño para TV (experiencia a 3 metros): tipografía grande y alto contraste.', 'Resoluciones 720p, 1080p y 4K.', 'Zonas seguras de overscan.', 'Toda la navegación posible solo con el mando (D-pad, OK, Atrás).', 'Probar en emulador de Android TV y, si es posible, en un dispositivo real.'])].join('\n\n');
  }
  const devices = ['Mobile (360–430 px)', 'Tablet (768–1024 px)', 'Laptop (1280–1440 px)', 'Desktop (1536 px+)', 'Pantallas grandes (1920 px+ y 2560 px)'];
  if (isQuick(c)) return `## RESPONSIVE\nCompatible con ${devices.join(', ')}. Mobile first y probado especialmente en móvil.`;
  return [
    '## RESPONSIVE',
    `Compatibilidad obligatoria con:\n${bullets(devices)}`,
    bullets([
      'Enfoque **mobile first**: diseña primero para móvil y amplía.',
      'Prueba **especialmente en dispositivos móviles** (sin scroll horizontal, objetivos táctiles de al menos 44×44 px, textos legibles sin zoom).',
      'Tablas que se transforman en tarjetas o con scroll contenido en móvil.',
      'Contenido con ancho máximo cómodo en pantallas grandes.',
      ...(isMaster(c) ? ['Imágenes responsivas (srcset/sizes) y formatos modernos.', 'Verifica orientación vertical y horizontal en tablet.'] : []),
    ]),
  ].join('\n\n');
}

function security(c: Ctx): string {
  const items: [string, string][] = [
    ['Validación de inputs', 'en el servidor con esquemas (además de la validación del cliente)'],
    ['Sanitización', 'de todo contenido que se muestre o almacene'],
    ['Protección XSS', 'escape por defecto, sin HTML sin sanitizar, Content-Security-Policy'],
    ['Protección CSRF', 'tokens CSRF o cookies SameSite + verificación de Origin en peticiones que modifican datos'],
    ['SQL Injection', 'solo consultas parametrizadas u ORM; nunca concatenar SQL'],
    ['Rate limiting', 'en login, registro, recuperación de contraseña, formularios públicos y APIs'],
    ['Autenticación segura', 'bloqueo progresivo tras intentos fallidos y mensajes que no revelan si el usuario existe'],
    ['Hash de contraseñas', 'Argon2id o bcrypt (nunca texto plano ni hashes rápidos)'],
    ['Gestión de sesiones', 'cookies HttpOnly, Secure y SameSite; expiración y revocación; rotación tras login'],
    ['Roles y permisos', 'verificados en el servidor en cada operación'],
    ['Protección de APIs', 'autenticación, autorización por recurso, límites de tamaño y CORS restrictivo'],
    ['Variables de entorno', 'toda configuración sensible en `.env`; `.env.example` sin valores reales'],
    ['Protección de secretos', 'nunca en el repositorio, en el cliente ni en los logs'],
    ['Logs de seguridad', 'inicios de sesión, fallos, cambios de permisos y acciones sensibles'],
  ];
  if (c.isWp) items.push(['WordPress', 'nonces en formularios y AJAX, `current_user_can` en cada acción, escape con `esc_html`/`esc_attr`/`wp_kses`, consultas con `$wpdb->prepare`']);
  if (c.hasPayments) items.push(['Pagos', 'cumplimiento PCI delegando la captura de tarjetas a la pasarela; importes calculados en el servidor; webhooks verificados']);
  if (isQuick(c)) return `## SEGURIDAD\n${items.map(([a]) => a).join(', ')}.`;
  const out = ['## SEGURIDAD', isMaster(c) ? bullets(items.map(([a, b]) => `**${a}:** ${b}.`)) : bullets(items.map(([a]) => a))];
  if (isMaster(c)) {
    out.push(bullets(['Cabeceras de seguridad: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors.', 'Subida de archivos: validación de tipo real (magic bytes), tamaño máximo y nombres aleatorios.', 'Dependencias sin vulnerabilidades conocidas (`npm audit` o equivalente) al finalizar.']));
  }
  return out.join('\n\n');
}

function seo(c: Ctx): string {
  if (!c.spec.seo || c.isAndroid) return '';
  const items = ['SEO técnico', 'Meta tags (title y description únicos por página)', 'Open Graph y Twitter Cards', 'Schema.org (JSON-LD) adecuado al tipo de contenido', 'URLs amigables', 'Sitemap XML', 'robots.txt', 'URLs canónicas (canonical)', 'Performance', 'Core Web Vitals'];
  if (isQuick(c)) return `## SEO\n${items.join(', ')}.`;
  const out = ['## SEO', bullets(items)];
  if (isMaster(c)) {
    out.push(bullets([
      'Objetivos Core Web Vitals: LCP < 2,5 s, INP < 200 ms, CLS < 0,1 en móvil.',
      'Renderizado en servidor o estático para las páginas indexables.',
      'Jerarquía de encabezados correcta (un único H1 por página) y textos alternativos en imágenes.',
      'Páginas 404 útiles y redirecciones 301 cuando cambien URLs.',
      ...(c.spec.multilingual ? ['Etiquetas hreflang para cada idioma.'] : []),
    ]));
  }
  return out.join('\n\n');
}

function performance(c: Ctx): string {
  if (isQuick(c)) return '';
  const items = [
    'Paginación del lado servidor en listados grandes',
    'Evitar consultas N+1; índices para las consultas frecuentes',
    'Caché donde aporte (HTTP, datos calculados, CDN para estáticos)',
    'Optimización de imágenes y carga diferida',
    'Bundles pequeños: carga diferida de código no crítico',
  ];
  if (isMaster(c)) items.push('Medir con Lighthouse y documentar los resultados finales', 'Compresión (gzip/brotli) y caché de estáticos con hash');
  return ['## RENDIMIENTO', bullets(items)].join('\n\n');
}

function integrations(c: Ctx): string {
  const ints = c.spec.integrations.map((id) => INTEGRATION_BY_ID[id]).filter(Boolean);
  const choosesGateway = Array.isArray(c.spec.answers.payment_gateways) && (c.spec.answers.payment_gateways as string[]).includes('auto');
  if (!ints.length && !choosesGateway) return '';
  const out = ['## INTEGRACIONES'];
  if (choosesGateway) {
    out.push(`**Pasarela de pago:** elige la más adecuada para ${c.spec.country || 'el país del negocio'} y su moneda${c.spec.currency ? ` (${c.spec.currency})` : ''}, justificando la elección (disponibilidad local, medios de pago populares, comisiones).`);
  }
  if (isQuick(c)) {
    if (ints.length) out.push(`${ints.map((i) => i.label).join(', ')}. Credenciales siempre en variables de entorno; no inventes APIs.`);
    return out.join('\n\n');
  }
  for (const i of ints) {
    const lines = [`### ${i.label}`, i.description];
    if (isMaster(c)) {
      lines.push(bullets(i.requirements));
      lines.push(`Variables de entorno: ${i.envVars.map((e) => `\`${e}\``).join(', ')}`);
    } else {
      lines.push(bullets(i.requirements.slice(0, 2)));
    }
    out.push(lines.join('\n'));
  }
  out.push(`Reglas para todas las integraciones:\n${bullets([
    '**Nunca inventes APIs**: usa SDKs oficiales y la documentación vigente de cada proveedor.',
    'Toda credencial va en **variables de entorno** y se documenta en `.env.example`.',
    'Si faltan credenciales, la integración queda deshabilitada de forma explícita y visible (sin simular respuestas).',
    'Timeouts, reintentos con backoff y registro de errores en todas las llamadas externas.',
  ])}`);
  return out.join('\n\n');
}

function testing(c: Ctx): string {
  const flows = ['Registro, login y recuperación de contraseña'];
  if (c.type.category === 'ecommerce') flows.push('Navegar catálogo → añadir al carrito → checkout → pago → pedido creado');
  if (c.type.id === 'bookings') flows.push('Consultar disponibilidad → reservar → pagar → confirmar; impedir dobles reservas');
  if (c.type.category === 'saas') flows.push('Alta → creación de organización → uso del módulo principal → cambio de plan');
  if (c.type.category === 'sistemas') flows.push('Flujo principal del módulo de negocio de principio a fin');
  flows.push('Permisos: un rol sin privilegios no puede acceder a recursos ajenos');
  if (isQuick(c)) return `## TESTING\nTests unitarios de la lógica de negocio, de integración de la API y E2E de los flujos críticos (${flows.join('; ')}). Todos deben pasar antes de entregar.`;
  const out = ['## TESTING', bullets([
    'Tests unitarios de la lógica de negocio (cálculos, validaciones, permisos).',
    'Tests de integración de la API y la base de datos.',
    'Tests E2E de los flujos críticos.',
    'Comando único para ejecutar todas las pruebas, documentado en el README.',
  ])];
  out.push(`Flujos críticos a cubrir:\n${bullets(flows)}`);
  if (isMaster(c)) out.push('Los tests deben ser deterministas y ejecutarse en CI. No desactives ni omitas tests para conseguir que pasen: corrige la causa.');
  return out.join('\n\n');
}

function deploy(c: Ctx): string {
  if (isQuick(c)) return '## DEPLOY\nDeja el proyecto listo para producción: build, variables de entorno, migraciones y guía de despliegue.';
  const items = [
    'Build de producción sin errores ni warnings relevantes',
    'Variables de entorno por entorno (desarrollo, staging, producción)',
    'Migraciones ejecutadas como parte del despliegue',
    c.isAndroid ? 'Build firmado (AAB/APK) con el keystore fuera del repositorio' : 'Dockerfile o configuración para la plataforma de hosting elegida',
    'Pipeline de CI que ejecute lint, type-check, tests y build',
  ];
  if (isMaster(c)) items.push('Backups automáticos de la base de datos y procedimiento de restauración probado', 'Monitorización de errores y logs centralizados', 'Health check endpoint', 'HTTPS obligatorio');
  return ['## DEPLOY Y DEVOPS', bullets(items)].join('\n\n');
}

function plan(c: Ctx): string {
  const phases: [string, string, string][] = [
    ['Arquitectura', 'Análisis, decisiones técnicas, estructura del proyecto', 'El análisis inicial está presentado y la estructura creada'],
    ['Configuración', 'Dependencias, linters, formateo, variables de entorno, scripts', 'El proyecto arranca en local con un comando'],
    ['Base de datos', 'Modelo, migraciones, seeders', 'Las migraciones se aplican desde cero sin errores'],
    ['Backend', 'Servicios, validación, APIs', 'Los endpoints responden con datos reales y tests de integración pasan'],
    ['Frontend', 'Layout, sistema de diseño, vistas', 'Las vistas principales consumen la API real'],
    ['Autenticación', 'Registro, login, sesiones, roles', 'Rutas protegidas y permisos verificados con tests'],
    ['Funcionalidades', 'Todas las funcionalidades de la lista', 'Cada funcionalidad funciona de extremo a extremo'],
    ['Integraciones', 'Pagos, emails y servicios externos', 'Integraciones probadas en modo sandbox/test'],
    ['Testing', 'Unitarios, integración y E2E', 'Toda la suite pasa'],
    ['Seguridad', 'Revisión con la checklist de seguridad', 'Sin vulnerabilidades conocidas pendientes'],
    ['Optimización', 'Rendimiento, responsive, accesibilidad, código duplicado', 'Lighthouse y revisión responsive satisfactorios'],
    ['Deploy', 'Build de producción, documentación y guía de despliegue', 'Build de producción correcto y README completo'],
  ];
  if (isQuick(c)) return `## PLAN DE IMPLEMENTACIÓN\n${phases.map(([n], i) => `FASE ${i + 1}: ${n}`).join(' → ')}. Verifica cada fase antes de continuar.`;
  const body = phases
    .map(([n, what, check], i) => (isMaster(c) ? `**FASE ${i + 1} — ${n}:** ${what}.\n   ✔ Verificación: ${check}.` : `**FASE ${i + 1} — ${n}:** ${what}.`))
    .join('\n');
  return ['## PLAN DE IMPLEMENTACIÓN', 'Trabaja de forma ordenada y **verifica cada fase antes de continuar**:', body].join('\n\n');
}

function acceptance(c: Ctx): string {
  if (!isMaster(c)) return '';
  const groups = Object.entries(c.spec.features).filter(([, i]) => i.length);
  const out = ['## CRITERIOS DE ACEPTACIÓN'];
  out.push(`El proyecto se considera terminado cuando:\n${bullets([
    'Todas las funcionalidades listadas funcionan con datos reales persistidos.',
    'Cada rol puede completar sus flujos principales sin errores y sin acceder a lo que no le corresponde.',
    'No hay botones, enlaces ni pantallas sin funcionalidad.',
    'La aplicación se ve y funciona correctamente en móvil, tablet y escritorio.',
    'El build de producción y todas las pruebas pasan.',
    'La documentación permite a otra persona instalar y desplegar el proyecto sin ayuda.',
  ])}`);
  if (groups.length) {
    out.push(`Comprobación por módulo:\n${bullets(groups.map(([g, items]) => `**${g}:** ${items.length} funcionalidades verificadas manualmente y con tests de los casos críticos.`))}`);
  }
  return out.join('\n\n');
}

function delivery(c: Ctx): string {
  const checks = [
    'Verifica que el proyecto compile',
    'Ejecuta las pruebas',
    'Corrige los errores',
    'Verifica el responsive',
    'Verifica la navegación',
    'Verifica los formularios',
    'Verifica la autenticación',
    c.needsDb ? 'Verifica la base de datos' : 'Verifica la persistencia',
    'Verifica las APIs',
    'Revisa la seguridad',
    'Revisa el rendimiento',
    'Limpia el código innecesario',
  ];
  const docs = ['Instalación', 'Configuración', 'Variables de entorno', c.needsDb ? 'Base de datos (migraciones y seeders)' : 'Datos', 'Comandos', 'Desarrollo', 'Producción', 'Deploy', 'Troubleshooting'];
  if (isQuick(c)) {
    return `## ENTREGA\nAl finalizar: compila, ejecuta las pruebas, corrige errores y revisa responsive, seguridad y rendimiento. Genera un README con instalación, variables de entorno, comandos y deploy.`;
  }
  const out = ['## ENTREGA FINAL', `Al finalizar, en este orden:\n${numbered(checks)}`, `Después genera la **DOCUMENTACIÓN** (README.md y/o carpeta \`docs/\`):\n${bullets(docs)}`];
  if (isMaster(c)) {
    out.push(`Termina con un **resumen final honesto** que incluya:\n${bullets([
      'Qué se implementó (por módulo)',
      'Decisiones técnicas relevantes y su justificación',
      'Cómo ejecutar el proyecto y las credenciales del usuario administrador de desarrollo',
      'Qué no se pudo implementar y por qué (por ejemplo, credenciales de terceros pendientes), sin maquillarlo',
      'Siguientes pasos recomendados',
    ])}`);
  }
  return out.join('\n\n');
}

function closing(c: Ctx): string {
  if (isQuick(c)) return '**Importante:** construye el sistema completo y funcional, no una maqueta ni una demo.';
  return [
    '## IMPORTANTE',
    bullets([
      'Construye el sistema completo. No entregues solo una descripción, wireframes o componentes sueltos.',
      'No es una demo: es una aplicación funcional y preparada para producción.',
      'Si una característica no puede implementarse todavía, explícalo claramente y no crees una falsa funcionalidad.',
    ]),
    'Comienza ahora con el **análisis inicial** y continúa con la **FASE 1**.',
  ].join('\n\n');
}

const SECTIONS: ((c: Ctx) => string)[] = [
  header,
  role,
  context,
  initialAnalysis,
  workflow,
  rules,
  stack,
  features,
  rolesSection,
  architecture,
  database,
  uiux,
  responsive,
  security,
  seo,
  performance,
  integrations,
  testing,
  deploy,
  plan,
  acceptance,
  delivery,
  closing,
];

const QUICK_SKIP = new Set<(c: Ctx) => string>([initialAnalysis, rolesSection]);

export function buildContext(input: ProjectSpec, v: Variant): Ctx {
  const spec = resolveSpec(input);
  const type = getProjectType(spec.projectType);
  const domain = domainTypeOf(spec);
  const extraDomain = domain && domain.id !== type.id ? domain : null;
  const entities = [...new Set([...type.entities, ...(extraDomain?.entities ?? [])])];
  const domainNotes = [...type.domainNotes, ...(extraDomain?.domainNotes ?? [])];
  const techs = new Set(spec.tech.selected);
  const isWp = type.id === 'woocommerce' || (spec.tech.mode === 'custom' && (techs.has('wordpress') || techs.has('woocommerce')));
  const isAndroid = type.id === 'android' || type.id === 'android_tv' || (spec.tech.mode === 'custom' && techs.has('kotlin'));
  const hasPayments = spec.integrations.some((i) => ['stripe', 'paypal', 'mercadopago', 'wompi', 'nequi'].includes(i)) || Array.isArray(spec.answers.payment_gateways);
  return {
    spec,
    type,
    domain: extraDomain,
    v,
    name: displayName(spec),
    label: typeLabel(spec),
    entities,
    domainNotes,
    needsDb: type.needsDb || Boolean(extraDomain?.needsDb),
    isWp,
    isAndroid,
    isTv: type.id === 'android_tv',
    hasPayments,
  };
}

/** Genera el prompt para una versión concreta. */
export function generatePrompt(spec: ProjectSpec, v: Variant): string {
  const c = buildContext(spec, v);
  return SECTIONS.filter((fn) => !(v === 'quick' && QUICK_SKIP.has(fn)))
    .map((fn) => fn(c).trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .concat('\n');
}

export function generateAll(spec: ProjectSpec): Record<Variant, string> {
  return { quick: generatePrompt(spec, 'quick'), pro: generatePrompt(spec, 'pro'), master: generatePrompt(spec, 'master') };
}

/** Secciones individuales, reutilizadas por el mejorador de prompts. */
export const SECTION_BUILDERS = {
  role,
  context,
  initialAnalysis,
  workflow,
  rules,
  stack,
  features,
  rolesSection,
  architecture,
  database,
  uiux,
  responsive,
  security,
  seo,
  performance,
  integrations,
  testing,
  deploy,
  plan,
  acceptance,
  delivery,
  closing,
};

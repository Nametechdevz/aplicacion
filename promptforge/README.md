# PROMPTFORGE AI

Generador de **prompts maestros** para Claude Code. Escribes una idea sencilla —por ejemplo
_"Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones,
usuarios, dashboard administrativo y diseño premium"_— y PromptForge la convierte en un prompt
profesional, extremadamente detallado y listo para pegar en Claude Code: rol, contexto, stack,
funcionalidades por rol, arquitectura, base de datos, UI/UX, responsive, seguridad, SEO,
integraciones, testing, deploy, plan en 12 fases, criterios de aceptación y entrega.

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4**
- **SQLite (better-sqlite3, modo WAL)** con migraciones versionadas
- Autenticación propia: contraseñas con **scrypt**, sesiones en base de datos con cookie HttpOnly
- Motor de generación **local y determinista** (no necesita ninguna API)
- Mejora opcional con **Claude** (`@anthropic-ai/sdk`, streaming) si se configura `ANTHROPIC_API_KEY`

---

## Índice
1. [Funcionalidades](#1-funcionalidades)
2. [Arquitectura y decisiones](#2-arquitectura-y-decisiones)
3. [Instalación](#3-instalación)
4. [Configuración y variables de entorno](#4-configuración-y-variables-de-entorno)
5. [Base de datos](#5-base-de-datos)
6. [Comandos](#6-comandos)
7. [Desarrollo](#7-desarrollo)
8. [Producción y deploy](#8-producción-y-deploy)
9. [Seguridad](#9-seguridad)
10. [Cómo funciona el motor](#10-cómo-funciona-el-motor)
11. [Limitaciones conocidas](#11-limitaciones-conocidas)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Funcionalidades

| Área | Qué hace |
|---|---|
| **Dashboard** | Total de prompts, creados (30 días), favoritos, plantillas utilizadas, calidad media, actividad diaria (14 días), categorías, últimos prompts y proyectos recientes. Campo rápido "¿Qué vamos a construir hoy?". |
| **Nuevo prompt** | Flujo en 4 pasos: **Idea → Tipo de proyecto → Preguntas → Prompt**. El análisis de la idea detecta tipo, dominio (p. ej. "SaaS *de facturación*"), stack, integraciones, pasarelas, país/moneda, estilo, colores y requisitos (inventario, cupones, dashboard…). |
| **Tipos de proyecto** | 41 tipos en 5 categorías (Web, E-commerce, Sistemas, SaaS, Aplicaciones) + **Proyecto personalizado**. |
| **Formulario inteligente** | Pestañas General, Negocio, Funcionalidades, Diseño, Tecnología e Integraciones. Las preguntas cambian según el tipo y **sus respuestas añaden funcionalidades e integraciones** (p. ej. "variantes de producto" → SKU por variante; "Wompi" → integración Wompi con sus variables de entorno). |
| **Tecnología** | WordPress, WooCommerce, PHP, Laravel, Node.js, React, Next.js, Vue, TypeScript, JavaScript, MySQL, PostgreSQL, MongoDB, Firebase, Supabase, API REST, GraphQL, Tailwind, Kotlin — o **"Claude puede elegir la mejor tecnología"** (el prompt le pide justificar la elección). Avisa de combinaciones incoherentes. |
| **Versiones** | **QUICK** (corto), **PRO** (detallado) y **MASTER** (completo) generadas a la vez; se cambia entre ellas con pestañas que muestran su puntuación. |
| **Prompt Quality Score** | 14 comprobaciones ponderadas (objetivo, stack, funcionalidades, arquitectura, base de datos, seguridad, responsive, SEO, testing, deploy, integraciones, roles, UX y optimización para Claude Code). Las que no aplican (p. ej. SEO en una app de Android TV) se excluyen. Muestra `96/100 — Prompt listo para Claude Code`. |
| **Editor** | Editar, vista previa Markdown, vista dividida, modo enfoque, **Copiar para Claude Code**, Copiar, Descargar TXT/MD, Regenerar, **Mejorar**, **Simplificar**, **Expandir**, **Mejorar con IA**, Deshacer, Guardar (Ctrl+S), **Historial** de versiones con restauración, guardar como plantilla, favorito. |
| **Biblioteca** | Nombre, categoría, descripción, fecha, stack, versión, etiquetas y puntuación. Buscar, filtrar (categoría, versión, etiqueta, favoritos), ordenar, editar, duplicar, eliminar, copiar, **importar/exportar JSON**. |
| **Plantillas** | 17 predeterminadas (Landing, SaaS, WooCommerce, E-commerce, Marketplace, Dashboard, CRM, ERP, Blog, Portfolio, LMS, Reservas, Facturación, API, PWA, WordPress, Tienda digital) + plantillas propias. |
| **Configuración** | Tema (claro/oscuro/sistema), idioma/país/moneda por defecto, versión y alcance por defecto, modelo y esfuerzo de IA, formato de exportación y metadatos, cuenta (nombre, contraseña, cerrar otras sesiones) y actividad de seguridad. |

### Mejorar, Simplificar y Expandir
- **Mejorar**: evalúa el prompt, rehace las secciones que fallan con su versión completa (conservando los requisitos que hayas añadido a mano), añade funcionalidades recomendadas y una sección *MEJORAS ADICIONALES* (requisitos técnicos, UX, seguridad, escalabilidad, SEO, rendimiento y testing) solo con lo que todavía no aparece. Es idempotente.
- **Simplificar**: condensa cada sección (primeras frases y viñetas clave) y elimina secciones accesorias.
- **Expandir**: lleva cada sección al nivel MASTER y añade las que falten.
- **Mejorar con IA**: envía el prompt a Claude, muestra la respuesta en streaming y te deja revisarla antes de aplicarla.

Todas las transformaciones se pueden **deshacer**, y cada guardado crea una versión en el historial.

---

## 2. Arquitectura y decisiones

```
promptforge/
├── src/
│   ├── app/
│   │   ├── (auth)/login, register         # Páginas públicas
│   │   ├── (app)/                         # Área autenticada (layout con sidebar)
│   │   │   ├── page.tsx                   # Dashboard
│   │   │   ├── new/                       # Asistente "Nuevo prompt"
│   │   │   ├── prompts/, prompts/[id]/    # Biblioteca y editor
│   │   │   ├── templates/, settings/
│   │   └── api/                           # Route handlers (JSON)
│   │       ├── auth/{login,register,logout}
│   │       ├── account/{password,profile,sessions}
│   │       ├── prompts/, prompts/[id]/{duplicate,versions}
│   │       ├── settings/, templates/, library/{export,import}
│   │       ├── ai/improve                 # NDJSON en streaming
│   │       └── health
│   ├── components/                        # UI (sistema de diseño propio) y vistas
│   └── lib/
│       ├── engine/                        # Motor de generación (TS puro, cliente y servidor)
│       │   ├── catalog.ts                 # 42 tipos: funcionalidades, entidades, notas de dominio
│       │   ├── questions.ts               # Preguntas inteligentes y sus efectos
│       │   ├── detect.ts                  # Análisis de la idea en texto libre
│       │   ├── generator.ts               # Prompt QUICK / PRO / MASTER
│       │   ├── quality.ts                 # Prompt Quality Score
│       │   ├── transform.ts               # Mejorar / Simplificar / Expandir
│       │   └── techs.ts, spec.ts, templates.ts
│       ├── server/                        # Solo servidor: db, migraciones, auth, rate limit, repos, IA
│       ├── validation.ts                  # Esquemas zod de toda la entrada
│       └── markdown.ts                    # Vista previa Markdown segura
├── tests/                                 # Vitest: motor, API/seguridad, IA (servidor simulado)
├── e2e/                                   # Playwright: flujo completo en escritorio y móvil
└── scripts/reset-password.mjs
```

**Por qué este stack**
- **Next.js + TypeScript**: una sola base de código para UI, API y el motor, que se ejecuta **en el navegador** (generación instantánea mientras respondes) y **en el servidor** (que recalcula la puntuación y los metadatos al guardar; nunca confía en los del cliente).
- **SQLite + better-sqlite3**: cero infraestructura, transacciones ACID y rendimiento de sobra para una herramienta de equipo. Todo el acceso a datos está en `src/lib/server/repos`, así que migrar a PostgreSQL afecta solo a esa capa.
- **Auth propia** en lugar de una librería: el alcance (email + contraseña, sesiones, bloqueo, cambio de contraseña) es pequeño y así no se depende de servicios externos. Contraseñas con scrypt (N=2¹⁷), tokens de sesión aleatorios de 256 bits guardados como hash SHA-256.
- **Motor determinista**: el mismo input produce siempre el mismo prompt; no hay coste por generación ni dependencia de red. La IA es un complemento opcional.

**Modelo de datos**: `users`, `sessions`, `prompts` (3 variantes + especificación JSON), `prompt_versions` (historial, máx. 100 por prompt), `user_settings`, `user_templates`, `audit_logs`, `schema_migrations`. Claves foráneas con `ON DELETE CASCADE`, `CHECK` en enumerados y puntuaciones, índices por `(user_id, updated_at)`, categoría y favoritos.

---

## 3. Instalación

Requisitos: **Node.js 20.9+** (recomendado 22) y npm. `better-sqlite3` descarga binarios precompilados; si tu plataforma no los tiene, necesitarás Python 3 y un compilador C++.

```bash
cd promptforge
npm ci
cp .env.example .env        # opcional: ajusta las variables
npm run dev                 # http://localhost:3000
```

Abre `/register`: **el primer usuario que se registra es el administrador**.

---

## 4. Configuración y variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_PATH` | `./data/promptforge.db` | Archivo SQLite. Se crea con sus migraciones al arrancar. |
| `APP_URL` | — | URL pública (p. ej. `https://promptforge.midominio.com`). Se añade a los orígenes permitidos (CSRF). Recomendado detrás de un proxy. |
| `ANTHROPIC_API_KEY` | — | Habilita **Mejorar con IA**. Sin ella todo funciona salvo ese botón, que se muestra deshabilitado con una explicación. |
| `ALLOW_REGISTRATION` | `true` | `false` cierra el registro público (el primer usuario siempre puede registrarse). |
| `COOKIE_SECURE` | `true` en producción | Cookie de sesión `Secure`. Pon `false` solo si sirves la app por HTTP plano (red local). |

El modelo de IA (Claude Opus 5.5 por defecto, Sonnet 5.5 o Haiku 5.5) y el esfuerzo se eligen en **Configuración → Modelo utilizado**. Con Opus y Sonnet se activa el *fallback* del servidor de Anthropic ante una negativa del modelo.

---

## 5. Base de datos

- Las migraciones están en `src/lib/server/migrations.ts` y se aplican **automáticamente** al abrir la base de datos (tabla `schema_migrations`). Para cambiar el esquema, añade una migración nueva con un número de versión mayor; nunca edites una ya aplicada.
- Modo WAL, `foreign_keys = ON`, `busy_timeout = 5000`.
- **Copias de seguridad**: usa la API de backup de SQLite en caliente:
  ```bash
  sqlite3 data/promptforge.db ".backup 'backup-$(date +%F).db'"
  ```
  o exporta la biblioteca de cada usuario desde **Configuración → Exportaciones** (JSON reimportable).
- No hay seeders con datos de ejemplo: la app se usa con datos reales desde el primer momento (las 17 plantillas vienen incluidas en el código).

---

## 6. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente. |
| `npm run build` | Build de producción (salida `standalone`). |
| `npm start` | Sirve el build de producción. |
| `npm run typecheck` | Comprobación de tipos. |
| `npm test` | Tests unitarios y de integración (motor, API, seguridad, IA con servidor simulado). |
| `npm run e2e` | Tests E2E con Playwright (escritorio y móvil). Requiere `npm run build` y `npx playwright install chromium`. |
| `npm run check` | typecheck + tests + build. |
| `npm run user:reset-password -- <email> <nueva>` | Restablece una contraseña desde el servidor y cierra sus sesiones. |

---

## 7. Desarrollo

- El motor (`src/lib/engine`) es TypeScript puro sin dependencias de Node ni de React: se puede probar de forma aislada (`tests/engine.test.ts`).
- Para añadir un **tipo de proyecto**: añade una entrada en `catalog.ts` (funcionalidades por grupo; un `+` inicial marca las avanzadas, que se excluyen en alcance MVP), y opcionalmente preguntas en `questions.ts` (`BY_TYPE`).
- Para añadir una **integración**: añádela en `techs.ts` con sus variables de entorno y requisitos verificables (solo APIs reales y documentadas).
- Para cambiar la **puntuación**: `quality.ts`. Los tests exigen que todas las plantillas MASTER puntúen ≥ 90.
- Estilo visual: tokens en `src/app/globals.css` (`:root` claro, `.dark` oscuro). Componentes base en `src/components/ui`.

---

## 8. Producción y deploy

### Node.js directamente
```bash
npm ci && npm run build
DATABASE_PATH=/var/lib/promptforge/promptforge.db APP_URL=https://promptforge.midominio.com npm start
```
Colócalo detrás de un proxy inverso con HTTPS (Nginx, Caddy…) que envíe `X-Forwarded-For`, `X-Forwarded-Proto` y `X-Forwarded-Host`.

### Docker
```bash
docker build -t promptforge .
docker run -d -p 3000:3000 -v promptforge-data:/data \
  -e APP_URL=https://promptforge.midominio.com \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  promptforge
```
La imagen ejecuta como usuario sin privilegios, guarda la base de datos en el volumen `/data` e incluye un `HEALTHCHECK` contra `/api/health`.

### Plataformas serverless
SQLite necesita **disco persistente**: usa un VPS, Docker, Fly.io/Railway con volumen, etc. En plataformas sin disco persistente (p. ej. Vercel) habría que migrar la capa `repos` a PostgreSQL.

### CI
`.github/workflows/promptforge.yml` ejecuta typecheck, tests, build y E2E en cada cambio dentro de `promptforge/`.

---

## 9. Seguridad

- **Validación** de toda la entrada con zod (tamaños máximos incluidos) y límite de tamaño del cuerpo.
- **CSRF**: cookie `SameSite=Lax` + verificación de `Origin` / `Sec-Fetch-Site` en toda petición que modifica datos.
- **XSS**: React escapa por defecto; la vista previa Markdown escapa todo el HTML antes de formatear; CSP restrictiva.
- **SQL injection**: solo consultas parametrizadas; los comodines de búsqueda se escapan.
- **Rate limiting**: login (10/min por IP y 20/h por email), registro (5/h por IP), cambio de contraseña, IA (10/h por usuario), creación e importación.
- **Bloqueo** de la cuenta 15 minutos tras 5 intentos fallidos; mensajes de error que no revelan si el email existe (tiempo constante con hash ficticio).
- **Sesiones**: token aleatorio de 256 bits, solo su hash en la base de datos, cookie `HttpOnly`/`Secure`/`SameSite`, expiración de 30 días, cierre del resto de sesiones al cambiar la contraseña.
- **Aislamiento**: cada consulta filtra por `user_id`; acceder a un prompt ajeno devuelve 404.
- **Cabeceras**: CSP, HSTS (producción), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Secretos**: solo en variables de entorno; la clave de Anthropic nunca llega al navegador.
- **Auditoría**: registros, inicios de sesión (y fallos), bloqueos, cambios de contraseña, borrados, importaciones y usos de IA, visibles para cada usuario en Configuración.

---

## 10. Cómo funciona el motor

1. **Detección** (`detect.ts`): normaliza la idea y puntúa cada tipo por palabras clave (los tipos genéricos pesan menos). Si aparece "SaaS" o una plataforma genérica junto a un dominio (facturación, reservas…), el dominio se incorpora como módulo con sus funcionalidades y entidades.
2. **Especificación** (`spec.ts`): funcionalidades por grupo/rol, integraciones, roles, diseño, stack y respuestas. `resolveSpec` aplica los efectos de las respuestas.
3. **Generación** (`generator.ts`): 22 secciones con nivel de detalle según la versión. Incluye las instrucciones de trabajo para Claude Code (20 pasos), las reglas de desarrollo ("no crees funcionalidades falsas", "no inventes APIs"…), el análisis inicial que Claude debe presentar y el plan en 12 fases con verificación.
4. **Calidad** (`quality.ts`): analiza el **texto** (no la especificación), así que las ediciones manuales cambian la puntuación en tiempo real.

---

## 11. Limitaciones conocidas

- **Recuperación de contraseña por email**: no implementada (requeriría un servidor SMTP). El administrador la restablece con `npm run user:reset-password`.
- **Interfaz solo en español**. El idioma configurable es el del proyecto que construirá Claude.
- **Rate limiting en memoria**: correcto para una instancia; con varias réplicas hay que moverlo a un almacén compartido (p. ej. Redis).
- **Mejorar con IA** requiere `ANTHROPIC_API_KEY` y consume tokens de tu cuenta de Anthropic.

---

## 12. Troubleshooting

| Problema | Solución |
|---|---|
| `Error: Could not locate the bindings file` (better-sqlite3) | `npm rebuild better-sqlite3` (requiere Python 3 y compilador C++ si no hay binario para tu plataforma). |
| Al guardar aparece "Origen no permitido" (403) | Detrás de un proxy, define `APP_URL` con la URL pública o reenvía `X-Forwarded-Host`/`X-Forwarded-Proto`. |
| Inicio de sesión correcto pero vuelve al login | Estás en HTTP plano con `COOKIE_SECURE=true`: usa HTTPS o `COOKIE_SECURE=false`. |
| "La mejora con IA no está configurada" | Define `ANTHROPIC_API_KEY` y reinicia el servidor. |
| "La clave ANTHROPIC_API_KEY no es válida" | Revisa la clave en console.anthropic.com. |
| `SQLITE_BUSY` | Otro proceso tiene la base de datos bloqueada; evita abrirla con herramientas externas en modo escritura mientras la app está activa. |
| E2E: no encuentra Chromium | `npx playwright install chromium`, o `PLAYWRIGHT_CHROMIUM_PATH=/ruta/a/chromium npm run e2e`. |

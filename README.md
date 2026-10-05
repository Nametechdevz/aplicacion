# WhatsApp CRM — Escritorio (Windows)

Aplicación de escritorio profesional para gestionar WhatsApp como un CRM: **contactos, etiquetas,
segmentos, bandeja de entrada, campañas con cola controlada, programación y recurrencia,
automatizaciones visuales, respuestas con IA, base de conocimiento, pipeline, tareas,
estadísticas, multicuenta, multiusuario, backups y auto-actualización**.

- Electron 44 + React 19 + TypeScript + SQLite (better-sqlite3, modo WAL).
- Conexión con WhatsApp mediante la **Cloud API oficial** de Meta **o** vinculando un teléfono por
  **código QR** (Baileys, no oficial; ver riesgos en la sección 6).
- Interfaz en español, tema oscuro por defecto (también claro).

> Arquitectura detallada (decisiones, base de datos, cola, motores): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Índice
1. [Instalación (usuarios)](#1-instalación-usuarios)
2. [Desarrollo](#2-desarrollo)
3. [Producción y build de Windows](#3-producción-y-build-de-windows)
4. [Configuración](#4-configuración)
5. [Base de datos](#5-base-de-datos)
6. [WhatsApp: conexión y límites reales](#6-whatsapp-conexión-y-límites-reales)
7. [Campañas](#7-campañas)
8. [Automatizaciones](#8-automatizaciones)
9. [IA y base de conocimiento](#9-ia-y-base-de-conocimiento)
10. [Backups](#10-backups)
11. [Actualizaciones](#11-actualizaciones)
12. [Seguridad](#12-seguridad)
13. [Pruebas](#13-pruebas)
14. [Solución de problemas](#14-solución-de-problemas)

---

## 1. Instalación (usuarios)

1. Ejecute `WhatsApp-CRM-Setup-<versión>.exe`.
2. Elija la carpeta de instalación (el instalador crea acceso directo en el escritorio y en el menú Inicio).
3. Al abrir por primera vez:
   - **Configuración inicial:** cree el usuario administrador.
   - **Conectar WhatsApp:** elija *WhatsApp con código QR* (no oficial), *WhatsApp Business Cloud API* (oficial) o *Simulador (pruebas)*.

La desinstalación (Panel de control → Aplicaciones) **no borra sus datos**, que viven en
`%APPDATA%\WhatsApp CRM\`.

### Segundo plano y bandeja del sistema
Al cerrar la ventana la aplicación pregunta: **«¿Cerrar aplicación o minimizar a la bandeja?»**
(se puede recordar la elección). Minimizada sigue ejecutando la cola de envíos, campañas
programadas, esperas de automatizaciones, IA y backups. Opción *Iniciar con Windows* en
Configuración → Cuenta (arranca oculta en la bandeja).

---

## 2. Desarrollo

Requisitos: **Node.js 22+** y npm.

```bash
npm install          # better-sqlite3 v13 trae binarios N-API precompilados (no requiere compilar)
npm run dev          # Vite (UI con recarga) + esbuild (main/preload) + Electron
npm test             # 74 pruebas (vitest) de motores, cola, campañas, persistencia…
npm run typecheck    # TypeScript estricto
npm run e2e          # recorrido de extremo a extremo con la app real (Linux: xvfb-run -a npm run e2e)
```

Estructura:

```
src/main/        proceso principal (backend): servicios, cola, motores, WhatsApp, IPC
src/preload/     puente seguro window.api
src/renderer/    interfaz React (páginas, componentes)
src/shared/      tipos, permisos, variables, teléfonos (compartido main/renderer)
tests/           pruebas unitarias/integración (vitest) y e2e (Playwright + Electron)
build/           iconos, licencia del instalador
scripts/         build, dev, generación de iconos
```

Variable útil: `WCRM_USER_DATA=<carpeta>` usa otra carpeta de datos (instancias de prueba o portables).
`WCRM_DEBUG=1` activa logs de depuración.

---

## 3. Producción y build de Windows

```bash
npm run dist:win     # genera release/WhatsApp-CRM-Setup-<versión>.exe (NSIS x64) + latest.yml
npm run dist:dir     # versión desempaquetada (sin instalador) para pruebas
npm run smoke:packaged  # prueba el binario empaquetado (rutas de producción reales)
```

- Lo ideal es compilar en Windows. Desde Linux también funciona con **Wine (64 y 32 bits)**
  instalado (`wine64` y `wine32:i386`).
- **CI:** `.github/workflows/build.yml` ejecuta typecheck + pruebas en Windows y Linux, genera el
  instalador en `windows-latest`, corre el smoke test del binario y lo publica como artefacto.
  En tags `v*` publica un *GitHub Release* (usado por la auto-actualización).
- Iconos: `build/icon.svg` → `npm run icons` regenera `icon.png`, `icon.ico` y `tray.png`
  (si usa un Chromium preinstalado: `CHROMIUM_PATH=/ruta/chrome npm run icons`).
- **Firma de código:** para evitar la advertencia de SmartScreen configure un certificado
  (`CSC_LINK` / `CSC_KEY_PASSWORD`) en el entorno de build.

---

## 4. Configuración

Configuración → secciones:

| Sección | Qué controla |
|---|---|
| Cuenta | Usuario actual, código de país por defecto, zona horaria, comportamiento al cerrar, inicio con Windows |
| WhatsApp | Cuentas (multicuenta), conectar/reconectar/desconectar, credenciales, plantillas, servidor de webhooks, simulador |
| Campañas y envíos | Mensajes/minuto, tope diario, reintentos, pausa ante RATE_LIMIT, margen para campañas atrasadas, confirmación reforzada, máximo por envío |
| Automatizaciones | Modo humano (pausa X min), palabras de **opt-out** y confirmación, límites anti-bucle |
| Horario de atención | Horario por día, zona horaria, respuesta fuera de horario |
| IA | API key (cifrada), modelo, mensajes de contexto |
| Notificaciones | Mensaje nuevo, campaña terminada/fallida, desconexión, automatización fallida, seguimientos |
| Campos personalizados | Texto, número, fecha, lista — usables como `{{clave}}` |
| Usuarios y permisos | Administrador / Supervisor / Agente + permisos adicionales |
| Base de datos y backup | Backups manuales/automáticos, restauración |
| Tema | Oscuro (por defecto) / claro |
| Actualizaciones y logs | Buscar actualizaciones, abrir logs |
| Auditoría | Registro de acciones de usuarios |

> La interfaz está en español; no hay selector de idioma.

---

## 5. Base de datos

- SQLite en `%APPDATA%\WhatsApp CRM\data\whatsapp-crm.db` (modo WAL, claves foráneas activas).
- Esquema versionado en `src/main/db/schema.ts` (`PRAGMA user_version`). Al actualizar la app,
  las migraciones se aplican solas y **antes** se copia la BD a `backups/pre-migration-*.db`.
- Todas las tablas de negocio tienen `account_id`: los datos de cada cuenta de WhatsApp están aislados.
- Tablas: `users, whatsapp_accounts, contacts, tags, contact_tags, custom_fields, contact_custom_fields,
  segments, conversations, messages, media_library, templates, provider_templates, quick_replies,
  campaigns, campaign_runs, campaign_recipients, message_queue, scheduled_messages, automations,
  automation_nodes, automation_edges, automation_runs, automation_logs, ai_assistants, knowledge_bases,
  knowledge_documents, knowledge_chunks (+FTS5), notes, tasks, pipelines, pipeline_stages,
  contact_pipeline, contact_events, settings, audit_logs, send_counters`.
- Multimedia en `%APPDATA%\WhatsApp CRM\media\<cuenta>\` (rutas relativas → backups portables).

---

## 6. WhatsApp: conexión y límites reales

### Conector oficial: Cloud API
Se necesita una cuenta de **Meta Business** con WhatsApp Business Platform:

1. En [developers.facebook.com](https://developers.facebook.com/) cree una app tipo *Business* y agregue **WhatsApp**.
2. Registre/verifique su número. Anote **Phone Number ID** y **WhatsApp Business Account ID**.
3. Cree un **usuario del sistema** con token permanente y permisos `whatsapp_business_messaging`
   y `whatsapp_business_management`.
4. Copie el **App Secret** (Configuración de la app → Básica).
5. En la aplicación: Configuración → WhatsApp → *Agregar cuenta* → Cloud API y pegue los datos.

**Recepción de mensajes (webhook).** La API entrega mensajes y estados por webhook HTTPS:

1. La app escucha en `http://127.0.0.1:3977/webhook` (puerto configurable).
2. Expóngalo por HTTPS, por ejemplo con Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:3977` (o un proxy inverso en su servidor).
3. En Meta → WhatsApp → Configuración → Webhook: *Callback URL* = `https://SU-DOMINIO/webhook`,
   *Verify token* = el que muestra la app. Suscríbase al campo **messages**.
4. Cada POST se verifica con la firma `X-Hub-Signature-256` (App Secret); sin firma válida se rechaza.

### Conector por código QR (Baileys, no oficial)
Para quien no tiene acceso a la API oficial, la app puede vincular un WhatsApp o WhatsApp Business
normal como **dispositivo vinculado** (igual que WhatsApp Web), usando la librería
[Baileys](https://github.com/WhiskeySockets/Baileys) (`src/main/whatsapp/baileys.ts`).

**Cómo conectar:** Configuración → WhatsApp → *Agregar cuenta* → *WhatsApp con código QR* →
acepte el aviso de riesgo → *Generar código QR*. En el teléfono: WhatsApp → ⋮ / Configuración →
*Dispositivos vinculados* → *Vincular un dispositivo* y escanee. La sesión queda guardada
**cifrada** (tabla `baileys_auth`) y se reconecta sola al abrir la app; *Cerrar sesión* la
desvincula y la borra.

**Riesgos (léalos):** no es una integración autorizada por WhatsApp; su uso incumple sus Términos
y el número puede ser **bloqueado**, sobre todo con envíos masivos o a personas que no lo tienen
agendado. Puede dejar de funcionar si WhatsApp cambia el protocolo (habrá que actualizar la app).
La app exige aceptar este riesgo (queda en el historial de auditoría) y **no incluye ningún
mecanismo para evadir límites o controles anti-spam**: no oculta la automatización, no rota
números ni simula escritura humana. Al contrario, aplica límites más prudentes por defecto
(6 mensajes/min, 150/día, configurables), además de opt-out, lista negra y consentimiento.

**Qué agrega frente a la API oficial:** sincroniza contactos de la agenda e historial reciente
(sin disparar automatizaciones ni contar como no leídos), no tiene ventana de 24 h, y los mensajes
que usted escribe desde el teléfono aparecen en el inbox (y activan el modo humano). No admite
plantillas de Meta. Grupos y estados se ignoran.

### Lo que la API oficial NO permite (y la alternativa implementada)
(Con el conector QR sí hay sincronización de contactos/historial y no aplica la ventana de 24 h.)

| Capacidad | Disponible | Alternativa |
|---|---|---|
| Sincronizar agenda de contactos | No | Contactos creados al recibir mensajes (con el nombre de perfil), importación CSV, alta manual |
| Etiquetas de WhatsApp Business | No | Etiquetas propias del CRM |
| Historial anterior a la conexión | No | El historial se construye desde la conexión |
| Foto de perfil | No | Avatar con iniciales |
| Mensajes libres pasadas 24 h del último mensaje del cliente | No | **Plantillas aprobadas** (se sincronizan desde Meta) |

### Estados y errores
Estados por mensaje: `queued → sending → sent → delivered → read`, o `failed` / `cancelled`.
Los errores de Meta se traducen a mensajes claros (ej. *«Cuenta desconectada»*, *«El proveedor
rechazó el envío»*, *«Fuera de la ventana de 24 h…»*); el detalle técnico queda en `logs/whatsapp`.

### Simulador
Proveedor de **pruebas** (marcado como *Simulador* en toda la UI): no envía mensajes reales,
simula entregado/leído, permite **simular mensajes entrantes** y **desconexiones** desde
Configuración → WhatsApp.

### Desconexión y reconexión
Si la conexión se pierde: estado 🔴, **las campañas en curso se pausan automáticamente**, la cola
no envía nada y se intenta reconectar con backoff (5 s → 10 min). Al reconectar se notifica
*«Conexión restaurada»* y se ofrece **▶ Reanudar campañas**. Un token inválido deja la cuenta en
*Error de credenciales* (requiere acción del usuario).

---

## 7. Campañas

Asistente de 7 pasos: **Nombre → Destinatarios** (todos, etiqueta(s), segmento, importados,
selección manual) **→ Mensaje** (texto con variables o plantilla aprobada) **→ Multimedia →
Programación** (inmediata, fecha/hora/zona, recurrente diaria/semanal/mensual) **→ Revisión**
(vista previa real por contacto, exclusiones) **→ Confirmar**.

- **Variables:** `{{nombre}} {{apellido}} {{nombre_completo}} {{telefono}} {{email}} {{empresa}}
  {{fecha}} {{hora}}` + campos personalizados. Valor por defecto: `{{nombre|cliente}}`.
- **Exclusiones automáticas:** opt-out, lista negra, etiqueta *No contactar*, teléfono inválido,
  duplicados y (texto libre) contactos fuera de la ventana de 24 h.
- **Confirmación segura:** la confirmación envía la cantidad que el usuario vio; si la audiencia
  cambió, se rechaza. Sobre el umbral configurado hay que escribir el número de destinatarios.
- **Cola:** un mensaje a la vez por cuenta, al ritmo configurado; `RATE_LIMIT` → pausa automática
  y reintento; errores temporales → backoff exponencial; tope diario opcional.
- **Sin duplicados:** cada envío tiene `idempotency_key` única (`camp:<campaña>:<ejecución>:<contacto>`).
  Si la app se cierra *durante* un envío, ese mensaje se marca fallido («interrumpido, verifique»)
  y **nunca se reenvía solo**.
- **Tiempo real:** contactos, enviados, entregados, leídos, respondidos, fallidos, pendientes y
  barra de progreso; ▶ Iniciar/Reanudar, ⏸ Pausar, ⏹ Detener.
- **Persistencia:** al reabrir la app, las campañas programadas siguen programadas, las en curso
  continúan con lo pendiente y las pausadas siguen pausadas. Una campaña cuya hora pasó con la
  app cerrada se envía si está dentro del margen configurado; si no, queda en pausa para que
  usted decida.
- **Recurrentes:** no se acumulan ejecuciones perdidas, no se inicia una ejecución si la anterior
  sigue en curso y, si la audiencia crece más de 50 %, se pausa para reconfirmar.

---

## 8. Automatizaciones

Constructor visual **Trigger → Condición (Sí/No) → Acción** (arrastrar, conectar, editar,
duplicar, eliminar).

- **Triggers:** mensaje recibido, mensaje respondido, mensaje enviado, contacto creado, etiqueta
  agregada/eliminada, horario determinado (días/hora para una etiqueta o segmento), evento
  programado por fecha de campo personalizado (con desfase en días y repetición anual).
- **Condiciones:** contiene / comienza / termina / es exactamente (sin distinguir mayúsculas ni
  acentos), etiqueta es / no es, número coincide, horario de atención, día, rango horario, campo
  personalizado, estado del contacto, contacto nuevo.
- **Acciones:** enviar mensaje, enviar imagen/documento/video, agregar/quitar etiqueta, nota,
  asignar, **esperar** (persistente: sobrevive al cierre de la app), ejecutar otra automatización,
  crear tarea, mover en pipeline, responder con IA, detener.
- **Protecciones:** modo humano, opt-out, lista negra, ventana de 24 h, límite de ejecuciones por
  contacto/hora, profundidad máxima de encadenamiento, validación de ciclos.
- Historial de ejecuciones y logs por nodo (botón *Ejecuciones*).

**Modo humano:** cuando un agente responde manualmente, automatizaciones e IA se pausan en esa
conversación durante los minutos configurados (30 por defecto). Se puede reactivar o pausar a mano
desde el inbox.

---

## 9. IA y base de conocimiento

- Proveedor: **Claude (Anthropic)**, opcional. Configure la API key en Configuración → IA
  (se guarda cifrada). Modelo por defecto `claude-opus-5-5` (editable; cada asistente puede usar otro).
- **Asistentes:** instrucciones propias + reglas de seguridad fijas (no inventar datos, derivar a
  humano, no pedir contraseñas). Controles: activar/desactivar, solo en horario, conversaciones
  permitidas (todas / sin asignar / por etiquetas), etiquetas excluidas, máximo de respuestas por
  hora, etiqueta al derivar. Botón **Probar** para ver la respuesta sin enviarla.
- **Derivación:** si la IA indica que hace falta un humano, se crea una tarea, se activa el modo
  humano y se notifica.
- **Base de conocimiento:** PDF (con texto seleccionable), DOCX, TXT/MD, preguntas frecuentes y
  texto libre. Se trocea e indexa con SQLite FTS5; antes de responder se buscan los fragmentos
  relevantes. *Probar búsqueda* muestra qué encontraría la IA.
- Se usa *server-side fallback* de la API para que una respuesta rechazada por los filtros del
  modelo pueda resolverse con un modelo alternativo.

---

## 10. Backups

Configuración → Base de datos y backup:
- **Crear backup** (o *Guardar en…*): `.wcrm.zip` con la base de datos completa (contactos,
  campañas, automatizaciones, plantillas, configuración, historial) + archivos multimedia.
- **Automático** cada N horas con retención configurable (por defecto diario, 7 copias).
- **Restaurar:** se valida el archivo, la app se reinicia, guarda una copia `pre-restore-*.db` de
  los datos actuales y aplica el backup.
- Las credenciales de WhatsApp y la API key están cifradas con DPAPI del usuario de Windows:
  al restaurar en **otro equipo** deberá volver a ingresarlas.

---

## 11. Actualizaciones

- `electron-updater` busca nuevas versiones (al iniciar y cada 6 h), las descarga y las instala al
  cerrar la app. También: Configuración → Actualizaciones → *Buscar actualizaciones*.
- Fuente: GitHub Releases del repositorio (ver `build.publish` en `package.json`). Para un
  repositorio privado configure un token de lectura o cambie a un proveedor `generic` (servidor
  propio con `latest.yml` + instalador).
- La base de datos, configuraciones, sesiones, campañas y contactos están en `%APPDATA%`, fuera de
  la carpeta de instalación: **las actualizaciones no los tocan**. Las migraciones de esquema
  crean una copia previa automáticamente.

---

## 12. Seguridad

- Renderer aislado: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta,
  navegación y ventanas emergentes bloqueadas; solo un canal IPC con lista blanca de métodos.
- Cada método IPC valida su entrada con **zod**, exige sesión y **permiso por rol**, y opera solo
  sobre la cuenta activa (aislamiento por cuenta).
- **SQL 100 % parametrizado**; mensajes renderizados como texto (React escapa → sin XSS);
  protección contra inyección de fórmulas en CSV/Excel exportados.
- Contraseñas con **scrypt** + sal; bloqueo progresivo tras 5 intentos fallidos.
- Credenciales y API key cifradas con `safeStorage` (DPAPI en Windows).
- Webhooks: firma HMAC-SHA256 obligatoria, verify token, límite de tamaño y rate limit por IP.
  (No hay formularios web: CSRF no aplica; el origen de cada llamada IPC se verifica.)
- Archivos multimedia servidos por un protocolo propio que exige sesión y pertenencia a la cuenta.
- Logs con rotación (5 MB × 5) en `logs/application|whatsapp|campaigns|automation|errors`;
  se redactan tokens y se enmascaran teléfonos; nunca se registra el contenido de los mensajes.
- Auditoría de acciones de usuarios (`audit_logs`).

### Uso legítimo
La aplicación **no** incluye mecanismos para evadir límites, bloqueos o controles anti-spam de
WhatsApp. Incluye confirmación de campañas, exclusión *No contactar*, opt-out automático por
palabra clave (y por el error 131050 de Meta), lista negra, registro de consentimiento
(`consent_status`, `consent_source`, `consent_date`), límites configurables y control de envío.

---

## 13. Pruebas

`npm test` (vitest, 74 pruebas) cubre: conexión/desconexión y pausa de campañas, contactos,
etiquetas, segmentos (incl. inyección SQL), campañas (flujo completo, exclusiones, pausa/reanudar/
detener, programación, recurrencia, ventana de 24 h, respuestas), cola (idempotencia, ritmo,
RATE_LIMIT, reintentos, errores permanentes, tope diario, recuperación tras cierre), multimedia,
variables, automatizaciones (triggers, condiciones, acciones, modo humano, anti-bucle, horarios),
importación/exportación, opt-out, lista negra, webhooks firmados, Cloud API, conector QR (Baileys con socket simulado: QR, sesión cifrada, LID, historial, cierre de sesión, reconexión) y migración de base de datos, IA (con cliente
simulado), backup/restauración, usuarios y permisos, y **persistencia real cerrando y reabriendo la
aplicación** con campañas programadas, en curso (sin duplicados) y pausadas.

`npm run e2e` lanza la aplicación Electron real y recorre: configuración inicial, conexión,
mensaje entrante, respuesta en el inbox, contactos y etiquetas, automatización, campaña completa y
todas las páginas (capturas en `test-results/screens`).

---

## 14. Solución de problemas

| Problema | Solución |
|---|---|
| 🔴 *Error de credenciales* | Token vencido o sin permisos: genere uno nuevo (usuario del sistema) y edítelo en Configuración → WhatsApp. |
| No llegan mensajes entrantes | Verifique que el túnel/proxy apunte a `http://127.0.0.1:3977/webhook`, que el webhook esté verificado en Meta y suscrito a *messages*, y que el App Secret sea correcto (si no, la firma se rechaza: ver `logs/whatsapp`). |
| *Fuera de la ventana de 24 h* | El cliente no escribió en las últimas 24 h: use una **plantilla aprobada** (sincronícelas en Configuración → WhatsApp). |
| *El puerto 3977 ya está en uso* | Cambie el puerto en Configuración → WhatsApp → Servidor de webhooks y actualice el túnel. |
| Envíos en pausa temporal | WhatsApp devolvió RATE_LIMIT: la cola se reanuda sola. Considere bajar *mensajes por minuto*. |
| Campaña en pausa «la aplicación estaba cerrada» | Pasó el margen configurado: revise y pulse **Reanudar** si aún aplica. |
| Mensaje marcado «Envío interrumpido» | La app se cerró en pleno envío: compruebe en WhatsApp si llegó antes de **Reintentar**. |
| Restauré un backup y no conecta | Las credenciales cifradas no se pueden leer en otro equipo: vuelva a ingresarlas. |
| La IA no responde | Revise la API key, que el asistente esté activo, el alcance/etiquetas/horario, el modo humano y el límite por hora (`logs/automation`). |
| PDF sin texto en la base de conocimiento | El PDF es una imagen escaneada: conviértalo con OCR. |
| Ver logs | Configuración → Actualizaciones y logs → *Abrir carpeta de logs*. |

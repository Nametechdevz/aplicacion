# Arquitectura — WhatsApp CRM (escritorio)

Este documento es el análisis previo a la implementación: decisiones, límites reales del canal
y cómo se comunican los módulos. Todo lo descrito aquí está implementado en `src/`.

## 1. Análisis y decisiones clave

| Tema | Decisión | Motivo |
|---|---|---|
| Plataforma | Electron + React + TypeScript | Instalador `.exe`, bandeja del sistema, notificaciones nativas y procesos en segundo plano sin navegador. |
| Base de datos | SQLite (`better-sqlite3`, modo WAL) | Embebida, transaccional, sin servidor. v13 trae binarios N-API precompilados para Windows (no requiere compilar). |
| Conector WhatsApp | **WhatsApp Business Platform – Cloud API (Meta)** detrás de la interfaz `WhatsAppProvider` | Es el mecanismo **oficial y autorizado**. |
| Conexión por QR | **Opcional, no oficial** (`BaileysProvider`) | Añadida a petición del usuario, que no tiene acceso a la API oficial. Riesgo de bloqueo explicado en la UI y aceptación obligatoria (validada en el proceso principal y auditada). Credenciales de sesión cifradas en `baileys_auth`. Sin mecanismos de evasión: mismos límites, opt-out y lista negra, con valores por defecto más prudentes. Migración de esquema v2 reconstruye `whatsapp_accounts` con FKs verificadas. |
| IA | Claude API (`@anthropic-ai/sdk`), opcional | Respuestas automáticas con instrucciones + base de conocimiento, con salida estructurada y derivación a humano. |
| Procesos | Toda la lógica de negocio en el proceso *main*; la UI (renderer) es aislada (`contextIsolation`, `sandbox`, sin `nodeIntegration`) | Seguridad y estabilidad: los motores siguen funcionando con la ventana cerrada (bandeja). |

### Capacidades reales del canal (Cloud API) y alternativas

| Requisito | ¿Disponible vía API oficial? | Alternativa implementada |
|---|---|---|
| Enviar texto/imagen/video/audio/documento | Sí | — |
| Recibir mensajes | Sí, por **webhook** HTTPS | Servidor de webhooks local (firma `X-Hub-Signature-256` verificada) expuesto con un túnel o proxy inverso (ver README). |
| Estados sent/delivered/read/failed | Sí (webhook `statuses`) | — |
| Sincronizar la agenda de contactos | **No** | Los contactos se crean automáticamente al recibir mensajes (nombre de perfil del webhook), por importación CSV o manualmente. |
| Etiquetas de WhatsApp Business | **No** | Etiquetas propias del CRM. |
| Historial previo a la conexión | **No** | El historial se construye desde la conexión. |
| Foto de perfil | **No** | Avatar con iniciales / imagen cargada por el usuario. |
| Mensajes libres fuera de la ventana de 24 h | **No** (solo plantillas aprobadas por Meta) | Campañas y automatizaciones soportan *plantillas aprobadas* (sincronizadas desde la cuenta) y el sistema avisa/registra el error 131047. |
| Límites de envío | Meta impone límites de throughput y por par usuario | Cola con ritmo configurable, pausa automática ante `RATE_LIMIT` y reintentos con backoff. |

Nunca se inventan datos: lo que la API no entrega se marca como no disponible en la UI.

### Proveedor simulador
Para probar flujos sin cuenta de Meta existe `SimulatorProvider`, claramente etiquetado como
*Simulador (pruebas)*: no envía mensajes reales, simula estados entregado/leído y permite inyectar
mensajes entrantes. Usa exactamente la misma interfaz que el proveedor real.

## 2. Capas y módulos

```
src/
  main/                       Proceso principal (backend)
    main.ts                   Ciclo de vida Electron, ventana, bandeja, single-instance
    app-context.ts            Composición (inyección de dependencias) de todos los servicios
    core/                     event-bus, logger (rotación), crypto (safeStorage/scrypt), clock, errors
    db/                       conexión, migraciones, esquema
    services/                 Lógica CRM y acceso a datos (SQL parametrizado únicamente): contacts,
                              tags, segments, custom-fields, conversations, messaging, templates,
                              media, import/export, tasks + pipeline, compliance (opt-out, horario),
                              users/auth, settings, history (auditoría), backup, stats
    whatsapp/                 WhatsAppProvider + CloudApiProvider + SimulatorProvider + AccountManager
                              + WebhookServer
    queue/                    QueueWorker (cola persistente) + rate limiter
    campaigns/                CampaignEngine + recurrence
    automation/               AutomationEngine (triggers, condiciones, acciones, waits)
    ai/                       AiResponder + KnowledgeBase (FTS5)
    scheduler/                Scheduler (tick persistente: campañas, waits, mensajes programados,
                              triggers horarios, backups automáticos)
    notifications/            NotificationEngine (Electron Notification)
    ipc/                      Router IPC con validación zod + permisos por rol
  preload/                    Puente seguro `window.api` (lista blanca de canales)
  renderer/                   React (UI)
  shared/                     Tipos, permisos, variables, normalización de teléfonos
```

## 3. Comunicación entre módulos

* **Renderer ⇄ Main**: un único canal `ipc:invoke` con `{ method, payload }`. El router valida el
  payload con zod, verifica sesión y permiso (`users.role`), ejecuta y devuelve
  `{ ok: true, data } | { ok: false, error: { code, message } }`. Los mensajes de error son
  comprensibles para el usuario; el detalle técnico va a `logs/errors`.
* **Main → Renderer**: eventos `app:event` (`message:new`, `message:status`, `campaign:progress`,
  `account:status`, `toast`…) emitidos desde el **EventBus**.
* **Entre motores**: EventBus interno tipado. Ejemplos:
  * `WebhookServer → AccountManager → ConversationService.ingestInbound()` → emite `message.received`.
  * `message.received` → `OptOutService` (primero), `BusinessHours`, `AutomationEngine`, `AiResponder`,
    `CampaignEngine` (marca "respondido"), `NotificationEngine`.
  * `account.status` (disconnected) → `CampaignEngine.pauseAllForAccount()` + `QueueWorker` se detiene.
  * `QueueWorker` → `message.sent/failed` → `CampaignEngine.onItemFinished()` (progreso y cierre).

## 4. Base de datos

Ver `src/main/db/schema.ts` (migraciones versionadas en `PRAGMA user_version`). Todas las tablas de
negocio llevan `account_id` para aislar datos por cuenta de WhatsApp. Tablas principales:

`users, whatsapp_accounts, contacts, tags, contact_tags, custom_fields, contact_custom_fields,
segments, conversations, messages, message_media, media_library, templates, quick_replies,
campaigns, campaign_runs, campaign_recipients, message_queue, scheduled_messages, automations,
automation_nodes, automation_edges, automation_runs, automation_logs, ai_assistants,
knowledge_bases, knowledge_documents, knowledge_chunks (+FTS5), notes, tasks, pipelines,
pipeline_stages, contact_pipeline, contact_events (historial), settings, audit_logs,
provider_templates`.

Consentimiento: `contacts.consent_status ∈ {unknown, opted_in, opted_out}`, `consent_source`,
`consent_date`. Lista negra: `contacts.blacklisted` + motivo.

## 5. Integración WhatsApp (`WhatsAppProvider`)

```ts
interface WhatsAppProvider {
  readonly kind: 'cloud_api' | 'simulator';
  readonly capabilities: ProviderCapabilities;   // qué soporta (media, templates, sync contactos…)
  connect(): Promise<void>;                      // valida credenciales / abre sesión
  disconnect(): Promise<void>;
  getStatus(): ConnectionInfo;                   // connected | connecting | disconnected | qr_required
  sendMessage(msg: OutboundMessage): Promise<SendResult>;  // lanza ProviderError tipado
  uploadMedia?(file): Promise<string>;
  downloadMedia?(id): Promise<Buffer>;
  listTemplates?(): Promise<ProviderTemplate[]>;
  handleWebhook?(payload): ProviderEvent[];      // normaliza a eventos internos
  on(event, cb)                                  // status, inbound, statusUpdate
}
```

`ProviderError.kind ∈ {RATE_LIMIT, AUTH, DISCONNECTED, INVALID_RECIPIENT, OUTSIDE_WINDOW,
TEMPLATE, MEDIA, TRANSIENT, REJECTED}` determina la política de reintento.

## 6. Cola (`message_queue`) y QueueWorker

* Cada envío (manual, campaña, automatización, IA, programado) entra a la cola con un
  **`idempotency_key` UNIQUE** (`camp:{campaña}:{ejecución}:{contacto}`, `auto:{run}:{nodo}`,
  `manual:{uuid}`, `sched:{id}`). `INSERT OR IGNORE` hace imposible duplicar.
* Worker por cuenta, un mensaje a la vez, ritmo configurable (msgs/min) y tope diario.
* Toma atómica: `UPDATE … SET status='sending' … RETURNING`.
* Resultados: `sent` (luego `delivered`/`read` por webhook), reintento con backoff exponencial para
  errores transitorios, `RATE_LIMIT` → pausa de la cuenta (backoff) y reprograma, errores
  permanentes → `failed` con motivo legible.
* Recuperación tras cierre inesperado: un elemento que quedó en `sending` **no se reenvía**
  automáticamente (no se puede saber si WhatsApp lo recibió); se marca `failed` con motivo
  "Envío interrumpido — verifique antes de reintentar". Prioridad: nunca duplicar.
* Antes de cada envío se re-verifica: opt-out, lista negra, cuenta conectada, campaña en `running`.

## 7. CampaignEngine

Estados: `draft → scheduled → running ⇄ paused → completed | cancelled | failed`.
1. Borrador (nombre, audiencia: todos/etiqueta/segmento/importados/manual, mensaje o plantilla,
   multimedia, programación, recurrencia).
2. `preview()` calcula destinatarios y exclusiones (opt-out, lista negra, "No contactar",
   teléfonos inválidos, duplicados) y renderiza variables por contacto.
3. `confirm(expectedCount)` — confirmación explícita; si la audiencia cambió, se rechaza.
4. Al llegar la hora el Scheduler llama `startRun()` → crea `campaign_run`, destinatarios y cola en
   una transacción.
5. Pausa/reanudar/detener; pausa automática por desconexión.
6. Recurrencia (diaria/semanal/mensual) con salvaguardas: no se acumulan ejecuciones perdidas, no se
   inicia una ejecución si la anterior sigue activa, tope de destinatarios por ejecución.
7. Una campaña única cuya hora pasó con la app cerrada se ejecuta al abrir si está dentro de la
   ventana de gracia (configurable); si no, queda en pausa esperando confirmación del usuario.

## 8. AutomationEngine

Grafo de nodos `trigger → condition(true/false) → action → …` guardado en
`automation_nodes/edges`. API: `trigger()`, `evaluateConditions()`, `executeAction()`,
`scheduleAction()`, `pause()`, `resume()`, `cancel()`.
* Ejecuciones persistentes (`automation_runs`) — los nodos *Esperar* guardan `resume_at` y el
  Scheduler las reanuda incluso tras reiniciar la app.
* Protecciones: profundidad máxima de encadenamiento, límite de ejecuciones por contacto/hora,
  modo humano, opt-out, horario.
* Triggers soportados por la integración: mensaje recibido, mensaje respondido, mensaje enviado,
  contacto creado, etiqueta agregada/eliminada, horario (programado), fecha de campo personalizado.

## 9. Seguridad

* Credenciales cifradas con `safeStorage` (DPAPI en Windows); contraseñas con `scrypt` + sal.
* IPC con lista blanca, validación zod y permisos por rol (admin / supervisor / agente).
* SQL 100% parametrizado; texto de mensajes renderizado como texto (React escapa → sin XSS); CSP
  estricta; navegación y `window.open` bloqueados.
* Webhook: verificación de firma HMAC-SHA256, límite de tamaño, rate limiting por IP.
* Login con bloqueo progresivo tras intentos fallidos. Auditoría en `audit_logs`.
* Logs con rotación y redacción de tokens y teléfonos.

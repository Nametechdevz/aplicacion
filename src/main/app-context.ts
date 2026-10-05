import path from 'node:path';
import fs from 'node:fs';
import type { Ctx, AppPaths } from './context';
import { openDatabase, type DB } from './db/database';
import { EventBus } from './core/event-bus';
import { Logger } from './core/logger';
import { systemClock, type Clock } from './core/clock';
import { createSecretBox, type SafeStorageLike, type SecretBox } from './core/crypto';
import { SettingsService } from './services/settings';
import { HistoryService } from './services/history';
import { UserService } from './services/users';
import { TagService } from './services/tags';
import { CustomFieldService } from './services/custom-fields';
import { SegmentService } from './services/segments';
import { ContactService } from './services/contacts';
import { MediaService } from './services/media';
import { ConversationService } from './services/conversations';
import { MessagingService } from './services/messaging';
import { TemplateService } from './services/templates';
import { TaskService } from './services/tasks';
import { ComplianceService } from './services/compliance';
import { ImportExportService } from './services/import-export';
import { StatsService } from './services/stats';
import { BackupService } from './services/backup';
import { AccountManager, defaultProviderFactory, type ProviderFactory } from './whatsapp/account-manager';
import { WebhookServer } from './whatsapp/webhook-server';
import { QueueWorker } from './queue/worker';
import { CampaignEngine } from './campaigns/engine';
import { AutomationEngine } from './automation/engine';
import { KnowledgeService } from './ai/knowledge';
import { AiResponder, type ResponderDeps } from './ai/responder';
import { Scheduler } from './scheduler/scheduler';
import { NotificationEngine, type NotifyFn } from './notifications/engine';

export interface CreateAppOptions {
  userDataDir: string;
  dbFile?: string; // ':memory:' en pruebas
  clock?: Clock;
  safeStorage?: SafeStorageLike | null;
  secrets?: SecretBox;
  providerFactory?: ProviderFactory;
  aiClientFactory?: ResponderDeps['createClient'];
  aiDebounceMs?: number;
  notify?: NotifyFn;
  isFocused?: () => boolean;
  logToFiles?: boolean;
  logToConsole?: boolean;
  appVersion?: string;
}

export type App = ReturnType<typeof createApp>;

export function makePaths(userData: string): AppPaths {
  return {
    userData,
    media: path.join(userData, 'media'),
    backups: path.join(userData, 'backups'),
    logs: path.join(userData, 'logs'),
    temp: path.join(userData, 'tmp'),
  };
}

/** Composición de la aplicación. No depende de Electron: se usa igual en producción y en pruebas. */
export function createApp(opts: CreateAppOptions) {
  const paths = makePaths(opts.userDataDir);
  for (const p of [paths.userData, paths.media, paths.backups, paths.temp]) fs.mkdirSync(p, { recursive: true });
  const log = new Logger({ dir: opts.logToFiles === false ? null : paths.logs, console: opts.logToConsole });
  const db: DB = openDatabase({ file: opts.dbFile ?? path.join(paths.userData, 'data', 'whatsapp-crm.db'), backupDir: paths.backups });
  const bus = new EventBus();
  bus.onError((ev, err) => log.error('application', `Error en manejador de "${ev}"`, err));
  const secrets = opts.secrets ?? createSecretBox({ safeStorage: opts.safeStorage, keyFile: path.join(paths.userData, '.localkey') });
  const ctx: Ctx = { db, bus, log, clock: opts.clock ?? systemClock, secrets, paths };

  const settings = new SettingsService(ctx);
  const history = new HistoryService(ctx);
  const users = new UserService(ctx, history);
  const tags = new TagService(ctx, history);
  const fields = new CustomFieldService(ctx);
  const segments = new SegmentService(ctx);
  const contacts = new ContactService(ctx, history, tags, fields, segments, settings);
  const media = new MediaService(ctx);
  const conversations = new ConversationService(ctx, contacts, tags, media, settings, history);
  const messaging = new MessagingService(ctx, contacts, conversations, media, fields, settings);
  const templates = new TemplateService(ctx);
  const tasks = new TaskService(ctx, history);
  const compliance = new ComplianceService(ctx, settings, contacts, () => messaging);
  const importExport = new ImportExportService(ctx, contacts, tags, fields, settings, history);
  const stats = new StatsService(ctx, settings);
  const backup = new BackupService(ctx, settings, opts.appVersion ?? '1.0.0');
  const accounts = new AccountManager(ctx, { conversations, templates, tags, tasks }, opts.providerFactory ?? defaultProviderFactory);
  const webhooks = new WebhookServer(ctx, accounts);
  const worker = new QueueWorker(ctx, {
    getProvider: (id) => accounts.getProvider(id),
    onProviderFatal: (id, err) => accounts.onProviderFatal(id, err),
    conversations,
    media,
    contacts,
    settings,
    tags,
  });
  const windowHours = (id: number) => accounts.windowHours(id);
  const campaigns = new CampaignEngine(ctx, { contacts, segments, tags, messaging, fields, settings, history, media, isConnected: (id) => accounts.isConnected(id), windowHours });
  const knowledge = new KnowledgeService(ctx);
  const ai = new AiResponder(ctx, { settings, contacts, conversations, messaging, tags, tasks, compliance, knowledge, createClient: opts.aiClientFactory, debounceMs: opts.aiDebounceMs });
  ai.windowHours = windowHours;
  const automation = new AutomationEngine(ctx, {
    contacts,
    tags,
    messaging,
    conversations,
    fields,
    settings,
    tasks,
    segments,
    compliance,
    windowHours,
    aiReply: (a, c, assistantId, runId) => ai.replyFromAutomation(a, c, assistantId, runId),
  });
  const scheduler = new Scheduler(ctx, {
    campaignsDue: () => campaigns.processDue(),
    scheduledMessagesDue: () => messaging.releaseDueScheduled(windowHours),
    automationWaits: () => automation.resumeDue(),
    automationTimeTriggers: () => automation.processTimeTriggers(),
    tasksDue: () => {
      for (const t of tasks.dueForNotification()) bus.emit('notify', { title: '⏰ Seguimiento pendiente', body: t.title + (t.contact_name ? ` — ${t.contact_name}` : ''), kind: 'task', accountId: t.account_id, route: '/tasks' });
    },
    autoBackup: () => backup.autoBackupIfDue(),
  });
  const notifications = new NotificationEngine(ctx, settings, opts.notify ?? (() => {}), opts.isFocused);

  // ------------------- Cableado de eventos -------------------
  bus.on('message.received', async (e) => {
    // 1) Cumplimiento primero (opt-out, fuera de horario)
    const { optedOut } = compliance.handleInbound(e);
    // 2) Estadística de "respondido" en campañas
    campaigns.onInbound(e.accountId, e.contactId);
    if (optedOut) return;
    // 3) Automatizaciones
    await automation.trigger({ type: 'message_received', accountId: e.accountId, contactId: e.contactId, text: e.text, isNewContact: e.isNewContact, conversationId: e.conversationId });
    if (e.wasAwaitingReply) await automation.trigger({ type: 'message_replied', accountId: e.accountId, contactId: e.contactId, text: e.text, isNewContact: e.isNewContact, conversationId: e.conversationId });
    // 4) IA (solo si nadie respondió ya)
    await ai.onInbound(e);
  });
  bus.on('contact.created', async (e) => {
    if (e.source === 'import') return; // importaciones masivas no disparan mensajes automáticos (opción explícita: import_auto)
    await automation.trigger({ type: 'contact_created', accountId: e.accountId, contactId: e.contactId, isNewContact: true });
  });
  bus.on('tag.added', async (e) => {
    await automation.trigger({ type: 'tag_added', accountId: e.accountId, contactId: e.contactId, tagId: e.tagId, depth: e.automationDepth ?? 0 });
  });
  bus.on('tag.removed', async (e) => {
    await automation.trigger({ type: 'tag_removed', accountId: e.accountId, contactId: e.contactId, tagId: e.tagId, depth: e.automationDepth ?? 0 });
  });
  bus.on('message.sent', async (e) => {
    if (e.source !== 'manual' && e.source !== 'campaign') return; // evita bucles con mensajes automáticos
    await automation.trigger({ type: 'message_sent', accountId: e.accountId, contactId: e.contactId, source: e.source, depth: e.automationDepth ?? 0 });
  });
  bus.on('queue.finished', (e) => campaigns.onQueueFinished(e));
  bus.on('account.status', (e) => {
    if ((e.status === 'disconnected' || e.status === 'error') && e.previous === 'connected') {
      const n = campaigns.pauseAllForAccount(e.accountId, 'disconnected');
      if (n) log.warn('campaigns', `${n} campaña(s) pausadas por desconexión de la cuenta ${e.accountId}`);
    }
  });
  notifications.register();

  let started = false;
  return {
    ctx,
    db,
    bus,
    log,
    paths,
    settings,
    history,
    users,
    tags,
    fields,
    segments,
    contacts,
    media,
    conversations,
    messaging,
    templates,
    tasks,
    compliance,
    importExport,
    stats,
    backup,
    accounts,
    webhooks,
    worker,
    campaigns,
    knowledge,
    ai,
    automation,
    scheduler,
    notifications,

    /** Arranque: recuperar estado persistente y poner en marcha motores. */
    async start(o: { webhook?: boolean; queueIntervalMs?: number; schedulerIntervalMs?: number } = {}) {
      if (started) return;
      started = true;
      worker.recoverInterrupted();
      // Ejecuciones de automatización que quedaron "running" por un cierre: se marcan fallidas
      // (sus envíos ya tienen clave de idempotencia; reanudar podría repetir acciones no idempotentes).
      const stuck = db.prepare("UPDATE automation_runs SET status = 'failed', error = 'Interrumpida por cierre de la aplicación', finished_at = ? WHERE status = 'running'").run(ctx.clock.now().toISOString()).changes;
      if (stuck) log.warn('automation', `${stuck} ejecución(es) interrumpidas marcadas como fallidas`);
      await accounts.startAll();
      if (o.webhook !== false) {
        const wh = settings.get('webhook');
        if (accounts.list().some((a) => a.provider === 'cloud_api')) await webhooks.start(wh.port, wh.host).catch((e) => log.error('whatsapp', 'No se pudo iniciar el servidor de webhooks', e));
      }
      worker.start(o.queueIntervalMs);
      scheduler.start(o.schedulerIntervalMs);
      log.info('application', 'Motores iniciados');
    },

    async shutdown() {
      scheduler.stop();
      worker.stop();
      await worker.idle();
      accounts.shutdown();
      await webhooks.stop();
      await bus.drain();
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch {
        /* ya cerrada */
      }
    },
  };
}

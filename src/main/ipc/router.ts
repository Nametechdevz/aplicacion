import { z, ZodError } from 'zod';
import fs from 'node:fs';
import type { App } from '../app-context';
import { AppError, forbidden } from '../core/errors';
import { randomId } from '../core/crypto';
import { hasPermission, PERMISSIONS, ROLE_LABELS, type Permission } from '../../shared/permissions';
import type { IpcResult, SessionUser } from '../../shared/types';
import { TRIGGERS, CONDITIONS, ACTIONS } from '../automation/catalog';
import { TEMPLATE_CATEGORIES } from '../services/templates';
import { BUILTIN_VARIABLES } from '../../shared/variables';
import { describeRecurrence } from '../campaigns/recurrence';
import { SETTINGS_SCHEMAS } from './settings-schemas';

/** Operaciones que requieren Electron (diálogos, shell…). Se inyectan para poder probar el router sin Electron. */
export interface DesktopBridge {
  openFile(opts: { title: string; filters: { name: string; extensions: string[] }[]; multi?: boolean }): Promise<string[] | null>;
  saveFile(opts: { title: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null>;
  openPath(p: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  relaunch(): void;
  quit(): void;
  appInfo(): { version: string; userData: string; platform: string; electron: string };
  checkForUpdates(): Promise<{ available: boolean; version?: string; message: string }>;
  setLoginItem(open: boolean): void;
}

export interface Session {
  user: SessionUser | null;
  accountId: number | null;
  fileTokens: Map<string, string>;
}

type Handler = {
  perm: Permission | 'public' | 'auth';
  account?: boolean;
  schema?: z.ZodTypeAny;
  fn: (input: any, s: Required<Pick<Session, 'fileTokens'>> & { user: SessionUser; accountId: number }) => unknown | Promise<unknown>;
};

const id = z.number().int().positive();
const str = (max = 500) => z.string().max(max);
const optStr = (max = 500) => z.string().max(max).nullable().optional();
const ids = z.array(id).max(100000);

const contactFilter = z
  .object({
    search: optStr(200),
    tagIds: z.array(id).optional(),
    tagMode: z.enum(['any', 'all']).optional(),
    excludeTagIds: z.array(id).optional(),
    segmentId: id.optional(),
    consent: z.enum(['unknown', 'opted_in', 'opted_out']).optional(),
    blacklisted: z.boolean().optional(),
    assignedTo: id.nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
    sort: z.enum(['name', 'created_at', 'last_message_at']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .partial();

const contactInput = z.object({
  name: optStr(120),
  first_name: optStr(120),
  last_name: optStr(120),
  phone: str(40),
  email: optStr(200),
  company: optStr(120),
  assigned_to: id.nullable().optional(),
  consent_status: z.enum(['unknown', 'opted_in', 'opted_out']).optional(),
  consent_source: optStr(120),
  custom: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.null()])).optional(),
  tagIds: z.array(id).optional(),
});

const segmentDef = z.object({
  match: z.enum(['all', 'any']),
  rules: z
    .array(z.object({ field: z.string().max(40), op: z.string().max(30), value: z.union([z.string().max(500), z.number(), z.null()]).optional(), fieldKey: z.string().max(60).optional() }))
    .max(30),
});

const audience = z.object({
  type: z.enum(['all', 'tag', 'segment', 'import', 'manual']),
  tagIds: z.array(id).optional(),
  tagMode: z.enum(['any', 'all']).optional(),
  segmentId: id.optional(),
  importBatchId: z.string().max(80).optional(),
  contactIds: z.array(id).max(100000).optional(),
});

const recurrence = z
  .object({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(12),
    byWeekday: z.array(z.number().int().min(1).max(7)).optional(),
    byMonthDay: z.number().int().min(1).max(31).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    until: z.string().max(40).nullable().optional(),
    maxRuns: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .nullable()
  .optional();

const campaignInput = z.object({
  id: id.optional(),
  name: str(120),
  audience,
  message_type: z.enum(['text', 'template']),
  body: optStr(4096),
  media_id: id.nullable().optional(),
  provider_template_id: id.nullable().optional(),
  template_params: z.array(z.string().max(1000)).max(20).nullable().optional(),
  timezone: z.string().max(60).optional(),
  scheduled_at: z.string().max(40).nullable().optional(),
  recurrence,
});

const autoNode = z.object({
  id: z.string().max(60),
  type: z.enum(['trigger', 'condition', 'action']),
  subtype: z.string().max(40),
  config: z.record(z.string(), z.any()),
  position: z.object({ x: z.number(), y: z.number() }),
});
const autoEdge = z.object({ id: z.string().max(140), source: z.string().max(60), target: z.string().max(60), sourceHandle: z.enum(['true', 'false', 'next']).nullable().optional() });

export function buildRouter(app: App, desktop: DesktopBridge) {
  const H: Record<string, Handler> = {};
  const on = (name: string, h: Handler) => {
    H[name] = h;
  };
  const tokenFor = (s: { fileTokens: Map<string, string> }, p: string) => {
    const t = randomId(8);
    s.fileTokens.set(t, p);
    return t;
  };
  const fromToken = (s: { fileTokens: Map<string, string> }, t: string) => {
    const p = s.fileTokens.get(t);
    if (!p) throw new AppError('FILE', 'El archivo seleccionado ya no está disponible. Selecciónelo de nuevo.');
    return p;
  };

  // ------------------------- Autenticación -------------------------
  on('auth.status', { perm: 'public', fn: () => null }); // resuelto en dispatch
  on('auth.setup', {
    perm: 'public',
    schema: z.object({ username: str(32), display_name: str(80), password: str(200) }),
    fn: () => null, // resuelto en dispatch
  });
  on('auth.login', { perm: 'public', schema: z.object({ username: str(32), password: str(200) }), fn: () => null });
  on('auth.logout', { perm: 'auth', fn: () => null });
  on('auth.changePassword', { perm: 'auth', schema: z.object({ current: str(200), next: str(200) }), fn: (i, s) => app.users.changeOwnPassword(s.user.id, i.current, i.next) });
  on('session.setAccount', { perm: 'auth', schema: z.object({ accountId: id }), fn: () => null });

  // ------------------------- Cuentas WhatsApp -------------------------
  on('accounts.list', { perm: 'auth', fn: () => app.accounts.list() });
  on('accounts.current', { perm: 'auth', account: true, fn: (_i, s) => ({ ...app.accounts.get(s.accountId), capabilities: app.accounts.capabilities(s.accountId) }) });
  on('accounts.create', {
    perm: 'accounts.manage',
    schema: z.object({ name: str(80), provider: z.enum(['cloud_api', 'simulator', 'baileys']), config: z.record(z.string(), z.string().max(2000)).optional(), riskAccepted: z.boolean().optional() }),
    fn: async (i, s) => {
      if (i.provider === 'baileys' && i.riskAccepted !== true) throw new AppError('VALIDATION', 'Debe aceptar el riesgo de usar un conector no oficial para continuar.');
      const a = app.accounts.create(i);
      app.history.audit('account.create', { userId: s.user.id, entityType: 'account', entityId: a.id, details: { name: i.name, provider: i.provider, riskAccepted: i.provider === 'baileys' ? true : undefined } });
      if (i.provider === 'cloud_api' && !app.webhooks.listening) {
        const wh = app.settings.get('webhook');
        await app.webhooks.start(wh.port, wh.host).catch(() => {});
      }
      return a;
    },
  });
  on('accounts.update', {
    perm: 'accounts.manage',
    schema: z.object({ accountId: id, name: str(80).optional(), auto_connect: z.boolean().optional(), config: z.record(z.string(), z.string().max(2000)).optional() }),
    fn: (i, s) => {
      const r = app.accounts.updateConfig(i.accountId, i);
      app.history.audit('account.update', { userId: s.user.id, entityType: 'account', entityId: i.accountId, details: { credentialsChanged: !!i.config } });
      return r;
    },
  });
  on('accounts.remove', { perm: 'accounts.manage', schema: z.object({ accountId: id }), fn: (i) => app.accounts.remove(i.accountId) });
  on('accounts.publicConfig', { perm: 'accounts.manage', schema: z.object({ accountId: id }), fn: (i) => app.accounts.publicConfig(i.accountId) });
  on('accounts.connect', { perm: 'auth', schema: z.object({ accountId: id }), fn: (i) => app.accounts.connect(i.accountId) });
  on('accounts.logout', {
    perm: 'accounts.manage',
    schema: z.object({ accountId: id }),
    fn: async (i, s) => {
      const r = await app.accounts.logout(i.accountId);
      app.history.audit('account.logout', { userId: s.user.id, entityType: 'account', entityId: i.accountId });
      return r;
    },
  });
  on('accounts.disconnect', { perm: 'accounts.manage', schema: z.object({ accountId: id }), fn: (i) => app.accounts.disconnect(i.accountId) });
  on('accounts.syncTemplates', { perm: 'templates.manage', account: true, fn: async (_i, s) => ({ count: await app.accounts.syncTemplates(s.accountId) }) });
  on('accounts.webhookStatus', {
    perm: 'accounts.manage',
    fn: () => ({ listening: app.webhooks.listening, address: app.webhooks.address(), lastEventAt: app.webhooks.lastEventAt, lastError: app.webhooks.lastError, settings: app.settings.get('webhook') }),
  });
  on('accounts.restartWebhook', {
    perm: 'accounts.manage',
    schema: z.object({ port: z.number().int().min(1024).max(65535), host: z.enum(['127.0.0.1', '0.0.0.0']) }),
    fn: async (i) => {
      app.settings.set('webhook', i);
      await app.webhooks.start(i.port, i.host);
      return app.webhooks.address();
    },
  });
  on('simulator.inbound', {
    perm: 'accounts.manage',
    account: true,
    schema: z.object({ phone: str(40), text: str(4096), name: optStr(80) }),
    fn: (i, s) => {
      const ph = app.contacts.normalize(s.accountId, i.phone);
      if (!ph.ok) throw new AppError('VALIDATION', `Teléfono inválido: ${ph.reason}`);
      return app.accounts.simulator(s.accountId).simulateInbound(ph.e164!, i.text, i.name ?? null);
    },
  });
  on('simulator.connectionLoss', { perm: 'accounts.manage', account: true, fn: (_i, s) => app.accounts.simulator(s.accountId).simulateConnectionLoss() });

  // ------------------------- Contactos -------------------------
  on('contacts.list', { perm: 'contacts.view', account: true, schema: contactFilter, fn: (i, s) => app.contacts.list(s.accountId, i) });
  on('contacts.ids', { perm: 'contacts.view', account: true, schema: contactFilter, fn: (i, s) => app.contacts.ids(s.accountId, i) });
  on('contacts.get', { perm: 'contacts.view', account: true, schema: z.object({ id }), fn: (i, s) => app.contacts.get(s.accountId, i.id) });
  on('contacts.detail', {
    perm: 'contacts.view',
    account: true,
    schema: z.object({ id }),
    fn: (i, s) => ({
      contact: app.contacts.get(s.accountId, i.id),
      activity: app.contacts.activity(s.accountId, i.id),
      notes: app.contacts.notes(s.accountId, i.id),
      timeline: app.history.contactTimeline(i.id, 100),
      tasks: app.tasks.list(s.accountId, { contactId: i.id }),
      conversationId: app.conversations.ensureConversation(s.accountId, i.id),
    }),
  });
  on('contacts.create', { perm: 'contacts.edit', account: true, schema: contactInput, fn: (i, s) => app.contacts.create(s.accountId, i, s.user.id) });
  on('contacts.update', { perm: 'contacts.edit', account: true, schema: z.object({ id, patch: contactInput.partial() }), fn: (i, s) => app.contacts.update(s.accountId, i.id, i.patch, s.user.id) });
  on('contacts.delete', { perm: 'contacts.delete', account: true, schema: z.object({ ids }), fn: (i, s) => app.contacts.delete(s.accountId, i.ids, s.user.id) });
  on('contacts.archive', { perm: 'contacts.edit', account: true, schema: z.object({ ids, archived: z.boolean() }), fn: (i, s) => app.contacts.archive(s.accountId, i.ids, i.archived, s.user.id) });
  on('contacts.assign', { perm: 'contacts.edit', account: true, schema: z.object({ ids, userId: id.nullable() }), fn: (i, s) => app.contacts.assign(s.accountId, i.ids, i.userId, s.user.id) });
  on('contacts.setConsent', {
    perm: 'contacts.edit',
    account: true,
    schema: z.object({ ids, status: z.enum(['unknown', 'opted_in', 'opted_out']), source: str(120) }),
    fn: (i, s) => {
      for (const cid of i.ids) app.contacts.setConsent(s.accountId, cid, i.status, i.source, s.user.id);
      return i.ids.length;
    },
  });
  on('contacts.setBlacklist', { perm: 'contacts.edit', account: true, schema: z.object({ ids, blacklisted: z.boolean(), reason: optStr(200) }), fn: (i, s) => app.contacts.setBlacklist(s.accountId, i.ids, i.blacklisted, i.reason ?? null, s.user.id) });
  on('contacts.addNote', { perm: 'contacts.edit', account: true, schema: z.object({ contactId: id, body: str(5000) }), fn: (i, s) => app.contacts.addNote(s.accountId, i.contactId, i.body, s.user.id) });
  on('contacts.deleteNote', { perm: 'contacts.edit', account: true, schema: z.object({ id }), fn: (i, s) => app.contacts.deleteNote(s.accountId, i.id, s.user.id) });

  // ------------------------- Etiquetas / campos / segmentos -------------------------
  on('tags.list', { perm: 'contacts.view', account: true, fn: (_i, s) => app.tags.list(s.accountId) });
  on('tags.create', { perm: 'tags.manage', account: true, schema: z.object({ name: str(40), color: optStr(7), emoji: optStr(8) }), fn: (i, s) => app.tags.create(s.accountId, { ...i, color: i.color ?? undefined }, s.user.id) });
  on('tags.update', { perm: 'tags.manage', account: true, schema: z.object({ id, name: str(40).optional(), color: str(7).optional(), emoji: optStr(8) }), fn: (i, s) => app.tags.update(s.accountId, i.id, i, s.user.id) });
  on('tags.delete', { perm: 'tags.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.tags.delete(s.accountId, i.id, s.user.id) });
  on('tags.assign', { perm: 'contacts.edit', account: true, schema: z.object({ contactIds: ids, tagId: id }), fn: (i, s) => app.tags.assign(s.accountId, i.contactIds, i.tagId, { actorId: s.user.id }) });
  on('tags.unassign', { perm: 'contacts.edit', account: true, schema: z.object({ contactIds: ids, tagId: id }), fn: (i, s) => app.tags.unassign(s.accountId, i.contactIds, i.tagId, { actorId: s.user.id }) });
  on('fields.list', { perm: 'contacts.view', account: true, fn: (_i, s) => app.fields.list(s.accountId) });
  on('fields.create', {
    perm: 'settings.manage',
    account: true,
    schema: z.object({ label: str(60), key: optStr(40), type: z.enum(['text', 'number', 'date', 'select']).optional(), options: z.array(str(80)).max(50).nullable().optional() }),
    fn: (i, s) => app.fields.create(s.accountId, { ...i, key: i.key ?? undefined }),
  });
  on('fields.update', { perm: 'settings.manage', account: true, schema: z.object({ id, label: str(60).optional(), options: z.array(str(80)).max(50).nullable().optional() }), fn: (i, s) => app.fields.update(s.accountId, i.id, i) });
  on('fields.delete', { perm: 'settings.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.fields.delete(s.accountId, i.id) });
  on('segments.list', { perm: 'contacts.view', account: true, fn: (_i, s) => app.segments.list(s.accountId) });
  on('segments.save', { perm: 'tags.manage', account: true, schema: z.object({ id: id.optional(), name: str(80), description: optStr(300), definition: segmentDef }), fn: (i, s) => app.segments.save(s.accountId, i, s.user.id) });
  on('segments.delete', { perm: 'tags.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.segments.delete(s.accountId, i.id) });
  on('segments.count', { perm: 'contacts.view', account: true, schema: z.object({ definition: segmentDef }), fn: (i, s) => app.segments.count(s.accountId, i.definition as any) });

  // ------------------------- Bandeja de entrada -------------------------
  on('inbox.list', {
    perm: 'inbox.view',
    account: true,
    schema: z.object({ search: optStr(200), filter: z.enum(['all', 'unread', 'tagged', 'assigned_me', 'unassigned', 'unanswered', 'recent']).optional(), tagId: id.optional(), limit: z.number().int().max(200).optional(), offset: z.number().int().min(0).optional() }),
    fn: (i, s) => app.conversations.list(s.accountId, { ...i, search: i.search ?? undefined, userId: s.user.id }),
  });
  on('inbox.get', { perm: 'inbox.view', account: true, schema: z.object({ id }), fn: (i, s) => app.conversations.get(s.accountId, i.id) });
  on('inbox.messages', { perm: 'inbox.view', account: true, schema: z.object({ conversationId: id, beforeId: id.optional(), limit: z.number().int().max(300).optional() }), fn: (i, s) => app.conversations.messages(s.accountId, i.conversationId, i) });
  on('inbox.markRead', { perm: 'inbox.view', account: true, schema: z.object({ conversationId: id }), fn: (i, s) => app.conversations.markRead(s.accountId, i.conversationId) });
  on('inbox.setStatus', { perm: 'messages.send', account: true, schema: z.object({ conversationId: id, status: z.enum(['open', 'closed']) }), fn: (i, s) => app.conversations.setStatus(s.accountId, i.conversationId, i.status) });
  on('inbox.setBotPause', {
    perm: 'messages.send',
    account: true,
    schema: z.object({ conversationId: id, minutes: z.number().int().min(0).max(43200) }),
    fn: (i, s) => app.conversations.setBotPause(s.accountId, i.conversationId, i.minutes ? new Date(app.ctx.clock.now().getTime() + i.minutes * 60000) : null),
  });
  on('inbox.send', {
    perm: 'messages.send',
    account: true,
    schema: z.object({ contactId: id, text: optStr(4096), mediaId: id.nullable().optional(), template: z.object({ providerTemplateId: id, params: z.array(str(1000)).max(20) }).nullable().optional(), clientKey: z.string().max(64).optional(), replyToProviderId: optStr(200) }),
    fn: (i, s) => {
      if (!app.accounts.isConnected(s.accountId)) throw new AppError('DISCONNECTED', 'WhatsApp está desconectado. El mensaje no se envió.');
      return app.messaging.sendManual(s.accountId, i, s.user.id, app.accounts.windowHours(s.accountId));
    },
  });
  on('inbox.retry', { perm: 'messages.send', account: true, schema: z.object({ messageId: id }), fn: (i, s) => app.worker.retry(s.accountId, i.messageId) });
  on('inbox.render', {
    perm: 'inbox.view',
    account: true,
    schema: z.object({ contactId: id, text: str(4096) }),
    fn: (i, s) => app.messaging.renderFor(s.accountId, app.contacts.get(s.accountId, i.contactId), i.text),
  });
  on('inbox.windowOpen', {
    perm: 'inbox.view',
    account: true,
    schema: z.object({ contactId: id }),
    fn: (i, s) => ({ open: app.messaging.windowOpen(app.contacts.get(s.accountId, i.contactId), app.accounts.windowHours(s.accountId)), windowHours: app.accounts.windowHours(s.accountId) }),
  });

  // ------------------------- Mensajes programados -------------------------
  on('scheduled.list', { perm: 'inbox.view', account: true, schema: z.object({ from: optStr(40), to: optStr(40) }), fn: (i, s) => app.messaging.listScheduled(s.accountId, i.from ?? undefined, i.to ?? undefined) });
  on('scheduled.create', { perm: 'messages.send', account: true, schema: z.object({ contactId: id, body: optStr(4096), mediaId: id.nullable().optional(), scheduledAt: str(40), timezone: optStr(60) }), fn: (i, s) => app.messaging.schedule(s.accountId, { ...i, timezone: i.timezone ?? undefined }, s.user.id) });
  on('scheduled.cancel', { perm: 'messages.send', account: true, schema: z.object({ id }), fn: (i, s) => app.messaging.cancelScheduled(s.accountId, i.id) });
  on('scheduled.reschedule', { perm: 'messages.send', account: true, schema: z.object({ id, scheduledAt: str(40) }), fn: (i, s) => app.messaging.reschedule(s.accountId, i.id, i.scheduledAt) });

  // ------------------------- Multimedia -------------------------
  on('media.list', { perm: 'inbox.view', account: true, schema: z.object({ kind: z.enum(['image', 'video', 'audio', 'document']).optional() }), fn: (i, s) => app.media.list(s.accountId, i.kind) });
  on('media.pick', {
    perm: 'templates.manage',
    account: true,
    fn: async (_i, s) => {
      const files = await desktop.openFile({ title: 'Agregar a la biblioteca', multi: true, filters: [{ name: 'Multimedia y documentos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', '3gp', 'mp3', 'ogg', 'aac', 'm4a', 'amr', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'] }] });
      const out = { imported: [] as any[], errors: [] as string[] };
      for (const f of files ?? []) {
        try {
          out.imported.push(app.media.importFile(s.accountId, f, { inLibrary: true }));
        } catch (e: any) {
          out.errors.push(`${f.split(/[\\/]/).pop()}: ${e?.userMessage ?? 'no se pudo importar'}`);
        }
      }
      return out;
    },
  });
  on('media.upload', {
    perm: 'messages.send',
    account: true,
    schema: z.object({ fileName: str(200), mimeType: optStr(120), data: z.instanceof(Uint8Array), inLibrary: z.boolean().optional() }),
    fn: (i, s) => app.media.importBuffer(s.accountId, Buffer.from(i.data), { fileName: i.fileName, mimeType: i.mimeType || undefined, inLibrary: !!i.inLibrary }),
  });
  on('media.rename', { perm: 'templates.manage', account: true, schema: z.object({ id, title: str(120) }), fn: (i, s) => app.media.rename(s.accountId, i.id, i.title) });
  on('media.delete', { perm: 'templates.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.media.delete(s.accountId, i.id) });
  on('media.limits', { perm: 'auth', account: true, fn: (_i, s) => app.accounts.capabilities(s.accountId).mediaLimits });

  // ------------------------- Plantillas / respuestas rápidas -------------------------
  on('templates.list', { perm: 'inbox.view', account: true, fn: (_i, s) => ({ templates: app.templates.list(s.accountId), categories: TEMPLATE_CATEGORIES, variables: BUILTIN_VARIABLES, fields: app.fields.list(s.accountId) }) });
  on('templates.save', { perm: 'templates.manage', account: true, schema: z.object({ id: id.optional(), name: str(80), category: str(40), body: str(4096), media_id: id.nullable().optional() }), fn: (i, s) => app.templates.save(s.accountId, i) });
  on('templates.delete', { perm: 'templates.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.templates.delete(s.accountId, i.id) });
  on('templates.provider', { perm: 'inbox.view', account: true, schema: z.object({ onlyApproved: z.boolean().optional() }), fn: (i, s) => app.templates.providerTemplates(s.accountId, !!i.onlyApproved) });
  on('quickReplies.list', { perm: 'inbox.view', account: true, fn: (_i, s) => app.templates.quickReplies(s.accountId) });
  on('quickReplies.save', { perm: 'templates.manage', account: true, schema: z.object({ id: id.optional(), shortcut: str(31), body: str(4096), media_id: id.nullable().optional() }), fn: (i, s) => app.templates.saveQuickReply(s.accountId, i) });
  on('quickReplies.delete', { perm: 'templates.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.templates.deleteQuickReply(s.accountId, i.id) });

  // ------------------------- Campañas -------------------------
  on('campaigns.list', { perm: 'campaigns.view', account: true, schema: z.object({ status: z.string().max(20).optional() }), fn: (i, s) => app.campaigns.list(s.accountId, i.status) });
  on('campaigns.get', {
    perm: 'campaigns.view',
    account: true,
    schema: z.object({ id }),
    fn: (i, s) => {
      const c = app.campaigns.get(s.accountId, i.id);
      return { ...c, recurrence_text: c.recurrence ? describeRecurrence(c.recurrence) : null };
    },
  });
  on('campaigns.save', { perm: 'campaigns.manage', account: true, schema: campaignInput, fn: (i, s) => app.campaigns.saveDraft(s.accountId, i, s.user.id) });
  on('campaigns.preview', { perm: 'campaigns.view', account: true, schema: z.object({ id, sampleContactId: id.optional() }), fn: (i, s) => app.campaigns.preview(s.accountId, i.id, i.sampleContactId) });
  on('campaigns.previewDraft', {
    perm: 'campaigns.view',
    account: true,
    schema: campaignInput.extend({ sampleContactId: id.optional() }),
    fn: (i, s) => app.campaigns.previewFor(s.accountId, { ...i, timezone: i.timezone || app.settings.get('general').timezone, body: i.body ?? null, provider_template_id: i.provider_template_id ?? null, template_params: i.template_params ?? null }, i.sampleContactId),
  });
  on('campaigns.confirm', { perm: 'campaigns.manage', account: true, schema: z.object({ id, expectedCount: z.number().int().min(0) }), fn: (i, s) => app.campaigns.confirm(s.accountId, i.id, i.expectedCount, s.user.id) });
  on('campaigns.pause', { perm: 'campaigns.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.pause(s.accountId, i.id, 'user', s.user.id) });
  on('campaigns.resume', { perm: 'campaigns.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.resume(s.accountId, i.id, s.user.id) });
  on('campaigns.cancel', { perm: 'campaigns.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.cancel(s.accountId, i.id, s.user.id) });
  on('campaigns.duplicate', { perm: 'campaigns.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.duplicate(s.accountId, i.id, s.user.id) });
  on('campaigns.delete', { perm: 'campaigns.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.delete(s.accountId, i.id, s.user.id) });
  on('campaigns.recipients', { perm: 'campaigns.view', account: true, schema: z.object({ id, status: z.string().max(20).optional(), limit: z.number().int().max(500).optional(), offset: z.number().int().min(0).optional() }), fn: (i, s) => app.campaigns.recipients(s.accountId, i.id, i) });
  on('campaigns.runs', { perm: 'campaigns.view', account: true, schema: z.object({ id }), fn: (i, s) => app.campaigns.runs(s.accountId, i.id) });
  on('campaigns.reschedule', { perm: 'campaigns.manage', account: true, schema: z.object({ id, scheduledAt: str(40) }), fn: (i, s) => app.campaigns.reschedule(s.accountId, i.id, i.scheduledAt, s.user.id) });
  on('campaigns.pausedByDisconnect', { perm: 'campaigns.view', account: true, fn: (_i, s) => app.campaigns.pausedByDisconnect(s.accountId) });
  on('campaigns.importBatches', { perm: 'campaigns.view', account: true, fn: (_i, s) => app.importExport.importBatches(s.accountId) });
  on('queue.stats', { perm: 'campaigns.view', account: true, fn: (_i, s) => app.worker.stats(s.accountId) });

  // ------------------------- Calendario -------------------------
  on('calendar.events', { perm: 'campaigns.view', account: true, schema: z.object({ from: str(40), to: str(40) }), fn: (i, s) => app.stats.calendar(s.accountId, i.from, i.to) });
  on('calendar.move', {
    perm: 'auth',
    account: true,
    schema: z.object({ kind: z.enum(['campaign', 'scheduled_message', 'task']), refId: id, start: str(40) }),
    fn: (i, s) => {
      const need: Permission = i.kind === 'campaign' ? 'campaigns.manage' : i.kind === 'task' ? 'tasks.manage' : 'messages.send';
      if (!s.user.permissions.includes(need)) throw forbidden();
      if (i.kind === 'campaign') return app.campaigns.reschedule(s.accountId, i.refId, i.start, s.user.id);
      if (i.kind === 'task') return app.tasks.update(s.accountId, i.refId, { due_at: i.start }, s.user.id);
      return app.messaging.reschedule(s.accountId, i.refId, i.start);
    },
  });

  // ------------------------- Automatizaciones -------------------------
  on('automations.catalog', { perm: 'automations.view', fn: () => ({ triggers: TRIGGERS, conditions: CONDITIONS, actions: ACTIONS }) });
  on('automations.list', { perm: 'automations.view', account: true, fn: (_i, s) => app.automation.list(s.accountId) });
  on('automations.get', { perm: 'automations.view', account: true, schema: z.object({ id }), fn: (i, s) => app.automation.get(s.accountId, i.id) });
  on('automations.save', {
    perm: 'automations.manage',
    account: true,
    schema: z.object({ id: id.optional(), name: str(120), description: optStr(500), enabled: z.boolean().optional(), nodes: z.array(autoNode).max(100), edges: z.array(autoEdge).max(200) }),
    fn: (i, s) => {
      const r = app.automation.save(s.accountId, i);
      app.history.audit('automation.save', { accountId: s.accountId, userId: s.user.id, entityType: 'automation', entityId: r.id });
      return r;
    },
  });
  on('automations.delete', { perm: 'automations.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.automation.delete(s.accountId, i.id) });
  on('automations.duplicate', { perm: 'automations.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.automation.duplicate(s.accountId, i.id) });
  on('automations.setEnabled', { perm: 'automations.manage', account: true, schema: z.object({ id, enabled: z.boolean() }), fn: (i, s) => (i.enabled ? app.automation.resume(s.accountId, i.id) : app.automation.pause(s.accountId, i.id)) });
  on('automations.runs', { perm: 'automations.view', account: true, schema: z.object({ id }), fn: (i, s) => app.automation.runs(s.accountId, i.id) });
  on('automations.runLogs', { perm: 'automations.view', account: true, schema: z.object({ runId: id }), fn: (i, s) => app.automation.runLogs(s.accountId, i.runId) });
  on('automations.cancelRun', { perm: 'automations.manage', account: true, schema: z.object({ runId: id }), fn: (i, s) => app.automation.cancel(s.accountId, i.runId) });

  // ------------------------- IA y base de conocimiento -------------------------
  on('ai.status', { perm: 'automations.view', fn: () => ({ configured: !!app.ai.apiKey(), model: app.settings.get('ai').model }) });
  on('ai.setApiKey', { perm: 'settings.manage', schema: z.object({ apiKey: z.string().max(300).nullable() }), fn: (i) => app.ai.setApiKey(i.apiKey) });
  on('ai.list', { perm: 'automations.view', account: true, fn: (_i, s) => app.ai.list(s.accountId) });
  on('ai.save', {
    perm: 'automations.manage',
    account: true,
    schema: z.object({
      id: id.optional(),
      name: str(80),
      instructions: str(20000),
      enabled: z.boolean(),
      model: optStr(80),
      only_business_hours: z.boolean().optional(),
      allowed_tag_ids: z.array(id).optional(),
      excluded_tag_ids: z.array(id).optional(),
      scope: z.enum(['all', 'unassigned', 'tagged']).optional(),
      knowledge_base_ids: z.array(id).optional(),
      max_replies_per_hour: z.number().int().min(1).max(60).optional(),
      handoff_tag_id: id.nullable().optional(),
    }),
    fn: (i, s) => app.ai.save(s.accountId, i as any),
  });
  on('ai.delete', { perm: 'automations.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.ai.delete(s.accountId, i.id) });
  on('ai.test', { perm: 'automations.manage', account: true, schema: z.object({ id, message: str(2000) }), fn: (i, s) => app.ai.test(s.accountId, i.id, i.message) });
  on('kb.list', { perm: 'automations.view', account: true, fn: (_i, s) => app.knowledge.bases(s.accountId) });
  on('kb.save', { perm: 'automations.manage', account: true, schema: z.object({ id: id.optional(), name: str(80), description: optStr(500) }), fn: (i, s) => app.knowledge.saveBase(s.accountId, i) });
  on('kb.delete', { perm: 'automations.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.knowledge.deleteBase(s.accountId, i.id) });
  on('kb.documents', { perm: 'automations.view', account: true, schema: z.object({ kbId: id }), fn: (i, s) => app.knowledge.documents(s.accountId, i.kbId) });
  on('kb.document', { perm: 'automations.view', account: true, schema: z.object({ id }), fn: (i, s) => app.knowledge.document(s.accountId, i.id) });
  on('kb.addText', { perm: 'automations.manage', account: true, schema: z.object({ kbId: id, title: str(120), content: str(2_000_000) }), fn: (i, s) => app.knowledge.addText(s.accountId, i.kbId, { title: i.title, content: i.content, sourceType: 'text' }) });
  on('kb.addFaq', { perm: 'automations.manage', account: true, schema: z.object({ kbId: id, title: str(120), items: z.array(z.object({ q: str(1000), a: str(5000) })).max(500) }), fn: (i, s) => app.knowledge.addFaq(s.accountId, i.kbId, i.title, i.items) });
  on('kb.addFiles', {
    perm: 'automations.manage',
    account: true,
    schema: z.object({ kbId: id }),
    fn: async (i, s) => {
      const files = await desktop.openFile({ title: 'Cargar documentos', multi: true, filters: [{ name: 'Documentos', extensions: ['pdf', 'docx', 'txt', 'md'] }] });
      const out = { added: 0, errors: [] as string[] };
      for (const f of files ?? []) {
        try {
          await app.knowledge.addFile(s.accountId, i.kbId, f);
          out.added++;
        } catch (e: any) {
          out.errors.push(`${f.split(/[\\/]/).pop()}: ${e?.userMessage ?? 'no se pudo leer el archivo'}`);
        }
      }
      return out;
    },
  });
  on('kb.deleteDocument', { perm: 'automations.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.knowledge.deleteDocument(s.accountId, i.id) });
  on('kb.search', { perm: 'automations.view', account: true, schema: z.object({ kbIds: z.array(id), query: str(500) }), fn: (i) => app.knowledge.search(i.kbIds, i.query, 6) });

  // ------------------------- Tareas y pipeline -------------------------
  on('tasks.list', { perm: 'tasks.manage', account: true, schema: z.object({ status: z.string().max(20).optional(), contactId: id.optional(), assignedTo: id.optional(), overdue: z.boolean().optional() }), fn: (i, s) => app.tasks.list(s.accountId, i) });
  on('tasks.create', { perm: 'tasks.manage', account: true, schema: z.object({ title: str(200), description: optStr(2000), contact_id: id.nullable().optional(), due_at: optStr(40), assigned_to: id.nullable().optional() }), fn: (i, s) => app.tasks.create(s.accountId, i, s.user.id) });
  on('tasks.update', { perm: 'tasks.manage', account: true, schema: z.object({ id, title: str(200).optional(), description: optStr(2000), due_at: optStr(40), assigned_to: id.nullable().optional(), status: z.enum(['pending', 'done', 'cancelled']).optional() }), fn: (i, s) => app.tasks.update(s.accountId, i.id, i, s.user.id) });
  on('tasks.delete', { perm: 'tasks.manage', account: true, schema: z.object({ id }), fn: (i, s) => app.tasks.delete(s.accountId, i.id) });
  on('pipeline.list', { perm: 'contacts.view', account: true, fn: (_i, s) => app.tasks.pipelines(s.accountId) });
  on('pipeline.board', { perm: 'contacts.view', account: true, schema: z.object({ pipelineId: id, search: optStr(100) }), fn: (i, s) => app.tasks.board(s.accountId, i.pipelineId, i.search ?? undefined) });
  on('pipeline.setStage', { perm: 'tasks.manage', account: true, schema: z.object({ contactIds: ids, stageId: id, position: z.number().int().min(0).optional() }), fn: (i, s) => i.contactIds.forEach((c: number) => app.tasks.setStage(s.accountId, c, i.stageId, i.position ?? 0, s.user.id)) });
  on('pipeline.remove', { perm: 'tasks.manage', account: true, schema: z.object({ contactId: id, pipelineId: id }), fn: (i, s) => app.tasks.removeFromPipeline(s.accountId, i.contactId, i.pipelineId) });
  on('pipeline.saveStages', { perm: 'settings.manage', account: true, schema: z.object({ pipelineId: id, stages: z.array(z.object({ id: id.optional(), name: str(40), color: str(7) })).min(1).max(20) }), fn: (i, s) => app.tasks.saveStages(s.accountId, i.pipelineId, i.stages) });

  // ------------------------- Estadísticas -------------------------
  on('stats.dashboard', {
    perm: 'auth',
    account: true,
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    fn: (i, s) => ({ ...app.stats.dashboard(s.accountId, i.days ?? 30), account: app.accounts.get(s.accountId), queue: app.worker.stats(s.accountId) }),
  });
  on('stats.full', {
    perm: 'stats.view',
    account: true,
    schema: z.object({ days: z.number().int().min(1).max(365).optional() }),
    fn: (i, s) => ({
      summary: app.stats.dashboard(s.accountId, i.days ?? 30),
      series: app.stats.series(s.accountId, i.days ?? 30),
      tags: app.stats.tagDistribution(s.accountId),
      campaigns: app.stats.campaignTable(s.accountId),
      automations: app.stats.automationTable(s.accountId),
    }),
  });

  // ------------------------- Importación / exportación -------------------------
  on('import.pick', {
    perm: 'contacts.import',
    account: true,
    fn: async (_i, s) => {
      const f = await desktop.openFile({ title: 'Importar contactos (CSV)', filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
      if (!f?.[0]) return null;
      return { token: tokenFor(s, f[0]), fileName: f[0].split(/[\\/]/).pop() };
    },
  });
  on('import.analyze', { perm: 'contacts.import', account: true, schema: z.object({ token: str(40), mapping: z.record(z.string(), z.string()).optional() }), fn: (i, s) => app.importExport.analyze(s.accountId, fromToken(s, i.token), i.mapping as any) });
  on('import.execute', {
    perm: 'contacts.import',
    account: true,
    schema: z.object({ token: str(40), mapping: z.record(z.string(), z.string()), updateExisting: z.boolean(), tagIds: z.array(id).optional(), consent: z.enum(['unknown', 'opted_in']).optional(), consentSource: optStr(120), runAutomations: z.boolean().optional() }),
    fn: (i, s) => app.importExport.execute(s.accountId, fromToken(s, i.token), { ...i, consentSource: i.consentSource ?? undefined } as any, s.user.id),
  });
  on('import.template', {
    perm: 'contacts.import',
    fn: async () => {
      const p = await desktop.saveFile({ title: 'Guardar plantilla CSV', defaultPath: 'plantilla-contactos.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (!p) return null;
      fs.writeFileSync(p, '﻿nombre,apellido,telefono,email,empresa,etiqueta\nJuan,Pérez,+57 300 123 4567,juan@ejemplo.com,ACME,Cliente;VIP\n', 'utf8');
      return p;
    },
  });
  on('export.contacts', {
    perm: 'contacts.export',
    account: true,
    schema: z.object({ filter: contactFilter, format: z.enum(['csv', 'xlsx']) }),
    fn: async (i, s) => {
      const p = await desktop.saveFile({ title: 'Exportar contactos', defaultPath: `contactos-${new Date().toISOString().slice(0, 10)}.${i.format}`, filters: [{ name: i.format.toUpperCase(), extensions: [i.format] }] });
      if (!p) return null;
      const { limit, offset, ...filter } = i.filter;
      void limit;
      void offset;
      return app.importExport.exportContacts(s.accountId, filter, i.format, p, s.user.id);
    },
  });

  // ------------------------- Configuración, usuarios, backups -------------------------
  on('settings.get', {
    perm: 'auth',
    account: true,
    schema: z.object({ key: z.enum(Object.keys(SETTINGS_SCHEMAS) as [string, ...string[]]) }),
    fn: (i, s) => {
      const v: any = app.settings.get(i.key as any, s.accountId);
      if (i.key === 'ai') return { ...v, apiKeyEncrypted: undefined, configured: !!app.ai.apiKey() };
      return v;
    },
  });
  on('settings.set', {
    perm: 'settings.manage',
    account: true,
    schema: z.object({ key: z.enum(Object.keys(SETTINGS_SCHEMAS) as [string, ...string[]]), value: z.record(z.string(), z.any()) }),
    fn: (i, s) => {
      const parsed = (SETTINGS_SCHEMAS as any)[i.key].parse(i.value);
      const r = app.settings.set(i.key as any, parsed, s.accountId);
      if (i.key === 'general' && parsed.launchAtLogin !== undefined) desktop.setLoginItem(!!parsed.launchAtLogin);
      app.history.audit('settings.update', { accountId: s.accountId, userId: s.user.id, entityType: 'settings', entityId: i.key });
      return i.key === 'ai' ? { ...r, apiKeyEncrypted: undefined } : r;
    },
  });
  on('users.list', { perm: 'users.manage', fn: () => app.users.list() });
  on('users.basic', { perm: 'auth', fn: () => app.users.list().filter((u: any) => u.active).map((u: any) => ({ id: u.id, display_name: u.display_name, role: u.role })) });
  on('users.create', {
    perm: 'users.manage',
    schema: z.object({ username: str(32), display_name: str(80), password: str(200), role: z.enum(['admin', 'supervisor', 'agent']), extra_permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]])).optional() }),
    fn: (i, s) => app.users.create(i, s.user.id),
  });
  on('users.update', {
    perm: 'users.manage',
    schema: z.object({ id, display_name: str(80).optional(), role: z.enum(['admin', 'supervisor', 'agent']).optional(), active: z.boolean().optional(), password: str(200).optional(), extra_permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]])).optional() }),
    fn: (i, s) => {
      if (i.id === s.user.id && i.active === false) throw new AppError('VALIDATION', 'No puede desactivar su propio usuario.');
      return app.users.update(i.id, i, s.user.id);
    },
  });
  on('users.meta', { perm: 'auth', fn: () => ({ permissions: PERMISSIONS, roles: ROLE_LABELS }) });
  on('audit.list', { perm: 'audit.view', account: true, schema: z.object({ limit: z.number().int().max(500).optional(), offset: z.number().int().min(0).optional(), action: optStr(60) }), fn: (i, s) => app.history.auditList({ accountId: s.accountId, ...i, action: i.action ?? undefined }) });
  on('backup.list', { perm: 'backup.manage', fn: () => app.backup.list() });
  on('backup.create', {
    perm: 'backup.manage',
    schema: z.object({ choosePath: z.boolean().optional() }),
    fn: async (i, s) => {
      let dest: string | undefined;
      if (i.choosePath) {
        const p = await desktop.saveFile({ title: 'Guardar backup', defaultPath: `whatsapp-crm-${new Date().toISOString().slice(0, 10)}.wcrm.zip`, filters: [{ name: 'Backup WhatsApp CRM', extensions: ['zip'] }] });
        if (!p) return null;
        dest = p;
      }
      const r = await app.backup.create({ destPath: dest });
      app.history.audit('backup.create', { userId: s.user.id, details: { file: r.file.split(/[\\/]/).pop() } });
      return r;
    },
  });
  on('backup.restore', {
    perm: 'backup.manage',
    schema: z.object({ path: optStr(1000) }),
    fn: async (i, s) => {
      let p = i.path ?? null;
      if (p && !app.backup.list().some((b) => b.path === p)) throw new AppError('VALIDATION', 'Backup no encontrado.');
      if (!p) p = (await desktop.openFile({ title: 'Seleccionar backup', filters: [{ name: 'Backup WhatsApp CRM', extensions: ['zip'] }] }))?.[0] ?? null;
      if (!p) return null;
      const m = app.backup.stageRestore(p);
      app.history.audit('backup.restore', { userId: s.user.id, details: { createdAt: m.createdAt } });
      setTimeout(() => desktop.relaunch(), 400);
      return m;
    },
  });
  on('backup.delete', { perm: 'backup.manage', schema: z.object({ name: str(200) }), fn: (i) => app.backup.delete(i.name) });
  on('backup.openFolder', { perm: 'backup.manage', fn: () => desktop.openPath(app.paths.backups) });
  on('app.info', { perm: 'auth', fn: () => ({ ...desktop.appInfo(), secrets: app.ctx.secrets.backend, scheduler: app.scheduler.lastTickAt }) });
  on('app.openLogs', { perm: 'settings.manage', fn: () => desktop.openPath(app.paths.logs) });
  on('app.checkUpdates', { perm: 'settings.manage', fn: () => desktop.checkForUpdates() });
  on('app.openExternal', {
    perm: 'auth',
    schema: z.object({ url: z.string().url().max(500) }),
    fn: (i) => {
      const allowed = ['https://developers.facebook.com/', 'https://business.facebook.com/', 'https://console.anthropic.com/', 'https://platform.claude.com/', 'https://www.whatsapp.com/'];
      if (!allowed.some((a) => i.url.startsWith(a))) throw forbidden();
      return desktop.openExternal(i.url);
    },
  });

  return H;
}

/** Ejecuta un método IPC aplicando sesión, permisos, validación y traducción de errores. */
export async function dispatch(app: App, H: Record<string, Handler>, session: Session, method: string, payload: unknown): Promise<IpcResult<unknown>> {
  try {
    const h = H[method];
    if (!h) throw new AppError('NOT_FOUND', 'Operación desconocida.');
    const input: any = h.schema ? h.schema.parse(payload ?? {}) : undefined;

    // Métodos públicos especiales (antes de iniciar sesión)
    if (method === 'auth.status') {
      const accounts = session.user ? app.accounts.list() : [];
      return { ok: true, data: { hasUsers: app.users.hasUsers(), user: session.user, accountId: session.accountId, accounts } };
    }
    if (method === 'auth.setup') {
      if (app.users.hasUsers()) throw forbidden();
      const u = app.users.create({ username: input.username, display_name: input.display_name, password: input.password, role: 'admin' });
      session.user = app.users.sessionFor(u.id);
      session.accountId = app.accounts.list()[0]?.id ?? null;
      return { ok: true, data: { user: session.user, accountId: session.accountId } };
    }
    if (method === 'auth.login') {
      session.user = app.users.login(input.username, input.password);
      session.accountId = app.accounts.list()[0]?.id ?? null;
      return { ok: true, data: { user: session.user, accountId: session.accountId } };
    }

    if (h.perm !== 'public') {
      if (!session.user) throw new AppError('UNAUTHENTICATED', 'Su sesión expiró. Inicie sesión de nuevo.');
      // Releer el usuario: si fue desactivado o cambió de rol, se aplica de inmediato.
      const fresh = app.users.sessionFor(session.user.id);
      if (!fresh) {
        session.user = null;
        throw new AppError('UNAUTHENTICATED', 'Su usuario fue desactivado.');
      }
      session.user = fresh;
      if (h.perm !== 'auth' && !hasPermission(fresh.role, h.perm, fresh.permissions)) throw forbidden();
    }
    if (method === 'auth.logout') {
      app.history.audit('auth.logout', { userId: session.user!.id });
      session.user = null;
      session.fileTokens.clear();
      return { ok: true, data: null };
    }
    if (method === 'session.setAccount') {
      app.accounts.get(input.accountId);
      session.accountId = input.accountId;
      return { ok: true, data: { accountId: session.accountId } };
    }
    if (h.account) {
      if (!session.accountId) throw new AppError('NO_ACCOUNT', 'Agregue una cuenta de WhatsApp en Configuración.');
      app.accounts.get(session.accountId);
    }
    const data = await h.fn(input, { user: session.user!, accountId: session.accountId!, fileTokens: session.fileTokens });
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    if (e instanceof AppError) {
      if (e.detail) app.log.warn('errors', `${method}: ${e.code}`, e.detail);
      return { ok: false, error: { code: e.code, message: e.userMessage } };
    }
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      app.log.warn('errors', `${method}: validación`, e.issues.slice(0, 3));
      return { ok: false, error: { code: 'VALIDATION', message: `Datos inválidos${issue?.path?.length ? ` (${issue.path.join('.')})` : ''}.` } };
    }
    app.log.error('errors', `Error inesperado en ${method}`, e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado. El detalle quedó registrado en los logs.' } };
  }
}

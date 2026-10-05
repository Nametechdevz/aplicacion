import type { Ctx } from '../context';
import { json } from '../db/database';
import type { BusinessHours } from '../../shared/types';

export interface SendingSettings {
  ratePerMinute: number;
  dailyCap: number;
  maxAttempts: number;
  retryBaseSeconds: number;
  rateLimitPauseSeconds: number;
  missedScheduleGraceHours: number;
  confirmThreshold: number;
  maxRecipientsPerRun: number;
}

export interface HumanModeSettings {
  enabled: boolean;
  pauseMinutes: number;
}

export interface OptOutSettings {
  keywords: string[];
  replyEnabled: boolean;
  replyMessage: string;
}

export interface GeneralSettings {
  defaultCountryCode: string;
  timezone: string;
  closeBehavior: 'ask' | 'tray' | 'quit';
  launchAtLogin: boolean;
  startMinimized: boolean;
}

export interface NotificationSettings {
  newMessage: boolean;
  campaignFinished: boolean;
  campaignFailed: boolean;
  disconnected: boolean;
  automationFailed: boolean;
  taskDue: boolean;
  sound: boolean;
}

export interface AiSettings {
  provider: 'anthropic';
  apiKeyEncrypted: string | null;
  model: string;
  maxContextMessages: number;
}

export interface BackupSettings {
  autoEnabled: boolean;
  intervalHours: number;
  keep: number;
  lastAutoBackupAt: string | null;
}

export interface WebhookSettings {
  port: number;
  host: string;
}

export interface AutomationSettings {
  maxRunsPerContactPerHour: number;
  maxChainDepth: number;
}

export interface AppearanceSettings {
  theme: 'dark' | 'light';
}

const defaultDays = (): BusinessHours['days'] => {
  const d: BusinessHours['days'] = {};
  for (let i = 1; i <= 7; i++) d[String(i)] = { enabled: i <= 5, open: '08:00', close: '18:00' };
  d['6'] = { enabled: true, open: '09:00', close: '13:00' };
  return d;
};

export const DEFAULTS = {
  sending: { ratePerMinute: 20, dailyCap: 1000, maxAttempts: 5, retryBaseSeconds: 30, rateLimitPauseSeconds: 60, missedScheduleGraceHours: 6, confirmThreshold: 50, maxRecipientsPerRun: 5000 } as SendingSettings,
  humanMode: { enabled: true, pauseMinutes: 30 } as HumanModeSettings,
  optOut: {
    keywords: ['stop', 'baja', 'darme de baja', 'no molestar', 'no contactar', 'cancelar suscripcion', 'no quiero recibir mensajes', 'unsubscribe'],
    replyEnabled: true,
    replyMessage: 'Listo. No volverás a recibir mensajes promocionales de nuestra parte. Si cambias de opinión, escríbenos cuando quieras.',
  } as OptOutSettings,
  general: { defaultCountryCode: '57', timezone: 'America/Bogota', closeBehavior: 'ask', launchAtLogin: false, startMinimized: false } as GeneralSettings,
  notifications: { newMessage: true, campaignFinished: true, campaignFailed: true, disconnected: true, automationFailed: true, taskDue: true, sound: true } as NotificationSettings,
  ai: { provider: 'anthropic', apiKeyEncrypted: null, model: 'claude-opus-5-5', maxContextMessages: 20 } as AiSettings,
  backup: { autoEnabled: true, intervalHours: 24, keep: 7, lastAutoBackupAt: null } as BackupSettings,
  webhook: { port: 3977, host: '127.0.0.1' } as WebhookSettings,
  automation: { maxRunsPerContactPerHour: 10, maxChainDepth: 3 } as AutomationSettings,
  appearance: { theme: 'dark' } as AppearanceSettings,
  businessHours: {
    timezone: 'America/Bogota',
    days: defaultDays(),
    outOfHoursReply: { enabled: false, message: 'Hola 👋 En este momento estamos fuera de horario. Te responderemos apenas volvamos. ¡Gracias por escribirnos!', cooldownHours: 12 },
  } as BusinessHours,
};

export type SettingsKey = keyof typeof DEFAULTS;
/** Claves que se guardan por cuenta de WhatsApp (el resto es global). */
export const ACCOUNT_SCOPED: SettingsKey[] = ['sending', 'humanMode', 'optOut', 'businessHours', 'automation'];

export class SettingsService {
  constructor(private ctx: Ctx) {}

  private scope(key: SettingsKey, accountId?: number | null) {
    return ACCOUNT_SCOPED.includes(key) && accountId ? `account:${accountId}` : 'global';
  }

  get<K extends SettingsKey>(key: K, accountId?: number | null): (typeof DEFAULTS)[K] {
    const scope = this.scope(key, accountId);
    const row = this.ctx.db.prepare('SELECT value FROM settings WHERE scope = ? AND key = ?').get(scope, key) as { value: string } | undefined;
    let base: any = DEFAULTS[key];
    if (!row && scope !== 'global') {
      const g = this.ctx.db.prepare("SELECT value FROM settings WHERE scope = 'global' AND key = ?").get(key) as { value: string } | undefined;
      if (g) base = { ...base, ...json(g.value, {}) };
      return structuredClone(base);
    }
    return { ...structuredClone(base), ...json(row?.value, {}) };
  }

  set<K extends SettingsKey>(key: K, value: Partial<(typeof DEFAULTS)[K]>, accountId?: number | null) {
    const scope = this.scope(key, accountId);
    const merged = { ...this.get(key, accountId), ...value };
    this.ctx.db
      .prepare(`INSERT INTO settings(scope, key, value, updated_at) VALUES (?,?,?,?)
                ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .run(scope, key, JSON.stringify(merged), this.ctx.clock.now().toISOString());
    return merged;
  }

  /** Datos internos (no expuestos a la UI) como flags de primera ejecución. */
  getRaw(key: string): string | null {
    const row = this.ctx.db.prepare("SELECT value FROM settings WHERE scope = 'internal' AND key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setRaw(key: string, value: string) {
    this.ctx.db
      .prepare(`INSERT INTO settings(scope, key, value) VALUES ('internal', ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }
}

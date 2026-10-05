import { z } from 'zod';

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const tz = z.string().max(60).refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Zona horaria inválida');

/** Validación estricta de cada bloque de configuración editable desde la UI. */
export const SETTINGS_SCHEMAS = {
  sending: z
    .object({
      ratePerMinute: z.number().int().min(1).max(600),
      dailyCap: z.number().int().min(0).max(1_000_000),
      maxAttempts: z.number().int().min(1).max(10),
      retryBaseSeconds: z.number().int().min(5).max(3600),
      rateLimitPauseSeconds: z.number().int().min(10).max(3600),
      missedScheduleGraceHours: z.number().min(0).max(168),
      confirmThreshold: z.number().int().min(1).max(100000),
      maxRecipientsPerRun: z.number().int().min(1).max(1_000_000),
    })
    .partial(),
  humanMode: z.object({ enabled: z.boolean(), pauseMinutes: z.number().int().min(1).max(10080) }).partial(),
  optOut: z.object({ keywords: z.array(z.string().min(2).max(60)).max(50), replyEnabled: z.boolean(), replyMessage: z.string().max(1000) }).partial(),
  general: z
    .object({ defaultCountryCode: z.string().regex(/^\d{1,4}$/), timezone: tz, closeBehavior: z.enum(['ask', 'tray', 'quit']), launchAtLogin: z.boolean(), startMinimized: z.boolean() })
    .partial(),
  notifications: z
    .object({ newMessage: z.boolean(), campaignFinished: z.boolean(), campaignFailed: z.boolean(), disconnected: z.boolean(), automationFailed: z.boolean(), taskDue: z.boolean(), sound: z.boolean() })
    .partial(),
  ai: z.object({ model: z.string().min(3).max(80), maxContextMessages: z.number().int().min(2).max(100) }).partial(),
  backup: z.object({ autoEnabled: z.boolean(), intervalHours: z.number().int().min(1).max(720), keep: z.number().int().min(1).max(100) }).partial(),
  automation: z.object({ maxRunsPerContactPerHour: z.number().int().min(1).max(100), maxChainDepth: z.number().int().min(0).max(5) }).partial(),
  appearance: z.object({ theme: z.enum(['dark', 'light']) }).partial(),
  businessHours: z
    .object({
      timezone: tz,
      days: z.record(z.enum(['1', '2', '3', '4', '5', '6', '7']), z.object({ enabled: z.boolean(), open: hhmm, close: hhmm })),
      outOfHoursReply: z.object({ enabled: z.boolean(), message: z.string().max(1000), cooldownHours: z.number().min(1).max(168) }),
    })
    .partial(),
  webhook: z.object({ port: z.number().int().min(1024).max(65535), host: z.enum(['127.0.0.1', '0.0.0.0']) }).partial(),
};

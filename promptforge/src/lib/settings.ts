import { z } from 'zod';

/** Preferencias del usuario (compartidas entre cliente y servidor). */
export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recomendado)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (más rápido)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (más económico)' },
] as const;

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  projectLanguage: z.string().trim().max(60).default('Español'),
  defaultCountry: z.string().trim().max(60).default(''),
  defaultCurrency: z.string().trim().max(10).default(''),
  defaultVariant: z.enum(['quick', 'pro', 'master']).default('master'),
  defaultScope: z.enum(['mvp', 'complete', 'enterprise']).default('complete'),
  defaultTechMode: z.enum(['auto', 'custom']).default('auto'),
  aiModel: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']).default('claude-opus-5-5'),
  aiEffort: z.enum(['low', 'medium', 'high']).default('medium'),
  exportFormat: z.enum(['md', 'txt']).default('md'),
  exportIncludeMeta: z.boolean().default(true),
  confirmBeforeRegenerate: z.boolean().default(true),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

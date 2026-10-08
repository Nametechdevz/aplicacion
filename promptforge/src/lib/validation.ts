import { z } from 'zod';
import { TYPE_BY_ID } from './engine/catalog';
import { TECHS, INTEGRATIONS } from './engine/techs';
import type { IntegrationId, TechId } from './engine/types';

const techIds = TECHS.map((t) => t.id) as [TechId, ...TechId[]];
const integrationIds = INTEGRATIONS.map((i) => i.id) as [IntegrationId, ...IntegrationId[]];

const shortText = (max: number) => z.string().trim().max(max);
const MAX_PROMPT = 200_000;

export const variantSchema = z.enum(['quick', 'pro', 'master']);

export const specSchema = z.object({
  idea: shortText(4000).default(''),
  projectType: z.string().refine((id) => id in TYPE_BY_ID, 'Tipo de proyecto desconocido'),
  customTypeLabel: shortText(120).default(''),
  name: shortText(160).default(''),
  description: shortText(4000).default(''),
  objective: shortText(2000).default(''),
  audience: shortText(1000).default(''),
  problem: shortText(2000).default(''),
  country: shortText(80).default(''),
  language: shortText(80).default(''),
  currency: shortText(10).default(''),
  scope: z.enum(['mvp', 'complete', 'enterprise']).default('complete'),
  design: z.object({
    styles: z.array(shortText(40)).max(20).default([]),
    colors: shortText(300).default(''),
    typography: shortText(200).default(''),
    themeMode: z.enum(['light', 'dark', 'both']).default('both'),
    references: shortText(1000).default(''),
    inspirationSites: shortText(1000).default(''),
  }),
  tech: z.object({
    mode: z.enum(['auto', 'custom']),
    selected: z.array(z.enum(techIds)).max(30).default([]),
    hosting: shortText(200).default(''),
  }),
  features: z.record(shortText(120), z.array(shortText(300)).max(120)).refine((r) => Object.keys(r).length <= 40, 'Demasiados grupos'),
  integrations: z.array(z.enum(integrationIds)).max(20).default([]),
  roles: z.array(shortText(80)).max(20).default([]),
  answers: z
    .record(shortText(60), z.union([shortText(2000), z.array(shortText(120)).max(30), z.boolean()]))
    .refine((r) => Object.keys(r).length <= 60, 'Demasiadas respuestas')
    .default({}),
  seo: z.boolean().default(true),
  multilingual: z.boolean().default(false),
  notes: shortText(4000).default(''),
  templateId: z.string().max(80).nullable().optional(),
});

export const variantsSchema = z.object({
  quick: z.string().max(MAX_PROMPT),
  pro: z.string().max(MAX_PROMPT),
  master: z.string().max(MAX_PROMPT),
});

const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]);

export const createPromptSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(160),
  description: shortText(1000).default(''),
  tags: tagsSchema.default([]),
  activeVariant: variantSchema,
  variants: variantsSchema,
  spec: specSchema.nullable(),
  favorite: z.boolean().optional(),
});

export const updatePromptSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: shortText(1000),
    tags: tagsSchema,
    activeVariant: variantSchema,
    variants: variantsSchema.partial(),
    spec: specSchema.nullable(),
    favorite: z.boolean(),
    versionNote: shortText(200),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios');

export const emailSchema = z.string().trim().toLowerCase().email('Email no válido').max(254);
export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Incluye letras y números');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Indica tu nombre').max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Introduce la contraseña').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const profileSchema = z.object({ name: z.string().trim().min(2).max(80) });

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: shortText(500).default(''),
  spec: specSchema,
});

export const aiImproveSchema = z.object({
  text: z.string().min(50, 'El prompt es demasiado corto').max(MAX_PROMPT),
  spec: specSchema.nullable().optional(),
  instructions: shortText(1000).optional(),
});

export const importSchema = z.object({
  version: z.literal(1),
  prompts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        description: shortText(1000).default(''),
        category: shortText(60).default('Personalizado'),
        projectType: z.string().max(60).default('custom'),
        stack: z.array(shortText(60)).max(30).default([]),
        tags: tagsSchema.default([]),
        activeVariant: variantSchema.default('master'),
        variants: variantsSchema,
        spec: specSchema.nullable().optional(),
        favorite: z.boolean().optional(),
        templateId: z.string().max(80).nullable().optional(),
      }),
    )
    .max(1000),
});

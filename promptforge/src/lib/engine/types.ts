export type CategoryId = 'web' | 'ecommerce' | 'sistemas' | 'saas' | 'apps' | 'custom';

export type Variant = 'quick' | 'pro' | 'master';

export const VARIANTS: Variant[] = ['quick', 'pro', 'master'];

export const VARIANT_LABEL: Record<Variant, string> = {
  quick: 'QUICK',
  pro: 'PRO',
  master: 'MASTER',
};

export type TechId =
  | 'wordpress'
  | 'woocommerce'
  | 'php'
  | 'laravel'
  | 'nodejs'
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'typescript'
  | 'javascript'
  | 'mysql'
  | 'postgresql'
  | 'mongodb'
  | 'firebase'
  | 'supabase'
  | 'rest'
  | 'graphql'
  | 'tailwind'
  | 'kotlin';

export type IntegrationId =
  | 'stripe'
  | 'paypal'
  | 'mercadopago'
  | 'wompi'
  | 'nequi'
  | 'whatsapp'
  | 'telegram'
  | 'google'
  | 'firebase'
  | 'supabase'
  | 'email'
  | 'webhooks'
  | 'external_api';

export type SeoLevel = 'high' | 'medium' | 'low';

export type Scope = 'mvp' | 'complete' | 'enterprise';

export type ThemeMode = 'light' | 'dark' | 'both';

/** Grupo de funcionalidades por rol/área (p. ej. "Cliente", "Administrador"). */
export interface FeatureGroup {
  name: string;
  /** Las funcionalidades marcadas como avanzadas empiezan desmarcadas en alcance MVP. */
  items: FeatureItem[];
}

export interface FeatureItem {
  label: string;
  advanced?: boolean;
}

export interface ProjectType {
  id: string;
  label: string;
  category: CategoryId;
  summary: string;
  /** Palabras clave para detectar el tipo a partir de una idea en texto libre. */
  keywords: string[];
  needsDb: boolean;
  seo: SeoLevel;
  roles: string[];
  featureGroups: FeatureGroup[];
  integrations: IntegrationId[];
  /** Entidades principales sugeridas para el modelo de datos. */
  entities: string[];
  /** Pista para Claude cuando el usuario delega la elección del stack. */
  stackHint: string;
  /** Requisitos no funcionales o de dominio propios del tipo. */
  domainNotes: string[];
  /** Ids de preguntas específicas adicionales a las de su categoría. */
  questions?: string[];
  pwa?: boolean;
}

export interface QuestionOption {
  value: string;
  label: string;
  /** Funcionalidades que se añaden al proyecto si se elige esta opción. */
  addFeatures?: { group: string; items: string[] }[];
  addIntegrations?: IntegrationId[];
}

export interface Question {
  id: string;
  label: string;
  help?: string;
  type: 'text' | 'textarea' | 'single' | 'multi' | 'boolean';
  placeholder?: string;
  options?: QuestionOption[];
  /** Efectos cuando una pregunta booleana es verdadera. */
  whenTrue?: { addFeatures?: { group: string; items: string[] }[]; addIntegrations?: IntegrationId[] };
}

export type AnswerValue = string | string[] | boolean;

export interface DesignSpec {
  styles: string[];
  colors: string;
  typography: string;
  themeMode: ThemeMode;
  references: string;
  inspirationSites: string;
}

export interface TechSpec {
  mode: 'auto' | 'custom';
  selected: TechId[];
  hosting: string;
}

export interface ProjectSpec {
  idea: string;
  projectType: string;
  customTypeLabel: string;
  name: string;
  description: string;
  objective: string;
  audience: string;
  problem: string;
  country: string;
  language: string;
  currency: string;
  scope: Scope;
  design: DesignSpec;
  tech: TechSpec;
  /** Funcionalidades seleccionadas por grupo. */
  features: Record<string, string[]>;
  integrations: IntegrationId[];
  roles: string[];
  answers: Record<string, AnswerValue>;
  seo: boolean;
  multilingual: boolean;
  notes: string;
  templateId?: string | null;
}

export type CheckStatus = 'pass' | 'partial' | 'fail' | 'na';

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  weight: number;
  points: number;
  hint: string;
}

export interface QualityReport {
  score: number;
  label: string;
  level: 'ready' | 'good' | 'incomplete' | 'weak';
  checks: QualityCheck[];
  suggestions: string[];
  stats: { words: number; chars: number; sections: number; approxTokens: number };
}

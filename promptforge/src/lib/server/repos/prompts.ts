import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ProjectSpec, Variant } from '@/lib/engine/types';
import { getDb, nowIso } from '../db';

export type Variants = Record<Variant, string>;

export interface PromptRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  projectType: string;
  stack: string[];
  tags: string[];
  activeVariant: Variant;
  variants: Variants;
  spec: ProjectSpec | null;
  qualityScore: number;
  favorite: boolean;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PromptSummary = Omit<PromptRecord, 'variants' | 'spec'> & { preview: string; words: number };

interface Row {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  project_type: string;
  stack: string;
  tags: string;
  active_variant: Variant;
  variants: string;
  spec: string | null;
  quality_score: number;
  favorite: number;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

function parse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function toRecord(r: Row): PromptRecord {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    projectType: r.project_type,
    stack: parse<string[]>(r.stack, []),
    tags: parse<string[]>(r.tags, []),
    activeVariant: r.active_variant,
    variants: parse<Variants>(r.variants, { quick: '', pro: '', master: '' }),
    spec: parse<ProjectSpec | null>(r.spec, null),
    qualityScore: r.quality_score,
    favorite: r.favorite === 1,
    templateId: r.template_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSummary(r: PromptRecord): PromptSummary {
  const { variants, spec: _spec, ...rest } = r;
  const text = variants[r.activeVariant] ?? '';
  const preview = text
    .replace(/^#.*$/gm, '')
    .replace(/[>*_`|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  return { ...rest, preview, words: text.trim() ? text.trim().split(/\s+/).length : 0 };
}

export interface PromptInput {
  name: string;
  description: string;
  category: string;
  projectType: string;
  stack: string[];
  tags: string[];
  activeVariant: Variant;
  variants: Variants;
  spec: ProjectSpec | null;
  qualityScore: number;
  favorite?: boolean;
  templateId?: string | null;
}

export function createPrompt(userId: string, input: PromptInput, note = 'Versión inicial'): PromptRecord {
  const db = getDb();
  const id = randomUUID();
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO prompts (id, user_id, name, description, category, project_type, stack, tags, active_variant, variants, spec, quality_score, favorite, template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      input.name,
      input.description,
      input.category,
      input.projectType,
      JSON.stringify(input.stack),
      JSON.stringify(input.tags),
      input.activeVariant,
      JSON.stringify(input.variants),
      input.spec ? JSON.stringify(input.spec) : null,
      input.qualityScore,
      input.favorite ? 1 : 0,
      input.templateId ?? null,
      now,
      now,
    );
    addVersion(id, input.activeVariant, input.variants[input.activeVariant], input.qualityScore, note);
  })();
  return getPrompt(userId, id)!;
}

export function getPrompt(userId: string, id: string): PromptRecord | null {
  const r = getDb().prepare('SELECT * FROM prompts WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return r ? toRecord(r) : null;
}

export interface PromptFilters {
  q?: string;
  category?: string;
  variant?: Variant;
  favorite?: boolean;
  tag?: string;
  sort?: 'updated' | 'created' | 'name' | 'score';
  limit?: number;
}

export function listPrompts(userId: string, f: PromptFilters = {}): PromptSummary[] {
  const where = ['user_id = ?'];
  const params: unknown[] = [userId];
  if (f.category) {
    where.push('category = ?');
    params.push(f.category);
  }
  if (f.variant) {
    where.push('active_variant = ?');
    params.push(f.variant);
  }
  if (f.favorite) where.push('favorite = 1');
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR stack LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  const order =
    f.sort === 'name' ? 'name COLLATE NOCASE ASC' : f.sort === 'created' ? 'created_at DESC' : f.sort === 'score' ? 'quality_score DESC, updated_at DESC' : 'updated_at DESC';
  const limit = Math.min(Math.max(f.limit ?? 500, 1), 1000);
  const rows = getDb()
    .prepare(`SELECT * FROM prompts WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`)
    .all(...params) as Row[];
  let out = rows.map((r) => toSummary(toRecord(r)));
  if (f.tag) out = out.filter((p) => p.tags.includes(f.tag!));
  return out;
}

export type PromptPatch = Partial<Omit<PromptInput, 'variants'>> & { variants?: Partial<Variants>; versionNote?: string };

export function updatePrompt(userId: string, id: string, patch: PromptPatch): PromptRecord | null {
  const db = getDb();
  return db.transaction(() => {
    const current = getPrompt(userId, id);
    if (!current) return null;
    const variants: Variants = { ...current.variants, ...(patch.variants ?? {}) };
    const next = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      category: patch.category ?? current.category,
      projectType: patch.projectType ?? current.projectType,
      stack: patch.stack ?? current.stack,
      tags: patch.tags ?? current.tags,
      activeVariant: patch.activeVariant ?? current.activeVariant,
      spec: patch.spec !== undefined ? patch.spec : current.spec,
      qualityScore: patch.qualityScore ?? current.qualityScore,
      favorite: patch.favorite ?? current.favorite,
    };
    db.prepare(
      `UPDATE prompts SET name = ?, description = ?, category = ?, project_type = ?, stack = ?, tags = ?, active_variant = ?, variants = ?, spec = ?, quality_score = ?, favorite = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      next.name,
      next.description,
      next.category,
      next.projectType,
      JSON.stringify(next.stack),
      JSON.stringify(next.tags),
      next.activeVariant,
      JSON.stringify(variants),
      next.spec ? JSON.stringify(next.spec) : null,
      next.qualityScore,
      next.favorite ? 1 : 0,
      nowIso(),
      id,
      userId,
    );
    // Historial: una versión por cada variante cuyo contenido cambió.
    for (const v of Object.keys(patch.variants ?? {}) as Variant[]) {
      if (variants[v] !== current.variants[v]) {
        addVersion(id, v, variants[v], v === next.activeVariant ? next.qualityScore : 0, patch.versionNote ?? 'Edición');
      }
    }
    return getPrompt(userId, id);
  })();
}

export function deletePrompt(userId: string, id: string): boolean {
  return getDb().prepare('DELETE FROM prompts WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function duplicatePrompt(userId: string, id: string): PromptRecord | null {
  const p = getPrompt(userId, id);
  if (!p) return null;
  return createPrompt(
    userId,
    { ...p, name: `${p.name} (copia)`.slice(0, 160), favorite: false, templateId: p.templateId },
    `Duplicado de "${p.name}"`,
  );
}

// ---------------------------------------------------------------------------
// Versiones
// ---------------------------------------------------------------------------
export interface PromptVersion {
  id: string;
  variant: Variant;
  content: string;
  qualityScore: number;
  note: string;
  createdAt: string;
}

const MAX_VERSIONS = 100;

function addVersion(promptId: string, variant: Variant, content: string, score: number, note: string): void {
  const db = getDb();
  db.prepare('INSERT INTO prompt_versions (id, prompt_id, variant, content, quality_score, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    promptId,
    variant,
    content,
    score,
    note.slice(0, 200),
    nowIso(),
  );
  // Conserva solo las últimas MAX_VERSIONS versiones por prompt.
  db.prepare(
    `DELETE FROM prompt_versions WHERE prompt_id = ? AND id NOT IN (
       SELECT id FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ${MAX_VERSIONS})`,
  ).run(promptId, promptId);
}

export function listVersions(userId: string, promptId: string): PromptVersion[] | null {
  if (!getPrompt(userId, promptId)) return null;
  const rows = getDb()
    .prepare('SELECT id, variant, content, quality_score, note, created_at FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(promptId) as { id: string; variant: Variant; content: string; quality_score: number; note: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, variant: r.variant, content: r.content, qualityScore: r.quality_score, note: r.note, createdAt: r.created_at }));
}

// ---------------------------------------------------------------------------
// Estadísticas del dashboard
// ---------------------------------------------------------------------------
export interface DashboardStats {
  total: number;
  createdLast30: number;
  favorites: number;
  fromTemplates: number;
  templatesUsed: number;
  avgScore: number;
  byCategory: { category: string; count: number }[];
  byVariant: { variant: Variant; count: number }[];
  perDay: { day: string; count: number }[];
  recentProjects: { name: string; projectType: string; category: string; updatedAt: string; id: string }[];
  latest: PromptSummary[];
}

export function dashboardStats(userId: string): DashboardStats {
  const db = getDb();
  const one = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(userId, ...p) as T;
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since14 = new Date(Date.now() - 13 * 864e5);
  since14.setUTCHours(0, 0, 0, 0);

  const total = one<{ n: number }>('SELECT COUNT(*) n FROM prompts WHERE user_id = ?').n;
  const createdLast30 = one<{ n: number }>('SELECT COUNT(*) n FROM prompts WHERE user_id = ? AND created_at >= ?', since30).n;
  const favorites = one<{ n: number }>('SELECT COUNT(*) n FROM prompts WHERE user_id = ? AND favorite = 1').n;
  const fromTemplates = one<{ n: number }>('SELECT COUNT(*) n FROM prompts WHERE user_id = ? AND template_id IS NOT NULL').n;
  const templatesUsed = one<{ n: number }>('SELECT COUNT(DISTINCT template_id) n FROM prompts WHERE user_id = ? AND template_id IS NOT NULL').n;
  const avgScore = Math.round(one<{ a: number | null }>('SELECT AVG(quality_score) a FROM prompts WHERE user_id = ?').a ?? 0);
  const byCategory = db
    .prepare('SELECT category, COUNT(*) count FROM prompts WHERE user_id = ? GROUP BY category ORDER BY count DESC')
    .all(userId) as { category: string; count: number }[];
  const byVariant = db
    .prepare('SELECT active_variant variant, COUNT(*) count FROM prompts WHERE user_id = ? GROUP BY active_variant')
    .all(userId) as { variant: Variant; count: number }[];
  const rawDays = db
    .prepare("SELECT substr(created_at, 1, 10) day, COUNT(*) count FROM prompts WHERE user_id = ? AND created_at >= ? GROUP BY day")
    .all(userId, since14.toISOString()) as { day: string; count: number }[];
  const perDay: { day: string; count: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since14.getTime() + i * 864e5).toISOString().slice(0, 10);
    perDay.push({ day: d, count: rawDays.find((r) => r.day === d)?.count ?? 0 });
  }
  const recentProjects = (
    db
      .prepare('SELECT id, name, project_type, category, updated_at FROM prompts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5')
      .all(userId) as { id: string; name: string; project_type: string; category: string; updated_at: string }[]
  ).map((r) => ({ id: r.id, name: r.name, projectType: r.project_type, category: r.category, updatedAt: r.updated_at }));
  const latest = listPrompts(userId, { sort: 'created', limit: 6 });
  return { total, createdLast30, favorites, fromTemplates, templatesUsed, avgScore, byCategory, byVariant, perDay, recentProjects, latest };
}

export function allPromptsForExport(userId: string): PromptRecord[] {
  return (getDb().prepare('SELECT * FROM prompts WHERE user_id = ? ORDER BY created_at ASC').all(userId) as Row[]).map(toRecord);
}

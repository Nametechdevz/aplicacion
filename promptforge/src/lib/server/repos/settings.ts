import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ProjectSpec } from '@/lib/engine/types';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/lib/settings';
import { getDb, nowIso } from '../db';

export function getSettings(userId: string): Settings {
  const row = getDb().prepare('SELECT data FROM user_settings WHERE user_id = ?').get(userId) as { data: string } | undefined;
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(row.data));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(userId: string, settings: Settings): Settings {
  const data = settingsSchema.parse(settings);
  getDb()
    .prepare(
      `INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(userId, JSON.stringify(data), nowIso());
  return data;
}

// ---------------------------------------------------------------------------
// Plantillas propias del usuario
// ---------------------------------------------------------------------------
export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  projectType: string;
  spec: ProjectSpec;
  createdAt: string;
}

export function listUserTemplates(userId: string): UserTemplate[] {
  const rows = getDb()
    .prepare('SELECT id, name, description, project_type, spec, created_at FROM user_templates WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as { id: string; name: string; description: string; project_type: string; spec: string; created_at: string }[];
  return rows.flatMap((r) => {
    try {
      return [{ id: r.id, name: r.name, description: r.description, projectType: r.project_type, spec: JSON.parse(r.spec) as ProjectSpec, createdAt: r.created_at }];
    } catch {
      return [];
    }
  });
}

export function getUserTemplate(userId: string, id: string): UserTemplate | null {
  return listUserTemplates(userId).find((t) => t.id === id) ?? null;
}

export function createUserTemplate(userId: string, input: { name: string; description: string; spec: ProjectSpec }): UserTemplate {
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO user_templates (id, user_id, name, description, project_type, spec, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, input.name, input.description, input.spec.projectType, JSON.stringify(input.spec), nowIso());
  return getUserTemplate(userId, id)!;
}

export function deleteUserTemplate(userId: string, id: string): boolean {
  return getDb().prepare('DELETE FROM user_templates WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

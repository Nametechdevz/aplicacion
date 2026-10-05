import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import type { Task } from '../../shared/types';
import type { HistoryService } from './history';

/** Tareas de seguimiento + pipeline CRM (etapas con drag & drop). */
export class TaskService {
  constructor(private ctx: Ctx, private history: HistoryService) {}

  // ---- Tareas ----
  list(accountId: number, f: { status?: string; contactId?: number; assignedTo?: number; from?: string; to?: string; overdue?: boolean } = {}): Task[] {
    const w = ['t.account_id = ?'];
    const p: unknown[] = [accountId];
    if (f.status) {
      w.push('t.status = ?');
      p.push(f.status);
    }
    if (f.contactId) {
      w.push('t.contact_id = ?');
      p.push(f.contactId);
    }
    if (f.assignedTo) {
      w.push('t.assigned_to = ?');
      p.push(f.assignedTo);
    }
    if (f.from) {
      w.push('t.due_at >= ?');
      p.push(f.from);
    }
    if (f.to) {
      w.push('t.due_at < ?');
      p.push(f.to);
    }
    if (f.overdue) {
      w.push("t.status = 'pending' AND t.due_at < ?");
      p.push(this.ctx.clock.now().toISOString());
    }
    return this.ctx.db
      .prepare(`SELECT t.*, c.name AS contact_name, c.phone AS contact_phone, u.display_name AS assigned_name FROM tasks t
                LEFT JOIN contacts c ON c.id = t.contact_id LEFT JOIN users u ON u.id = t.assigned_to
                WHERE ${w.join(' AND ')} ORDER BY t.status = 'pending' DESC, t.due_at IS NULL, t.due_at, t.id DESC LIMIT 1000`)
      .all(...p) as Task[];
  }

  get(accountId: number, id: number): Task {
    const t = this.ctx.db.prepare('SELECT * FROM tasks WHERE id = ? AND account_id = ?').get(id, accountId) as Task | undefined;
    if (!t) throw notFound('La tarea');
    return t;
  }

  create(accountId: number, input: { title: string; description?: string | null; contact_id?: number | null; due_at?: string | null; assigned_to?: number | null; source?: string }, actorId?: number | null): number {
    const title = input.title?.trim();
    if (!title) throw invalid('La tarea necesita un título.');
    if (input.due_at && Number.isNaN(Date.parse(input.due_at))) throw invalid('Fecha de vencimiento inválida.');
    if (input.contact_id && !this.ctx.db.prepare('SELECT 1 FROM contacts WHERE id = ? AND account_id = ?').get(input.contact_id, accountId)) throw notFound('El contacto');
    const r = this.ctx.db
      .prepare('INSERT INTO tasks(account_id, contact_id, title, description, due_at, assigned_to, created_by, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(accountId, input.contact_id ?? null, title.slice(0, 200), input.description ?? null, input.due_at ? new Date(input.due_at).toISOString() : null, input.assigned_to ?? null, actorId ?? null, input.source ?? 'manual', this.ctx.clock.now().toISOString());
    const id = Number(r.lastInsertRowid);
    if (input.contact_id) this.history.contactEvent(accountId, input.contact_id, 'task_created', { taskId: id, title }, actorId);
    this.ctx.bus.emit('task.created', { accountId, taskId: id });
    return id;
  }

  update(accountId: number, id: number, patch: { title?: string; description?: string | null; due_at?: string | null; assigned_to?: number | null; status?: Task['status'] }, actorId?: number | null) {
    const t = this.get(accountId, id);
    const status = patch.status ?? t.status;
    this.ctx.db
      .prepare('UPDATE tasks SET title = ?, description = ?, due_at = ?, assigned_to = ?, status = ?, completed_at = ?, notified_at = CASE WHEN ? != COALESCE(due_at, \'\') THEN NULL ELSE notified_at END WHERE id = ?')
      .run(
        patch.title?.trim() || t.title,
        patch.description !== undefined ? patch.description : t.description,
        patch.due_at !== undefined ? (patch.due_at ? new Date(patch.due_at).toISOString() : null) : t.due_at,
        patch.assigned_to !== undefined ? patch.assigned_to : t.assigned_to,
        status,
        status === 'done' ? t.completed_at ?? this.ctx.clock.now().toISOString() : null,
        patch.due_at !== undefined ? (patch.due_at ? new Date(patch.due_at).toISOString() : '') : t.due_at ?? '',
        id,
      );
    if (t.contact_id && patch.status && patch.status !== t.status) this.history.contactEvent(accountId, t.contact_id, 'task_' + patch.status, { taskId: id, title: t.title }, actorId);
    return this.get(accountId, id);
  }

  delete(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  /** Tareas vencidas aún no notificadas (el Scheduler las notifica una sola vez). */
  dueForNotification() {
    const rows = this.ctx.db
      .prepare("SELECT t.*, c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id WHERE t.status = 'pending' AND t.due_at IS NOT NULL AND t.due_at <= ? AND t.notified_at IS NULL LIMIT 50")
      .all(this.ctx.clock.now().toISOString()) as (Task & { contact_name: string | null })[];
    for (const r of rows) this.ctx.db.prepare('UPDATE tasks SET notified_at = ? WHERE id = ?').run(this.ctx.clock.now().toISOString(), r.id);
    return rows;
  }

  // ---- Pipeline ----
  ensureDefaultPipeline(accountId: number): number {
    const p = this.ctx.db.prepare('SELECT id FROM pipelines WHERE account_id = ? AND is_default = 1').get(accountId) as { id: number } | undefined;
    if (p) return p.id;
    const id = Number(this.ctx.db.prepare("INSERT INTO pipelines(account_id, name, is_default) VALUES (?, 'Ventas', 1)").run(accountId).lastInsertRowid);
    const stages: [string, string][] = [
      ['Nuevo', '#64748b'],
      ['Contactado', '#3b82f6'],
      ['Interesado', '#eab308'],
      ['Negociación', '#f97316'],
      ['Cliente', '#22c55e'],
      ['Fidelizado', '#a855f7'],
    ];
    const ins = this.ctx.db.prepare('INSERT INTO pipeline_stages(pipeline_id, name, color, position) VALUES (?,?,?,?)');
    stages.forEach(([n, c], i) => ins.run(id, n, c, i));
    return id;
  }

  pipelines(accountId: number) {
    this.ensureDefaultPipeline(accountId);
    const ps = this.ctx.db.prepare('SELECT * FROM pipelines WHERE account_id = ? ORDER BY is_default DESC, id').all(accountId) as any[];
    for (const p of ps) p.stages = this.ctx.db.prepare('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position').all(p.id);
    return ps;
  }

  board(accountId: number, pipelineId: number, search?: string) {
    const p = this.ctx.db.prepare('SELECT * FROM pipelines WHERE id = ? AND account_id = ?').get(pipelineId, accountId);
    if (!p) throw notFound('El pipeline');
    const stages = this.ctx.db.prepare('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY position').all(pipelineId) as any[];
    const like = search?.trim() ? `%${search.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%` : null;
    const cards = this.ctx.db
      .prepare(`SELECT cp.stage_id, cp.position, c.id, c.name, c.phone, c.company, c.last_message_at, c.last_message_preview, u.display_name AS assigned_name
                FROM contact_pipeline cp JOIN contacts c ON c.id = cp.contact_id LEFT JOIN users u ON u.id = c.assigned_to
                WHERE cp.pipeline_id = ? AND c.status = 'active' ${like ? "AND (c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ?)" : ''}
                ORDER BY cp.position, cp.updated_at DESC`)
      .all(...(like ? [pipelineId, like, like] : [pipelineId])) as any[];
    return { pipeline: p, stages: stages.map((s) => ({ ...s, cards: cards.filter((c) => c.stage_id === s.id) })) };
  }

  setStage(accountId: number, contactId: number, stageId: number, position = 0, actorId?: number | null) {
    const st = this.ctx.db.prepare('SELECT s.*, p.account_id FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id WHERE s.id = ?').get(stageId) as any;
    if (!st || st.account_id !== accountId) throw notFound('La etapa');
    if (!this.ctx.db.prepare('SELECT 1 FROM contacts WHERE id = ? AND account_id = ?').get(contactId, accountId)) throw notFound('El contacto');
    const prev = this.ctx.db.prepare('SELECT s.name FROM contact_pipeline cp JOIN pipeline_stages s ON s.id = cp.stage_id WHERE cp.contact_id = ? AND cp.pipeline_id = ?').get(contactId, st.pipeline_id) as { name: string } | undefined;
    this.ctx.db
      .prepare(`INSERT INTO contact_pipeline(contact_id, pipeline_id, stage_id, position, updated_at) VALUES (?,?,?,?,?)
                ON CONFLICT(contact_id, pipeline_id) DO UPDATE SET stage_id = excluded.stage_id, position = excluded.position, updated_at = excluded.updated_at`)
      .run(contactId, st.pipeline_id, stageId, position, this.ctx.clock.now().toISOString());
    if (prev?.name !== st.name) this.history.contactEvent(accountId, contactId, 'stage_changed', { from: prev?.name ?? null, to: st.name }, actorId);
  }

  removeFromPipeline(accountId: number, contactId: number, pipelineId: number) {
    this.ctx.db.prepare('DELETE FROM contact_pipeline WHERE contact_id = ? AND pipeline_id = ? AND pipeline_id IN (SELECT id FROM pipelines WHERE account_id = ?)').run(contactId, pipelineId, accountId);
  }

  saveStages(accountId: number, pipelineId: number, stages: { id?: number; name: string; color: string }[]) {
    const p = this.ctx.db.prepare('SELECT id FROM pipelines WHERE id = ? AND account_id = ?').get(pipelineId, accountId);
    if (!p) throw notFound('El pipeline');
    if (!stages.length) throw invalid('El pipeline necesita al menos una etapa.');
    this.ctx.db.transaction(() => {
      const keep = stages.filter((s) => s.id).map((s) => s.id!);
      const existing = (this.ctx.db.prepare('SELECT id FROM pipeline_stages WHERE pipeline_id = ?').all(pipelineId) as { id: number }[]).map((r) => r.id);
      for (const id of existing) if (!keep.includes(id)) this.ctx.db.prepare('DELETE FROM pipeline_stages WHERE id = ?').run(id);
      stages.forEach((s, i) => {
        if (!s.name.trim()) throw invalid('Todas las etapas necesitan nombre.');
        if (s.id && existing.includes(s.id)) this.ctx.db.prepare('UPDATE pipeline_stages SET name = ?, color = ?, position = ? WHERE id = ?').run(s.name.trim(), s.color, i, s.id);
        else this.ctx.db.prepare('INSERT INTO pipeline_stages(pipeline_id, name, color, position) VALUES (?,?,?,?)').run(pipelineId, s.name.trim(), s.color, i);
      });
    })();
    return this.pipelines(accountId).find((x: any) => x.id === pipelineId);
  }
}

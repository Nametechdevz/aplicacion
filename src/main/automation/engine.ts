import { DateTime } from 'luxon';
import type { Ctx } from '../context';
import { invalid, notFound } from '../core/errors';
import { json } from '../db/database';
import type { Automation, AutomationEdge, AutomationNode, Contact } from '../../shared/types';
import { normalizeText } from '../../shared/text';
import { ACTIONS, CONDITIONS, TRIGGERS, type TriggerType } from './catalog';
import type { ContactService } from '../services/contacts';
import type { TagService } from '../services/tags';
import type { MessagingService } from '../services/messaging';
import type { ConversationService } from '../services/conversations';
import type { CustomFieldService } from '../services/custom-fields';
import type { SettingsService } from '../services/settings';
import type { TaskService } from '../services/tasks';
import type { SegmentService } from '../services/segments';
import type { ComplianceService } from '../services/compliance';

export interface TriggerEvent {
  type: TriggerType;
  accountId: number;
  contactId: number;
  text?: string;
  tagId?: number;
  isNewContact?: boolean;
  source?: string;
  depth?: number;
  conversationId?: number;
}

interface RunRow {
  id: number;
  automation_id: number;
  account_id: number;
  contact_id: number | null;
  status: string;
  trigger_event: string | null;
  context: string | null;
  current_node_key: string | null;
  depth: number;
}

export interface AutomationDeps {
  contacts: ContactService;
  tags: TagService;
  messaging: MessagingService;
  conversations: ConversationService;
  fields: CustomFieldService;
  settings: SettingsService;
  tasks: TaskService;
  segments: SegmentService;
  compliance: ComplianceService;
  windowHours(accountId: number): number | null;
  aiReply?(accountId: number, contactId: number, assistantId: number | null, runId: number): Promise<string>;
}

const MAX_STEPS = 60;

/**
 * Motor de automatizaciones: Trigger → Condición → Acción.
 * API pública: trigger(), evaluateConditions(), executeAction(), scheduleAction(), pause(), resume(), cancel().
 */
export class AutomationEngine {
  constructor(private ctx: Ctx, private d: AutomationDeps) {}

  // ---------------- CRUD ----------------
  private load(row: any): Automation {
    const nodes = (this.ctx.db.prepare('SELECT * FROM automation_nodes WHERE automation_id = ? ORDER BY id').all(row.id) as any[]).map(
      (n): AutomationNode => ({ id: n.node_key, type: n.type, subtype: n.subtype, config: json(n.config, {}), position: { x: n.position_x, y: n.position_y } }),
    );
    const edges = (this.ctx.db.prepare('SELECT * FROM automation_edges WHERE automation_id = ? ORDER BY id').all(row.id) as any[]).map(
      (e): AutomationEdge => ({ id: e.edge_key, source: e.source_key, target: e.target_key, sourceHandle: e.source_handle }),
    );
    return { ...row, nodes, edges };
  }

  list(accountId: number): Automation[] {
    return (this.ctx.db.prepare('SELECT * FROM automations WHERE account_id = ? ORDER BY id DESC').all(accountId) as any[]).map((r) => this.load(r));
  }

  get(accountId: number, id: number): Automation {
    const r = this.ctx.db.prepare('SELECT * FROM automations WHERE id = ? AND account_id = ?').get(id, accountId);
    if (!r) throw notFound('La automatización');
    return this.load(r);
  }

  /** Valida estructura: un único trigger, nodos conocidos, aristas válidas, sin ciclos, una salida por puerto. */
  validate(accountId: number, nodes: AutomationNode[], edges: AutomationEdge[]) {
    const triggers = nodes.filter((n) => n.type === 'trigger');
    if (triggers.length !== 1) throw invalid('La automatización debe tener exactamente un disparador (trigger).');
    const keys = new Set<string>();
    for (const n of nodes) {
      if (!n.id || keys.has(n.id)) throw invalid('Identificadores de nodo duplicados.');
      keys.add(n.id);
      const cat = n.type === 'trigger' ? TRIGGERS : n.type === 'condition' ? CONDITIONS : ACTIONS;
      if (!(n.subtype in cat)) throw invalid(`Tipo de nodo desconocido: ${n.subtype}`);
      this.validateConfig(accountId, n);
    }
    const outs = new Set<string>();
    for (const e of edges) {
      if (!keys.has(e.source) || !keys.has(e.target)) throw invalid('Hay conexiones hacia nodos inexistentes.');
      if (e.source === e.target) throw invalid('Un nodo no puede conectarse consigo mismo.');
      const tgt = nodes.find((n) => n.id === e.target)!;
      if (tgt.type === 'trigger') throw invalid('Nada puede conectarse hacia el disparador.');
      const src = nodes.find((n) => n.id === e.source)!;
      const handle = src.type === 'condition' ? e.sourceHandle ?? 'true' : 'next';
      if (src.type === 'condition' && !['true', 'false'].includes(handle)) throw invalid('Las condiciones solo tienen salidas Sí/No.');
      const k = `${e.source}:${handle}`;
      if (outs.has(k)) throw invalid('Cada salida solo puede conectarse a un nodo (use condiciones para ramificar).');
      outs.add(k);
    }
    // Detección de ciclos (DFS)
    const adj = new Map<string, string[]>();
    for (const e of edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    const state = new Map<string, number>();
    const visit = (k: string): void => {
      state.set(k, 1);
      for (const t of adj.get(k) ?? []) {
        if (state.get(t) === 1) throw invalid('La automatización contiene un ciclo. Use "Ejecutar otra automatización" para repetir pasos.');
        if (!state.get(t)) visit(t);
      }
      state.set(k, 2);
    };
    for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  }

  private validateConfig(accountId: number, n: AutomationNode) {
    const c = n.config ?? {};
    const need = (cond: boolean, msg: string) => {
      if (!cond) throw invalid(`${msg} (nodo "${(n.type === 'trigger' ? (TRIGGERS as any) : n.type === 'condition' ? (CONDITIONS as any) : (ACTIONS as any))[n.subtype].label}")`);
    };
    switch (n.subtype) {
      case 'tag_added':
      case 'tag_removed':
        if (c.tagId) this.d.tags.get(accountId, Number(c.tagId));
        break;
      case 'schedule':
        need(/^\d{2}:\d{2}$/.test(c.time ?? ''), 'Indique la hora');
        need(Array.isArray(c.days) && c.days.length > 0, 'Seleccione al menos un día');
        need(!!(c.tagId || c.segmentId), 'Seleccione la etiqueta o segmento destino');
        break;
      case 'date_field':
        need(!!c.fieldKey, 'Seleccione el campo de fecha');
        need(/^\d{2}:\d{2}$/.test(c.time ?? ''), 'Indique la hora');
        break;
      case 'message_contains':
        need(Array.isArray(c.keywords) && c.keywords.some((k: string) => k?.trim()), 'Indique al menos una palabra');
        break;
      case 'message_starts_with':
      case 'message_ends_with':
      case 'message_equals':
        need(!!c.text?.trim(), 'Indique el texto');
        break;
      case 'has_tag':
      case 'not_has_tag':
      case 'add_tag':
      case 'remove_tag':
        need(!!c.tagId, 'Seleccione la etiqueta');
        this.d.tags.get(accountId, Number(c.tagId));
        break;
      case 'send_message':
        need(!!c.text?.trim(), 'Escriba el mensaje');
        need(c.text.length <= 4096, 'El mensaje supera 4096 caracteres');
        break;
      case 'send_media':
        need(!!c.mediaId, 'Seleccione el archivo');
        break;
      case 'add_note':
        need(!!c.text?.trim(), 'Escriba la nota');
        break;
      case 'wait':
        need(Number(c.amount) > 0, 'Indique cuánto esperar');
        need(['minutes', 'hours', 'days'].includes(c.unit), 'Unidad inválida');
        need(this.waitMs(c as any) <= 90 * 86400000, 'La espera máxima es de 90 días');
        break;
      case 'run_automation':
        need(!!c.automationId, 'Seleccione la automatización');
        break;
      case 'create_task':
        need(!!c.title?.trim(), 'Indique el título de la tarea');
        break;
      case 'set_stage':
        need(!!c.stageId, 'Seleccione la etapa');
        break;
      case 'custom_field':
        need(!!c.fieldKey, 'Seleccione el campo');
        break;
      case 'phone_matches':
        need(!!String(c.value ?? '').replace(/\D/g, ''), 'Indique los dígitos');
        break;
      case 'time_range':
        need(/^\d{2}:\d{2}$/.test(c.from ?? '') && /^\d{2}:\d{2}$/.test(c.to ?? ''), 'Indique el rango horario');
        break;
      case 'day_of_week':
        need(Array.isArray(c.days) && c.days.length > 0, 'Seleccione los días');
        break;
    }
  }

  save(accountId: number, input: { id?: number; name: string; description?: string | null; enabled?: boolean; nodes: AutomationNode[]; edges: AutomationEdge[] }): Automation {
    const name = input.name?.trim();
    if (!name) throw invalid('La automatización necesita un nombre.');
    this.validate(accountId, input.nodes, input.edges);
    const trigger = input.nodes.find((n) => n.type === 'trigger')!;
    const db = this.ctx.db;
    const now = this.ctx.clock.now().toISOString();
    const id = db.transaction(() => {
      let aid = input.id;
      if (aid) {
        this.get(accountId, aid);
        db.prepare('UPDATE automations SET name = ?, description = ?, trigger_type = ?, enabled = COALESCE(?, enabled), updated_at = ? WHERE id = ?').run(name, input.description ?? null, trigger.subtype, input.enabled === undefined ? null : input.enabled ? 1 : 0, now, aid);
        db.prepare('DELETE FROM automation_nodes WHERE automation_id = ?').run(aid);
        db.prepare('DELETE FROM automation_edges WHERE automation_id = ?').run(aid);
      } else {
        aid = Number(db.prepare('INSERT INTO automations(account_id, name, description, enabled, trigger_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(accountId, name, input.description ?? null, input.enabled ? 1 : 0, trigger.subtype, now, now).lastInsertRowid);
      }
      const insN = db.prepare('INSERT INTO automation_nodes(automation_id, node_key, type, subtype, config, position_x, position_y) VALUES (?,?,?,?,?,?,?)');
      for (const n of input.nodes) insN.run(aid, n.id, n.type, n.subtype, JSON.stringify(n.config ?? {}), n.position?.x ?? 0, n.position?.y ?? 0);
      const insE = db.prepare('INSERT INTO automation_edges(automation_id, edge_key, source_key, target_key, source_handle) VALUES (?,?,?,?,?)');
      for (const e of input.edges) insE.run(aid, e.id || `${e.source}-${e.target}`, e.source, e.target, e.sourceHandle ?? null);
      return aid!;
    })();
    return this.get(accountId, id);
  }

  delete(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('DELETE FROM automations WHERE id = ?').run(id);
  }

  duplicate(accountId: number, id: number): Automation {
    const a = this.get(accountId, id);
    return this.save(accountId, { name: `${a.name} (copia)`, description: a.description, enabled: false, nodes: a.nodes, edges: a.edges });
  }

  /** Desactiva la automatización (no se inician nuevas ejecuciones; las esperas pendientes se cancelan al reanudarse). */
  pause(accountId: number, id: number) {
    this.get(accountId, id);
    this.ctx.db.prepare('UPDATE automations SET enabled = 0, updated_at = ? WHERE id = ?').run(this.ctx.clock.now().toISOString(), id);
  }

  resume(accountId: number, id: number) {
    const a = this.get(accountId, id);
    this.validate(accountId, a.nodes, a.edges);
    this.ctx.db.prepare('UPDATE automations SET enabled = 1, updated_at = ? WHERE id = ?').run(this.ctx.clock.now().toISOString(), id);
  }

  /** Cancela una ejecución en espera. */
  cancel(accountId: number, runId: number) {
    const r = this.ctx.db.prepare("UPDATE automation_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND account_id = ? AND status IN ('waiting','running')").run(this.ctx.clock.now().toISOString(), runId, accountId);
    if (!r.changes) throw invalid('La ejecución ya terminó.');
    this.logRun(runId, null, 'info', 'Ejecución cancelada por el usuario');
  }

  runs(accountId: number, automationId: number, limit = 100) {
    this.get(accountId, automationId);
    return this.ctx.db
      .prepare('SELECT r.*, c.name AS contact_name, c.phone AS contact_phone FROM automation_runs r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.automation_id = ? ORDER BY r.id DESC LIMIT ?')
      .all(automationId, limit);
  }

  runLogs(accountId: number, runId: number) {
    const r = this.ctx.db.prepare('SELECT id FROM automation_runs WHERE id = ? AND account_id = ?').get(runId, accountId);
    if (!r) throw notFound('La ejecución');
    return this.ctx.db.prepare('SELECT * FROM automation_logs WHERE run_id = ? ORDER BY id').all(runId);
  }

  private logRun(runId: number, nodeKey: string | null, level: 'info' | 'warn' | 'error', message: string) {
    this.ctx.db.prepare('INSERT INTO automation_logs(run_id, node_key, level, message, created_at) VALUES (?,?,?,?,?)').run(runId, nodeKey, level, message, this.ctx.clock.now().toISOString());
    this.ctx.log.write('automation', level, `run ${runId}${nodeKey ? ` [${nodeKey}]` : ''}: ${message}`);
  }

  // ---------------- Ejecución ----------------
  /** Punto de entrada de eventos. Devuelve los ids de ejecuciones creadas. */
  async trigger(ev: TriggerEvent, onlyAutomationId?: number): Promise<number[]> {
    const depth = ev.depth ?? 0;
    const maxDepth = this.d.settings.get('automation', ev.accountId).maxChainDepth;
    if (depth > maxDepth) return [];
    const rows = this.ctx.db
      .prepare(`SELECT * FROM automations WHERE account_id = ? AND enabled = 1 AND trigger_type = ? ${onlyAutomationId ? 'AND id = ?' : ''}`)
      .all(...(onlyAutomationId ? [ev.accountId, ev.type, onlyAutomationId] : [ev.accountId, ev.type])) as any[];
    if (!rows.length) return [];
    let contact: Contact;
    try {
      contact = this.d.contacts.get(ev.accountId, ev.contactId);
    } catch {
      return [];
    }
    if (contact.blacklisted) return [];
    const messageTrigger = ev.type === 'message_received' || ev.type === 'message_replied';
    if (messageTrigger && this.d.conversations.isBotPaused(ev.accountId, ev.contactId)) {
      this.ctx.log.info('automation', `Contacto ${ev.contactId}: automatizaciones omitidas (modo humano activo)`);
      return [];
    }
    if (messageTrigger && contact.consent_status === 'opted_out') return [];
    const created: number[] = [];
    for (const row of rows) {
      const a = this.load(row);
      const trig = a.nodes.find((n) => n.type === 'trigger');
      if (!trig || !this.triggerMatches(trig, ev)) continue;
      if (!onlyAutomationId && this.rateLimited(a.id, ev.contactId, ev.accountId)) {
        this.ctx.log.warn('automation', `Automatización ${a.id}: límite de ejecuciones por contacto alcanzado (contacto ${ev.contactId})`);
        continue;
      }
      const now = this.ctx.clock.now().toISOString();
      const runId = Number(
        this.ctx.db
          .prepare('INSERT INTO automation_runs(automation_id, account_id, contact_id, status, trigger_event, context, current_node_key, depth, started_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(a.id, ev.accountId, ev.contactId, 'running', JSON.stringify(ev), JSON.stringify({ text: ev.text ?? '', isNewContact: !!ev.isNewContact }), trig.id, depth, now).lastInsertRowid,
      );
      this.ctx.db.prepare('UPDATE automations SET run_count = run_count + 1, last_run_at = ? WHERE id = ?').run(now, a.id);
      this.logRun(runId, trig.id, 'info', `Disparado por "${TRIGGERS[ev.type].label}"`);
      this.ctx.bus.emit('automation.run', { accountId: ev.accountId, automationId: a.id });
      created.push(runId);
      await this.continueRun(a, runId, this.next(a, trig.id, 'next'));
    }
    return created;
  }

  private triggerMatches(trig: AutomationNode, ev: TriggerEvent): boolean {
    const c = trig.config ?? {};
    if ((ev.type === 'tag_added' || ev.type === 'tag_removed') && c.tagId) return Number(c.tagId) === ev.tagId;
    if (ev.type === 'message_sent') {
      const sources: string[] = c.sources?.length ? c.sources : ['manual', 'campaign'];
      return !!ev.source && sources.includes(ev.source);
    }
    return true;
  }

  private rateLimited(automationId: number, contactId: number, accountId: number) {
    const max = this.d.settings.get('automation', accountId).maxRunsPerContactPerHour;
    const since = new Date(this.ctx.clock.now().getTime() - 3600000).toISOString();
    const n = (this.ctx.db.prepare('SELECT COUNT(*) n FROM automation_runs WHERE automation_id = ? AND contact_id = ? AND started_at >= ?').get(automationId, contactId, since) as { n: number }).n;
    return n >= max;
  }

  private next(a: Automation, key: string, handle: 'next' | 'true' | 'false'): string | null {
    const node = a.nodes.find((n) => n.id === key);
    const e = a.edges.find((x) => x.source === key && (node?.type === 'condition' ? (x.sourceHandle ?? 'true') === handle : true));
    return e?.target ?? null;
  }

  private async continueRun(a: Automation, runId: number, startKey: string | null) {
    const run = this.ctx.db.prepare('SELECT * FROM automation_runs WHERE id = ?').get(runId) as RunRow;
    const ctxData = json<{ text: string; isNewContact: boolean }>(run.context, { text: '', isNewContact: false });
    let key = startKey;
    let steps = 0;
    try {
      while (key) {
        if (++steps > MAX_STEPS) throw new Error('Demasiados pasos en una ejecución');
        const node = a.nodes.find((n) => n.id === key);
        if (!node) break;
        this.ctx.db.prepare('UPDATE automation_runs SET current_node_key = ? WHERE id = ?').run(key, runId);
        if (node.type === 'condition') {
          const ok = this.evaluateConditions(run.account_id, run.contact_id!, node, ctxData);
          this.logRun(runId, node.id, 'info', `${CONDITIONS[node.subtype as keyof typeof CONDITIONS].label}: ${ok ? 'Sí' : 'No'}`);
          key = this.next(a, node.id, ok ? 'true' : 'false');
          continue;
        }
        if (node.type === 'action') {
          if (node.subtype === 'stop') {
            this.logRun(runId, node.id, 'info', 'Automatización detenida por el nodo "Detener"');
            break;
          }
          const nextKey = this.next(a, node.id, 'next');
          if (node.subtype === 'wait') {
            this.scheduleAction(runId, node, nextKey);
            return;
          }
          await this.executeAction(run, node);
          key = nextKey;
          continue;
        }
        key = this.next(a, node.id, 'next');
      }
      this.ctx.db.prepare("UPDATE automation_runs SET status = 'completed', finished_at = ?, current_node_key = NULL WHERE id = ?").run(this.ctx.clock.now().toISOString(), runId);
    } catch (e: any) {
      const msg = e?.userMessage ?? e?.message ?? String(e);
      this.ctx.db.prepare("UPDATE automation_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(msg, this.ctx.clock.now().toISOString(), runId);
      this.logRun(runId, key, 'error', `Error: ${msg}`);
      this.ctx.bus.emit('automation.failed', { accountId: run.account_id, automationId: a.id, name: a.name, error: msg });
    }
  }

  private waitMs(c: { amount: number; unit: string }) {
    const mult = c.unit === 'days' ? 86400000 : c.unit === 'hours' ? 3600000 : 60000;
    return Number(c.amount) * mult;
  }

  /** Programa la continuación de una ejecución (nodo "Esperar"). Persiste: sobrevive a reinicios. */
  scheduleAction(runId: number, node: AutomationNode, nextKey: string | null) {
    const at = new Date(this.ctx.clock.now().getTime() + this.waitMs(node.config as any));
    if (!nextKey) {
      this.ctx.db.prepare("UPDATE automation_runs SET status = 'completed', finished_at = ? WHERE id = ?").run(this.ctx.clock.now().toISOString(), runId);
      return;
    }
    this.ctx.db.prepare("UPDATE automation_runs SET status = 'waiting', resume_at = ?, current_node_key = ? WHERE id = ?").run(at.toISOString(), nextKey, runId);
    this.logRun(runId, node.id, 'info', `En espera hasta ${at.toISOString()}`);
  }

  /** Reanuda ejecuciones cuya espera venció. Llamado por el Scheduler. */
  async resumeDue(): Promise<number> {
    const rows = this.ctx.db.prepare("SELECT * FROM automation_runs WHERE status = 'waiting' AND resume_at <= ? ORDER BY resume_at LIMIT 100").all(this.ctx.clock.now().toISOString()) as RunRow[];
    for (const r of rows) {
      const claimed = this.ctx.db.prepare("UPDATE automation_runs SET status = 'running', resume_at = NULL WHERE id = ? AND status = 'waiting'").run(r.id).changes;
      if (!claimed) continue;
      const row = this.ctx.db.prepare('SELECT * FROM automations WHERE id = ?').get(r.automation_id) as any;
      if (!row || !row.enabled) {
        this.ctx.db.prepare("UPDATE automation_runs SET status = 'cancelled', finished_at = ? WHERE id = ?").run(this.ctx.clock.now().toISOString(), r.id);
        this.logRun(r.id, null, 'warn', 'Cancelada: la automatización fue desactivada durante la espera');
        continue;
      }
      this.logRun(r.id, r.current_node_key, 'info', 'Reanudada tras la espera');
      await this.continueRun(this.load(row), r.id, r.current_node_key);
    }
    return rows.length;
  }

  evaluateConditions(accountId: number, contactId: number, node: AutomationNode, data: { text: string; isNewContact: boolean }): boolean {
    const c = node.config ?? {};
    const text = normalizeText(data.text);
    const bh = this.d.settings.get('businessHours', accountId);
    const local = DateTime.fromJSDate(this.ctx.clock.now(), { zone: bh.timezone || 'UTC' });
    switch (node.subtype) {
      case 'message_contains': {
        const kws = (c.keywords as string[]).map(normalizeText).filter(Boolean);
        const hit = (k: string) => (c.wholeWord ? new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text) : text.includes(k));
        return c.mode === 'all' ? kws.every(hit) : kws.some(hit);
      }
      case 'message_starts_with':
        return text.startsWith(normalizeText(c.text));
      case 'message_ends_with':
        return text.endsWith(normalizeText(c.text));
      case 'message_equals':
        return text === normalizeText(c.text);
      case 'has_tag':
        return this.d.tags.contactHasTag(contactId, Number(c.tagId));
      case 'not_has_tag':
        return !this.d.tags.contactHasTag(contactId, Number(c.tagId));
      case 'phone_matches': {
        const phone = this.d.contacts.get(accountId, contactId).phone;
        const digits = String(c.value).replace(/\D/g, '');
        return c.mode === 'contains' ? phone.includes(digits) : phone.startsWith(digits);
      }
      case 'business_hours':
        return this.d.compliance.isWithinBusinessHours(accountId) === (c.inside !== false);
      case 'day_of_week':
        return (c.days as number[]).map(Number).includes(local.weekday);
      case 'time_range': {
        const hm = local.toFormat('HH:mm');
        return c.from <= c.to ? hm >= c.from && hm < c.to : hm >= c.from || hm < c.to;
      }
      case 'custom_field': {
        const v = this.d.fields.valuesFor(contactId)[c.fieldKey] ?? '';
        const val = String(c.value ?? '');
        switch (c.op ?? 'equals') {
          case 'equals':
            return normalizeText(v) === normalizeText(val);
          case 'not_equals':
            return normalizeText(v) !== normalizeText(val);
          case 'contains':
            return normalizeText(v).includes(normalizeText(val));
          case 'is_empty':
            return !v;
          case 'not_empty':
            return !!v;
          case 'gt':
            return Number(v) > Number(val);
          case 'lt':
            return Number(v) < Number(val);
          default:
            return false;
        }
      }
      case 'contact_status': {
        const ct = this.d.contacts.get(accountId, contactId);
        if (c.field === 'consent_status') return ct.consent_status === c.value;
        if (c.field === 'blacklisted') return !!ct.blacklisted === (c.value === true || c.value === 'true');
        if (c.field === 'pipeline_stage') return ct.stage?.stage_id === Number(c.value);
        if (c.field === 'assigned') return c.value === 'unassigned' ? !ct.assigned_to : Number(c.value) === ct.assigned_to;
        return ct.status === c.value;
      }
      case 'is_new_contact':
        return data.isNewContact;
      default:
        return false;
    }
  }

  async executeAction(run: RunRow, node: AutomationNode): Promise<void> {
    const c = node.config ?? {};
    const accountId = run.account_id;
    const contactId = run.contact_id!;
    const contact = this.d.contacts.get(accountId, contactId);
    const label = ACTIONS[node.subtype as keyof typeof ACTIONS].label;
    const canMessage = (): string | null => {
      if (contact.consent_status === 'opted_out') return 'el contacto pidió no recibir mensajes';
      if (contact.blacklisted) return 'contacto en lista negra';
      if (this.d.tags.contactHasTag(contactId, this.d.tags.noContactTagId(accountId))) return 'etiqueta "No contactar"';
      if (this.d.conversations.isBotPaused(accountId, contactId)) return 'modo humano activo';
      if (!this.d.messaging.windowOpen(contact, this.d.windowHours(accountId))) return 'fuera de la ventana de 24 h de WhatsApp';
      return null;
    };
    switch (node.subtype) {
      case 'send_message':
      case 'send_media': {
        const why = canMessage();
        if (why) {
          this.logRun(run.id, node.id, 'warn', `${label}: omitido (${why})`);
          return;
        }
        const raw = node.subtype === 'send_message' ? c.text : c.caption ?? '';
        const text = raw ? this.d.messaging.renderFor(accountId, contact, raw).text : null;
        const r = this.d.messaging.enqueue({
          accountId,
          contactId,
          kind: node.subtype === 'send_media' ? 'media' : 'text',
          text,
          mediaId: node.subtype === 'send_media' ? Number(c.mediaId) : null,
          source: 'automation',
          idempotencyKey: `auto:${run.id}:${node.id}`,
          automationRunId: run.id,
          priority: 5,
        });
        this.logRun(run.id, node.id, 'info', `${label}: ${r.duplicate ? 'ya estaba en cola' : 'en cola'} (mensaje ${r.messageId})`);
        return;
      }
      case 'add_tag':
        this.d.tags.assign(accountId, [contactId], Number(c.tagId), { automationDepth: run.depth + 1, source: 'automation' });
        this.logRun(run.id, node.id, 'info', `${label}: ${this.d.tags.get(accountId, Number(c.tagId)).name}`);
        return;
      case 'remove_tag':
        this.d.tags.unassign(accountId, [contactId], Number(c.tagId), { automationDepth: run.depth + 1, source: 'automation' });
        this.logRun(run.id, node.id, 'info', `${label}: ${this.d.tags.get(accountId, Number(c.tagId)).name}`);
        return;
      case 'add_note': {
        this.d.contacts.addNote(accountId, contactId, this.d.messaging.renderFor(accountId, contact, c.text).text);
        this.logRun(run.id, node.id, 'info', label);
        return;
      }
      case 'assign':
        this.d.contacts.assign(accountId, [contactId], c.userId ? Number(c.userId) : null);
        this.logRun(run.id, node.id, 'info', `${label}: ${c.userId ? 'usuario ' + c.userId : 'sin asignar'}`);
        return;
      case 'run_automation': {
        const target = Number(c.automationId);
        const ta = this.ctx.db.prepare('SELECT trigger_type, enabled FROM automations WHERE id = ? AND account_id = ?').get(target, accountId) as { trigger_type: TriggerType; enabled: number } | undefined;
        if (!ta) throw new Error('La automatización destino no existe');
        if (!ta.enabled) {
          this.logRun(run.id, node.id, 'warn', `${label}: la automatización destino está desactivada`);
          return;
        }
        const ev = json<TriggerEvent>(run.trigger_event, { type: ta.trigger_type, accountId, contactId });
        const ids = await this.trigger({ ...ev, type: ta.trigger_type, depth: run.depth + 1 }, target);
        this.logRun(run.id, node.id, 'info', `${label}: ${ids.length ? 'ejecución ' + ids.join(',') : 'no se ejecutó (límite de encadenamiento)'}`);
        return;
      }
      case 'create_task': {
        const due = c.dueInHours ? new Date(this.ctx.clock.now().getTime() + Number(c.dueInHours) * 3600000).toISOString() : null;
        const id = this.d.tasks.create(accountId, { title: this.d.messaging.renderFor(accountId, contact, c.title).text, description: c.description ?? null, contact_id: contactId, due_at: due, assigned_to: c.assignTo ? Number(c.assignTo) : contact.assigned_to, source: 'automation' });
        this.logRun(run.id, node.id, 'info', `${label}: tarea ${id}`);
        return;
      }
      case 'set_stage':
        this.d.tasks.setStage(accountId, contactId, Number(c.stageId));
        this.logRun(run.id, node.id, 'info', label);
        return;
      case 'ai_reply': {
        const why = canMessage();
        if (why) {
          this.logRun(run.id, node.id, 'warn', `${label}: omitido (${why})`);
          return;
        }
        if (!this.d.aiReply) throw new Error('El módulo de IA no está configurado');
        const r = await this.d.aiReply(accountId, contactId, c.assistantId ? Number(c.assistantId) : null, run.id);
        this.logRun(run.id, node.id, 'info', `${label}: ${r}`);
        return;
      }
      default:
        throw new Error(`Acción no soportada: ${node.subtype}`);
    }
  }

  // ---------------- Triggers temporales ----------------
  /** Disparadores "Horario determinado" y "Evento programado (fecha)". Llamado cada minuto. */
  async processTimeTriggers(): Promise<number> {
    const rows = this.ctx.db.prepare("SELECT * FROM automations WHERE enabled = 1 AND trigger_type IN ('schedule','date_field')").all() as any[];
    let fired = 0;
    for (const row of rows) {
      const a = this.load(row);
      const trig = a.nodes.find((n) => n.type === 'trigger')!;
      const c = trig.config;
      const tz = this.d.settings.get('businessHours', a.account_id).timezone || this.d.settings.get('general').timezone;
      const local = DateTime.fromJSDate(this.ctx.clock.now(), { zone: tz });
      const [hh, mm] = String(c.time).split(':').map(Number);
      const slotTime = local.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
      const slot = `${local.toISODate()} ${c.time}`;
      if (local < slotTime || local.diff(slotTime, 'minutes').minutes > 60) continue; // ventana de 1 h, sin acumular perdidos
      if (row.last_fired_slot === slot) continue;
      if (trig.subtype === 'schedule' && !(c.days as number[]).map(Number).includes(local.weekday)) continue;
      this.ctx.db.prepare('UPDATE automations SET last_fired_slot = ? WHERE id = ?').run(slot, a.id);
      let contactIds: number[] = [];
      if (trig.subtype === 'schedule') {
        contactIds = c.segmentId ? this.d.segments.contactIds(a.account_id, this.d.segments.get(a.account_id, Number(c.segmentId)).definition) : this.d.contacts.ids(a.account_id, { tagIds: [Number(c.tagId)] });
      } else {
        const target = local.minus({ days: Number(c.offsetDays ?? 0) });
        const md = target.toFormat('MM-dd');
        const full = target.toISODate();
        const rowsF = this.ctx.db
          .prepare(`SELECT v.contact_id, v.value FROM contact_custom_fields v JOIN custom_fields f ON f.id = v.field_id JOIN contacts ct ON ct.id = v.contact_id
                    WHERE f.account_id = ? AND f.key = ? AND ct.status = 'active'`)
          .all(a.account_id, c.fieldKey) as { contact_id: number; value: string }[];
        contactIds = rowsF.filter((r) => (c.yearly ? String(r.value).slice(5, 10) === md : String(r.value).slice(0, 10) === full)).map((r) => r.contact_id);
      }
      const limit = Math.min(Number(c.limit) || 500, 5000);
      for (const cid of contactIds.slice(0, limit)) {
        const ids = await this.trigger({ type: trig.subtype as TriggerType, accountId: a.account_id, contactId: cid }, a.id);
        fired += ids.length;
      }
      this.ctx.log.info('automation', `Automatización ${a.id} (${trig.subtype}) disparada para ${Math.min(contactIds.length, limit)} contacto(s)`);
    }
    return fired;
  }
}

import { DateTime } from 'luxon';
import type { Ctx } from '../context';
import type { SettingsService } from './settings';
import { nextOccurrence } from '../campaigns/recurrence';
import { json } from '../db/database';

export class StatsService {
  constructor(private ctx: Ctx, private settings: SettingsService) {}

  private offsetMinutes(): number {
    const tz = this.settings.get('general').timezone;
    return DateTime.now().setZone(tz).offset;
  }

  private q<T = number>(sql: string, ...p: unknown[]): T {
    return (this.ctx.db.prepare(sql).get(...p) as any).n as T;
  }

  dashboard(accountId: number, days = 30) {
    const now = this.ctx.clock.now();
    const from = new Date(now.getTime() - days * 86400000).toISOString();
    const sentStatuses = "('sent','delivered','read')";
    const sent = this.q(`SELECT COUNT(*) n FROM messages WHERE account_id = ? AND direction = 'out' AND status IN ${sentStatuses} AND sent_at >= ?`, accountId, from);
    const delivered = this.q(`SELECT COUNT(*) n FROM messages WHERE account_id = ? AND direction = 'out' AND status IN ('delivered','read') AND sent_at >= ?`, accountId, from);
    const read = this.q(`SELECT COUNT(*) n FROM messages WHERE account_id = ? AND direction = 'out' AND status = 'read' AND sent_at >= ?`, accountId, from);
    const failed = this.q(`SELECT COUNT(*) n FROM messages WHERE account_id = ? AND direction = 'out' AND status = 'failed' AND created_at >= ?`, accountId, from);
    const received = this.q(`SELECT COUNT(*) n FROM messages WHERE account_id = ? AND direction = 'in' AND created_at >= ?`, accountId, from);
    const messaged = this.q(`SELECT COUNT(DISTINCT contact_id) n FROM messages WHERE account_id = ? AND direction = 'out' AND status IN ${sentStatuses} AND sent_at >= ?`, accountId, from);
    const replied = this.q(
      `SELECT COUNT(DISTINCT o.contact_id) n FROM messages o WHERE o.account_id = ? AND o.direction = 'out' AND o.status IN ${sentStatuses} AND o.sent_at >= ?
       AND EXISTS (SELECT 1 FROM messages i WHERE i.contact_id = o.contact_id AND i.direction = 'in' AND i.created_at > o.sent_at)`,
      accountId,
      from,
    );
    return {
      periodDays: days,
      contacts: this.q("SELECT COUNT(*) n FROM contacts WHERE account_id = ? AND status = 'active'", accountId),
      newContacts: this.q('SELECT COUNT(*) n FROM contacts WHERE account_id = ? AND created_at >= ?', accountId, from),
      conversations: this.q('SELECT COUNT(*) n FROM conversations WHERE account_id = ? AND last_message_at IS NOT NULL', accountId),
      openConversations: this.q("SELECT COUNT(*) n FROM conversations WHERE account_id = ? AND awaiting_reply = 1 AND status = 'open'", accountId),
      unread: this.q('SELECT COALESCE(SUM(unread_count),0) n FROM conversations WHERE account_id = ?', accountId),
      sent,
      delivered,
      read,
      failed,
      received,
      repliedContacts: replied,
      messagedContacts: messaged,
      responseRate: messaged ? replied / messaged : 0,
      deliveryRate: sent ? delivered / sent : 0,
      readRate: sent ? read / sent : 0,
      campaigns: this.q('SELECT COUNT(*) n FROM campaigns WHERE account_id = ?', accountId),
      campaignsScheduled: this.q("SELECT COUNT(*) n FROM campaigns WHERE account_id = ? AND status = 'scheduled'", accountId),
      campaignsRunning: this.q("SELECT COUNT(*) n FROM campaigns WHERE account_id = ? AND status IN ('running','paused')", accountId),
      automationsActive: this.q('SELECT COUNT(*) n FROM automations WHERE account_id = ? AND enabled = 1', accountId),
      automationRuns: this.q('SELECT COUNT(*) n FROM automation_runs WHERE account_id = ? AND started_at >= ?', accountId, from),
      tasksPending: this.q("SELECT COUNT(*) n FROM tasks WHERE account_id = ? AND status = 'pending'", accountId),
      tasksOverdue: this.q("SELECT COUNT(*) n FROM tasks WHERE account_id = ? AND status = 'pending' AND due_at < ?", accountId, now.toISOString()),
      optedOut: this.q("SELECT COUNT(*) n FROM contacts WHERE account_id = ? AND consent_status = 'opted_out'", accountId),
    };
  }

  series(accountId: number, days = 30) {
    const off = this.offsetMinutes();
    const from = new Date(this.ctx.clock.now().getTime() - days * 86400000).toISOString();
    const rows = this.ctx.db
      .prepare(`SELECT date(created_at, '${off} minutes') d,
          SUM(CASE WHEN direction = 'out' AND status IN ('sent','delivered','read') THEN 1 ELSE 0 END) sent,
          SUM(CASE WHEN direction = 'out' AND status IN ('delivered','read') THEN 1 ELSE 0 END) delivered,
          SUM(CASE WHEN direction = 'out' AND status = 'read' THEN 1 ELSE 0 END) read,
          SUM(CASE WHEN direction = 'out' AND status = 'failed' THEN 1 ELSE 0 END) failed,
          SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) received
        FROM messages WHERE account_id = ? AND created_at >= ? GROUP BY d ORDER BY d`)
      .all(accountId, from) as any[];
    const contacts = this.ctx.db.prepare(`SELECT date(created_at, '${off} minutes') d, COUNT(*) n FROM contacts WHERE account_id = ? AND created_at >= ? GROUP BY d`).all(accountId, from) as { d: string; n: number }[];
    const byDay = new Map(rows.map((r) => [r.d, r]));
    const cByDay = new Map(contacts.map((r) => [r.d, r.n]));
    const out = [];
    const tz = this.settings.get('general').timezone;
    for (let i = days - 1; i >= 0; i--) {
      const d = DateTime.fromJSDate(this.ctx.clock.now(), { zone: tz }).minus({ days: i }).toISODate()!;
      const r = byDay.get(d) ?? {};
      out.push({ date: d, sent: r.sent ?? 0, delivered: r.delivered ?? 0, read: r.read ?? 0, failed: r.failed ?? 0, received: r.received ?? 0, newContacts: cByDay.get(d) ?? 0 });
    }
    return out;
  }

  tagDistribution(accountId: number) {
    return this.ctx.db
      .prepare(`SELECT t.name, t.color, COUNT(ct.contact_id) n FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id = t.id WHERE t.account_id = ? GROUP BY t.id ORDER BY n DESC LIMIT 12`)
      .all(accountId);
  }

  campaignTable(accountId: number) {
    const rows = this.ctx.db.prepare("SELECT id, name, status, started_at FROM campaigns WHERE account_id = ? AND status != 'draft' ORDER BY id DESC LIMIT 50").all(accountId) as any[];
    return rows.map((c) => {
      const s = this.ctx.db
        .prepare(`SELECT COUNT(*) total,
            SUM(status IN ('sent','delivered','read')) sent, SUM(status IN ('delivered','read')) delivered, SUM(status = 'read') read,
            SUM(status = 'failed') failed, SUM(status = 'cancelled') cancelled, SUM(status = 'skipped') skipped, SUM(replied_at IS NOT NULL) replied
           FROM campaign_recipients WHERE campaign_id = ?`)
        .get(c.id) as any;
      return { ...c, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? 0])) };
    });
  }

  automationTable(accountId: number) {
    return this.ctx.db
      .prepare(`SELECT a.id, a.name, a.enabled, a.trigger_type, a.run_count,
          (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id AND r.status = 'failed') failed,
          (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id AND r.status = 'waiting') waiting, a.last_run_at
        FROM automations a WHERE a.account_id = ? ORDER BY a.run_count DESC`)
      .all(accountId);
  }

  /** Eventos del calendario: campañas (incluye próximas ocurrencias recurrentes), mensajes programados y tareas. */
  calendar(accountId: number, fromIso: string, toIso: string) {
    const events: any[] = [];
    const camps = this.ctx.db.prepare("SELECT * FROM campaigns WHERE account_id = ? AND status != 'draft' OR (account_id = ? AND status = 'draft' AND scheduled_at IS NOT NULL)").all(accountId, accountId) as any[];
    const from = new Date(fromIso);
    const to = new Date(toIso);
    for (const c of camps) {
      const rec = json<any>(c.recurrence, null);
      const runs = this.ctx.db.prepare('SELECT run_number, started_at, status FROM campaign_runs WHERE campaign_id = ? AND started_at >= ? AND started_at < ?').all(c.id, fromIso, toIso) as any[];
      for (const r of runs) events.push({ id: `camp-${c.id}-run-${r.run_number}`, kind: 'campaign', refId: c.id, title: c.name, start: r.started_at, status: r.status === 'running' ? c.status : 'completed', draggable: false });
      if (['scheduled', 'draft', 'paused'].includes(c.status)) {
        if (rec && c.status !== 'draft') {
          let after = new Date(Math.max(from.getTime(), this.ctx.clock.now().getTime()) - 1);
          let n = c.run_count;
          const startAt = new Date(c.scheduled_at);
          let first = true;
          for (let i = 0; i < 62; i++) {
            const occ = nextOccurrence(rec, c.timezone, startAt, after, n);
            if (!occ || occ >= to) break;
            events.push({ id: `camp-${c.id}-occ-${occ.getTime()}`, kind: 'campaign', refId: c.id, title: c.name + ' ↻', start: occ.toISOString(), status: c.status, draggable: first && c.status === 'scheduled' && !!c.next_run_at && occ.toISOString() === c.next_run_at, recurring: true });
            first = false;
            after = occ;
            n++;
          }
        } else {
          const at = c.next_run_at ?? c.scheduled_at;
          if (at && at >= fromIso && at < toIso) events.push({ id: `camp-${c.id}`, kind: 'campaign', refId: c.id, title: c.name, start: at, status: c.status, draggable: c.status === 'scheduled' || c.status === 'draft' });
        }
      }
    }
    const sched = this.ctx.db
      .prepare(`SELECT s.id, s.scheduled_at, s.status, s.body, c.name, c.phone FROM scheduled_messages s JOIN contacts c ON c.id = s.contact_id WHERE s.account_id = ? AND s.scheduled_at >= ? AND s.scheduled_at < ? AND s.status != 'cancelled'`)
      .all(accountId, fromIso, toIso) as any[];
    for (const s of sched) events.push({ id: `sched-${s.id}`, kind: 'scheduled_message', refId: s.id, title: `Mensaje a ${s.name ?? '+' + s.phone}`, start: s.scheduled_at, status: s.status, draggable: s.status === 'scheduled', detail: s.body });
    const tasks = this.ctx.db
      .prepare(`SELECT t.id, t.title, t.due_at, t.status, c.name FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id WHERE t.account_id = ? AND t.due_at >= ? AND t.due_at < ? AND t.status != 'cancelled'`)
      .all(accountId, fromIso, toIso) as any[];
    for (const t of tasks) events.push({ id: `task-${t.id}`, kind: 'task', refId: t.id, title: t.title + (t.name ? ` · ${t.name}` : ''), start: t.due_at, status: t.status, draggable: t.status === 'pending' });
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
}

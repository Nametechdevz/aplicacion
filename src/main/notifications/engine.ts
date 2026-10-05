import type { Ctx } from '../context';
import type { SettingsService } from '../services/settings';

export type NotifyFn = (n: { title: string; body: string; kind: string; route?: string; silent?: boolean }) => void;

/** Traduce eventos internos a notificaciones de escritorio, según las preferencias del usuario. */
export class NotificationEngine {
  private lastMsgNotify = new Map<number, number>();
  constructor(private ctx: Ctx, private settings: SettingsService, private show: NotifyFn, private isFocused: () => boolean = () => false) {}

  register() {
    const bus = this.ctx.bus;
    const s = () => this.settings.get('notifications');
    bus.on('message.received', (e) => {
      if (!s().newMessage || this.isFocused()) return;
      const now = Date.now();
      if (now - (this.lastMsgNotify.get(e.conversationId) ?? 0) < 15000) return; // agrupa ráfagas
      this.lastMsgNotify.set(e.conversationId, now);
      const c = this.ctx.db.prepare('SELECT name, phone FROM contacts WHERE id = ?').get(e.contactId) as { name: string | null; phone: string } | undefined;
      this.show({ title: c?.name || '+' + c?.phone, body: e.text ? e.text.slice(0, 140) : 'Nuevo mensaje', kind: 'message', route: `/inbox/${e.conversationId}`, silent: !s().sound });
    });
    bus.on('campaign.finished', (e) => {
      if (e.status === 'failed') {
        if (s().campaignFailed) this.show({ title: 'Campaña fallida', body: `"${e.name}": no se pudo enviar ningún mensaje.`, kind: 'error', route: `/campaigns/${e.campaignId}` });
      } else if (s().campaignFinished) this.show({ title: 'Campaña terminada', body: `"${e.name}": ${e.sent} enviados${e.failed ? `, ${e.failed} fallidos` : ''}.`, kind: 'success', route: `/campaigns/${e.campaignId}` });
    });
    bus.on('account.status', (e) => {
      if (!s().disconnected) return;
      if ((e.status === 'disconnected' || e.status === 'error') && e.previous === 'connected') {
        this.show({ title: '🔴 WhatsApp desconectado', body: (e.detail ? e.detail + ' ' : '') + 'Las campañas en curso se pausaron.', kind: 'error', route: '/settings/whatsapp' });
      } else if (e.status === 'connected' && (e.previous === 'disconnected' || e.previous === 'error' || e.previous === 'connecting')) {
        const paused = (this.ctx.db.prepare("SELECT COUNT(*) n FROM campaigns WHERE account_id = ? AND status = 'paused' AND pause_reason IN ('disconnected','disconnected_at_schedule')").get(e.accountId) as { n: number }).n;
        if (paused) this.show({ title: '🟢 Conexión restaurada', body: `${paused} campaña(s) en pausa pueden reanudarse.`, kind: 'success', route: '/campaigns' });
      }
    });
    bus.on('automation.failed', (e) => {
      if (s().automationFailed) this.show({ title: 'Automatización con error', body: `"${e.name}": ${e.error}`, kind: 'error', route: `/automations/${e.automationId}` });
    });
    bus.on('notify', (n) => {
      if (n.kind === 'task' && !s().taskDue) return;
      this.show({ title: n.title, body: n.body, kind: n.kind, route: n.route });
    });
  }
}

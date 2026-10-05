import { EventEmitter } from 'node:events';

/** Eventos internos entre motores. Los handlers nunca deben romper al emisor. */
export interface BusEvents {
  'message.received': { accountId: number; contactId: number; conversationId: number; messageId: number; text: string; type: string; isNewContact: boolean; wasAwaitingReply: boolean };
  'message.sent': { accountId: number; contactId: number; messageId: number; source: string; campaignId?: number | null; queueId?: number; automationDepth?: number };
  'message.failed': { accountId: number; contactId: number; messageId: number | null; campaignId?: number | null; queueId: number; reason: string };
  'message.status': { accountId: number; messageId: number; status: string; conversationId: number; campaignId?: number | null };
  'queue.finished': { accountId: number; queueId: number; campaignId: number | null; runId: number | null; status: string };
  'contact.created': { accountId: number; contactId: number; source: string };
  'contact.updated': { accountId: number; contactId: number };
  'tag.added': { accountId: number; contactId: number; tagId: number; automationDepth?: number };
  'tag.removed': { accountId: number; contactId: number; tagId: number; automationDepth?: number };
  'contact.opted_out': { accountId: number; contactId: number };
  'account.status': { accountId: number; status: string; previous: string; detail?: string | null };
  'campaign.updated': { accountId: number; campaignId: number; status: string };
  'campaign.progress': { accountId: number; campaignId: number };
  'campaign.finished': { accountId: number; campaignId: number; name: string; status: string; failed: number; sent: number };
  'automation.failed': { accountId: number; automationId: number; name: string; error: string };
  'automation.run': { accountId: number; automationId: number };
  'task.created': { accountId: number; taskId: number };
  'conversation.updated': { accountId: number; conversationId: number };
  'notify': { title: string; body: string; kind: string; accountId?: number; route?: string };
}

type Handler<T> = (payload: T) => void | Promise<void>;

export class EventBus {
  private emitter = new EventEmitter();
  private errorHandler: (event: string, err: unknown) => void = () => {};
  private pending = new Set<Promise<unknown>>();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  onError(fn: (event: string, err: unknown) => void) {
    this.errorHandler = fn;
  }

  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>) {
    const wrapped = (payload: BusEvents[K]) => {
      try {
        const r = handler(payload);
        if (r && typeof (r as Promise<void>).then === 'function') {
          const p = (r as Promise<void>).catch((e) => this.errorHandler(event, e));
          this.pending.add(p);
          p.finally(() => this.pending.delete(p));
        }
      } catch (e) {
        this.errorHandler(event, e);
      }
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  /** Escucha todos los eventos (para reenviarlos a la UI). */
  onAny(fn: (event: string, payload: unknown) => void) {
    const orig = this.emitter.emit.bind(this.emitter);
    this.emitter.emit = ((event: string, ...args: unknown[]) => {
      try {
        fn(event, args[0]);
      } catch {
        /* ignore */
      }
      return orig(event, ...args);
    }) as typeof this.emitter.emit;
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]) {
    this.emitter.emit(event, payload);
  }

  /** Espera a que terminen los handlers asíncronos en curso (útil en pruebas y al cerrar). */
  async drain(maxRounds = 20) {
    for (let i = 0; i < maxRounds && this.pending.size; i++) await Promise.allSettled([...this.pending]);
  }
}

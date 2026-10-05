import type { Ctx } from '../context';

export interface SchedulerJobs {
  campaignsDue(): number;
  scheduledMessagesDue(): number;
  automationWaits(): Promise<number>;
  automationTimeTriggers(): Promise<number>;
  tasksDue(): void;
  autoBackup(): Promise<unknown>;
}

/**
 * Planificador persistente. No guarda estado en memoria: en cada ciclo consulta la base de datos,
 * por lo que tras cerrar y volver a abrir la aplicación retoma exactamente lo pendiente.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private lastMinute = '';
  lastTickAt: string | null = null;

  constructor(private ctx: Ctx, private jobs: SchedulerJobs) {}

  start(intervalMs = 10000) {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safe<T>(name: string, fn: () => T | Promise<T>) {
    try {
      return await fn();
    } catch (e) {
      this.ctx.log.error('application', `Error en tarea programada "${name}"`, e);
      return undefined;
    }
  }

  private current: Promise<void> | null = null;

  /** Ejecuta un ciclo. Si ya hay uno en curso, espera a que termine y ejecuta otro (nunca en paralelo). */
  async tick(): Promise<void> {
    while (this.current) await this.current;
    this.current = this.run();
    try {
      await this.current;
    } finally {
      this.current = null;
    }
  }

  private async run() {
    this.lastTickAt = this.ctx.clock.now().toISOString();
    await this.safe('campañas', () => this.jobs.campaignsDue());
    await this.safe('mensajes programados', () => this.jobs.scheduledMessagesDue());
    await this.safe('esperas de automatización', () => this.jobs.automationWaits());
    const minute = this.lastTickAt.slice(0, 16);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      await this.safe('disparadores horarios', () => this.jobs.automationTimeTriggers());
      await this.safe('tareas vencidas', () => this.jobs.tasksDue());
      await this.safe('backup automático', () => this.jobs.autoBackup());
    }
  }
}

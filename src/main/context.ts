import type { DB } from './db/database';
import type { EventBus } from './core/event-bus';
import type { Logger } from './core/logger';
import type { Clock } from './core/clock';
import type { SecretBox } from './core/crypto';

export interface AppPaths {
  userData: string;
  media: string;
  backups: string;
  logs: string;
  temp: string;
}

/** Dependencias base compartidas por todos los servicios. */
export interface Ctx {
  db: DB;
  bus: EventBus;
  log: Logger;
  clock: Clock;
  secrets: SecretBox;
  paths: AppPaths;
}

export const nowIso = (ctx: Ctx) => ctx.clock.now().toISOString();

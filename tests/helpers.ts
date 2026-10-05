import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp, type App } from '../src/main/app-context';
import { ManualClock } from '../src/main/core/clock';
import { createSecretBox } from '../src/main/core/crypto';
import { SimulatorProvider } from '../src/main/whatsapp/simulator';
import type { ProviderFactory } from '../src/main/whatsapp/account-manager';
import { CloudApiProvider } from '../src/main/whatsapp/cloud-api';

export interface TestEnv {
  app: App;
  clock: ManualClock;
  dir: string;
  sims: Map<number, SimulatorProvider>;
  notifications: { title: string; body: string; kind: string }[];
  reopen(): TestEnv;
  close(): Promise<void>;
}

const KEY = crypto.randomBytes(32);

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wcrm-test-'));
}

export function makeEnv(opts: { dir?: string; clock?: ManualClock; memory?: boolean; aiClientFactory?: any; cloudFetch?: typeof fetch; providerFactory?: ProviderFactory } = {}): TestEnv {
  const dir = opts.dir ?? tmpDir();
  const clock = opts.clock ?? new ManualClock(new Date('2026-10-05T15:00:00.000Z').getTime());
  const sims = new Map<number, SimulatorProvider>();
  const notifications: TestEnv['notifications'] = [];
  let counter = 0;
  const factory: ProviderFactory = ({ provider, config }) => {
    if (provider === 'cloud_api') return new CloudApiProvider(config, opts.cloudFetch ?? (async () => new Response('{}')) as any);
    const s = new SimulatorProvider({ connectDelayMs: 0, deliveredAfterMs: null, readAfterMs: null, phoneNumber: '1555000000' + counter++ });
    return s;
  };
  const app = createApp({
    userDataDir: dir,
    dbFile: opts.memory ? ':memory:' : undefined,
    clock,
    secrets: createSecretBox({ key: KEY }),
    providerFactory: (row) => {
      const p = opts.providerFactory && row.provider === 'baileys' ? opts.providerFactory(row) : factory(row);
      return p;
    },
    aiClientFactory: opts.aiClientFactory,
    aiDebounceMs: 0,
    logToFiles: false,
    notify: (n) => notifications.push(n),
  });
  // Registrar simuladores por cuenta al conectarse
  const origConnect = app.accounts.connect.bind(app.accounts);
  app.accounts.connect = async (id: number) => {
    const r = await origConnect(id);
    const p = app.accounts.getProvider(id);
    if (p instanceof SimulatorProvider) sims.set(id, p);
    return r;
  };
  const env: TestEnv = {
    app,
    clock,
    dir,
    sims,
    notifications,
    reopen() {
      return makeEnv({ ...opts, dir, clock });
    },
    async close() {
      await app.shutdown();
    },
  };
  return env;
}

/** Crea una cuenta simulador conectada y devuelve su id. */
export async function simAccount(env: TestEnv, name = 'Pruebas'): Promise<number> {
  const acc = env.app.accounts.create({ name, provider: 'simulator' });
  await env.app.accounts.connect(acc.id);
  return acc.id;
}

/** Procesa la cola hasta vaciarla, avanzando el reloj para respetar el ritmo configurado. */
export async function drainQueue(env: TestEnv, accountId: number, max = 1000) {
  let n = 0;
  for (let i = 0; i < max; i++) {
    const did = await env.app.worker.processNext(accountId);
    if (did) n++;
    const pending = (env.app.db.prepare("SELECT COUNT(*) n FROM message_queue WHERE account_id = ? AND status = 'queued' AND next_attempt_at <= ?").get(accountId, env.clock.now().toISOString()) as { n: number }).n;
    if (!pending && !did) break;
    env.clock.advance(5000);
  }
  await env.app.bus.drain();
  return n;
}

export async function settle(env: TestEnv) {
  await env.app.bus.drain();
  await new Promise((r) => setTimeout(r, 5));
  await env.app.bus.drain();
}

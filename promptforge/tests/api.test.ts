import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { specFromIdea, generateAll } from '@/lib/engine';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptforge-test-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.ALLOW_REGISTRATION = 'true';

const ORIGIN = 'http://localhost:3000';
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

let routes: {
  register: Handler;
  login: Handler;
  logout: Handler;
  prompts: { GET: Handler; POST: Handler };
  prompt: { GET: Handler; PATCH: Handler; DELETE: Handler };
  duplicate: Handler;
  versions: Handler;
  settings: { GET: Handler; PUT: Handler };
  password: Handler;
  exportLib: Handler;
  importLib: Handler;
  ai: Handler;
};
let resetRateLimits: () => void;

beforeAll(async () => {
  routes = {
    register: (await import('@/app/api/auth/register/route')).POST,
    login: (await import('@/app/api/auth/login/route')).POST,
    logout: (await import('@/app/api/auth/logout/route')).POST,
    prompts: await import('@/app/api/prompts/route'),
    prompt: await import('@/app/api/prompts/[id]/route'),
    duplicate: (await import('@/app/api/prompts/[id]/duplicate/route')).POST,
    versions: (await import('@/app/api/prompts/[id]/versions/route')).GET,
    settings: await import('@/app/api/settings/route'),
    password: (await import('@/app/api/account/password/route')).PUT,
    exportLib: (await import('@/app/api/library/export/route')).GET,
    importLib: (await import('@/app/api/library/import/route')).POST,
    ai: (await import('@/app/api/ai/improve/route')).POST,
  } as typeof routes;
  resetRateLimits = (await import('@/lib/server/rate-limit')).resetRateLimits;
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetRateLimits());

function req(url: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-forwarded-for': init.ip ?? '10.0.0.1' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.origin !== null && (init.method ?? 'GET') !== 'GET') headers.origin = init.origin ?? ORIGIN;
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`${ORIGIN}${url}`, { method: init.method ?? 'GET', headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
}
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

async function signUp(email: string, name = 'Tester') {
  const res = await routes.register(req('/api/auth/register', { method: 'POST', body: { name, email, password: 'ClaveSegura123' } }), ctx());
  expect(res.status).toBe(201);
  const set = res.headers.get('set-cookie') ?? '';
  expect(set).toMatch(/pf_session=/);
  expect(set.toLowerCase()).toContain('httponly');
  expect(set.toLowerCase()).toContain('samesite=lax');
  return set.split(';')[0];
}

function promptBody(name = 'Tienda Pulse') {
  const { spec } = specFromIdea('Quiero una tienda online de ropa deportiva con WooCommerce, pagos online e inventario');
  return { name, description: 'Desc', tags: ['ecommerce', 'Cliente-X'], activeVariant: 'master', variants: generateAll(spec), spec };
}

let alice = '';
let bob = '';

describe('autenticación', () => {
  it('registra usuarios; el primero es administrador', async () => {
    alice = await signUp('alice@example.com', 'Alice');
    bob = await signUp('bob@example.com', 'Bob');
    const { getDb } = await import('@/lib/server/db');
    const rows = getDb().prepare('SELECT email, role, password_hash FROM users ORDER BY created_at').all() as { email: string; role: string; password_hash: string }[];
    expect(rows[0].role).toBe('admin');
    expect(rows[1].role).toBe('user');
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain('ClaveSegura123');
  });

  it('rechaza emails duplicados y contraseñas débiles', async () => {
    const dup = await routes.register(req('/api/auth/register', { method: 'POST', body: { name: 'Xx', email: 'ALICE@example.com', password: 'ClaveSegura123' } }), ctx());
    expect(dup.status).toBe(409);
    const weak = await routes.register(req('/api/auth/register', { method: 'POST', body: { name: 'Xx', email: 'c@example.com', password: 'corta' } }), ctx());
    expect(weak.status).toBe(422);
  });

  it('login correcto e incorrecto (mensaje genérico)', async () => {
    const ok = await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'ClaveSegura123' } }), ctx());
    expect(ok.status).toBe(200);
    const bad = await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'mala' } }), ctx());
    const unknown = await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'nadie@example.com', password: 'mala' } }), ctx());
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await bad.json()).error).toBe((await unknown.json()).error);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    await signUp('carol@example.com');
    for (let i = 0; i < 5; i++) {
      await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'carol@example.com', password: 'mala' }, ip: `10.1.0.${i}` }), ctx());
    }
    const locked = await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'carol@example.com', password: 'ClaveSegura123' }, ip: '10.1.1.1' }), ctx());
    expect(locked.status).toBe(423);
  });

  it('aplica rate limiting al login por IP', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'x@example.com', password: 'y' }, ip: '10.9.9.9' }), ctx())).status;
    }
    expect(last).toBe(429);
  });

  it('rechaza peticiones sin Origin o de otro origen (CSRF)', async () => {
    const noOrigin = await routes.prompts.POST(req('/api/prompts', { method: 'POST', body: promptBody(), cookie: alice, origin: null }), ctx());
    expect(noOrigin.status).toBe(403);
    const evil = await routes.prompts.POST(req('/api/prompts', { method: 'POST', body: promptBody(), cookie: alice, origin: 'https://evil.example' }), ctx());
    expect(evil.status).toBe(403);
  });

  it('exige sesión en la API', async () => {
    const res = await routes.prompts.GET(req('/api/prompts'), ctx());
    expect(res.status).toBe(401);
    const forged = await routes.prompts.GET(req('/api/prompts', { cookie: 'pf_session=token-falso' }), ctx());
    expect(forged.status).toBe(401);
  });
});

describe('prompts', () => {
  let id = '';

  it('crea un prompt y calcula metadatos en el servidor', async () => {
    const res = await routes.prompts.POST(req('/api/prompts', { method: 'POST', body: { ...promptBody(), category: 'Hackeada' }, cookie: alice }), ctx());
    expect(res.status).toBe(201);
    const { prompt } = await res.json();
    id = prompt.id;
    expect(prompt.category).toBe('E-commerce');
    expect(prompt.projectType).toBe('woocommerce');
    expect(prompt.stack).toEqual(expect.arrayContaining(['WordPress', 'WooCommerce']));
    expect(prompt.qualityScore).toBeGreaterThanOrEqual(90);
    expect(prompt.tags).toEqual(['ecommerce', 'cliente-x']);
  });

  it('lista, busca y filtra', async () => {
    const all = await (await routes.prompts.GET(req('/api/prompts', { cookie: alice }), ctx())).json();
    expect(all.prompts).toHaveLength(1);
    const found = await (await routes.prompts.GET(req('/api/prompts?q=pulse', { cookie: alice }), ctx())).json();
    expect(found.prompts).toHaveLength(1);
    const none = await (await routes.prompts.GET(req('/api/prompts?category=SaaS', { cookie: alice }), ctx())).json();
    expect(none.prompts).toHaveLength(0);
    const like = await (await routes.prompts.GET(req('/api/prompts?q=%25', { cookie: alice }), ctx())).json();
    expect(like.prompts).toHaveLength(0); // el comodín % se escapa
  });

  it('aísla los datos entre usuarios', async () => {
    expect((await routes.prompt.GET(req(`/api/prompts/${id}`, { cookie: bob }), ctx({ id }))).status).toBe(404);
    expect((await routes.prompt.PATCH(req(`/api/prompts/${id}`, { method: 'PATCH', body: { name: 'pwned' }, cookie: bob }), ctx({ id }))).status).toBe(404);
    expect((await routes.prompt.DELETE(req(`/api/prompts/${id}`, { method: 'DELETE', cookie: bob }), ctx({ id }))).status).toBe(404);
    const bobList = await (await routes.prompts.GET(req('/api/prompts', { cookie: bob }), ctx())).json();
    expect(bobList.prompts).toHaveLength(0);
  });

  it('edita, guarda historial y recalcula la puntuación', async () => {
    const res = await routes.prompt.PATCH(
      req(`/api/prompts/${id}`, { method: 'PATCH', body: { variants: { master: '# Corto\n\nTexto mínimo.' }, favorite: true }, cookie: alice }),
      ctx({ id }),
    );
    const { prompt } = await res.json();
    expect(prompt.favorite).toBe(true);
    expect(prompt.qualityScore).toBeLessThan(20);
    const { versions } = await (await routes.versions(req(`/api/prompts/${id}/versions`, { cookie: alice }), ctx({ id }))).json();
    expect(versions).toHaveLength(2);
    expect(versions[0].content).toBe('# Corto\n\nTexto mínimo.');
  });

  it('valida la entrada', async () => {
    const res = await routes.prompt.PATCH(req(`/api/prompts/${id}`, { method: 'PATCH', body: { name: '' }, cookie: alice }), ctx({ id }));
    expect(res.status).toBe(422);
    const bad = await routes.prompts.POST(req('/api/prompts', { method: 'POST', body: { ...promptBody(), spec: { ...promptBody().spec, projectType: 'inexistente' } }, cookie: alice }), ctx());
    expect(bad.status).toBe(422);
  });

  it('duplica', async () => {
    const res = await routes.duplicate(req(`/api/prompts/${id}/duplicate`, { method: 'POST', body: {}, cookie: alice }), ctx({ id }));
    expect(res.status).toBe(201);
    expect((await res.json()).prompt.name).toBe('Tienda Pulse (copia)');
  });

  it('exporta e importa la biblioteca', async () => {
    const exp = await routes.exportLib(req('/api/library/export', { cookie: alice }), ctx());
    expect(exp.headers.get('content-disposition')).toMatch(/attachment/);
    const data = await exp.json();
    expect(data.prompts).toHaveLength(2);
    const imp = await routes.importLib(req('/api/library/import', { method: 'POST', body: data, cookie: bob }), ctx());
    expect((await imp.json()).imported).toBe(2);
    const bobList = await (await routes.prompts.GET(req('/api/prompts', { cookie: bob }), ctx())).json();
    expect(bobList.prompts).toHaveLength(2);
  });

  it('elimina', async () => {
    expect((await routes.prompt.DELETE(req(`/api/prompts/${id}`, { method: 'DELETE', cookie: alice }), ctx({ id }))).status).toBe(200);
    expect((await routes.prompt.GET(req(`/api/prompts/${id}`, { cookie: alice }), ctx({ id }))).status).toBe(404);
  });
});

describe('configuración y cuenta', () => {
  it('guarda y valida preferencias', async () => {
    const ok = await routes.settings.PUT(req('/api/settings', { method: 'PUT', body: { theme: 'dark', defaultVariant: 'pro' }, cookie: alice }), ctx());
    expect(ok.status).toBe(200);
    const { settings } = await (await routes.settings.GET(req('/api/settings', { cookie: alice }), ctx())).json();
    expect(settings.theme).toBe('dark');
    expect(settings.defaultVariant).toBe('pro');
    expect(settings.aiModel).toBe('claude-opus-5-5');
    const bad = await routes.settings.PUT(req('/api/settings', { method: 'PUT', body: { aiModel: 'gpt-x' }, cookie: alice }), ctx());
    expect(bad.status).toBe(422);
  });

  it('la IA responde 503 si no hay ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await routes.ai(req('/api/ai/improve', { method: 'POST', body: { text: 'x'.repeat(100) }, cookie: alice }), ctx());
    expect(res.status).toBe(503);
  });

  it('cambia la contraseña y cierra las demás sesiones', async () => {
    const second = (await routes.login(req('/api/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'ClaveSegura123' } }), ctx())).headers
      .get('set-cookie')!
      .split(';')[0];
    const wrong = await routes.password(req('/api/account/password', { method: 'PUT', body: { currentPassword: 'mala', newPassword: 'NuevaClave456' }, cookie: alice }), ctx());
    expect(wrong.status).toBe(400);
    const ok = await routes.password(req('/api/account/password', { method: 'PUT', body: { currentPassword: 'ClaveSegura123', newPassword: 'NuevaClave456' }, cookie: alice }), ctx());
    expect(ok.status).toBe(200);
    expect((await routes.prompts.GET(req('/api/prompts', { cookie: second }), ctx())).status).toBe(401);
    expect((await routes.prompts.GET(req('/api/prompts', { cookie: alice }), ctx())).status).toBe(200);
  });

  it('logout invalida la sesión', async () => {
    await routes.logout(req('/api/auth/logout', { method: 'POST', body: {}, cookie: bob }), ctx());
    expect((await routes.prompts.GET(req('/api/prompts', { cookie: bob }), ctx())).status).toBe(401);
  });
});

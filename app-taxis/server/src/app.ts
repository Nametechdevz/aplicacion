import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Config } from './config';
import { openDb } from './db';
import { HttpError, badRequest, notFound, unauthorized } from './errors';
import { createGeo, type Geo } from './geo';
import { createRealtime, type RealtimeHooks } from './realtime';
import { createRideService } from './rides';
import {
  authMiddleware,
  createUser,
  ensureAdmin,
  getUser,
  getUserByEmail,
  requireRole,
  signToken,
  toPublicUser,
  verifyPassword,
  type UserRow,
} from './users';

const latLng = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) };
const place = z.object({ ...latLng, address: z.string().trim().min(1).max(300) });
const point = z.object(latLng);

const registerSchema = z.object({
  role: z.enum(['passenger', 'driver']),
  name: z.string().trim().min(2, 'Escribe tu nombre.').max(80),
  email: z.email('Correo no válido.').max(120),
  phone: z.string().trim().min(6, 'Teléfono no válido.').max(30),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200),
  vehicle: z
    .object({
      make: z.string().trim().min(1, 'Indica la marca.').max(40),
      model: z.string().trim().min(1, 'Indica el modelo.').max(40),
      plate: z.string().trim().min(3, 'Matrícula no válida.').max(15),
      color: z.string().trim().max(30).default(''),
    })
    .optional(),
});

const tariffSchema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Moneda en formato ISO de 3 letras (USD, EUR, MXN…).'),
  baseFare: z.number().min(0).max(10000),
  perKm: z.number().min(0).max(10000),
  perMinute: z.number().min(0).max(10000),
  minimumFare: z.number().min(0).max(10000),
  surge: z.number().min(1).max(5),
});

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest(r.error.issues[0]?.message ?? 'Datos no válidos.');
  return r.data;
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
};

export function createApp(config: Config, opts: { geo?: Geo } = {}) {
  const db = openDb(config.dbPath);
  ensureAdmin(db, config.adminEmail, config.adminPassword, config.adminName);
  const geo = opts.geo ?? createGeo(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const http = createServer(app);
  const hooks: { current: RealtimeHooks | null } = { current: null };
  const rt = createRealtime(http, db, config.jwtSecret, config.corsOrigin, hooks);
  const rides = createRideService(db, config, geo, rt);
  hooks.current = {
    onDriverLocation: (id, loc, heading) => rides.onDriverLocation(id, loc, heading),
    onDriverOnline: (id, online) => {
      const u = getUser(db, id);
      if (u) rides.setDriverOnline({ id, role: 'driver', name: u.name, status: u.status }, online);
    },
  };

  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (config.corsOrigin) {
    const allowed = config.corsOrigin.split(',').map((s) => s.trim());
    app.use('/api', (req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
      }
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
      next();
    });
  }

  // Limitador simple para los intentos de inicio de sesión y registro.
  const attempts = new Map<string, { n: number; reset: number }>();
  const limitAuth = (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const a = attempts.get(key);
    if (!a || a.reset < now) attempts.set(key, { n: 1, reset: now + 15 * 60_000 });
    else if (++a.n > 30) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
    next();
  };

  const api = express.Router();
  const auth = authMiddleware(db, config.jwtSecret);
  const session = (u: UserRow) => ({ token: signToken(config.jwtSecret, u), user: toPublicUser(u) });

  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  api.post('/auth/register', limitAuth, (req, res) => {
    const body = parse(registerSchema, req.body);
    if (body.role === 'driver' && !body.vehicle) throw badRequest('Indica los datos de tu vehículo.');
    const user = createUser(db, {
      role: body.role,
      name: body.name,
      email: body.email,
      phone: body.phone,
      password: body.password,
      status: body.role === 'driver' && !config.driverAutoApprove ? 'pending' : 'active',
      vehicle: body.role === 'driver' ? body.vehicle : null,
    });
    if (user.status === 'pending') rt.io.to('role:admin').emit('admin:changed');
    res.status(201).json(session(user));
  });

  api.post('/auth/login', limitAuth, (req, res) => {
    const body = parse(z.object({ email: z.string().trim(), password: z.string() }), req.body);
    const user = getUserByEmail(db, body.email);
    if (!user || !verifyPassword(user, body.password)) throw unauthorized('Correo o contraseña incorrectos.');
    if (user.status === 'blocked') throw new HttpError(403, 'Tu cuenta está bloqueada. Contacta con el administrador.');
    res.json(session(user));
  });

  api.use(auth);

  api.get('/me', (req, res) => {
    res.json({ user: toPublicUser(getUser(db, req.user!.id)!) });
  });

  api.get('/tariff', (_req, res) => {
    res.json(rides.tariff());
  });

  // ---- Geografía (proxy con caché hacia Nominatim / OSRM) ----
  api.get('/geo/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3) return void res.json([]);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const near = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined ? { lat, lng } : undefined;
    try {
      res.json(await geo.search(q.slice(0, 200), near));
    } catch {
      throw new HttpError(502, 'El buscador de direcciones no responde. Toca el mapa para elegir el punto.');
    }
  });

  api.get('/geo/reverse', async (req, res) => {
    const p = parse(point, { lat: Number(req.query.lat), lng: Number(req.query.lng) });
    res.json({ address: await geo.reverse(p) });
  });

  api.post('/geo/route', async (req, res) => {
    const body = parse(z.object({ from: point, to: point }), req.body);
    res.json(await geo.route(body.from, body.to));
  });

  // ---- Viajes ----
  api.post('/rides/quote', requireRole('passenger'), async (req, res) => {
    const body = parse(z.object({ pickup: point, dropoff: point }), req.body);
    res.json(await rides.quote(body.pickup, body.dropoff));
  });

  api.post('/rides', requireRole('passenger'), async (req, res) => {
    const body = parse(z.object({ pickup: place, dropoff: place, paymentMethod: z.enum(['cash', 'card']) }), req.body);
    res.status(201).json(await rides.request(req.user!, body));
  });

  api.get('/rides/current', (req, res) => {
    const ride = rides.activeFor(req.user!);
    const driverLocation = ride?.driver ? (rt.drivers.get(ride.driver.id) ?? null) : null;
    res.json({ ride, driverLocation });
  });

  api.get('/rides', (req, res) => {
    res.json(rides.history(req.user!));
  });

  api.get('/rides/:id', (req, res) => {
    res.json(rides.getFor(req.user!, idParam(req)));
  });

  for (const action of ['accept', 'arrive', 'start', 'complete'] as const) {
    api.post(`/rides/:id/${action}`, requireRole('driver'), (req, res) => {
      res.json(rides.transition(req.user!, idParam(req), action));
    });
  }

  api.post('/rides/:id/cancel', (req, res) => {
    const body = parse(z.object({ reason: z.string().max(200).optional() }), req.body ?? {});
    res.json(rides.transition(req.user!, idParam(req), 'cancel', body.reason));
  });

  api.post('/rides/:id/rate', requireRole('passenger', 'driver'), (req, res) => {
    const body = parse(z.object({ stars: z.number().int().min(1).max(5) }), req.body);
    res.json(rides.rate(req.user!, idParam(req), body.stars));
  });

  // ---- Conductor ----
  api.post('/driver/online', requireRole('driver'), (req, res) => {
    const body = parse(z.object({ online: z.boolean() }), req.body);
    res.json(rides.setDriverOnline(req.user!, body.online));
  });

  api.post('/driver/location', requireRole('driver'), (req, res) => {
    const body = parse(z.object({ ...latLng, heading: z.number().nullable().optional() }), req.body);
    res.json(rides.onDriverLocation(req.user!.id, body, body.heading ?? null));
  });

  api.get('/driver/state', requireRole('driver'), (req, res) => {
    res.json({ online: rt.drivers.isOnline(req.user!.id), location: rt.drivers.get(req.user!.id) ?? null });
  });

  api.get('/driver/offers', requireRole('driver'), (req, res) => {
    res.json(rides.openOffersFor(req.user!));
  });

  api.get('/driver/earnings', requireRole('driver'), (req, res) => {
    res.json(rides.earnings(req.user!));
  });

  // ---- Administración ----
  const admin = express.Router();
  admin.use(requireRole('admin'));

  admin.get('/stats', (_req, res) => {
    res.json(rides.stats());
  });

  admin.get('/users', (req, res) => {
    const role = req.query.role ? parse(z.enum(['passenger', 'driver', 'admin']), req.query.role) : null;
    const rows = (
      role
        ? db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id DESC LIMIT 500').all(role)
        : db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 500').all()
    ) as unknown as UserRow[];
    res.json(rows.map((u) => ({ ...toPublicUser(u), online: rt.drivers.isOnline(u.id) })));
  });

  admin.patch('/users/:id', (req, res) => {
    const id = idParam(req);
    const body = parse(z.object({ status: z.enum(['active', 'pending', 'blocked']) }), req.body);
    const u = getUser(db, id);
    if (!u) throw notFound('Usuario no encontrado.');
    if (u.role === 'admin') throw badRequest('No se puede cambiar el estado de un administrador.');
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, id);
    if (body.status !== 'active' && u.role === 'driver') rt.drivers.setOnline(id, false);
    rt.emitUserChanged(id);
    if (body.status === 'blocked') rt.io.in(`user:${id}`).disconnectSockets(true);
    res.json(toPublicUser(getUser(db, id)!));
  });

  admin.get('/rides', (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    res.json(rides.adminList({ status, limit }));
  });

  admin.get('/live', (_req, res) => {
    res.json({ drivers: rt.drivers.all(), rides: rides.adminActive() });
  });

  admin.put('/tariff', (req, res) => {
    res.json(rides.setTariff(parse(tariffSchema, req.body)));
  });

  admin.post('/rides/:id/cancel', (req, res) => {
    res.json(rides.transition(req.user!, idParam(req), 'cancel', 'Cancelado por la central.'));
  });

  api.use('/admin', admin);
  api.use((_req, _res) => {
    throw notFound('Ruta no encontrada.');
  });

  app.use('/api', api);

  // ---- Cliente web (PWA) ----
  const clientDir = config.clientDir ? resolve(config.clientDir) : null;
  if (clientDir && existsSync(clientDir)) {
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders: (res, path) => {
          if (path.includes(`${'/'}assets${'/'}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(clientDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      return void res.status(400).json({ error: 'JSON no válido.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  const sweeper = setInterval(() => rides.expireStale(), 15_000);
  sweeper.unref();

  return {
    app,
    http,
    db,
    rides,
    rt,
    close: async () => {
      clearInterval(sweeper);
      rt.io.close();
      await new Promise<void>((r) => http.close(() => r()));
      db.close();
    },
  };
}

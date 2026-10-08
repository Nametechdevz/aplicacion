import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../server/src/app';
import { loadConfig } from '../server/src/config';
import { approximateRoute } from '../shared/fare';
import type { LatLng, Ride } from '../shared/types';

const fakeGeo = {
  route: async (a: LatLng, b: LatLng) => ({
    ...approximateRoute(a, b),
    geometry: [
      [a.lat, a.lng],
      [b.lat, b.lng],
    ] as [number, number][],
    approximate: true,
  }),
  search: async () => [],
  reverse: async (p: LatLng) => `${p.lat}, ${p.lng}`,
};

const PICKUP = { lat: 40.4169, lng: -3.7035, address: 'Puerta del Sol' };
const DROPOFF = { lat: 40.4531, lng: -3.6883, address: 'Estadio Bernabéu' };

let server: ReturnType<typeof createApp>;
let base: string;
const sockets: Socket[] = [];

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor<T>(s: Socket, event: string, pred: (p: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), 4000);
    const h = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(timer);
      s.off(event, h);
      resolve(p);
    };
    s.on(event, h);
  });
}

beforeAll(async () => {
  const config = {
    ...loadConfig({ JWT_SECRET: 'test-secret', ADMIN_PASSWORD: 'admin-pass-123', ADMIN_EMAIL: 'admin@test.local' }),
    dbPath: ':memory:',
    clientDir: null,
    port: 0,
  };
  server = createApp(config, { geo: fakeGeo });
  await new Promise<void>((r) => server.http.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.close();
});

describe('API de la App de Taxis', () => {
  let admin: string;
  let passenger: string;
  let driver: string;
  let driver2: string;
  let driverId: number;
  let rideId: number;

  it('valida el registro', async () => {
    const r = await call('POST', '/auth/register', undefined, { role: 'passenger', name: 'A', email: 'x', phone: '1', password: '1' });
    expect(r.status).toBe(400);
    expect(r.data.error).toBeTruthy();
  });

  it('registra pasajero y conductores (pendientes de aprobación)', async () => {
    const p = await call('POST', '/auth/register', undefined, {
      role: 'passenger',
      name: 'Ana Pasajera',
      email: 'ana@test.local',
      phone: '600111222',
      password: 'secreta123',
    });
    expect(p.status).toBe(201);
    expect(p.data.user.status).toBe('active');
    passenger = p.data.token;

    const vehicle = { make: 'Toyota', model: 'Prius', plate: '1234abc', color: 'Blanco' };
    const d = await call('POST', '/auth/register', undefined, {
      role: 'driver',
      name: 'Carlos Conductor',
      email: 'carlos@test.local',
      phone: '600333444',
      password: 'secreta123',
      vehicle,
    });
    expect(d.status).toBe(201);
    expect(d.data.user.status).toBe('pending');
    expect(d.data.user.vehicle.plate).toBe('1234ABC');
    driver = d.data.token;
    driverId = d.data.user.id;

    const d2 = await call('POST', '/auth/register', undefined, {
      role: 'driver',
      name: 'Diana',
      email: 'diana@test.local',
      phone: '600555666',
      password: 'secreta123',
      vehicle: { ...vehicle, plate: '9999XYZ' },
    });
    driver2 = d2.data.token;

    const dup = await call('POST', '/auth/register', undefined, {
      role: 'passenger',
      name: 'Otra',
      email: 'ANA@test.local',
      phone: '600111222',
      password: 'secreta123',
    });
    expect(dup.status).toBe(409);
  });

  it('impide que un conductor no aprobado se conecte', async () => {
    const r = await call('POST', '/driver/online', driver, { online: true });
    expect(r.status).toBe(403);
  });

  it('el administrador inicia sesión y aprueba conductores', async () => {
    const bad = await call('POST', '/auth/login', undefined, { email: 'admin@test.local', password: 'mala' });
    expect(bad.status).toBe(401);
    const a = await call('POST', '/auth/login', undefined, { email: 'admin@test.local', password: 'admin-pass-123' });
    expect(a.status).toBe(200);
    admin = a.data.token;

    const forbidden = await call('GET', '/admin/stats', passenger);
    expect(forbidden.status).toBe(403);

    const users = await call<any[]>('GET', '/admin/users?role=driver', admin);
    expect(users.data.length).toBe(2);
    for (const u of users.data) {
      const r = await call('PATCH', `/admin/users/${u.id}`, admin, { status: 'active' });
      expect(r.data.status).toBe('active');
    }
  });

  it('cotiza un viaje con la tarifa configurada', async () => {
    const t = await call('PUT', '/admin/tariff', admin, { currency: 'EUR', baseFare: 2, perKm: 1, perMinute: 0.25, minimumFare: 5, surge: 1 });
    expect(t.status).toBe(200);
    const q = await call('POST', '/rides/quote', passenger, { pickup: PICKUP, dropoff: DROPOFF });
    expect(q.status).toBe(200);
    expect(q.data.currency).toBe('EUR');
    const expected = 2 + (q.data.distanceM / 1000) * 1 + (q.data.durationS / 60) * 0.25;
    expect(q.data.fare).toBeCloseTo(expected, 1);
  });

  it('flujo completo en tiempo real: solicitar, aceptar, llegar, iniciar, finalizar y valorar', async () => {
    const ps = await connect(passenger);
    const ds = await connect(driver);
    const ds2 = await connect(driver2);
    const as = await connect(admin);

    // Ambos conductores conectados cerca del punto de recogida.
    expect((await call('POST', '/driver/online', driver, { online: true })).data.online).toBe(true);
    expect((await call('POST', '/driver/online', driver2, { online: true })).data.online).toBe(true);
    await call('POST', '/driver/location', driver, { lat: 40.418, lng: -3.704 });
    await call('POST', '/driver/location', driver2, { lat: 40.42, lng: -3.70 });

    const offer = waitFor<Ride>(ds, 'ride:offer');
    const offer2 = waitFor<Ride>(ds2, 'ride:offer');
    const adminSees = waitFor<Ride>(as, 'ride:update', (r) => r.status === 'requested');
    const r = await call<Ride>('POST', '/rides', passenger, { pickup: PICKUP, dropoff: DROPOFF, paymentMethod: 'cash' });
    expect(r.status).toBe(201);
    expect(r.data.status).toBe('requested');
    rideId = r.data.id;
    expect((await offer).id).toBe(rideId);
    expect((await offer2).id).toBe(rideId);
    expect((await adminSees).id).toBe(rideId);

    // No se puede pedir otro viaje mientras hay uno activo.
    expect((await call('POST', '/rides', passenger, { pickup: PICKUP, dropoff: DROPOFF, paymentMethod: 'cash' })).status).toBe(409);

    const offers = await call<Ride[]>('GET', '/driver/offers', driver);
    expect(offers.data.map((o) => o.id)).toContain(rideId);

    // El primero que acepta se lo lleva; el segundo recibe 409 y el aviso de oferta cerrada.
    const closed = waitFor<{ rideId: number }>(ds2, 'ride:offer:closed');
    const accepted = waitFor<Ride>(ps, 'ride:update', (x) => x.status === 'accepted');
    const acc = await call<Ride>('POST', `/rides/${rideId}/accept`, driver);
    expect(acc.status).toBe(200);
    expect(acc.data.driver?.id).toBe(driverId);
    expect((await accepted).driver?.vehicle?.plate).toBe('1234ABC');
    expect((await closed).rideId).toBe(rideId);
    expect((await call('POST', `/rides/${rideId}/accept`, driver2)).status).toBe(409);

    // Otro conductor no puede manipular el viaje.
    expect((await call('POST', `/rides/${rideId}/arrive`, driver2)).status).toBe(403);
    // El pasajero no puede ejecutar acciones de conductor.
    expect((await call('POST', `/rides/${rideId}/arrive`, passenger)).status).toBe(403);

    // El pasajero recibe la ubicación del conductor asignado en tiempo real (vía socket).
    const loc = waitFor<{ driverId: number; lat: number }>(ps, 'driver:location', (l) => l.driverId === driverId);
    ds.emit('driver:location', { lat: 40.4172, lng: -3.7036, heading: 90 });
    expect((await loc).lat).toBeCloseTo(40.4172);

    const cur = await call<{ ride: Ride; driverLocation: { lat: number } }>('GET', '/rides/current', passenger);
    expect(cur.data.ride.id).toBe(rideId);
    expect(cur.data.driverLocation.lat).toBeCloseTo(40.4172);

    // Pasos en orden.
    expect((await call('POST', `/rides/${rideId}/start`, driver)).status).toBe(409);
    expect((await call<Ride>('POST', `/rides/${rideId}/arrive`, driver)).data.status).toBe('arrived');
    expect((await call<Ride>('POST', `/rides/${rideId}/start`, driver)).data.status).toBe('in_progress');
    expect((await call('POST', `/rides/${rideId}/cancel`, passenger, {})).status).toBe(409);

    const done = waitFor<Ride>(ps, 'ride:update', (x) => x.status === 'completed');
    const c = await call<Ride>('POST', `/rides/${rideId}/complete`, driver);
    expect(c.data.status).toBe('completed');
    expect(c.data.fareFinal).toBe(c.data.fareEstimate);
    expect((await done).id).toBe(rideId);

    // Valoraciones mutuas.
    expect((await call<Ride>('POST', `/rides/${rideId}/rate`, passenger, { stars: 5 })).data.ratingByPassenger).toBe(5);
    expect((await call('POST', `/rides/${rideId}/rate`, passenger, { stars: 4 })).status).toBe(409);
    expect((await call<Ride>('POST', `/rides/${rideId}/rate`, driver, { stars: 4 })).data.ratingByDriver).toBe(4);
    const me = await call('GET', '/me', driver);
    expect(me.data.user.rating).toBe(5);

    const earnings = await call('GET', '/driver/earnings', driver);
    expect(earnings.data.today.rides).toBe(1);
    expect(earnings.data.today.total).toBe(c.data.fareFinal);

    const hist = await call<Ride[]>('GET', '/rides', passenger);
    expect(hist.data[0].id).toBe(rideId);

    const stats = await call('GET', '/admin/stats', admin);
    expect(stats.data.completedToday).toBe(1);
    expect(stats.data.onlineDrivers).toBe(2);
  });

  it('el pasajero puede cancelar una solicitud y otros usuarios no ven sus viajes', async () => {
    const r = await call<Ride>('POST', '/rides', passenger, { pickup: PICKUP, dropoff: DROPOFF, paymentMethod: 'card' });
    expect(r.status).toBe(201);
    const other = await call('POST', '/auth/register', undefined, {
      role: 'passenger',
      name: 'Intrusa',
      email: 'intrusa@test.local',
      phone: '600999888',
      password: 'secreta123',
    });
    expect((await call('GET', `/rides/${rideId}`, other.data.token)).status).toBe(404);
    expect((await call('POST', `/rides/${r.data.id}/cancel`, other.data.token, {})).status).toBe(404);
    const c = await call<Ride>('POST', `/rides/${r.data.id}/cancel`, passenger, { reason: 'Cambié de planes' });
    expect(c.data.status).toBe('cancelled');
    expect(c.data.cancelledBy).toBe('passenger');
  });

  it('caduca las solicitudes que nadie acepta', async () => {
    const r = await call<Ride>('POST', '/rides', passenger, { pickup: PICKUP, dropoff: DROPOFF, paymentMethod: 'cash' });
    server.db.prepare('UPDATE rides SET requested_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', r.data.id);
    expect(server.rides.expireStale()).toBe(1);
    expect((await call<Ride>('GET', `/rides/${r.data.id}`, passenger)).data.status).toBe('expired');
  });

  it('bloquear a un usuario invalida su sesión', async () => {
    await call('PATCH', `/admin/users/${driverId}`, admin, { status: 'blocked' });
    expect((await call('GET', '/me', driver)).status).toBe(403);
    expect((await call('POST', '/auth/login', undefined, { email: 'carlos@test.local', password: 'secreta123' })).status).toBe(403);
  });

  it('rechaza peticiones sin sesión', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', 'token-falso')).status).toBe(401);
  });
});

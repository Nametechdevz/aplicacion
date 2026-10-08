import type { DriverLocation, LatLng, PaymentMethod, Place, Quote, Ride, RidePerson, RideStatus, Role, Tariff } from '../../shared/types';
import { ACTIVE_RIDE_STATUSES } from '../../shared/types';
import { DEFAULT_TARIFF, calculateFare, haversineM } from '../../shared/fare';
import { allowedFrom, nextStatus, type RideAction } from '../../shared/rideState';
import type { Config } from './config';
import { getSetting, nowIso, setSetting, type DB } from './db';
import { badRequest, conflict, forbidden, notFound } from './errors';
import type { Geo } from './geo';
import type { Realtime } from './realtime';
import { addRating, getUser, ratingOf, vehicleOf, type AuthUser } from './users';

interface RideRow {
  id: number;
  passenger_id: number;
  driver_id: number | null;
  status: RideStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  distance_m: number;
  duration_s: number;
  geometry: string;
  fare_estimate: number;
  fare_final: number | null;
  currency: string;
  payment_method: PaymentMethod;
  requested_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: Role | 'system' | null;
  cancel_reason: string | null;
  rating_by_passenger: number | null;
  rating_by_driver: number | null;
}

const ACTIVE_SQL = `('${ACTIVE_RIDE_STATUSES.join("','")}')`;

export function createRideService(db: DB, config: Config, geo: Geo, rt: Realtime) {
  function tariff(): Tariff {
    return { ...DEFAULT_TARIFF, ...getSetting<Partial<Tariff>>(db, 'tariff', {}) };
  }

  function setTariff(t: Tariff): Tariff {
    setSetting(db, 'tariff', t);
    return tariff();
  }

  function person(id: number): RidePerson {
    const u = getUser(db, id)!;
    return { id: u.id, name: u.name, phone: u.phone, rating: ratingOf(u), vehicle: vehicleOf(u) };
  }

  function toRide(r: RideRow): Ride {
    return {
      id: r.id,
      status: r.status,
      pickup: { lat: r.pickup_lat, lng: r.pickup_lng, address: r.pickup_address },
      dropoff: { lat: r.dropoff_lat, lng: r.dropoff_lng, address: r.dropoff_address },
      distanceM: r.distance_m,
      durationS: r.duration_s,
      geometry: JSON.parse(r.geometry) as [number, number][],
      fareEstimate: r.fare_estimate,
      fareFinal: r.fare_final,
      currency: r.currency,
      paymentMethod: r.payment_method,
      passenger: person(r.passenger_id),
      driver: r.driver_id ? person(r.driver_id) : null,
      requestedAt: r.requested_at,
      acceptedAt: r.accepted_at,
      arrivedAt: r.arrived_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      cancelledBy: r.cancelled_by,
      cancelReason: r.cancel_reason,
      ratingByPassenger: r.rating_by_passenger,
      ratingByDriver: r.rating_by_driver,
    };
  }

  function row(id: number): RideRow | undefined {
    return db.prepare('SELECT * FROM rides WHERE id = ?').get(id) as RideRow | undefined;
  }

  function get(id: number): Ride {
    const r = row(id);
    if (!r) throw notFound('Viaje no encontrado.');
    return toRide(r);
  }

  function canSee(user: AuthUser, r: RideRow): boolean {
    if (user.role === 'admin') return true;
    if (r.passenger_id === user.id || r.driver_id === user.id) return true;
    // Un conductor puede ver una solicitud abierta (para decidir si la acepta).
    return user.role === 'driver' && r.status === 'requested';
  }

  function getFor(user: AuthUser, id: number): Ride {
    const r = row(id);
    if (!r || !canSee(user, r)) throw notFound('Viaje no encontrado.');
    return toRide(r);
  }

  function activeFor(user: AuthUser): Ride | null {
    const col = user.role === 'driver' ? 'driver_id' : 'passenger_id';
    const r = db
      .prepare(`SELECT * FROM rides WHERE ${col} = ? AND status IN ${ACTIVE_SQL} ORDER BY id DESC LIMIT 1`)
      .get(user.id) as RideRow | undefined;
    return r ? toRide(r) : null;
  }

  function history(user: AuthUser, limit = 50): Ride[] {
    const col = user.role === 'driver' ? 'driver_id' : 'passenger_id';
    const rows = db
      .prepare(`SELECT * FROM rides WHERE ${col} = ? AND status NOT IN ${ACTIVE_SQL} ORDER BY id DESC LIMIT ?`)
      .all(user.id, limit) as unknown as RideRow[];
    return rows.map(toRide);
  }

  async function quote(pickup: LatLng, dropoff: LatLng): Promise<Quote> {
    if (haversineM(pickup, dropoff) < 50) throw badRequest('El origen y el destino están demasiado cerca.');
    const info = await geo.route(pickup, dropoff);
    const t = tariff();
    return { ...info, fare: calculateFare(info.distanceM, info.durationS, t), currency: t.currency };
  }

  /** Conductores conectados, activos, sin viaje en curso y dentro del radio de despacho. */
  function availableDriversNear(p: LatLng): DriverLocation[] {
    const radiusM = config.dispatchRadiusKm * 1000;
    const busy = new Set(
      (db.prepare(`SELECT driver_id FROM rides WHERE driver_id IS NOT NULL AND status IN ${ACTIVE_SQL}`).all() as { driver_id: number }[]).map(
        (r) => r.driver_id,
      ),
    );
    return rt.drivers
      .online()
      .filter((d) => !busy.has(d.driverId) && getUser(db, d.driverId)?.status === 'active' && haversineM(d, p) <= radiusM)
      .sort((a, b) => haversineM(a, p) - haversineM(b, p));
  }

  async function request(user: AuthUser, input: { pickup: Place; dropoff: Place; paymentMethod: PaymentMethod }): Promise<Ride> {
    if (user.status !== 'active') throw forbidden('Tu cuenta no está activa.');
    if (activeFor(user)) throw conflict('Ya tienes un viaje en curso.');
    const q = await quote(input.pickup, input.dropoff);
    // Se vuelve a comprobar tras la espera de la ruta, por si llegaron dos solicitudes a la vez.
    if (activeFor(user)) throw conflict('Ya tienes un viaje en curso.');
    const res = db
      .prepare(
        `INSERT INTO rides (passenger_id, status, pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address,
           distance_m, duration_s, geometry, fare_estimate, currency, payment_method, requested_at)
         VALUES (?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        input.pickup.lat,
        input.pickup.lng,
        input.pickup.address,
        input.dropoff.lat,
        input.dropoff.lng,
        input.dropoff.address,
        q.distanceM,
        q.durationS,
        JSON.stringify(q.geometry),
        q.fare,
        q.currency,
        input.paymentMethod,
        nowIso(),
      );
    const ride = get(Number(res.lastInsertRowid));
    rt.emitRide(ride);
    rt.emitOffer(
      availableDriversNear(ride.pickup).map((d) => d.driverId),
      ride,
    );
    return ride;
  }

  function openOffersFor(driver: AuthUser): Ride[] {
    const loc = rt.drivers.get(driver.id);
    if (!loc || !loc.online || !Number.isFinite(loc.lat)) return [];
    const radiusM = config.dispatchRadiusKm * 1000;
    const rows = db.prepare(`SELECT * FROM rides WHERE status = 'requested' ORDER BY id`).all() as unknown as RideRow[];
    return rows
      .filter((r) => haversineM(loc, { lat: r.pickup_lat, lng: r.pickup_lng }) <= radiusM)
      .map(toRide);
  }

  const TIMESTAMP_COL: Partial<Record<RideStatus, string>> = {
    accepted: 'accepted_at',
    arrived: 'arrived_at',
    in_progress: 'started_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
    expired: 'cancelled_at',
  };

  function transition(user: AuthUser | 'system', rideId: number, action: RideAction, reason?: string): Ride {
    const r = row(rideId);
    const actor = user === 'system' ? 'system' : user.role;
    if (!r) throw notFound('Viaje no encontrado.');
    if (user !== 'system' && user.role === 'driver') {
      if (action === 'accept' && r.status !== 'requested') throw conflict('Otro conductor ya aceptó este viaje.');
      if (action !== 'accept' && r.driver_id !== user.id) throw forbidden('Este viaje no está asignado a ti.');
    }
    if (user !== 'system' && user.role === 'passenger' && r.passenger_id !== user.id) throw notFound('Viaje no encontrado.');
    const to = nextStatus(r.status, action, actor);
    if (!to) throw conflict(`No se puede realizar esta acción: el viaje está "${r.status}".`);

    const now = nowIso();
    const sets: string[] = ['status = ?', `${TIMESTAMP_COL[to]} = ?`];
    const params: (string | number | null)[] = [to, now];

    if (action === 'accept') {
      const driver = user as AuthUser;
      if (driver.status !== 'active') throw forbidden('Tu cuenta de conductor aún no está aprobada.');
      if (activeFor(driver)) throw conflict('Ya tienes un viaje en curso.');
      sets.push('driver_id = ?');
      params.push(driver.id);
    }
    if (action === 'complete') {
      sets.push('fare_final = ?');
      params.push(finalFare(r, now));
    }
    if (to === 'cancelled' || to === 'expired') {
      sets.push('cancelled_by = ?', 'cancel_reason = ?');
      params.push(actor, reason?.slice(0, 200) ?? null);
    }

    // La condición sobre el estado actual evita carreras (p. ej. dos conductores aceptando a la vez).
    const from = action === 'cancel' && actor === 'admin' ? [...allowedFrom('cancel'), 'in_progress'] : allowedFrom(action);
    const where = `id = ? AND status IN (${from.map(() => '?').join(',')})${action === 'accept' ? ' AND driver_id IS NULL' : ''}`;
    const res = db.prepare(`UPDATE rides SET ${sets.join(', ')} WHERE ${where}`).run(...params, rideId, ...from);
    if (Number(res.changes) === 0) {
      throw conflict(action === 'accept' ? 'Otro conductor ya aceptó este viaje.' : 'El viaje cambió de estado. Actualiza la pantalla.');
    }

    const ride = get(rideId);
    if (r.status === 'requested') rt.emitOfferClosed(ride.id);
    rt.emitRide(ride);
    return ride;
  }

  /** Recalcula la tarifa con el tiempo real del viaje si fue mayor que el estimado (la distancia se mantiene). */
  function finalFare(r: RideRow, completedAt: string): number {
    if (!r.started_at) return r.fare_estimate;
    const realS = (Date.parse(completedAt) - Date.parse(r.started_at)) / 1000;
    if (realS <= r.duration_s * 1.2) return r.fare_estimate;
    const t = tariff();
    return Math.max(r.fare_estimate, calculateFare(r.distance_m, realS, { ...t, currency: r.currency }));
  }

  function rate(user: AuthUser, rideId: number, stars: number): Ride {
    const r = row(rideId);
    if (!r || (r.passenger_id !== user.id && r.driver_id !== user.id)) throw notFound('Viaje no encontrado.');
    if (r.status !== 'completed') throw conflict('Solo se pueden valorar viajes finalizados.');
    if (user.role === 'passenger') {
      if (r.rating_by_passenger) throw conflict('Ya valoraste este viaje.');
      db.prepare('UPDATE rides SET rating_by_passenger = ? WHERE id = ?').run(stars, rideId);
      addRating(db, r.driver_id!, stars);
    } else {
      if (r.rating_by_driver) throw conflict('Ya valoraste este viaje.');
      db.prepare('UPDATE rides SET rating_by_driver = ? WHERE id = ?').run(stars, rideId);
      addRating(db, r.passenger_id, stars);
    }
    const ride = get(rideId);
    rt.emitRide(ride);
    return ride;
  }

  function expireStale(): number {
    const cutoff = new Date(Date.now() - config.rideRequestTimeoutS * 1000).toISOString();
    const ids = (db.prepare(`SELECT id FROM rides WHERE status = 'requested' AND requested_at < ?`).all(cutoff) as { id: number }[]).map(
      (r) => r.id,
    );
    let n = 0;
    for (const id of ids) {
      try {
        transition('system', id, 'expire', 'Ningún conductor aceptó a tiempo.');
        n++;
      } catch {
        /* ya cambió de estado */
      }
    }
    return n;
  }

  function onDriverLocation(driverId: number, loc: LatLng, heading: number | null) {
    const d = rt.drivers.update(driverId, loc, heading);
    const active = activeFor({ id: driverId, role: 'driver', name: '', status: 'active' });
    rt.emitDriverLocation(d, active ? active.passenger.id : null);
    return d;
  }

  function setDriverOnline(driver: AuthUser, online: boolean) {
    if (online && driver.status !== 'active') throw forbidden('Tu cuenta de conductor aún no está aprobada.');
    const d = rt.drivers.setOnline(driver.id, online);
    if (d && Number.isFinite(d.lat)) rt.emitDriverLocation(d, null);
    return { online: rt.drivers.isOnline(driver.id) };
  }

  function earnings(driver: AuthUser) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).toISOString();
    const q = (since: string | null) =>
      db
        .prepare(
          `SELECT COUNT(*) AS rides, COALESCE(SUM(fare_final), 0) AS total FROM rides
           WHERE driver_id = ? AND status = 'completed' ${since ? 'AND completed_at >= ?' : ''}`,
        )
        .get(...(since ? [driver.id, since] : [driver.id])) as { rides: number; total: number };
    return { currency: tariff().currency, today: q(startOfDay), week: q(startOfWeek), total: q(null) };
  }

  function adminList(filter: { status?: string; limit: number }) {
    const rows = (
      filter.status
        ? db.prepare('SELECT * FROM rides WHERE status = ? ORDER BY id DESC LIMIT ?').all(filter.status, filter.limit)
        : db.prepare('SELECT * FROM rides ORDER BY id DESC LIMIT ?').all(filter.limit)
    ) as unknown as RideRow[];
    return rows.map(toRide);
  }

  function adminActive(): Ride[] {
    return (db.prepare(`SELECT * FROM rides WHERE status IN ${ACTIVE_SQL} ORDER BY id DESC`).all() as unknown as RideRow[]).map(toRide);
  }

  function stats() {
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const one = <T>(sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as T;
    return {
      currency: tariff().currency,
      ridesToday: one<{ n: number }>('SELECT COUNT(*) AS n FROM rides WHERE requested_at >= ?', startOfDay).n,
      completedToday: one<{ n: number }>(`SELECT COUNT(*) AS n FROM rides WHERE status = 'completed' AND completed_at >= ?`, startOfDay).n,
      revenueToday: one<{ s: number }>(`SELECT COALESCE(SUM(fare_final),0) AS s FROM rides WHERE status = 'completed' AND completed_at >= ?`, startOfDay).s,
      activeRides: one<{ n: number }>(`SELECT COUNT(*) AS n FROM rides WHERE status IN ${ACTIVE_SQL}`).n,
      onlineDrivers: rt.drivers.online().length,
      pendingDrivers: one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'driver' AND status = 'pending'`).n,
      passengers: one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'passenger'`).n,
      drivers: one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'driver'`).n,
    };
  }

  return {
    tariff,
    setTariff,
    get,
    getFor,
    activeFor,
    history,
    quote,
    request,
    openOffersFor,
    transition,
    rate,
    expireStale,
    onDriverLocation,
    setDriverOnline,
    earnings,
    adminList,
    adminActive,
    stats,
  };
}

export type RideService = ReturnType<typeof createRideService>;

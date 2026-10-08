import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { DriverLocation, LatLng, Ride } from '../../shared/types';
import type { DB } from './db';
import { authenticateToken } from './users';

/** Ubicaciones y disponibilidad de los conductores (en memoria; se reconstruyen al reconectar). */
export class DriverRegistry {
  private locations = new Map<number, DriverLocation>();

  update(driverId: number, loc: LatLng, heading: number | null = null): DriverLocation {
    const prev = this.locations.get(driverId);
    const next: DriverLocation = {
      driverId,
      lat: loc.lat,
      lng: loc.lng,
      heading,
      online: prev?.online ?? false,
      updatedAt: new Date().toISOString(),
    };
    this.locations.set(driverId, next);
    return next;
  }

  setOnline(driverId: number, online: boolean): DriverLocation | undefined {
    const prev = this.locations.get(driverId);
    if (!prev) {
      if (!online) return undefined;
      // Aún sin ubicación: se guarda el estado y se completará con la primera posición.
      const loc: DriverLocation = { driverId, lat: NaN, lng: NaN, heading: null, online, updatedAt: new Date().toISOString() };
      this.locations.set(driverId, loc);
      return loc;
    }
    prev.online = online;
    return prev;
  }

  get(driverId: number): DriverLocation | undefined {
    return this.locations.get(driverId);
  }

  isOnline(driverId: number): boolean {
    return this.locations.get(driverId)?.online ?? false;
  }

  online(): DriverLocation[] {
    return [...this.locations.values()].filter((l) => l.online && Number.isFinite(l.lat));
  }

  all(): DriverLocation[] {
    return [...this.locations.values()].filter((l) => Number.isFinite(l.lat));
  }
}

export interface Realtime {
  io: Server;
  drivers: DriverRegistry;
  emitRide(ride: Ride): void;
  emitOffer(driverIds: number[], ride: Ride): void;
  emitOfferClosed(rideId: number): void;
  emitDriverLocation(loc: DriverLocation, passengerId: number | null): void;
  emitUserChanged(userId: number): void;
}

export interface RealtimeHooks {
  onDriverLocation(driverId: number, loc: LatLng, heading: number | null): void;
  onDriverOnline(driverId: number, online: boolean): void;
}

const OFFLINE_GRACE_MS = 60_000;

export function createRealtime(
  http: HttpServer,
  db: DB,
  jwtSecret: string,
  corsOrigin: string,
  hooksRef: { current: RealtimeHooks | null },
): Realtime {
  const io = new Server(http, {
    path: '/socket.io',
    cors: corsOrigin ? { origin: corsOrigin.split(',').map((s) => s.trim()) } : undefined,
  });
  const drivers = new DriverRegistry();
  const offlineTimers = new Map<number, NodeJS.Timeout>();

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      socket.data.user = authenticateToken(db, jwtSecret, token);
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: number; role: string; status: string };
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);

    if (user.role === 'driver') {
      const t = offlineTimers.get(user.id);
      if (t) {
        clearTimeout(t);
        offlineTimers.delete(user.id);
      }

      socket.on('driver:location', (p: { lat?: unknown; lng?: unknown; heading?: unknown }) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const heading = Number.isFinite(Number(p?.heading)) ? Number(p.heading) : null;
        hooksRef.current?.onDriverLocation(user.id, { lat, lng }, heading);
      });

      socket.on('disconnect', async () => {
        const sockets = await io.in(`user:${user.id}`).fetchSockets();
        if (sockets.length > 0) return;
        offlineTimers.set(
          user.id,
          setTimeout(() => {
            offlineTimers.delete(user.id);
            hooksRef.current?.onDriverOnline(user.id, false);
          }, OFFLINE_GRACE_MS).unref(),
        );
      });
    }
  });

  return {
    io,
    drivers,
    emitRide(ride) {
      let target = io.to(`user:${ride.passenger.id}`).to('role:admin');
      if (ride.driver) target = target.to(`user:${ride.driver.id}`);
      target.emit('ride:update', ride);
    },
    emitOffer(driverIds, ride) {
      if (driverIds.length === 0) return;
      io.to(driverIds.map((id) => `user:${id}`)).emit('ride:offer', ride);
    },
    emitOfferClosed(rideId) {
      io.to('role:driver').emit('ride:offer:closed', { rideId });
    },
    emitDriverLocation(loc, passengerId) {
      let target = io.to('role:admin').to(`user:${loc.driverId}`);
      if (passengerId) target = target.to(`user:${passengerId}`);
      target.emit('driver:location', loc);
    },
    emitUserChanged(userId) {
      io.to(`user:${userId}`).emit('me:changed');
    },
  };
}

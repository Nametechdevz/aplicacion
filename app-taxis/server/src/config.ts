import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Config {
  port: number;
  dbPath: string;
  jwtSecret: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  driverAutoApprove: boolean;
  /** URL base de un servidor OSRM, o "none" para usar solo la estimación en línea recta. */
  routingUrl: string;
  /** URL base de un servidor Nominatim, o "none" para desactivar la búsqueda de direcciones. */
  geocoderUrl: string;
  geocoderCountryCodes: string;
  dispatchRadiusKm: number;
  rideRequestTimeoutS: number;
  corsOrigin: string;
  clientDir: string | null;
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(v.toLowerCase());
}

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : def;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = env.DB_PATH ?? 'data/taxis.db';
  let jwtSecret = env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    if (dbPath === ':memory:') {
      jwtSecret = randomBytes(32).toString('hex');
    } else {
      // Sin JWT_SECRET se genera uno y se guarda junto a la base de datos para que las sesiones sobrevivan a los reinicios.
      jwtSecret = persistentSecret(join(dirname(dbPath), 'jwt-secret'));
    }
  }
  return {
    port: num(env.PORT, 3000),
    dbPath,
    jwtSecret,
    adminEmail: (env.ADMIN_EMAIL ?? 'admin@taxis.local').toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD ?? '',
    adminName: env.ADMIN_NAME ?? 'Administrador',
    driverAutoApprove: bool(env.DRIVER_AUTO_APPROVE, false),
    routingUrl: env.ROUTING_URL ?? 'https://router.project-osrm.org',
    geocoderUrl: env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org',
    geocoderCountryCodes: env.GEOCODER_COUNTRY_CODES ?? '',
    dispatchRadiusKm: num(env.DISPATCH_RADIUS_KM, 10),
    rideRequestTimeoutS: num(env.RIDE_REQUEST_TIMEOUT_S, 180),
    corsOrigin: env.CORS_ORIGIN ?? '',
    clientDir: env.CLIENT_DIR ?? 'client/dist',
  };
}

function persistentSecret(file: string): string {
  if (existsSync(file)) {
    const v = readFileSync(file, 'utf8').trim();
    if (v.length >= 32) return v;
  }
  mkdirSync(dirname(file), { recursive: true });
  const v = randomBytes(32).toString('hex');
  writeFileSync(file, v, { mode: 0o600 });
  console.log(`[config] JWT_SECRET no definido: se generó uno y se guardó en ${file}`);
  return v;
}

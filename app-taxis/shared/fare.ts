import type { LatLng, Tariff } from './types';

export const DEFAULT_TARIFF: Tariff = {
  currency: 'USD',
  baseFare: 1.5,
  perKm: 0.9,
  perMinute: 0.2,
  minimumFare: 4,
  surge: 1,
};

/** Tarifa = max(mínima, base + km·precio_km + min·precio_min) × multiplicador, redondeada a céntimos. */
export function calculateFare(distanceM: number, durationS: number, tariff: Tariff): number {
  const km = Math.max(0, distanceM) / 1000;
  const minutes = Math.max(0, durationS) / 60;
  const raw = tariff.baseFare + km * tariff.perKm + minutes * tariff.perMinute;
  const fare = Math.max(tariff.minimumFare, raw) * Math.max(1, tariff.surge);
  return Math.round(fare * 100) / 100;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimación sin servicio de rutas: distancia en línea recta × 1,3 a 25 km/h de media urbana. */
export function approximateRoute(from: LatLng, to: LatLng) {
  const distanceM = Math.round(haversineM(from, to) * 1.3);
  const durationS = Math.round(distanceM / (25_000 / 3600));
  return { distanceM, durationS };
}

export function formatMoney(amount: number, currency: string, locale = 'es'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

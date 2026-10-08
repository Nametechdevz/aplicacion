import type { LatLng, Tariff } from './types';

/** Tarifa por defecto en pesos colombianos (la central la ajusta en Tarifas). */
export const DEFAULT_TARIFF: Tariff = {
  currency: 'COP',
  baseFare: 5000,
  perKm: 1200,
  perMinute: 250,
  minimumFare: 8000,
  surge: 1,
  roundTo: 100,
};

/** Monedas que no usan decimales en la práctica: el precio se redondea a 100 unidades. */
const NO_DECIMALS = new Set(['COP', 'CLP', 'PYG', 'JPY', 'KRW', 'VND', 'IDR', 'HUF', 'ISK']);

export function defaultRoundTo(currency: string): number {
  return NO_DECIMALS.has(currency.toUpperCase()) ? 100 : 0.01;
}

/** Tarifa = max(mínima, base + km·precio_km + min·precio_min) × multiplicador, redondeada a `roundTo`. */
export function calculateFare(distanceM: number, durationS: number, tariff: Tariff): number {
  const km = Math.max(0, distanceM) / 1000;
  const minutes = Math.max(0, durationS) / 60;
  const raw = tariff.baseFare + km * tariff.perKm + minutes * tariff.perMinute;
  const fare = Math.max(tariff.minimumFare, raw) * Math.max(1, tariff.surge);
  const step = tariff.roundTo > 0 ? tariff.roundTo : defaultRoundTo(tariff.currency);
  // Se trabaja en céntimos para evitar errores de coma flotante (p. ej. 0.1 + 0.2).
  const cents = Math.round(step * 100);
  return (Math.round((fare * 100) / cents) * cents) / 100;
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

export function formatMoney(amount: number, currency: string, locale?: string): string {
  const cur = currency.toUpperCase();
  const whole = NO_DECIMALS.has(cur) || Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(locale ?? (cur === 'COP' ? 'es-CO' : 'es'), {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${whole ? Math.round(amount) : amount.toFixed(2)} ${cur}`;
  }
}

/** Formato compacto para ejes de gráficas: $ 1,2 M, $ 350 mil… */
export function formatMoneyShort(amount: number, currency: string): string {
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(cur === 'COP' ? 'es-CO' : 'es', {
      style: 'currency',
      currency: cur,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatMoney(amount, cur);
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

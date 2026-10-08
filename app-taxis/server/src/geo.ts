import type { LatLng, Place, RouteInfo } from '../../shared/types';
import { approximateRoute } from '../../shared/fare';
import type { Config } from './config';

const USER_AGENT = 'app-taxis/1.0 (+https://github.com/nametechdevz)';
const TIMEOUT_MS = 6000;

class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(
    private ttlMs: number,
    private max = 500,
  ) {}
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.map.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function createGeo(config: Config) {
  const routeCache = new TtlCache<RouteInfo>(10 * 60_000);
  const searchCache = new TtlCache<Place[]>(60 * 60_000);
  const reverseCache = new TtlCache<string>(60 * 60_000);
  // Nominatim pide como máximo 1 petición por segundo: se encadenan las peticiones.
  let geocoderQueue: Promise<unknown> = Promise.resolve();
  const throttled = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = geocoderQueue.then(fn);
    geocoderQueue = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 1000)));
    return run;
  };

  async function route(from: LatLng, to: LatLng): Promise<RouteInfo> {
    const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(5)).join(',');
    const cached = routeCache.get(key);
    if (cached) return cached;
    let info: RouteInfo | null = null;
    if (config.routingUrl !== 'none') {
      try {
        const url = `${config.routingUrl.replace(/\/$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
        const data = (await fetchJson(url)) as {
          code: string;
          routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
        };
        const r = data.code === 'Ok' ? data.routes?.[0] : undefined;
        if (r) {
          info = {
            distanceM: Math.round(r.distance),
            durationS: Math.round(r.duration),
            geometry: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
            approximate: false,
          };
        }
      } catch (err) {
        console.warn('[geo] Error del servicio de rutas, se usa estimación:', (err as Error).message);
      }
    }
    if (!info) {
      info = {
        ...approximateRoute(from, to),
        geometry: [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        approximate: true,
      };
    }
    routeCache.set(key, info);
    return info;
  }

  async function search(q: string, near?: LatLng): Promise<Place[]> {
    if (config.geocoderUrl === 'none') return [];
    const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''}`;
    const cached = searchCache.get(key);
    if (cached) return cached;
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '0' });
    if (config.geocoderCountryCodes) params.set('countrycodes', config.geocoderCountryCodes);
    if (near) {
      const d = 0.5;
      params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    }
    const data = (await throttled(() => fetchJson(`${config.geocoderUrl.replace(/\/$/, '')}/search?${params}`))) as {
      lat: string;
      lon: string;
      display_name: string;
    }[];
    const places = data.map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), address: p.display_name }));
    searchCache.set(key, places);
    return places;
  }

  async function reverse(p: LatLng): Promise<string> {
    const fallback = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    if (config.geocoderUrl === 'none') return fallback;
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const cached = reverseCache.get(key);
    if (cached) return cached;
    try {
      const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), format: 'jsonv2', zoom: '18' });
      const data = (await throttled(() => fetchJson(`${config.geocoderUrl.replace(/\/$/, '')}/reverse?${params}`))) as {
        display_name?: string;
      };
      const name = data.display_name ?? fallback;
      reverseCache.set(key, name);
      return name;
    } catch {
      return fallback;
    }
  }

  return { route, search, reverse };
}

export type Geo = ReturnType<typeof createGeo>;

import { api } from './api';
import { isNative } from './server';

export interface TileConfig {
  url: string;
  attribution: string;
}

const OSM: TileConfig = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

// Dentro de la app Android la web se sirve desde "https://localhost", y los servidores de OpenStreetMap
// bloquean ese origen; por eso la app usa por defecto las teselas de CARTO (basadas en OpenStreetMap).
const CARTO: TileConfig = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

let cached: Promise<TileConfig> | null = null;

/** Mapa base: el configurado en el servidor (TILE_URL) o el predeterminado según la plataforma. */
export function tileConfig(): Promise<TileConfig> {
  if (!cached) {
    const fallback = isNative() ? CARTO : OSM;
    cached = api<{ tileUrl: string; tileAttribution: string }>('/config')
      .then((c) => (c.tileUrl ? { url: c.tileUrl, attribution: c.tileAttribution || fallback.attribution } : fallback))
      .catch(() => {
        cached = null;
        return fallback;
      });
  }
  return cached;
}

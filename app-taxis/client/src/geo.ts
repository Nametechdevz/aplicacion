import type { LatLng } from '../../shared/types';

const fromEnv = (import.meta.env.VITE_DEFAULT_CENTER as string | undefined)?.split(',').map(Number);
export const DEFAULT_CENTER: LatLng =
  fromEnv && fromEnv.length === 2 && fromEnv.every(Number.isFinite) ? { lat: fromEnv[0], lng: fromEnv[1] } : { lat: 4.711, lng: -74.0721 };

export function currentPosition(timeoutMs = 8000): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Tu dispositivo no permite obtener la ubicación.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener tu ubicación.')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function shortAddress(address: string): string {
  return address.split(',').slice(0, 2).join(',').trim();
}

export function mapsDirectionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}

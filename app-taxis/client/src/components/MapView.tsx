import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../../../shared/types';

export type MarkerKind = 'pickup' | 'dropoff' | 'car' | 'car-busy' | 'car-off' | 'me';

export interface MapMarker extends LatLng {
  id: string;
  kind: MarkerKind;
  title?: string;
  heading?: number | null;
}

interface Props {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  route?: [number, number][] | null;
  /** Cambia este valor para volver a encuadrar el mapa con los marcadores y la ruta. */
  fitKey?: string | number;
  onClick?: (p: LatLng) => void;
  className?: string;
}

const PIN = (color: string, letter: string) =>
  `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 33 27 33 17A16 16 0 0 0 1 17C1 27 17 43 17 43Z" fill="${color}" stroke="#fff" stroke-width="2"/><text x="17" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="#fff">${letter}</text></svg>`;

const CAR = (color: string, heading: number) =>
  `<div style="transform:rotate(${heading}deg);width:34px;height:34px"><svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg"><circle cx="17" cy="17" r="16" fill="#111827" stroke="#fff" stroke-width="2"/><path d="M17 6 L24 24 L17 20 L10 24 Z" fill="${color}"/></svg></div>`;

function iconFor(m: MapMarker): L.DivIcon {
  switch (m.kind) {
    case 'pickup':
      return L.divIcon({ html: PIN('#16a34a', 'A'), className: 'map-icon', iconSize: [34, 44], iconAnchor: [17, 43] });
    case 'dropoff':
      return L.divIcon({ html: PIN('#dc2626', 'B'), className: 'map-icon', iconSize: [34, 44], iconAnchor: [17, 43] });
    case 'me':
      return L.divIcon({ html: '<div class="me-dot"></div>', className: 'map-icon', iconSize: [22, 22], iconAnchor: [11, 11] });
    default: {
      const color = m.kind === 'car' ? '#facc15' : m.kind === 'car-busy' ? '#60a5fa' : '#9ca3af';
      return L.divIcon({ html: CAR(color, m.heading ?? 0), className: 'map-icon', iconSize: [34, 34], iconAnchor: [17, 17] });
    }
  }
}

export default function MapView({ center, zoom = 15, markers = [], route, fitKey, onClick, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markerRefs = useRef(new Map<string, L.Marker>());
  const routeLine = useRef<L.Polyline | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      markerRefs.current.clear();
      routeLine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se recentra solo cuando cambia el centro explícitamente (no en cada render).
  const centerKey = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
  useEffect(() => {
    map.current?.setView([center.lat, center.lng], map.current.getZoom() || zoom, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey]);

  // Marcadores: se actualizan en sitio para que los coches se muevan suavemente.
  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    const seen = new Set<string>();
    for (const m of markers) {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
      seen.add(m.id);
      const key = `${m.id}`;
      const existing = markerRefs.current.get(key);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
        existing.setIcon(iconFor(m));
      } else {
        const mk = L.marker([m.lat, m.lng], { icon: iconFor(m), title: m.title, keyboard: false });
        if (m.title) mk.bindTooltip(m.title);
        mk.addTo(group);
        markerRefs.current.set(key, mk);
      }
    }
    for (const [key, mk] of markerRefs.current) {
      if (!seen.has(key)) {
        mk.remove();
        markerRefs.current.delete(key);
      }
    }
  }, [markers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    routeLine.current?.remove();
    routeLine.current = null;
    if (route && route.length > 1) {
      routeLine.current = L.polyline(route, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(m);
    }
  }, [route]);

  useEffect(() => {
    const m = map.current;
    if (!m || fitKey === undefined) return;
    const pts: L.LatLngExpression[] = markers.filter((x) => Number.isFinite(x.lat)).map((x) => [x.lat, x.lng]);
    if (route) pts.push(...route);
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    else if (pts.length === 1) m.setView(pts[0], 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} className={className ?? 'map'} />;
}

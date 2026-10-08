import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DriverLocation, LatLng, Ride, RouteInfo } from '../../../shared/types';
import { formatDistance, formatDuration, haversineM } from '../../../shared/fare';
import { STATUS_LABELS } from '../../../shared/rideState';
import { api, errorMessage } from '../api';
import { useAuth, useSocketEvent } from '../auth';
import { DEFAULT_CENTER, mapsDirectionsUrl, shortAddress } from '../geo';
import MapView, { type MapMarker } from '../components/MapView';
import { Alert, Avatar, Money, Rating, Spinner, Stars } from '../components/ui';

const ACTIVE = ['accepted', 'arrived', 'in_progress'];
const SEND_EVERY_MS = 3000;

function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export default function DriverHome() {
  const { user, socket, connected } = useAuth();
  const [online, setOnline] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [offers, setOffers] = useState<Ride[]>([]);
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const lastSent = useRef(0);
  const simTimer = useRef<number | null>(null);
  const centered = useRef(false);

  const approved = user?.status === 'active';
  const tracking = approved && (online || (ride && ACTIVE.includes(ride.status)));

  const sendLocation = useCallback(
    (p: LatLng, h: number | null, force = false) => {
      setMe(p);
      setHeading(h);
      if (!centered.current) {
        centered.current = true;
        setCenter(p);
      }
      const now = Date.now();
      if (!force && now - lastSent.current < SEND_EVERY_MS) return;
      lastSent.current = now;
      if (socket?.connected) socket.emit('driver:location', { ...p, heading: h });
      else void api('/driver/location', { body: { ...p, heading: h } }).catch(() => undefined);
    },
    [socket],
  );

  // Estado inicial.
  useEffect(() => {
    if (!approved) return;
    void (async () => {
      try {
        const [state, cur] = await Promise.all([
          api<{ online: boolean; location: DriverLocation | null }>('/driver/state'),
          api<{ ride: Ride | null }>('/rides/current'),
        ]);
        setOnline(state.online);
        if (state.location && Number.isFinite(state.location.lat)) {
          setMe(state.location);
          setCenter(state.location);
          centered.current = true;
        }
        if (cur.ride) {
          setRide(cur.ride);
          setFitKey((k) => k + 1);
        }
        if (state.online) setOffers(await api<Ride[]>('/driver/offers'));
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [approved]);

  // GPS real mientras esté conectado o con viaje activo (se pausa durante la simulación).
  useEffect(() => {
    if (!tracking || simulating) return;
    if (!('geolocation' in navigator)) {
      setGpsError('Este dispositivo no tiene GPS. Toca el mapa para fijar tu posición.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError('');
        sendLocation(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        );
      },
      (e) =>
        setGpsError(
          e.code === 1
            ? 'Permiso de ubicación denegado. Actívalo para recibir viajes, o toca el mapa para fijar tu posición.'
            : 'No se pudo obtener tu ubicación. Toca el mapa para fijarla.',
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking, simulating, sendLocation]);

  // Al tener la primera posición estando conectado se cargan las solicitudes cercanas ya abiertas.
  const hasLocation = !!me;
  useEffect(() => {
    if (online && hasLocation && !ride) {
      const t = setTimeout(() => void api<Ride[]>('/driver/offers').then(setOffers).catch(() => undefined), 500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, hasLocation]);

  // Tras reconectar el socket se reenvía la última posición conocida.
  useEffect(() => {
    if (connected && me && tracking) sendLocation(me, heading, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useSocketEvent<Ride>(
    'ride:offer',
    useCallback((r) => {
      setOffers((cur) => (cur.some((o) => o.id === r.id) ? cur : [...cur, r]));
      navigator.vibrate?.([300, 150, 300]);
    }, []),
  );
  useSocketEvent<{ rideId: number }>(
    'ride:offer:closed',
    useCallback(({ rideId }) => setOffers((cur) => cur.filter((o) => o.id !== rideId)), []),
  );
  useSocketEvent<Ride>(
    'ride:update',
    useCallback((r) => setRide((cur) => (cur && cur.id === r.id ? r : cur)), []),
  );

  async function toggleOnline() {
    setBusy(true);
    setError('');
    try {
      const next = !online;
      if (next && me) sendLocation(me, heading, true);
      const r = await api<{ online: boolean }>('/driver/online', { body: { online: next } });
      setOnline(r.online);
      setOffers(r.online ? await api<Ride[]>('/driver/offers') : []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: 'accept' | 'arrive' | 'start' | 'complete' | 'cancel', target: Ride) {
    if (action === 'cancel' && !confirm('¿Cancelar este viaje? El pasajero será avisado.')) return;
    setBusy(true);
    setError('');
    stopSimulation();
    try {
      const r = await api<Ride>(`/rides/${target.id}/${action}`, { body: action === 'cancel' ? { reason: 'Cancelado por el conductor' } : {} });
      setRide(r);
      if (action === 'accept') {
        setOffers([]);
        setFitKey((k) => k + 1);
      }
    } catch (e) {
      setError(errorMessage(e));
      if (action === 'accept') setOffers((cur) => cur.filter((o) => o.id !== target.id));
    } finally {
      setBusy(false);
    }
  }

  async function rate(stars: number) {
    if (!ride) return;
    try {
      setRide(await api<Ride>(`/rides/${ride.id}/rate`, { body: { stars } }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function finish() {
    setRide(null);
    if (online) setOffers(await api<Ride[]>('/driver/offers').catch(() => []));
  }

  function stopSimulation() {
    if (simTimer.current) window.clearInterval(simTimer.current);
    simTimer.current = null;
    setSimulating(false);
  }
  useEffect(() => stopSimulation, []);

  /** Mueve el coche por la ruta real hasta el siguiente punto (modo demostración sin conducir). */
  async function simulate() {
    if (!ride || !me) return;
    const target = ride.status === 'in_progress' ? ride.dropoff : ride.pickup;
    try {
      const route = await api<RouteInfo>('/geo/route', { body: { from: me, to: target } });
      const pts = route.geometry.map(([lat, lng]) => ({ lat, lng }));
      if (pts.length < 2) return;
      setSimulating(true);
      const stepM = 60; // ~216 km/h acelerado ×5 para la demo
      let i = 0;
      let pos = pts[0];
      simTimer.current = window.setInterval(() => {
        let remaining = stepM;
        while (remaining > 0 && i < pts.length - 1) {
          const next = pts[i + 1];
          const d = haversineM(pos, next);
          if (d <= remaining) {
            remaining -= d;
            pos = next;
            i++;
          } else {
            const f = remaining / d;
            pos = { lat: pos.lat + (next.lat - pos.lat) * f, lng: pos.lng + (next.lng - pos.lng) * f };
            remaining = 0;
          }
        }
        const h = i < pts.length - 1 ? bearing(pos, pts[i + 1]) : heading;
        sendLocation(pos, h, true);
        if (i >= pts.length - 1) stopSimulation();
      }, 1000);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onMapClick(p: LatLng) {
    if (gpsError || !me) sendLocation(p, null, true);
  }

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (me) m.push({ id: 'me', kind: online || ride ? 'car' : 'car-off', ...me, heading, title: 'Tú' });
    const shownRide = ride && ACTIVE.includes(ride.status) ? ride : null;
    if (shownRide) {
      m.push({ id: 'pickup', kind: 'pickup', ...shownRide.pickup, title: 'Recogida' });
      m.push({ id: 'dropoff', kind: 'dropoff', ...shownRide.dropoff, title: 'Destino' });
    } else {
      for (const o of offers) m.push({ id: `offer-${o.id}`, kind: 'pickup', ...o.pickup, title: `Solicitud #${o.id}` });
    }
    return m;
  }, [me, heading, online, ride, offers]);

  if (!approved) {
    return (
      <main className="page narrow">
        <div className="card center">
          <div className="big-emoji">{user?.status === 'blocked' ? '⛔' : '⏳'}</div>
          <h2>{user?.status === 'blocked' ? 'Cuenta bloqueada' : 'Cuenta en revisión'}</h2>
          <p className="muted">
            {user?.status === 'blocked'
              ? 'Tu cuenta de conductor está bloqueada. Contacta con la central.'
              : 'La central está revisando tus datos y tu vehículo. Te avisaremos aquí en cuanto puedas empezar a recibir viajes.'}
          </p>
        </div>
      </main>
    );
  }

  const activeRide = ride && ACTIVE.includes(ride.status) ? ride : null;
  const target = activeRide ? (activeRide.status === 'in_progress' ? activeRide.dropoff : activeRide.pickup) : null;

  return (
    <div className="map-screen">
      <MapView center={center} markers={markers} route={activeRide?.geometry ?? null} fitKey={fitKey} onClick={onMapClick} />

      <div className="top-float">
        <button className={`online-toggle ${online ? 'on' : ''}`} disabled={busy || !!activeRide} onClick={toggleOnline}>
          <span className="led" /> {online ? 'Conectado' : 'Desconectado'}
        </button>
        {!connected && <span className="badge warn">Reconectando…</span>}
      </div>

      <section className="sheet">
        <Alert>{error}</Alert>
        <Alert kind="info">{tracking || !me ? gpsError : ''}</Alert>
        {!me && !gpsError && tracking && (
          <p className="muted small">
            <Spinner /> Obteniendo tu ubicación…
          </p>
        )}

        {!ride && !online && (
          <div className="center">
            <h2 className="sheet-title">Estás desconectado</h2>
            <p className="muted">Conéctate para empezar a recibir solicitudes de viaje cercanas.</p>
            <button className="btn primary block big" disabled={busy} onClick={toggleOnline}>
              Conectarme
            </button>
          </div>
        )}

        {!ride && online && (
          <>
            <h2 className="sheet-title">{offers.length ? `Solicitudes (${offers.length})` : 'Esperando solicitudes…'}</h2>
            {offers.length === 0 && <p className="muted">Te avisaremos con vibración cuando un pasajero cercano pida un taxi.</p>}
            <ul className="offers">
              {offers.map((o) => (
                <li key={o.id} className="offer card">
                  <div className="row between">
                    <strong className="price">
                      <Money amount={o.fareEstimate} currency={o.currency} />
                    </strong>
                    <span className="muted small">
                      {me ? `A ${formatDistance(haversineM(me, o.pickup))} · ` : ''}
                      {formatDistance(o.distanceM)} de viaje
                    </span>
                  </div>
                  <div className="trip-lines">
                    <div>
                      <span className="dot pickup" /> {shortAddress(o.pickup.address)}
                    </div>
                    <div>
                      <span className="dot dropoff" /> {shortAddress(o.dropoff.address)}
                    </div>
                  </div>
                  <div className="row between">
                    <span className="small">
                      {o.passenger.name.split(' ')[0]} <Rating value={o.passenger.rating} /> · {o.paymentMethod === 'cash' ? '💵' : '💳'}
                    </span>
                    <button className="btn primary" disabled={busy} onClick={() => act('accept', o)}>
                      Aceptar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {ride && (
          <div className="ride-panel">
            <div className={`status-pill s-${ride.status}`}>{STATUS_LABELS[ride.status]}</div>
            <div className="person-card">
              <Avatar name={ride.passenger.name} />
              <div className="grow">
                <strong>{ride.passenger.name}</strong> <Rating value={ride.passenger.rating} />
                <div className="muted small">{ride.paymentMethod === 'cash' ? '💵 Cobro en efectivo' : '💳 Cobro con tarjeta'}</div>
              </div>
              <strong>
                <Money amount={ride.fareFinal ?? ride.fareEstimate} currency={ride.currency} />
              </strong>
            </div>
            <div className="trip-lines">
              <div className={ride.status === 'accepted' ? 'current' : ''}>
                <span className="dot pickup" /> {shortAddress(ride.pickup.address)}
              </div>
              <div className={ride.status === 'in_progress' ? 'current' : ''}>
                <span className="dot dropoff" /> {shortAddress(ride.dropoff.address)}
              </div>
            </div>
            {target && me && (
              <p className="muted small">
                {formatDistance(haversineM(me, target))} hasta {ride.status === 'in_progress' ? 'el destino' : 'la recogida'} · ~
                {formatDuration((haversineM(me, target) * 1.3) / (25_000 / 3600))}
              </p>
            )}

            {target && (
              <div className="row gap">
                <a className="btn grow" href={mapsDirectionsUrl(target)} target="_blank" rel="noreferrer">
                  🧭 Navegar
                </a>
                {ride.passenger.phone && ride.status !== 'in_progress' && (
                  <a className="btn grow" href={`tel:${ride.passenger.phone}`}>
                    📞 Llamar
                  </a>
                )}
                <button className="btn grow" disabled={!me} onClick={simulating ? stopSimulation : simulate} title="Modo demostración">
                  {simulating ? '⏸ Parar' : '▶ Simular'}
                </button>
              </div>
            )}

            {ride.status === 'accepted' && (
              <button className="btn primary block big" disabled={busy} onClick={() => act('arrive', ride)}>
                He llegado a la recogida
              </button>
            )}
            {ride.status === 'arrived' && (
              <button className="btn primary block big" disabled={busy} onClick={() => act('start', ride)}>
                Iniciar viaje
              </button>
            )}
            {ride.status === 'in_progress' && (
              <button className="btn success block big" disabled={busy} onClick={() => act('complete', ride)}>
                Finalizar viaje
              </button>
            )}
            {['accepted', 'arrived'].includes(ride.status) && (
              <button className="btn danger-outline block" disabled={busy} onClick={() => act('cancel', ride)}>
                Cancelar viaje
              </button>
            )}

            {ride.status === 'completed' && (
              <div className="center">
                <h3>Viaje finalizado ✅</h3>
                <p>
                  Cobra{' '}
                  <strong>
                    <Money amount={ride.fareFinal ?? ride.fareEstimate} currency={ride.currency} />
                  </strong>{' '}
                  {ride.paymentMethod === 'cash' ? 'en efectivo' : 'con tarjeta'}.
                </p>
                {ride.ratingByDriver ? (
                  <p className="muted">Gracias por valorar al pasajero.</p>
                ) : (
                  <>
                    <p className="muted">Valora al pasajero</p>
                    <Stars value={0} onChange={rate} size={34} />
                  </>
                )}
              </div>
            )}
            {ride.status === 'cancelled' && <p>{ride.cancelledBy === 'passenger' ? 'El pasajero canceló el viaje.' : 'Viaje cancelado.'}</p>}
            {['completed', 'cancelled', 'expired'].includes(ride.status) && (
              <button className="btn primary block" onClick={finish}>
                Seguir trabajando
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

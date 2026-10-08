import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DriverLocation, LatLng, PaymentMethod, Place, Quote, Ride } from '../../../shared/types';
import { formatDistance, formatDuration, haversineM } from '../../../shared/fare';
import { STATUS_LABELS } from '../../../shared/rideState';
import { api, errorMessage } from '../api';
import { useAuth, useSocketEvent } from '../auth';
import { DEFAULT_CENTER, currentPosition, shortAddress } from '../geo';
import MapView, { type MapMarker } from '../components/MapView';
import PlaceSearch from '../components/PlaceSearch';
import { Alert, Avatar, Money, Rating, Spinner, Stars } from '../components/ui';

const FINISHED = ['completed', 'cancelled', 'expired'];

export default function PassengerHome() {
  const { user } = useAuth();
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [selecting, setSelecting] = useState<'pickup' | 'dropoff'>('dropoff');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [ride, setRide] = useState<Ride | null>(null);
  const [driverLoc, setDriverLoc] = useState<DriverLocation | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [fitKey, setFitKey] = useState(0);

  const reverse = useCallback(async (p: LatLng): Promise<Place> => {
    try {
      const { address } = await api<{ address: string }>(`/geo/reverse?lat=${p.lat}&lng=${p.lng}`);
      return { ...p, address };
    } catch {
      return { ...p, address: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` };
    }
  }, []);

  const locateMe = useCallback(async () => {
    try {
      const p = await currentPosition();
      setCenter(p);
      setPickup(await reverse(p));
      setInfo('');
    } catch (e) {
      setInfo(`${errorMessage(e)} Toca el mapa para marcar dónde te recogemos.`);
      setSelecting('pickup');
    }
  }, [reverse]);

  // Estado inicial: viaje en curso (si lo hay) y ubicación.
  useEffect(() => {
    api<{ ride: Ride | null; driverLocation: DriverLocation | null }>('/rides/current')
      .then(({ ride, driverLocation }) => {
        if (ride) {
          setRide(ride);
          setDriverLoc(driverLocation);
          setFitKey((k) => k + 1);
        } else void locateMe();
      })
      .catch((e) => setError(errorMessage(e)));
  }, [locateMe]);

  useSocketEvent<Ride>(
    'ride:update',
    useCallback((r) => {
      setRide((cur) => (!cur || cur.id === r.id ? r : cur));
      if (r.status === 'accepted') navigator.vibrate?.([200, 100, 200]);
    }, []),
  );
  useSocketEvent<DriverLocation>(
    'driver:location',
    useCallback((l) => setDriverLoc((cur) => (cur && cur.driverId !== l.driverId ? cur : l)), []),
  );

  // Cotización automática cuando hay origen y destino.
  useEffect(() => {
    setQuote(null);
    if (!pickup || !dropoff || ride) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    api<Quote>('/rides/quote', { body: { pickup, dropoff } })
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setFitKey((k) => k + 1);
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, ride]);

  async function onMapClick(p: LatLng) {
    if (ride) return;
    const place = await reverse(p);
    if (selecting === 'pickup') {
      setPickup(place);
      setSelecting('dropoff');
    } else setDropoff(place);
  }

  async function requestRide() {
    if (!pickup || !dropoff) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<Ride>('/rides', { body: { pickup, dropoff, paymentMethod: payment } });
      setRide(r);
      setDriverLoc(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRide() {
    if (!ride || !confirm('¿Seguro que quieres cancelar el viaje?')) return;
    setBusy(true);
    try {
      setRide(await api<Ride>(`/rides/${ride.id}/cancel`, { body: {} }));
    } catch (e) {
      setError(errorMessage(e));
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

  function reset() {
    setRide(null);
    setDropoff(null);
    setQuote(null);
    setDriverLoc(null);
    setSelecting('dropoff');
    if (!pickup) void locateMe();
  }

  const shownPickup = ride?.pickup ?? pickup;
  const shownDropoff = ride?.dropoff ?? dropoff;
  const route = ride ? ride.geometry : (quote?.geometry ?? null);
  const showDriver = ride && driverLoc && ['accepted', 'arrived', 'in_progress'].includes(ride.status);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (shownPickup) m.push({ id: 'pickup', kind: 'pickup', ...shownPickup, title: 'Recogida' });
    if (shownDropoff) m.push({ id: 'dropoff', kind: 'dropoff', ...shownDropoff, title: 'Destino' });
    if (showDriver) m.push({ id: 'driver', kind: 'car', lat: driverLoc!.lat, lng: driverLoc!.lng, heading: driverLoc!.heading, title: 'Tu conductor' });
    return m;
  }, [shownPickup, shownDropoff, showDriver, driverLoc]);

  const etaToPickup =
    ride && driverLoc && ride.status === 'accepted' ? Math.max(60, (haversineM(driverLoc, ride.pickup) * 1.3) / (25_000 / 3600)) : null;

  return (
    <div className="map-screen">
      <MapView center={center} markers={markers} route={route} fitKey={fitKey} onClick={onMapClick} />
      {!ride && (
        <button className="fab locate" onClick={() => void locateMe()} title="Usar mi ubicación" aria-label="Usar mi ubicación">
          ◎
        </button>
      )}

      <section className="sheet">
        <Alert>{error}</Alert>
        {!ride && (
          <>
            <h2 className="sheet-title">Hola, {user?.name.split(' ')[0]} 👋</h2>
            <Alert kind="info">{info}</Alert>
            <div className="route-inputs">
              <PlaceSearch
                label="Punto de recogida"
                dot="pickup"
                value={pickup}
                placeholder="¿Dónde te recogemos?"
                near={pickup ?? center}
                active={selecting === 'pickup'}
                onFocus={() => setSelecting('pickup')}
                onSelect={(p) => {
                  setPickup(p);
                  setCenter(p);
                  setSelecting('dropoff');
                }}
              />
              <PlaceSearch
                label="Destino"
                dot="dropoff"
                value={dropoff}
                placeholder="¿A dónde vas?"
                near={pickup ?? center}
                active={selecting === 'dropoff'}
                onFocus={() => setSelecting('dropoff')}
                onSelect={setDropoff}
              />
            </div>
            <p className="muted small hint">
              También puedes tocar el mapa para marcar {selecting === 'pickup' ? 'la recogida' : 'el destino'}.
            </p>

            {busy && !quote && (
              <p className="center">
                <Spinner /> Calculando tarifa…
              </p>
            )}
            {quote && (
              <div className="quote">
                <div className="quote-main">
                  <div>
                    <div className="vehicle-type">🚕 Taxi</div>
                    <div className="muted small">
                      {formatDistance(quote.distanceM)} · {formatDuration(quote.durationS)}
                      {quote.approximate && ' (aprox.)'}
                    </div>
                  </div>
                  <div className="price">
                    <Money amount={quote.fare} currency={quote.currency} />
                  </div>
                </div>
                <div className="segmented" role="radiogroup" aria-label="Forma de pago">
                  <button type="button" className={payment === 'cash' ? 'on' : ''} aria-pressed={payment === 'cash'} onClick={() => setPayment('cash')}>
                    💵 Efectivo
                  </button>
                  <button type="button" className={payment === 'card' ? 'on' : ''} aria-pressed={payment === 'card'} onClick={() => setPayment('card')}>
                    💳 Tarjeta al conductor
                  </button>
                </div>
                <button className="btn primary block big" disabled={busy} onClick={requestRide}>
                  {busy ? <Spinner /> : 'Pedir taxi'}
                </button>
              </div>
            )}
          </>
        )}

        {ride && (
          <div className="ride-panel">
            <div className={`status-pill s-${ride.status}`}>{STATUS_LABELS[ride.status]}</div>

            {ride.status === 'requested' && (
              <div className="searching">
                <div className="pulse" aria-hidden="true">🚕</div>
                <p>Avisando a los conductores cercanos…</p>
              </div>
            )}

            {ride.driver && ['accepted', 'arrived', 'in_progress', 'completed'].includes(ride.status) && (
              <div className="person-card">
                <Avatar name={ride.driver.name} />
                <div className="grow">
                  <strong>{ride.driver.name}</strong> <Rating value={ride.driver.rating} />
                  {ride.driver.vehicle && (
                    <div className="muted small">
                      {ride.driver.vehicle.make} {ride.driver.vehicle.model} · {ride.driver.vehicle.color}
                    </div>
                  )}
                </div>
                {ride.driver.vehicle && <div className="plate">{ride.driver.vehicle.plate}</div>}
              </div>
            )}

            {ride.status === 'accepted' && etaToPickup && <p className="big-text">Llega en ~{formatDuration(etaToPickup)}</p>}
            {ride.status === 'arrived' && <p className="big-text">¡Tu taxi te está esperando! 🚕</p>}
            {ride.status === 'in_progress' && <p className="big-text">Rumbo a {shortAddress(ride.dropoff.address)}</p>}

            <div className="trip-lines">
              <div>
                <span className="dot pickup" /> {shortAddress(ride.pickup.address)}
              </div>
              <div>
                <span className="dot dropoff" /> {shortAddress(ride.dropoff.address)}
              </div>
            </div>

            <div className="row between">
              <span className="muted">{ride.paymentMethod === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'}</span>
              <strong>
                <Money amount={ride.fareFinal ?? ride.fareEstimate} currency={ride.currency} />
              </strong>
            </div>

            {ride.driver && ['accepted', 'arrived'].includes(ride.status) && ride.driver.phone && (
              <a className="btn block" href={`tel:${ride.driver.phone}`}>
                📞 Llamar al conductor
              </a>
            )}
            {['requested', 'accepted', 'arrived'].includes(ride.status) && (
              <button className="btn danger-outline block" disabled={busy} onClick={cancelRide}>
                Cancelar viaje
              </button>
            )}

            {ride.status === 'completed' && (
              <div className="center">
                <h3>¡Has llegado! 🎉</h3>
                {ride.ratingByPassenger ? (
                  <p>Gracias por tu valoración.</p>
                ) : (
                  <>
                    <p>¿Qué tal fue tu viaje con {ride.driver?.name.split(' ')[0]}?</p>
                    <Stars value={0} onChange={rate} size={36} />
                  </>
                )}
              </div>
            )}
            {ride.status === 'expired' && <p>No encontramos un conductor libre. Inténtalo de nuevo en unos minutos.</p>}
            {ride.status === 'cancelled' && ride.cancelledBy !== 'passenger' && (
              <p>{ride.cancelledBy === 'driver' ? 'El conductor canceló el viaje.' : 'La central canceló el viaje.'} Puedes pedir otro.</p>
            )}
            {FINISHED.includes(ride.status) && (
              <button className="btn primary block" onClick={reset}>
                {ride.status === 'completed' ? 'Listo' : 'Pedir otro taxi'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { Ride } from '../../../shared/types';
import { formatDistance, formatMoney } from '../../../shared/fare';
import { STATUS_LABELS } from '../../../shared/rideState';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { shortAddress } from '../geo';
import { Alert, Spinner, Stars, formatDate } from '../components/ui';

interface Earnings {
  currency: string;
  today: { rides: number; total: number };
  week: { rides: number; total: number };
  total: { rides: number; total: number };
}

export function RideList({ rides, viewer }: { rides: Ride[]; viewer: 'passenger' | 'driver' | 'admin' }) {
  if (rides.length === 0) return <p className="muted center">Aún no hay viajes.</p>;
  return (
    <ul className="ride-list">
      {rides.map((r) => (
        <li key={r.id} className="card">
          <div className="row between">
            <span className="muted small">
              #{r.id} · {formatDate(r.requestedAt)}
            </span>
            <span className={`status-pill small s-${r.status}`}>{STATUS_LABELS[r.status]}</span>
          </div>
          <div className="trip-lines">
            <div>
              <span className="dot pickup" /> {shortAddress(r.pickup.address)}
            </div>
            <div>
              <span className="dot dropoff" /> {shortAddress(r.dropoff.address)}
            </div>
          </div>
          <div className="row between">
            <span className="small muted">
              {viewer !== 'driver' && r.driver && `🚕 ${r.driver.name}${r.driver.vehicle ? ` (${r.driver.vehicle.plate})` : ''}`}
              {viewer === 'driver' && `🧍 ${r.passenger.name}`}
              {viewer === 'admin' && ` · 🧍 ${r.passenger.name}`}
              {' · '}
              {formatDistance(r.distanceM)}
            </span>
            <strong>{formatMoney(r.fareFinal ?? r.fareEstimate, r.currency)}</strong>
          </div>
          {r.status === 'completed' && viewer !== 'admin' && (
            <div className="small muted row gap">
              Tu valoración: <Stars value={(viewer === 'passenger' ? r.ratingByPassenger : r.ratingByDriver) ?? 0} size={14} />
            </div>
          )}
          {r.cancelReason && <div className="small muted">Motivo: {r.cancelReason}</div>}
        </li>
      ))}
    </ul>
  );
}

export function History() {
  const { user } = useAuth();
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Ride[]>('/rides')
      .then(setRides)
      .catch((e) => setError(errorMessage(e)));
    if (user?.role === 'driver' && user.status === 'active') {
      api<Earnings>('/driver/earnings')
        .then(setEarnings)
        .catch(() => undefined);
    }
  }, [user]);

  return (
    <main className="page narrow">
      <h1>{user?.role === 'driver' ? 'Ganancias y viajes' : 'Mis viajes'}</h1>
      <Alert>{error}</Alert>
      {earnings && (
        <div className="stats-grid three">
          {(
            [
              ['Hoy', earnings.today],
              ['Esta semana', earnings.week],
              ['Total', earnings.total],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="stat card">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{formatMoney(v.total, earnings.currency)}</div>
              <div className="muted small">
                {v.rides} viaje{v.rides === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}
      {rides === null ? (
        <p className="center">
          <Spinner />
        </p>
      ) : (
        <RideList rides={rides} viewer={user?.role === 'driver' ? 'driver' : 'passenger'} />
      )}
    </main>
  );
}

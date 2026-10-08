import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import type { DriverLocation, PublicUser, Ride, RideStatus, Tariff } from '../../../shared/types';
import { calculateFare, formatMoney } from '../../../shared/fare';
import { STATUS_LABELS } from '../../../shared/rideState';
import { api, errorMessage } from '../api';
import { useSocketEvent } from '../auth';
import { DEFAULT_CENTER, shortAddress } from '../geo';
import MapView, { type MapMarker } from '../components/MapView';
import { Alert, Rating, Spinner, formatDate } from '../components/ui';
import { RideList } from './History';

interface Stats {
  currency: string;
  ridesToday: number;
  completedToday: number;
  revenueToday: number;
  activeRides: number;
  onlineDrivers: number;
  pendingDrivers: number;
  passengers: number;
  drivers: number;
}

type AdminUser = PublicUser & { online: boolean };

export default function Admin() {
  return (
    <main className="page wide">
      <nav className="tabs">
        <NavLink to="/admin" end>
          Resumen
        </NavLink>
        <NavLink to="/admin/conductores">Conductores</NavLink>
        <NavLink to="/admin/pasajeros">Pasajeros</NavLink>
        <NavLink to="/admin/viajes">Viajes</NavLink>
        <NavLink to="/admin/tarifas">Tarifas</NavLink>
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="conductores" element={<Users role="driver" />} />
        <Route path="pasajeros" element={<Users role="passenger" />} />
        <Route path="viajes" element={<Rides />} />
        <Route path="tarifas" element={<TariffForm />} />
      </Routes>
    </main>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState('');
  const [fitKey, setFitKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, live] = await Promise.all([api<Stats>('/admin/stats'), api<{ drivers: DriverLocation[]; rides: Ride[] }>('/admin/live')]);
      setStats(s);
      setDrivers(live.drivers);
      setRides(live.rides);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load().then(() => setFitKey(1));
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  useSocketEvent<DriverLocation>(
    'driver:location',
    useCallback((l) => setDrivers((cur) => [...cur.filter((d) => d.driverId !== l.driverId), l]), []),
  );
  useSocketEvent<Ride>(
    'ride:update',
    useCallback(
      (r) => {
        setRides((cur) => {
          const rest = cur.filter((x) => x.id !== r.id);
          return ['requested', 'accepted', 'arrived', 'in_progress'].includes(r.status) ? [r, ...rest] : rest;
        });
        void api<Stats>('/admin/stats').then(setStats).catch(() => undefined);
      },
      [],
    ),
  );
  useSocketEvent('admin:changed', load);

  const busyDrivers = useMemo(() => new Set(rides.map((r) => r.driver?.id).filter(Boolean)), [rides]);
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = drivers.map((d) => ({
      id: `d${d.driverId}`,
      kind: !d.online ? 'car-off' : busyDrivers.has(d.driverId) ? 'car-busy' : 'car',
      lat: d.lat,
      lng: d.lng,
      heading: d.heading,
      title: `Conductor #${d.driverId}${d.online ? '' : ' (desconectado)'}`,
    }));
    for (const r of rides) m.push({ id: `r${r.id}`, kind: r.status === 'in_progress' ? 'dropoff' : 'pickup', ...(r.status === 'in_progress' ? r.dropoff : r.pickup), title: `Viaje #${r.id}` });
    return m;
  }, [drivers, rides, busyDrivers]);

  async function cancel(r: Ride) {
    if (!confirm(`¿Cancelar el viaje #${r.id}? Se avisará al pasajero y al conductor.`)) return;
    try {
      await api(`/admin/rides/${r.id}/cancel`, { body: {} });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <Alert>{error}</Alert>
      {stats && (
        <div className="stats-grid">
          <Stat label="Viajes hoy" value={stats.ridesToday} />
          <Stat label="Completados hoy" value={stats.completedToday} />
          <Stat label="Facturado hoy" value={formatMoney(stats.revenueToday, stats.currency)} />
          <Stat label="Viajes activos" value={stats.activeRides} />
          <Stat label="Conductores conectados" value={`${stats.onlineDrivers} / ${stats.drivers}`} />
          <Stat label="Conductores por aprobar" value={stats.pendingDrivers} warn={stats.pendingDrivers > 0} />
          <Stat label="Pasajeros" value={stats.passengers} />
        </div>
      )}
      <div className="admin-live">
        <div className="card map-card">
          <MapView center={drivers[0] ?? DEFAULT_CENTER} zoom={12} markers={markers} fitKey={fitKey} className="map" />
          <div className="legend small">
            <span>🟡 Libre</span> <span>🔵 Ocupado</span> <span>⚪ Desconectado</span> <span>🟢 Recogida</span> <span>🔴 Destino</span>
          </div>
        </div>
        <div className="card">
          <h3>Viajes en curso ({rides.length})</h3>
          {rides.length === 0 && <p className="muted">No hay viajes activos ahora mismo.</p>}
          <ul className="live-rides">
            {rides.map((r) => (
              <li key={r.id}>
                <div className="row between">
                  <strong>#{r.id}</strong>
                  <span className={`status-pill small s-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                </div>
                <div className="small">
                  🧍 {r.passenger.name} {r.driver && <>· 🚕 {r.driver.name}</>}
                </div>
                <div className="small muted">
                  {shortAddress(r.pickup.address)} → {shortAddress(r.dropoff.address)}
                </div>
                <div className="row between">
                  <span className="small">{formatMoney(r.fareEstimate, r.currency)}</span>
                  <button className="btn small danger-outline" onClick={() => cancel(r)}>
                    Cancelar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`stat card ${warn ? 'warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

const STATUS_TEXT = { active: 'Activo', pending: 'Pendiente', blocked: 'Bloqueado' } as const;

function Users({ role }: { role: 'driver' | 'passenger' }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<AdminUser[]>(`/admin/users?role=${role}`)
      .then(setUsers)
      .catch((e) => setError(errorMessage(e)));
  }, [role]);
  useEffect(load, [load]);
  useSocketEvent('admin:changed', load);

  async function setStatus(u: AdminUser, status: 'active' | 'blocked') {
    if (status === 'blocked' && !confirm(`¿Bloquear a ${u.name}? No podrá usar la app.`)) return;
    try {
      const updated = await api<PublicUser>(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } });
      setUsers((cur) => cur?.map((x) => (x.id === u.id ? { ...x, ...updated, online: status === 'active' && x.online } : x)) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const q = filter.trim().toLowerCase();
  const shown = (users ?? [])
    .filter((u) => !q || [u.name, u.email, u.phone, u.vehicle?.plate ?? ''].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));

  return (
    <>
      <Alert>{error}</Alert>
      <div className="row between toolbar">
        <h2>{role === 'driver' ? 'Conductores' : 'Pasajeros'}</h2>
        <input type="search" placeholder="Buscar por nombre, correo, teléfono o matrícula…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {users === null ? (
        <Spinner />
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                {role === 'driver' && <th>Vehículo</th>}
                <th>Valoración</th>
                <th>Estado</th>
                <th>Alta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {role === 'driver' && u.online && <span className="badge ok">En línea</span>}
                  </td>
                  <td className="small">
                    {u.email}
                    <br />
                    {u.phone}
                  </td>
                  {role === 'driver' && (
                    <td className="small">
                      {u.vehicle ? (
                        <>
                          {u.vehicle.make} {u.vehicle.model} · {u.vehicle.color}
                          <br />
                          <span className="plate">{u.vehicle.plate}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td>
                    <Rating value={u.rating} /> <span className="muted small">({u.ratingCount})</span>
                  </td>
                  <td>
                    <span className={`badge ${u.status}`}>{STATUS_TEXT[u.status]}</span>
                  </td>
                  <td className="small">{formatDate(u.createdAt)}</td>
                  <td className="actions">
                    {u.status !== 'active' && (
                      <button className="btn small primary" onClick={() => setStatus(u, 'active')}>
                        {u.status === 'pending' ? 'Aprobar' : 'Desbloquear'}
                      </button>
                    )}
                    {u.status !== 'blocked' && (
                      <button className="btn small danger-outline" onClick={() => setStatus(u, 'blocked')}>
                        Bloquear
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted center">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const FILTERS: ('' | RideStatus)[] = ['', 'requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired'];

function Rides() {
  const [status, setStatus] = useState<'' | RideStatus>('');
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRides(null);
    api<Ride[]>(`/admin/rides?limit=200${status ? `&status=${status}` : ''}`)
      .then(setRides)
      .catch((e) => setError(errorMessage(e)));
  }, [status]);

  return (
    <>
      <Alert>{error}</Alert>
      <div className="row between toolbar">
        <h2>Viajes</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value as RideStatus | '')} aria-label="Filtrar por estado">
          {FILTERS.map((s) => (
            <option key={s} value={s}>
              {s ? STATUS_LABELS[s] : 'Todos los estados'}
            </option>
          ))}
        </select>
      </div>
      {rides === null ? <Spinner /> : <RideList rides={rides} viewer="admin" />}
    </>
  );
}

function TariffForm() {
  const [t, setT] = useState<Tariff | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Tariff>('/tariff')
      .then(setT)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (!t) return <Spinner />;

  const num = (k: keyof Tariff) => (e: React.ChangeEvent<HTMLInputElement>) => setT({ ...t, [k]: e.target.value === '' ? 0 : Number(e.target.value) });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved('');
    try {
      setT(await api<Tariff>('/admin/tariff', { method: 'PUT', body: { ...t, currency: t!.currency.toUpperCase() } }));
      setSaved('Tarifa guardada. Se aplica a los nuevos viajes.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const examples = [
    [3000, 600],
    [8000, 1200],
    [20000, 1800],
  ] as const;

  return (
    <div className="tariff-layout">
      <form className="card form" onSubmit={save}>
        <h2>Tarifas</h2>
        <Alert>{error}</Alert>
        <Alert kind="success">{saved}</Alert>
        <label>
          Moneda (código ISO)
          <input value={t.currency} maxLength={3} onChange={(e) => setT({ ...t, currency: e.target.value.toUpperCase() })} />
        </label>
        <div className="grid2">
          <label>
            Bajada de bandera
            <input type="number" step="0.01" min="0" value={t.baseFare} onChange={num('baseFare')} />
          </label>
          <label>
            Precio por km
            <input type="number" step="0.01" min="0" value={t.perKm} onChange={num('perKm')} />
          </label>
          <label>
            Precio por minuto
            <input type="number" step="0.01" min="0" value={t.perMinute} onChange={num('perMinute')} />
          </label>
          <label>
            Tarifa mínima
            <input type="number" step="0.01" min="0" value={t.minimumFare} onChange={num('minimumFare')} />
          </label>
          <label>
            Multiplicador por demanda
            <input type="number" step="0.1" min="1" max="5" value={t.surge} onChange={num('surge')} />
          </label>
        </div>
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : 'Guardar tarifa'}
        </button>
      </form>
      <div className="card">
        <h3>Vista previa</h3>
        <p className="muted small">Precio = máx(mínima, bandera + km × precio/km + min × precio/min) × multiplicador</p>
        <table>
          <tbody>
            {examples.map(([m, s]) => (
              <tr key={m}>
                <td>
                  {m / 1000} km · {s / 60} min
                </td>
                <td className="right">
                  <strong>{formatMoney(calculateFare(m, s, t), /^[A-Z]{3}$/.test(t.currency) ? t.currency : 'USD')}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

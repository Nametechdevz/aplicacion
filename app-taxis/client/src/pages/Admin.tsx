import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Analytics, DriverLocation, PublicUser, Ride, RideStatus, Tariff } from '../../../shared/types';
import { calculateFare, defaultRoundTo, formatDistance, formatMoney, formatMoneyShort } from '../../../shared/fare';
import { STATUS_LABELS } from '../../../shared/rideState';
import { api, errorMessage } from '../api';
import { useAuth, useSocketEvent } from '../auth';
import { DEFAULT_CENTER, shortAddress } from '../geo';
import MapView, { type MapMarker } from '../components/MapView';
import Icon, { type IconName } from '../components/Icon';
import { BarList, ColumnChart } from '../components/charts';
import { Alert, Avatar, Rating, Spinner, formatDate } from '../components/ui';
import Profile from './Profile';

interface Stats {
  currency: string;
  ridesToday: number;
  ridesYesterday: number;
  completedToday: number;
  revenueToday: number;
  revenueYesterday: number;
  activeRides: number;
  onlineDrivers: number;
  pendingDrivers: number;
  passengers: number;
  drivers: number;
}

type AdminUser = PublicUser & { online: boolean };

const ACTIVE: RideStatus[] = ['requested', 'accepted', 'arrived', 'in_progress'];

const NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/admin', icon: 'dashboard', label: 'Resumen', end: true },
  { to: '/admin/mapa', icon: 'map', label: 'Mapa en vivo' },
  { to: '/admin/viajes', icon: 'receipt', label: 'Viajes' },
  { to: '/admin/conductores', icon: 'car', label: 'Conductores' },
  { to: '/admin/pasajeros', icon: 'users', label: 'Pasajeros' },
  { to: '/admin/tarifas', icon: 'tag', label: 'Tarifas' },
];

/* ------------------------------------------------------------------ */
/* Estructura: barra lateral + contenido                               */
/* ------------------------------------------------------------------ */

export default function Admin() {
  const { user, logout, connected } = useAuth();
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const loadPending = useCallback(() => {
    api<Stats>('/admin/stats')
      .then((s) => setPending(s.pendingDrivers))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadPending();
    const t = setInterval(loadPending, 30_000);
    return () => clearInterval(t);
  }, [loadPending]);
  useSocketEvent('admin:changed', loadPending);
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`admin ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Menú de la central">
        <Link to="/admin" className="sidebar-brand">
          <img src="/icon.svg" alt="" width={34} height={34} />
          <span>
            TaxiYa <small>Central</small>
          </span>
        </Link>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.to === '/admin/conductores' && pending > 0 && <span className="nav-badge">{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/admin/perfil" className="sidebar-user">
            <Avatar name={user?.name ?? 'C'} />
            <span className="grow">
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </span>
          </NavLink>
          <button className="sidebar-logout" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setOpen(false)} />

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Icon name="menu" size={22} />
          </button>
          <Link to="/admin" className="topbar-brand">
            <img src="/icon.svg" alt="" width={28} height={28} /> TaxiYa
          </Link>
          <div className="grow" />
          <span className={`live-pill ${connected ? 'on' : ''}`} title={connected ? 'Recibiendo datos en tiempo real' : 'Reconectando…'}>
            <span className="live-dot" /> {connected ? 'En vivo' : 'Reconectando…'}
          </span>
        </header>
        <main className="admin-content">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="mapa" element={<LivePage />} />
            <Route path="viajes" element={<Rides />} />
            <Route path="conductores" element={<Users role="driver" />} />
            <Route path="pasajeros" element={<Users role="passenger" />} />
            <Route path="tarifas" element={<TariffForm />} />
            <Route path="perfil" element={<Profile />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function todayText() {
  return capitalize(new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }));
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

function Kpi({
  icon,
  label,
  value,
  foot,
  tone,
  to,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  tone?: 'accent' | 'warn' | 'live';
  to?: string;
}) {
  const body = (
    <>
      <div className="kpi-top">
        <span className={`kpi-icon ${tone ?? ''}`}>
          <Icon name={icon} size={20} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </>
  );
  return to ? (
    <Link to={to} className={`kpi card link ${tone ?? ''}`}>
      {body}
    </Link>
  ) : (
    <div className={`kpi card ${tone ?? ''}`}>{body}</div>
  );
}

function Delta({ now, before, money }: { now: number; before: number; money?: string }) {
  if (before === 0 && now === 0) return <span className="muted">Sin movimiento ayer</span>;
  if (before === 0) return <span className="delta up">Ayer: {money ? formatMoney(0, money) : 0}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      <Icon name={up ? 'up' : 'down'} size={14} /> {Math.abs(pct)}% <span className="muted">vs. ayer</span>
    </span>
  );
}

const RANGES = [7, 14, 30] as const;

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [an, setAn] = useState<Analytics | null>(null);
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const [metric, setMetric] = useState<'revenue' | 'rides'>('revenue');
  const [error, setError] = useState('');

  const loadStats = useCallback(() => {
    api<Stats>('/admin/stats')
      .then(setStats)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const loadAnalytics = useCallback(() => {
    api<Analytics>(`/admin/analytics?days=${days}`)
      .then(setAn)
      .catch((e) => setError(errorMessage(e)));
  }, [days]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 30_000);
    return () => clearInterval(t);
  }, [loadStats]);
  useEffect(loadAnalytics, [loadAnalytics]);
  useSocketEvent(
    'ride:update',
    useCallback(
      (r: Ride) => {
        loadStats();
        if (!ACTIVE.includes(r.status)) loadAnalytics();
      },
      [loadStats, loadAnalytics],
    ),
  );
  useSocketEvent('admin:changed', loadStats);

  const cur = stats?.currency ?? an?.currency ?? 'COP';
  const chartData = useMemo(
    () =>
      (an?.days ?? []).map((d) => {
        const date = new Date(`${d.date}T12:00:00`);
        return {
          key: d.date,
          label: date.toLocaleDateString('es-CO', days > 14 ? { day: 'numeric', month: 'numeric' } : { weekday: 'short', day: 'numeric' }),
          fullLabel: capitalize(date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })),
          value: metric === 'revenue' ? d.revenue : d.rides,
          extra:
            metric === 'revenue'
              ? `${d.completed} viaje${d.completed === 1 ? '' : 's'} completado${d.completed === 1 ? '' : 's'}`
              : `${d.completed} completado${d.completed === 1 ? '' : 's'} · ${formatMoney(d.revenue, an!.currency)}`,
        };
      }),
    [an, metric, days],
  );

  const sc = an?.statusCounts;
  const finished = sc ? sc.completed + sc.cancelled + sc.expired : 0;
  const completion = finished ? Math.round((sc!.completed / finished) * 100) : null;

  return (
    <>
      <PageHeader title={`${greeting()}, ${user?.name.split(' ')[0] ?? 'Central'}`} subtitle={todayText()} />
      <Alert>{error}</Alert>

      <div className="kpi-grid">
        <Kpi
          icon="money"
          tone="accent"
          label="Facturado hoy"
          value={stats ? formatMoney(stats.revenueToday, cur) : '—'}
          foot={stats && <Delta now={stats.revenueToday} before={stats.revenueYesterday} money={cur} />}
        />
        <Kpi
          icon="receipt"
          label="Viajes hoy"
          value={stats?.ridesToday ?? '—'}
          foot={stats && `${stats.completedToday} completados · ayer ${stats.ridesYesterday}`}
        />
        <Kpi
          icon="activity"
          tone="live"
          label="En curso ahora"
          value={stats?.activeRides ?? '—'}
          foot={<Link to="/admin/mapa">Ver en el mapa →</Link>}
        />
        <Kpi
          icon="car"
          label="Conductores en línea"
          value={
            stats ? (
              <>
                {stats.onlineDrivers} <small>de {stats.drivers}</small>
              </>
            ) : (
              '—'
            )
          }
          foot={
            stats && (
              <div className="meter" aria-hidden="true">
                <div style={{ width: `${stats.drivers ? (stats.onlineDrivers / stats.drivers) * 100 : 0}%` }} />
              </div>
            )
          }
        />
        <Kpi
          icon="clock"
          tone={stats?.pendingDrivers ? 'warn' : undefined}
          label="Conductores por aprobar"
          value={stats?.pendingDrivers ?? '—'}
          foot={stats?.pendingDrivers ? 'Revisar ahora →' : 'Todo al día'}
          to="/admin/conductores"
        />
        <Kpi icon="users" label="Pasajeros registrados" value={stats?.passengers ?? '—'} foot={<Link to="/admin/pasajeros">Ver pasajeros →</Link>} />
      </div>

      <div className="dash-grid">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h2>{metric === 'revenue' ? 'Facturación por día' : 'Viajes solicitados por día'}</h2>
              {an && (
                <p className="muted small">
                  {metric === 'revenue' ? (
                    <>
                      <strong className="hero-inline">{formatMoney(an.totals.revenue, an.currency)}</strong> en {days} días · ticket medio{' '}
                      {formatMoney(an.totals.avgFare, an.currency)}
                    </>
                  ) : (
                    <>
                      <strong className="hero-inline">{an.totals.rides}</strong> viajes en {days} días · {an.totals.completed} completados
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="row gap">
              <div className="seg small" role="group" aria-label="Métrica">
                <button className={metric === 'revenue' ? 'on' : ''} aria-pressed={metric === 'revenue'} onClick={() => setMetric('revenue')}>
                  Dinero
                </button>
                <button className={metric === 'rides' ? 'on' : ''} aria-pressed={metric === 'rides'} onClick={() => setMetric('rides')}>
                  Viajes
                </button>
              </div>
              <div className="seg small" role="group" aria-label="Periodo">
                {RANGES.map((r) => (
                  <button key={r} className={days === r ? 'on' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>
                    {r} d
                  </button>
                ))}
              </div>
            </div>
          </div>
          {an ? (
            <ColumnChart
              title={metric === 'revenue' ? 'Facturación por día' : 'Viajes por día'}
              data={chartData}
              format={(v) => (metric === 'revenue' ? formatMoney(v, an.currency) : `${v} viaje${v === 1 ? '' : 's'}`)}
              formatAxis={(v) => (metric === 'revenue' ? formatMoneyShort(v, an.currency) : String(Math.round(v)))}
            />
          ) : (
            <div className="chart-skeleton" />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Estado de los viajes</h2>
            <span className="muted small">{days} días</span>
          </div>
          {sc ? (
            <>
              <div className="hero-number">
                {completion === null ? '—' : `${completion}%`}
                <span>de los viajes terminados se completaron</span>
              </div>
              <BarList
                total={an!.totals.rides}
                items={[
                  { label: 'Completados', value: sc.completed },
                  { label: 'Cancelados', value: sc.cancelled },
                  { label: 'Sin conductor disponible', value: sc.expired },
                  { label: 'En curso', value: sc.requested + sc.accepted + sc.arrived + sc.in_progress },
                ]}
              />
            </>
          ) : (
            <Spinner />
          )}
        </section>
      </div>

      <div className="dash-grid">
        <LiveBoard compact />
      </div>

      <div className="dash-grid single">
        <section className="card">
          <div className="card-head">
            <h2>
              <Icon name="trophy" /> Mejores conductores
            </h2>
            <span className="muted small">{days} días</span>
          </div>
          {an && an.topDrivers.length === 0 && <p className="muted">Aún no hay viajes completados en este periodo.</p>}
          <ol className="leaderboard">
            {an?.topDrivers.map((d, i) => (
              <li key={d.id}>
                <span className="rank">{i + 1}</span>
                <Avatar name={d.name} />
                <span className="grow">
                  <strong>{d.name}</strong>
                  <small className="muted">
                    {d.rides} viaje{d.rides === 1 ? '' : 's'} · <Rating value={d.rating} />
                  </small>
                </span>
                <strong>{formatMoney(d.revenue, an.currency)}</strong>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa en vivo                                                        */
/* ------------------------------------------------------------------ */

function LivePage() {
  return (
    <>
      <PageHeader title="Mapa en vivo" subtitle="Posición de la flota y viajes activos, actualizados al instante." />
      <div className="live-page">
        <LiveBoard />
      </div>
    </>
  );
}

function LiveBoard({ compact }: { compact?: boolean }) {
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState('');
  const [fitKey, setFitKey] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const live = await api<{ drivers: DriverLocation[]; rides: Ride[] }>('/admin/live');
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
    useCallback((r) => {
      setRides((cur) => {
        const rest = cur.filter((x) => x.id !== r.id);
        return ACTIVE.includes(r.status) ? [r, ...rest] : rest;
      });
    }, []),
  );

  const busy = useMemo(() => new Set(rides.map((r) => r.driver?.id).filter(Boolean)), [rides]);
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = drivers.map((d) => ({
      id: `d${d.driverId}`,
      kind: !d.online ? 'car-off' : busy.has(d.driverId) ? 'car-busy' : 'car',
      lat: d.lat,
      lng: d.lng,
      heading: d.heading,
      title: `Conductor #${d.driverId}${d.online ? '' : ' (desconectado)'}`,
    }));
    for (const r of rides) {
      const p = r.status === 'in_progress' ? r.dropoff : r.pickup;
      m.push({ id: `r${r.id}`, kind: r.status === 'in_progress' ? 'dropoff' : 'pickup', ...p, title: `Viaje #${r.id}` });
    }
    return m;
  }, [drivers, rides, busy]);

  const free = drivers.filter((d) => d.online && !busy.has(d.driverId)).length;

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
      <section className={`card map-card ${compact ? '' : 'tall'}`}>
        <div className="map-card-head">
          <h2>
            <Icon name="map" /> Flota en el mapa
          </h2>
          <div className="legend">
            <span>
              <i className="sw car" /> Libre ({free})
            </span>
            <span>
              <i className="sw busy" /> Ocupado ({busy.size})
            </span>
            <span>
              <i className="sw off" /> Desconectado
            </span>
          </div>
        </div>
        <Alert>{error}</Alert>
        <MapView center={drivers[0] ?? DEFAULT_CENTER} zoom={12} markers={markers} fitKey={fitKey} className="map" />
      </section>
      <section className="card live-list">
        <div className="card-head">
          <h2>Viajes en curso</h2>
          <span className="count-badge">{rides.length}</span>
        </div>
        {rides.length === 0 && (
          <div className="empty">
            <Icon name="check" size={28} />
            <p>No hay viajes activos ahora mismo.</p>
          </div>
        )}
        <ul>
          {rides.map((r) => (
            <li key={r.id}>
              <div className="row between">
                <strong>Viaje #{r.id}</strong>
                <StatusChip status={r.status} />
              </div>
              <div className="trip-lines small">
                <div>
                  <span className="dot pickup" /> {shortAddress(r.pickup.address)}
                </div>
                <div>
                  <span className="dot dropoff" /> {shortAddress(r.dropoff.address)}
                </div>
              </div>
              <div className="row between small">
                <span className="muted">
                  {r.passenger.name.split(' ')[0]}
                  {r.driver ? ` · 🚕 ${r.driver.name.split(' ')[0]}` : ''}
                </span>
                <strong>{formatMoney(r.fareEstimate, r.currency)}</strong>
              </div>
              <button className="btn small danger-outline" onClick={() => cancel(r)}>
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function StatusChip({ status }: { status: RideStatus }) {
  return <span className={`status-pill small s-${status}`}>{STATUS_LABELS[status]}</span>;
}

/* ------------------------------------------------------------------ */
/* Conductores y pasajeros                                             */
/* ------------------------------------------------------------------ */

const STATUS_TEXT = { active: 'Activo', pending: 'Pendiente', blocked: 'Bloqueado' } as const;
type UserFilter = 'all' | 'pending' | 'active' | 'blocked' | 'online';

function Users({ role }: { role: 'driver' | 'passenger' }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<AdminUser[]>(`/admin/users?role=${role}`)
      .then((u) => {
        setUsers(u);
        if (role === 'driver' && u.some((x) => x.status === 'pending')) setFilter((f) => (f === 'all' ? 'pending' : f));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [role]);
  useEffect(() => {
    setFilter('all');
    load();
  }, [load]);
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

  const count = (f: UserFilter) =>
    (users ?? []).filter((u) => (f === 'all' ? true : f === 'online' ? u.online : u.status === f)).length;
  const needle = q.trim().toLowerCase();
  const shown = (users ?? []).filter(
    (u) =>
      (filter === 'all' || (filter === 'online' ? u.online : u.status === filter)) &&
      (!needle || [u.name, u.email, u.phone, u.vehicle?.plate ?? ''].some((s) => s.toLowerCase().includes(needle))),
  );
  const filters: [UserFilter, string][] =
    role === 'driver'
      ? [
          ['all', 'Todos'],
          ['pending', 'Por aprobar'],
          ['online', 'En línea'],
          ['active', 'Activos'],
          ['blocked', 'Bloqueados'],
        ]
      : [
          ['all', 'Todos'],
          ['active', 'Activos'],
          ['blocked', 'Bloqueados'],
        ];

  return (
    <>
      <PageHeader
        title={role === 'driver' ? 'Conductores' : 'Pasajeros'}
        subtitle={role === 'driver' ? 'Aprueba a los nuevos conductores y gestiona la flota.' : 'Personas registradas para pedir taxis.'}
      />
      <Alert>{error}</Alert>
      <div className="toolbar">
        <div className="chips" role="tablist">
          {filters.map(([f, label]) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'on' : ''} ${f === 'pending' && count('pending') ? 'warn' : ''}`} onClick={() => setFilter(f)}>
              {label} <span>{count(f)}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder={role === 'driver' ? 'Buscar nombre, teléfono o placa…' : 'Buscar nombre, correo o teléfono…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar"
          />
        </label>
      </div>
      {users === null ? (
        <Spinner />
      ) : (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{role === 'driver' ? 'Conductor' : 'Pasajero'}</th>
                <th>Teléfono</th>
                {role === 'driver' && <th>Vehículo</th>}
                <th>Valoración</th>
                <th>Estado</th>
                <th>Alta</th>
                <th className="right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person">
                      <Avatar name={u.name} />
                      <div>
                        <strong>{u.name}</strong>
                        <small className="muted">{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{u.phone ? <a href={`tel:${u.phone}`}>{u.phone}</a> : '—'}</td>
                  {role === 'driver' && (
                    <td>
                      {u.vehicle ? (
                        <div>
                          <span className="plate">{u.vehicle.plate}</span>
                          <small className="muted block">
                            {u.vehicle.make} {u.vehicle.model} · {u.vehicle.color}
                          </small>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className="nowrap">
                    <Rating value={u.rating} /> <small className="muted">({u.ratingCount})</small>
                  </td>
                  <td>
                    <span className={`badge ${u.status}`}>{STATUS_TEXT[u.status]}</span>
                    {u.online && <span className="badge ok">● En línea</span>}
                  </td>
                  <td className="small nowrap">{formatDate(u.createdAt)}</td>
                  <td className="actions">
                    {u.status !== 'active' && (
                      <button className="btn small primary" onClick={() => setStatus(u, 'active')}>
                        <Icon name="check" size={15} /> {u.status === 'pending' ? 'Aprobar' : 'Desbloquear'}
                      </button>
                    )}
                    {u.status !== 'blocked' && (
                      <button className="btn small danger-outline" onClick={() => setStatus(u, 'blocked')}>
                        <Icon name="ban" size={15} /> Bloquear
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <Icon name="search" size={26} />
                      <p>{users.length === 0 ? 'Aún no hay registros.' : 'No hay resultados con este filtro.'}</p>
                    </div>
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

/* ------------------------------------------------------------------ */
/* Viajes                                                              */
/* ------------------------------------------------------------------ */

const RIDE_FILTERS: { key: string; label: string; match: (s: RideStatus) => boolean }[] = [
  { key: 'all', label: 'Todos', match: () => true },
  { key: 'active', label: 'En curso', match: (s) => ACTIVE.includes(s) },
  { key: 'completed', label: 'Completados', match: (s) => s === 'completed' },
  { key: 'cancelled', label: 'Cancelados', match: (s) => s === 'cancelled' },
  { key: 'expired', label: 'Sin conductor', match: (s) => s === 'expired' },
];

function Rides() {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Ride[]>('/admin/rides?limit=500')
      .then(setRides)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);
  useSocketEvent<Ride>(
    'ride:update',
    useCallback((r) => setRides((cur) => (cur ? [r, ...cur.filter((x) => x.id !== r.id)].sort((a, b) => b.id - a.id) : cur)), []),
  );

  async function cancel(r: Ride) {
    if (!confirm(`¿Cancelar el viaje #${r.id}?`)) return;
    try {
      await api(`/admin/rides/${r.id}/cancel`, { body: {} });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const f = RIDE_FILTERS.find((x) => x.key === filter)!;
  const needle = q.trim().toLowerCase().replace(/^#/, '');
  const shown = (rides ?? []).filter(
    (r) =>
      f.match(r.status) &&
      (!needle ||
        String(r.id) === needle ||
        [r.passenger.name, r.driver?.name ?? '', r.driver?.vehicle?.plate ?? '', r.pickup.address, r.dropoff.address].some((s) =>
          s.toLowerCase().includes(needle),
        )),
  );
  const total = shown.filter((r) => r.status === 'completed').reduce((a, r) => a + (r.fareFinal ?? 0), 0);
  const cur = shown[0]?.currency ?? 'COP';

  return (
    <>
      <PageHeader title="Viajes" subtitle="Historial completo de solicitudes, con su estado y valor." />
      <Alert>{error}</Alert>
      <div className="toolbar">
        <div className="chips" role="tablist">
          {RIDE_FILTERS.map((x) => (
            <button key={x.key} role="tab" aria-selected={filter === x.key} className={`chip ${filter === x.key ? 'on' : ''}`} onClick={() => setFilter(x.key)}>
              {x.label} <span>{(rides ?? []).filter((r) => x.match(r.status)).length}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="Buscar #viaje, persona, placa o dirección…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar viajes" />
        </label>
      </div>
      {rides === null ? (
        <Spinner />
      ) : (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Viaje</th>
                <th>Pasajero</th>
                <th>Conductor</th>
                <th>Recorrido</th>
                <th>Estado</th>
                <th className="right">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">
                    <strong>#{r.id}</strong>
                    <small className="muted block">{formatDate(r.requestedAt)}</small>
                  </td>
                  <td>{r.passenger.name}</td>
                  <td>
                    {r.driver ? (
                      <>
                        {r.driver.name}
                        {r.driver.vehicle && <small className="muted block">{r.driver.vehicle.plate}</small>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="route-cell">
                    <div>
                      <span className="dot pickup" /> {shortAddress(r.pickup.address)}
                    </div>
                    <div>
                      <span className="dot dropoff" /> {shortAddress(r.dropoff.address)}
                    </div>
                    <small className="muted">
                      {formatDistance(r.distanceM)} · {r.paymentMethod === 'cash' ? 'Efectivo' : 'Tarjeta'}
                    </small>
                  </td>
                  <td>
                    <StatusChip status={r.status} />
                    {r.cancelReason && <small className="muted block">{r.cancelReason}</small>}
                  </td>
                  <td className="right nowrap">
                    <strong>{formatMoney(r.fareFinal ?? r.fareEstimate, r.currency)}</strong>
                  </td>
                  <td className="actions">
                    {ACTIVE.includes(r.status) && (
                      <button className="btn small danger-outline" onClick={() => cancel(r)}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <Icon name="receipt" size={26} />
                      <p>No hay viajes con este filtro.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {shown.some((r) => r.status === 'completed') && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="right muted">
                    Total completados en la lista
                  </td>
                  <td className="right nowrap">
                    <strong>{formatMoney(total, cur)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tarifas                                                             */
/* ------------------------------------------------------------------ */

const CURRENCIES = ['COP', 'USD', 'MXN', 'PEN', 'CLP', 'ARS', 'EUR'];

function MoneyInput({ label, value, onChange, currency, hint }: { label: string; value: number; onChange: (v: number) => void; currency: string; hint?: string }) {
  const symbol = formatMoney(0, currency).replace(/[\d\s.,]/g, '') || '$';
  return (
    <label>
      {label}
      <span className="input-affix">
        <span>{symbol}</span>
        <input type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
      </span>
      {hint && <small className="muted">{hint}</small>}
    </label>
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
  const set = (k: keyof Tariff) => (v: number) => setT({ ...t, [k]: v });
  const validCurrency = /^[A-Z]{3}$/.test(t.currency) ? t.currency : 'COP';

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved('');
    try {
      setT(await api<Tariff>('/admin/tariff', { method: 'PUT', body: { ...t, currency: t!.currency.toUpperCase() } }));
      setSaved('Tarifa guardada. Se aplica a los viajes que se pidan desde ahora.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const examples = [
    { label: 'Trayecto corto', km: 2, min: 8 },
    { label: 'Trayecto medio', km: 6, min: 18 },
    { label: 'Trayecto largo', km: 15, min: 35 },
    { label: 'Al aeropuerto', km: 25, min: 50 },
  ];
  const roundOptions = validCurrency === 'COP' || defaultRoundTo(validCurrency) >= 1 ? [1, 50, 100, 500, 1000] : [0.01, 0.05, 0.1, 0.5, 1];

  return (
    <>
      <PageHeader title="Tarifas" subtitle="Precio que ve el pasajero antes de pedir el taxi." />
      <div className="tariff-layout">
        <form className="card form" onSubmit={save}>
          <Alert>{error}</Alert>
          <Alert kind="success">{saved}</Alert>
          <div className="grid2">
            <label>
              Moneda
              <select
                value={t.currency}
                onChange={(e) => setT({ ...t, currency: e.target.value, roundTo: defaultRoundTo(e.target.value) })}
              >
                {(CURRENCIES.includes(t.currency) ? CURRENCIES : [t.currency, ...CURRENCIES]).map((c) => (
                  <option key={c} value={c}>
                    {c === 'COP' ? 'COP — Peso colombiano' : c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Redondear el precio a
              <select value={t.roundTo} onChange={(e) => setT({ ...t, roundTo: Number(e.target.value) })}>
                {roundOptions.map((r) => (
                  <option key={r} value={r}>
                    {formatMoney(r, validCurrency)}
                  </option>
                ))}
              </select>
            </label>
            <MoneyInput label="Banderazo (arranque)" value={t.baseFare} onChange={set('baseFare')} currency={validCurrency} />
            <MoneyInput label="Tarifa mínima" value={t.minimumFare} onChange={set('minimumFare')} currency={validCurrency} />
            <MoneyInput label="Valor por kilómetro" value={t.perKm} onChange={set('perKm')} currency={validCurrency} />
            <MoneyInput label="Valor por minuto" value={t.perMinute} onChange={set('perMinute')} currency={validCurrency} />
            <label>
              Recargo por demanda
              <span className="input-affix">
                <span>×</span>
                <input type="number" step="0.1" min="1" max="5" value={t.surge} onChange={(e) => set('surge')(e.target.value === '' ? 1 : Number(e.target.value))} />
              </span>
              <small className="muted">1 = sin recargo · 1,5 = 50 % más (noches, festivos, lluvia…)</small>
            </label>
          </div>
          <button className="btn primary block big" disabled={busy}>
            {busy ? <Spinner /> : 'Guardar tarifa'}
          </button>
        </form>

        <section className="card">
          <div className="card-head">
            <h2>Vista previa</h2>
          </div>
          <p className="muted small">
            Precio = máx(mínima, banderazo + km × valor km + min × valor min) × recargo, redondeado a {formatMoney(t.roundTo, validCurrency)}.
          </p>
          <ul className="preview-list">
            {examples.map((ex) => (
              <li key={ex.label}>
                <span>
                  <strong>{ex.label}</strong>
                  <small className="muted block">
                    {ex.km} km · {ex.min} min
                  </small>
                </span>
                <strong className="preview-price">{formatMoney(calculateFare(ex.km * 1000, ex.min * 60, { ...t, currency: validCurrency }), validCurrency)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

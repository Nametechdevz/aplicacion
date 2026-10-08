import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Spinner } from './components/ui';
import { Login, Register } from './pages/Auth';
import PassengerHome from './pages/Passenger';
import DriverHome from './pages/Driver';
import { History } from './pages/History';
import Profile from './pages/Profile';
import Admin from './pages/Admin';

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  const links = [
    ['/', user.role === 'driver' ? '🚕' : '📍', user.role === 'driver' ? 'Conducir' : 'Pedir'],
    ['/historial', user.role === 'driver' ? '💰' : '🧾', user.role === 'driver' ? 'Ganancias' : 'Viajes'],
    ['/perfil', '👤', 'Perfil'],
  ];
  return (
    <div className={`shell role-${user.role}`}>
      <header className="topbar">
        <NavLink to="/" className="logo">
          <img src="/icon.svg" alt="" width={28} height={28} /> TaxiYa
          {user.role !== 'passenger' && <span className="role-tag">{user.role === 'driver' ? 'Conductor' : 'Central'}</span>}
        </NavLink>
        <nav className="topnav">
          {links.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span aria-hidden="true">{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="content">{children}</div>
      <nav className="bottomnav">
        {links.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <img src="/icon.svg" alt="" width={80} height={80} />
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/registro" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (user.role === 'admin') {
    return (
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  const home = user.role === 'driver' ? <DriverHome /> : <PassengerHome />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={home} />
        <Route path="/historial" element={<History />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

import { useAuth } from '../auth';
import { Avatar, Rating } from '../components/ui';
import { isNative, serverUrl } from '../server';

const ROLE: Record<string, string> = { passenger: 'Pasajero', driver: 'Conductor', admin: 'Administrador' };
const STATUS: Record<string, string> = { active: 'Activa', pending: 'Pendiente de aprobación', blocked: 'Bloqueada' };

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <main className="page narrow">
      <div className="card profile">
        <Avatar name={user.name} />
        <h2>{user.name}</h2>
        <p className="muted">
          {ROLE[user.role]} · <Rating value={user.rating} /> ({user.ratingCount})
        </p>
        <dl>
          <dt>Correo</dt>
          <dd>{user.email}</dd>
          {user.phone && (
            <>
              <dt>Teléfono</dt>
              <dd>{user.phone}</dd>
            </>
          )}
          {(isNative() || serverUrl()) && (
            <>
              <dt>Servidor</dt>
              <dd>{serverUrl()}</dd>
            </>
          )}
          <dt>Estado de la cuenta</dt>
          <dd>{STATUS[user.status]}</dd>
          {user.vehicle && (
            <>
              <dt>Vehículo</dt>
              <dd>
                {user.vehicle.make} {user.vehicle.model} · {user.vehicle.color} · <span className="plate">{user.vehicle.plate}</span>
              </dd>
            </>
          )}
        </dl>
        <InstallHint />
        <button className="btn danger-outline block" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}

function InstallHint() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone || isNative()) return null;
  return (
    <div className="alert info">
      <strong>Instala TaxiYa en tu móvil:</strong> en Android abre el menú ⋮ de Chrome y elige «Instalar aplicación»; en iPhone toca
      Compartir y luego «Añadir a pantalla de inicio».
    </div>
  );
}

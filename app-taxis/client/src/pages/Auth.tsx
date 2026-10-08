import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { errorMessage } from '../api';
import { Alert, Spinner } from '../components/ui';

function Brand() {
  return (
    <div className="brand-hero">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>TaxiYa</h1>
      <p>Tu taxi, en minutos.</p>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Brand />
      <form className="card form" onSubmit={submit}>
        <h2>Iniciar sesión</h2>
        <Alert>{error}</Alert>
        <label>
          Correo electrónico
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : 'Entrar'}
        </button>
        <p className="center muted">
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </form>
    </main>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', make: '', model: '', plate: '', color: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({
        role,
        name: f.name,
        email: f.email,
        phone: f.phone,
        password: f.password,
        vehicle: role === 'driver' ? { make: f.make, model: f.model, plate: f.plate, color: f.color } : undefined,
      });
      nav('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Brand />
      <form className="card form" onSubmit={submit}>
        <h2>Crear cuenta</h2>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={role === 'passenger'} className={role === 'passenger' ? 'on' : ''} onClick={() => setRole('passenger')}>
            🧍 Pasajero
          </button>
          <button type="button" role="tab" aria-selected={role === 'driver'} className={role === 'driver' ? 'on' : ''} onClick={() => setRole('driver')}>
            🚕 Conductor
          </button>
        </div>
        <Alert>{error}</Alert>
        <label>
          Nombre completo
          <input required autoComplete="name" value={f.name} onChange={set('name')} />
        </label>
        <label>
          Correo electrónico
          <input type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
        </label>
        <label>
          Teléfono
          <input type="tel" required autoComplete="tel" value={f.phone} onChange={set('phone')} />
        </label>
        <label>
          Contraseña (mínimo 8 caracteres)
          <input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
        </label>
        {role === 'driver' && (
          <fieldset>
            <legend>Tu vehículo</legend>
            <div className="grid2">
              <label>
                Marca
                <input required value={f.make} onChange={set('make')} />
              </label>
              <label>
                Modelo
                <input required value={f.model} onChange={set('model')} />
              </label>
              <label>
                Matrícula / placa
                <input required value={f.plate} onChange={set('plate')} />
              </label>
              <label>
                Color
                <input value={f.color} onChange={set('color')} />
              </label>
            </div>
            <p className="muted small">La central revisará tus datos antes de que puedas recibir viajes.</p>
          </fieldset>
        )}
        <button className="btn primary block" disabled={busy}>
          {busy ? <Spinner /> : 'Crear cuenta'}
        </button>
        <p className="center muted">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </form>
    </main>
  );
}

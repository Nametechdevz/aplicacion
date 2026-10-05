import { useState } from 'react';
import { Lock, MessageCircle, ShieldCheck } from 'lucide-react';
import { call } from '../lib/api';
import { useStore } from '../lib/store';
import { Button, Field, InfoBox, Input } from '../components/ui';

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="drag fixed inset-x-0 top-0 h-10" />
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-xl shadow-emerald-500/30">
            <MessageCircle className="h-7 w-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ user: any; accountId: number | null }>('auth.login', { username, password });
      useStore.getState().setSession(r.user, r.accountId);
      await useStore.getState().bootstrap();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Bienvenido de nuevo" subtitle="Inicie sesión para gestionar sus conversaciones">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Usuario">
          <Input autoFocus value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Contraseña">
          <Input type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        </Field>
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<Lock className="h-4 w-4" />} disabled={!username || !password}>
          Iniciar sesión
        </Button>
      </form>
    </Shell>
  );
}

export function Setup() {
  const [f, setF] = useState({ display_name: '', username: 'admin', password: '', repeat: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ user: any; accountId: number | null }>('auth.setup', { username: f.username, display_name: f.display_name || f.username, password: f.password });
      useStore.getState().setSession(r.user, r.accountId);
      await useStore.getState().bootstrap();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Configuración inicial" subtitle="Cree la cuenta de administrador de esta instalación">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Su nombre">
          <Input autoFocus value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Ej. Laura Gómez" />
        </Field>
        <Field label="Usuario">
          <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, con letras y números. Se guarda cifrada (scrypt).">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Repetir contraseña">
          <Input type="password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
        </Field>
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<ShieldCheck className="h-4 w-4" />} disabled={!f.username || f.password.length < 8}>
          Crear administrador
        </Button>
      </form>
    </Shell>
  );
}

'use client';

import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/client';

export function AuthForm({ mode, registrationClosed, firstUser }: { mode: 'login' | 'register'; registrationClosed?: boolean; firstUser?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isLogin = mode === 'login';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await api(isLogin ? '/api/auth/login' : '/api/auth/register', { body: isLogin ? { email, password } : { name, email, password } });
      router.replace('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.details ?? {});
      } else setError('No se pudo completar la solicitud.');
      setLoading(false);
    }
  }

  if (!isLogin && registrationClosed) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">Registro cerrado</h1>
        <p className="mt-2 text-sm text-text-2">El administrador ha desactivado el registro de nuevas cuentas en esta instalación.</p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-accent hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight text-text">{isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h1>
      <p className="mt-1.5 text-sm text-text-2">
        {isLogin ? 'Accede a tu biblioteca de prompts.' : firstUser ? 'Serás el administrador de esta instalación.' : 'Empieza a forjar prompts para Claude Code.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        {!isLogin && (
          <Field label="Nombre" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} aria-invalid={!!fieldErrors.name} />
          </Field>
        )}
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={fieldErrors.password} hint={!isLogin ? 'Mínimo 10 caracteres, con letras y números.' : undefined}>
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
              aria-invalid={!!fieldErrors.password}
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-text" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-2">
        {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
        <Link href={isLogin ? '/register' : '/login'} className="font-medium text-accent hover:underline">
          {isLogin ? 'Regístrate' : 'Inicia sesión'}
        </Link>
      </p>
      {isLogin && <p className="mt-3 text-center text-xs text-muted">¿Olvidaste la contraseña? El administrador puede restablecerla con <code className="font-mono">npm run user:reset-password</code>.</p>}
    </div>
  );
}

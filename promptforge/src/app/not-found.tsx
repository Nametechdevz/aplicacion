import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <LogoMark className="mx-auto" />
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Esta página no existe</h1>
        <p className="mt-2 text-sm text-text-2">Puede que el prompt haya sido eliminado o que el enlace sea incorrecto.</p>
        <Link href="/" className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover">
          Volver al dashboard
        </Link>
      </div>
    </main>
  );
}

'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-danger">Error inesperado</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Algo salió mal</h1>
        <p className="mt-2 text-sm text-text-2">
          No pudimos completar la operación. Inténtalo de nuevo; si persiste, revisa los logs del servidor{error.digest ? ` (ref. ${error.digest})` : ''}.
        </p>
        <button onClick={reset} className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover">
          Reintentar
        </button>
      </div>
    </main>
  );
}

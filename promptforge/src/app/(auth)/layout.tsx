import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { getCurrentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect('/');
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:block">
        <div className="bg-grid absolute inset-0 opacity-70" />
        <div className="ember-glow absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo />
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Idea → Prompt maestro</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-text">
              Convierte una idea en instrucciones que Claude Code puede construir.
            </h2>
            <div className="mt-8 space-y-2.5 rounded-2xl border border-border bg-bg/60 p-4 font-mono text-[12.5px] leading-relaxed text-text-2">
              <p className="text-muted">$ idea</p>
              <p>“Tienda online de ropa deportiva con WooCommerce, pagos, inventario y cupones”</p>
              <p className="pt-2 text-muted">$ promptforge generate --master</p>
              <p>
                <span className="text-success">✔</span> Rol · Contexto · Stack · 52 funcionalidades · Arquitectura · Base de datos · Seguridad · SEO · Plan en 12 fases
              </p>
              <p>
                <span className="text-accent">●</span> Prompt Quality Score: <span className="font-semibold text-text">96/100</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">Generación local y determinista · Mejora opcional con Claude</p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

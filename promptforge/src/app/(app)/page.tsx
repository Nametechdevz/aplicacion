import { ArrowRight, FileText, Gauge, LayoutTemplate, Library, Star, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivityChart, CategoryBars } from '@/components/dashboard/charts';
import { QuickStart } from '@/components/dashboard/quick-start';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { scoreTone } from '@/lib/cn';
import { getProjectType } from '@/lib/engine/catalog';
import { VARIANT_LABEL } from '@/lib/engine/types';
import { dashboardStats } from '@/lib/server/repos/prompts';
import { requireUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Dashboard' };

function relative(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `hace ${d} d` : new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function Stat({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-text-2">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-text">{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const s = dashboardStats(user.id);
  const firstName = user.name.split(' ')[0];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface px-5 py-7 sm:px-8 sm:py-9">
        <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="ember-glow absolute inset-0" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Hola, {firstName}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text sm:text-3xl">¿Qué vamos a construir hoy?</h1>
          <p className="mt-2 text-sm text-text-2">Escribe una idea y PromptForge la convierte en un prompt maestro listo para Claude Code.</p>
          <div className="mt-5">
            <QuickStart />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de prompts" value={s.total} hint={`Calidad media ${s.avgScore}/100`} icon={<Library className="size-4" />} />
        <Stat label="Prompts creados" value={s.createdLast30} hint="Últimos 30 días" icon={<TrendingUp className="size-4" />} />
        <Stat label="Favoritos" value={s.favorites} hint={s.total ? `${Math.round((s.favorites / s.total) * 100)}% de la biblioteca` : 'Marca tus mejores prompts'} icon={<Star className="size-4" />} />
        <Stat label="Plantillas utilizadas" value={s.templatesUsed} hint={`${s.fromTemplates} prompts desde plantillas`} icon={<LayoutTemplate className="size-4" />} />
      </div>

      {s.total === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title="Aún no tienes prompts"
          description="Crea tu primer prompt maestro o parte de una plantilla. Aquí verás tus estadísticas y proyectos recientes."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover">
                Nuevo prompt
              </Link>
              <Link href="/templates" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-2">
                Ver plantillas
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <div className="mb-6 flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-text">Actividad</h2>
                  <p className="text-xs text-muted">Prompts creados por día · últimos 14 días</p>
                </div>
                <span className="font-mono text-xs text-text-2">{s.perDay.reduce((n, d) => n + d.count, 0)} en total</span>
              </div>
              <ActivityChart data={s.perDay} />
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-text">Categorías</h2>
              <p className="mb-5 text-xs text-muted">Distribución de tu biblioteca</p>
              <CategoryBars data={s.byCategory} />
              <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border pt-4">
                {s.byVariant.map((v) => (
                  <Badge key={v.variant}>
                    {VARIANT_LABEL[v.variant]} · {v.count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="p-5 xl:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">Últimos prompts</h2>
                <Link href="/prompts" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  Ver biblioteca <ArrowRight className="size-3" />
                </Link>
              </div>
              <ul className="divide-y divide-border">
                {s.latest.map((p) => (
                  <li key={p.id}>
                    <Link href={`/prompts/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-[10px] font-semibold text-text-2">{VARIANT_LABEL[p.activeVariant].slice(0, 3)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{p.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {p.category} · {p.stack.slice(0, 2).join(', ') || 'Sin stack'} · {relative(p.createdAt)}
                        </span>
                      </span>
                      <Badge tone={scoreTone(p.qualityScore)}>{p.qualityScore}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5 xl:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">Proyectos recientes</h2>
                <Gauge className="size-4 text-muted" />
              </div>
              <ul className="space-y-2">
                {s.recentProjects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/prompts/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-border-strong hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-text">{p.name}</span>
                        <span className="block text-xs text-muted">{getProjectType(p.projectType).label}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{relative(p.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

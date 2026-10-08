'use client';

import {
  ArrowRight,
  Building2,
  Calendar,
  ChartColumn,
  Cloud,
  Code,
  Download,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  LayoutTemplate,
  PenLine,
  Receipt,
  Rocket,
  ShoppingBag,
  Smartphone,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmModal } from '@/components/ui/modal';
import { Badge, Button, Card, EmptyState, scoreTone } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, formatDate } from '@/lib/client';

const ICONS: Record<string, typeof Rocket> = {
  rocket: Rocket,
  cloud: Cloud,
  'shopping-bag': ShoppingBag,
  store: Store,
  chart: ChartColumn,
  users: Users,
  building: Building2,
  pen: PenLine,
  image: ImageIcon,
  graduation: GraduationCap,
  calendar: Calendar,
  receipt: Receipt,
  code: Code,
  smartphone: Smartphone,
  globe: Globe,
  download: Download,
};

export interface BuiltinTemplateCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  typeLabel: string;
  category: string;
  features: number;
  score: number;
}

export interface UserTemplateCard {
  id: string;
  name: string;
  description: string;
  typeLabel: string;
  createdAt: string;
}

export function TemplatesView({ builtin, mine }: { builtin: BuiltinTemplateCard[]; mine: UserTemplateCard[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(mine);
  const [toDelete, setToDelete] = useState<UserTemplateCard | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/api/templates/${toDelete.id}`, { method: 'DELETE' });
      setItems((l) => l.filter((t) => t.id !== toDelete.id));
      toast.success('Plantilla eliminada');
      setToDelete(null);
      router.refresh();
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Plantillas predeterminadas</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {builtin.map((t) => {
            const Icon = ICONS[t.icon] ?? LayoutTemplate;
            return (
              <li key={t.id}>
                <Link href={`/new?template=${t.id}`} className="group block h-full rounded-2xl focus-visible:outline-offset-4">
                  <Card className="flex h-full flex-col p-4 transition-all group-hover:-translate-y-px group-hover:border-border-strong group-hover:shadow-[var(--shadow)]">
                    <div className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                        <Icon className="size-5" />
                      </span>
                      <Badge tone={scoreTone(t.score)}>MASTER {t.score}</Badge>
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold text-text">{t.name}</h3>
                    <p className="mt-1 flex-1 text-[13px] leading-relaxed text-text-2">{t.description}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted">
                      <span>
                        {t.category} · {t.features} funcionalidades
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                        Usar <ArrowRight className="size-3.5" />
                      </span>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Mis plantillas</h2>
        {items.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="size-5" />}
            title="Aún no tienes plantillas propias"
            description='Desde el editor de cualquier prompt, usa "Guardar como plantilla" para reutilizar sus respuestas.'
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((t) => (
              <li key={t.id}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-text">{t.name}</h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {t.typeLabel} · {formatDate(t.createdAt)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted hover:text-danger" onClick={() => setToDelete(t)} aria-label={`Eliminar plantilla ${t.name}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <p className="mt-2 flex-1 text-[13px] text-text-2">{t.description || 'Sin descripción'}</p>
                  <Link href={`/new?mine=${t.id}`} className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border text-[13px] font-medium text-text hover:bg-surface-2">
                    Usar plantilla <ArrowRight className="size-3.5" />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="¿Eliminar plantilla?"
        description="Los prompts creados con ella no se verán afectados."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

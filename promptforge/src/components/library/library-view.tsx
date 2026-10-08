'use client';

import { Copy, CopyPlus, Download, Library, Plus, Search, Star, Trash2, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmModal } from '@/components/ui/modal';
import { Badge, Button, Card, cn, EmptyState, Input, scoreTone, Select, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, copyText, forClaudeCode, formatDate } from '@/lib/client';
import { VARIANT_LABEL, type Variant } from '@/lib/engine/types';

export interface PromptSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  projectType: string;
  stack: string[];
  tags: string[];
  activeVariant: Variant;
  qualityScore: number;
  favorite: boolean;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  preview: string;
  words: number;
}

const CATEGORIES = ['Web', 'E-commerce', 'Sistemas', 'SaaS', 'Aplicaciones', 'Personalizado'];

export function LibraryView({ initial }: { initial: PromptSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [variant, setVariant] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('updated');
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<PromptSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const filtersActive = Boolean(q || category || variant || favorite || tag);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (category) params.set('category', category);
      if (variant) params.set('variant', variant);
      if (favorite) params.set('favorite', '1');
      if (tag) params.set('tag', tag);
      params.set('sort', sort);
      try {
        const r = await api<{ prompts: PromptSummary[] }>(`/api/prompts?${params}`, { signal: ctrl.signal });
        setItems(r.prompts);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') toast.error('No se pudo cargar la biblioteca', (e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, category, variant, favorite, tag, sort, toast]);

  const allTags = useMemo(() => [...new Set(initial.flatMap((p) => p.tags).concat(items.flatMap((p) => p.tags)))].sort(), [initial, items]);

  const copy = async (p: PromptSummary) => {
    setBusy(p.id);
    try {
      const { prompt } = await api<{ prompt: { variants: Record<Variant, string> } }>(`/api/prompts/${p.id}`);
      const ok = await copyText(forClaudeCode(prompt.variants[p.activeVariant]));
      if (ok) toast.success('Copiado para Claude Code', p.name);
      else toast.error('No se pudo copiar');
    } catch (e) {
      toast.error('No se pudo copiar', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (p: PromptSummary) => {
    setBusy(p.id);
    try {
      const { prompt } = await api<{ prompt: { id: string } }>(`/api/prompts/${p.id}/duplicate`, { body: {} });
      toast.success('Prompt duplicado');
      router.push(`/prompts/${prompt.id}`);
    } catch (e) {
      toast.error('No se pudo duplicar', (e as Error).message);
      setBusy(null);
    }
  };

  const toggleFav = async (p: PromptSummary) => {
    setItems((list) => list.map((x) => (x.id === p.id ? { ...x, favorite: !x.favorite } : x)));
    try {
      await api(`/api/prompts/${p.id}`, { method: 'PATCH', body: { favorite: !p.favorite } });
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === p.id ? { ...x, favorite: p.favorite } : x)));
      toast.error('No se pudo actualizar', (e as Error).message);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(toDelete.id);
    try {
      await api(`/api/prompts/${toDelete.id}`, { method: 'DELETE' });
      setItems((list) => list.filter((x) => x.id !== toDelete.id));
      toast.success('Prompt eliminado', toDelete.name);
      setToDelete(null);
      router.refresh();
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (file: File) => {
    if (file.size > 20_000_000) {
      toast.error('Archivo demasiado grande', 'Máximo 20 MB.');
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const r = await api<{ imported: number }>('/api/library/import', { body: data });
      toast.success(`${r.imported} prompts importados`);
      const list = await api<{ prompts: PromptSummary[] }>(`/api/prompts?sort=${sort}`);
      setItems(list.prompts);
      router.refresh();
    } catch (e) {
      toast.error('No se pudo importar', e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Filtros */}
      <Card className="mb-5 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, descripción, stack o etiqueta…" className="pl-9" aria-label="Buscar prompts" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría" className="sm:w-40">
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={variant} onChange={(e) => setVariant(e.target.value)} aria-label="Versión" className="sm:w-32">
              <option value="">Toda versión</option>
              <option value="quick">QUICK</option>
              <option value="pro">PRO</option>
              <option value="master">MASTER</option>
            </Select>
            <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiqueta" className="sm:w-36">
              <option value="">Toda etiqueta</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar" className="sm:w-40">
              <option value="updated">Últimos editados</option>
              <option value="created">Más recientes</option>
              <option value="name">Nombre (A–Z)</option>
              <option value="score">Mejor puntuación</option>
            </Select>
          </div>
          <Button variant={favorite ? 'outline' : 'ghost'} onClick={() => setFavorite((f) => !f)} aria-pressed={favorite} icon={<Star className={cn('size-4', favorite && 'fill-warning text-warning')} />}>
            Favoritos
          </Button>
        </div>
        {filtersActive && (
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted">
            {items.length} resultado{items.length === 1 ? '' : 's'}
            <button
              className="inline-flex items-center gap-1 text-text-2 hover:text-text"
              onClick={() => {
                setQ('');
                setCategory('');
                setVariant('');
                setFavorite(false);
                setTag('');
              }}
            >
              <X className="size-3" /> Limpiar filtros
            </button>
          </div>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
          Importar JSON
        </Button>
        <a href="/api/library/export" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-text-2 hover:bg-surface-2 hover:text-text">
          <Download className="size-3.5" /> Exportar biblioteca
        </a>
      </div>

      {loading && !items.length ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        filtersActive ? (
          <EmptyState icon={<Search className="size-5" />} title="Sin resultados" description="Ningún prompt coincide con los filtros. Prueba con otros términos." />
        ) : (
          <EmptyState
            icon={<Library className="size-5" />}
            title="Tu biblioteca está vacía"
            description="Genera tu primer prompt maestro o empieza desde una plantilla."
            action={
              <Link href="/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover">
                <Plus className="size-4" /> Nuevo prompt
              </Link>
            }
          />
        )
      ) : (
        <ul className={cn('grid gap-3 md:grid-cols-2 2xl:grid-cols-3', loading && 'opacity-60 transition-opacity')}>
          {items.map((p) => (
            <li key={p.id}>
              <Card className="group flex h-full flex-col p-4 transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-[var(--shadow)]">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/prompts/${p.id}`} className="min-w-0 flex-1 rounded-md">
                    <h3 className="truncate text-[15px] font-semibold text-text group-hover:text-accent">{p.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {p.category} · {formatDate(p.updatedAt)} · {p.words.toLocaleString('es')} palabras
                    </p>
                  </Link>
                  <button onClick={() => toggleFav(p)} aria-label={p.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} aria-pressed={p.favorite} className="rounded-md p-1 text-muted hover:bg-surface-2">
                    <Star className={cn('size-4', p.favorite && 'fill-warning text-warning')} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={scoreTone(p.qualityScore)}>{p.qualityScore}/100</Badge>
                  <Badge tone="accent">{VARIANT_LABEL[p.activeVariant]}</Badge>
                  {p.stack.slice(0, 3).map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {p.templateId && <Badge tone="steel">Plantilla</Badge>}
                </div>
                <p className="mt-3 line-clamp-3 flex-1 text-[13px] leading-relaxed text-text-2">{p.description || p.preview}</p>
                {p.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.tags.slice(0, 5).map((t) => (
                      <button key={t} onClick={() => setTag(t)} className="text-[11px] text-muted hover:text-accent">
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
                  <Link href={`/prompts/${p.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-text hover:bg-surface-2">
                    Editar
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => copy(p)} loading={busy === p.id} icon={<Copy className="size-3.5" />}>
                    Copiar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicate(p)} disabled={busy === p.id} icon={<CopyPlus className="size-3.5" />}>
                    Duplicar
                  </Button>
                  <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-muted hover:text-danger" onClick={() => setToDelete(p)} aria-label={`Eliminar ${p.name}`}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={!!toDelete && busy === toDelete.id}
        danger
        title="¿Eliminar este prompt?"
        description={
          <>
            Se eliminará <strong>{toDelete?.name}</strong> junto con su historial. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}

'use client';

import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  History,
  Maximize2,
  Minimize2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Terminal,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Badge, Button, Card, cn, Field, Input, scoreTone, Segmented, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, copyText, downloadFile, forClaudeCode, relativeTime, slugify } from '@/lib/client';
import { generatePrompt } from '@/lib/engine/generator';
import { evaluatePrompt } from '@/lib/engine/quality';
import { expandPrompt, improvePrompt, simplifyPrompt } from '@/lib/engine/transform';
import { VARIANT_LABEL, VARIANTS, type ProjectSpec, type Variant } from '@/lib/engine/types';
import { getProjectType } from '@/lib/engine/catalog';
import { renderMarkdown } from '@/lib/markdown';
import type { Settings } from '@/lib/settings';
import { AiImproveModal } from './ai-modal';
import { HistoryDrawer } from './history-drawer';
import { QualityPanel } from './quality-panel';

export interface WorkbenchInitial {
  name: string;
  description: string;
  tags: string[];
  variants: Record<Variant, string>;
  activeVariant: Variant;
  spec: ProjectSpec | null;
  favorite: boolean;
  updatedAt?: string;
}

type View = 'edit' | 'preview' | 'split';

export function Workbench({
  promptId,
  initial,
  settings,
  aiAvailable,
  onBack,
}: {
  promptId?: string;
  initial: WorkbenchInitial;
  settings: Settings;
  aiAvailable: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !promptId;

  const [variants, setVariants] = useState(initial.variants);
  const [saved, setSaved] = useState(initial.variants);
  const [active, setActive] = useState<Variant>(initial.activeVariant);
  const [savedActive, setSavedActive] = useState<Variant>(initial.activeVariant);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [savedMeta, setSavedMeta] = useState({ name: initial.name, description: initial.description, tags: initial.tags.join(', ') });
  const [favorite, setFavorite] = useState(initial.favorite);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [view, setView] = useState<View>('edit');
  const [focus, setFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<Record<Variant, string[]>>({ quick: [], pro: [], master: [] });
  const [lastChanges, setLastChanges] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'history' | 'ai' | 'template' | 'regenerate' | 'delete' | 'details'>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const spec = initial.spec;
  const text = variants[active];
  const deferredText = useDeferredValue(text);
  const report = useMemo(() => evaluatePrompt(deferredText, spec), [deferredText, spec]);
  const otherScores = useMemo(
    () => Object.fromEntries(VARIANTS.map((v) => [v, evaluatePrompt(variants[v], spec).score])) as Record<Variant, number>,
    // Solo se recalcula al cambiar de pestaña o tras una transformación, no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, saved, undo, spec],
  );
  const variantScores = { ...otherScores, [active]: report.score } as Record<Variant, number>;

  const tagList = useMemo(() => [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20), [tags]);
  const dirtyContent = VARIANTS.some((v) => variants[v] !== saved[v]);
  const dirtyMeta = name !== savedMeta.name || description !== savedMeta.description || tags !== savedMeta.tags || active !== savedActive;
  const dirty = isNew || dirtyContent || dirtyMeta;

  // Aviso al salir con cambios sin guardar
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);

  const setText = useCallback((value: string) => setVariants((v) => ({ ...v, [active]: value })), [active]);

  const applyTransform = (label: string, fn: (t: string) => { text: string; changes: string[] }) => {
    const res = fn(text);
    if (res.text === text) {
      toast.info(label, res.changes[0]);
      return;
    }
    setUndo((u) => ({ ...u, [active]: [...u[active].slice(-19), text] }));
    setText(res.text);
    setLastChanges(res.changes);
    const after = evaluatePrompt(res.text, spec).score;
    toast.success(`${label}: ${report.score} → ${after}/100`, res.changes.slice(0, 2).join(' · '));
  };

  const doUndo = () => {
    const stack = undo[active];
    if (!stack.length) return;
    setText(stack[stack.length - 1]);
    setUndo((u) => ({ ...u, [active]: u[active].slice(0, -1) }));
    setLastChanges(null);
  };

  const regenerate = () => {
    if (!spec) return;
    setUndo((u) => ({ ...u, [active]: [...u[active].slice(-19), text] }));
    setText(generatePrompt(spec, active));
    setModal(null);
    toast.success(`Versión ${VARIANT_LABEL[active]} regenerada`);
  };

  const copy = async (kind: 'claude' | 'raw') => {
    const ok = await copyText(kind === 'claude' ? forClaudeCode(text) : text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
      toast.success(kind === 'claude' ? 'Copiado para Claude Code' : 'Prompt copiado', kind === 'claude' ? 'Pégalo directamente en Claude Code.' : undefined);
    } else toast.error('No se pudo copiar al portapapeles');
  };

  const download = (fmt: 'md' | 'txt') => {
    const base = slugify(name || 'prompt');
    const meta = settings.exportIncludeMeta
      ? fmt === 'md'
        ? `---\nnombre: "${name.replace(/"/g, "'")}"\nversion: ${VARIANT_LABEL[active]}\ntipo: ${spec ? getProjectType(spec.projectType).label : 'Personalizado'}\npuntuacion: ${report.score}\nexportado: ${new Date().toISOString()}\ngenerador: PROMPTFORGE AI\n---\n\n`
        : `${name} — Versión ${VARIANT_LABEL[active]} — Puntuación ${report.score}/100 — Exportado ${new Date().toLocaleString('es')}\n${'='.repeat(60)}\n\n`
      : '';
    downloadFile(`${base}-${active}.${fmt}`, meta + text, fmt === 'md' ? 'text/markdown' : 'text/plain');
  };

  const save = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Ponle un nombre al prompt antes de guardarlo');
      setModal('details');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { prompt } = await api<{ prompt: { id: string } }>('/api/prompts', {
          body: { name: name.trim(), description: description.trim(), tags: tagList, activeVariant: active, variants, spec, favorite },
        });
        toast.success('Prompt guardado en tu biblioteca');
        router.push(`/prompts/${prompt.id}`);
        return;
      }
      const changed = Object.fromEntries(VARIANTS.filter((v) => variants[v] !== saved[v]).map((v) => [v, variants[v]]));
      const { prompt } = await api<{ prompt: { updatedAt: string; qualityScore: number } }>(`/api/prompts/${promptId}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          description: description.trim(),
          tags: tagList,
          activeVariant: active,
          ...(Object.keys(changed).length ? { variants: changed, versionNote: lastChanges ? 'Transformación + edición' : 'Edición' } : {}),
        },
      });
      setSaved(variants);
      setSavedActive(active);
      setSavedMeta({ name, description, tags });
      setUpdatedAt(prompt.updatedAt);
      setHistoryKey((k) => k + 1);
      toast.success('Cambios guardados', `Puntuación ${prompt.qualityScore}/100`);
      router.refresh();
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }, [active, description, favorite, isNew, lastChanges, name, promptId, router, saved, spec, tagList, tags, toast, variants]);

  // Ctrl/Cmd + S
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [save, saving]);

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    if (isNew) return;
    try {
      await api(`/api/prompts/${promptId}`, { method: 'PATCH', body: { favorite: next } });
      toast.success(next ? 'Añadido a favoritos' : 'Quitado de favoritos');
    } catch (e) {
      setFavorite(!next);
      toast.error('No se pudo actualizar', (e as Error).message);
    }
  };

  const saveTemplate = async () => {
    if (!spec || !tplName.trim()) return;
    setBusy(true);
    try {
      await api('/api/templates', { body: { name: tplName.trim(), description: tplDesc.trim(), spec } });
      toast.success('Plantilla guardada', 'La encontrarás en Plantillas → Mis plantillas.');
      setModal(null);
    } catch (e) {
      toast.error('No se pudo guardar la plantilla', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/prompts/${promptId}`, { method: 'DELETE' });
      toast.success('Prompt eliminado');
      setSaved(variants); // evita el aviso de cambios sin guardar
      router.push('/prompts');
      router.refresh();
    } catch (e) {
      toast.error('No se pudo eliminar', (e as Error).message);
      setBusy(false);
    }
  };

  const lines = text.split('\n').length;
  const previewHtml = useMemo(() => (view === 'edit' ? '' : renderMarkdown(deferredText)), [deferredText, view]);

  return (
    <div className={cn(focus && 'fixed inset-0 z-50 overflow-y-auto bg-bg p-3 sm:p-6')}>
      {/* Cabecera */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            {onBack && (
              <button onClick={onBack} className="inline-flex items-center gap-1 rounded-md py-0.5 pr-1.5 hover:text-text">
                <ChevronLeft className="size-3.5" /> Volver a las preguntas
              </button>
            )}
            {spec && <Badge tone="accent">{getProjectType(spec.projectType).label}</Badge>}
            {isNew ? <Badge tone="warning">Sin guardar</Badge> : dirty ? <Badge tone="warning">Cambios sin guardar</Badge> : <Badge tone="success">Guardado</Badge>}
            {updatedAt && !isNew && <span>Actualizado {relativeTime(updatedAt)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              aria-label="Nombre del prompt"
              placeholder="Nombre del prompt"
              className="min-w-0 flex-1 truncate rounded-lg bg-transparent py-1 text-xl font-semibold tracking-tight text-text outline-none placeholder:text-muted hover:bg-surface-2/60 focus:bg-surface-2 focus:px-2 sm:text-2xl"
            />
            <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-pressed={favorite} aria-label={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'} title="Favorito">
              <Star className={cn('size-[18px]', favorite ? 'fill-warning text-warning' : 'text-muted')} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="lg" onClick={() => copy('claude')} icon={copied === 'claude' ? <Check className="size-4" /> : <Terminal className="size-4" />} className="flex-1 sm:flex-none">
            {copied === 'claude' ? '¡Copiado!' : 'Copiar para Claude Code'}
          </Button>
          <Button variant={dirty ? 'outline' : 'secondary'} size="lg" onClick={save} loading={saving} icon={<Save className="size-4" />} title="Guardar (Ctrl+S)">
            Guardar
          </Button>
        </div>
      </div>

      {/* Barra de herramientas */}
      <Card className="mb-4 flex flex-col gap-3 p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={active}
            onChange={(v) => {
              setActive(v);
              setLastChanges(null);
            }}
            options={VARIANTS.map((v) => ({
              value: v,
              title: v === 'quick' ? 'Prompt corto' : v === 'pro' ? 'Prompt detallado' : 'Prompt extremadamente completo',
              label: (
                <>
                  {VARIANT_LABEL[v]}
                  <span className={cn('rounded px-1 font-mono text-[10px]', active === v ? 'bg-surface-2 text-text-2' : 'text-muted')}>{variantScores[v]}</span>
                </>
              ),
            }))}
          />
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'edit', label: <><Pencil className="size-3.5" /> <span className="hidden sm:inline">Editar</span></>, title: 'Editar' },
              { value: 'preview', label: <><Eye className="size-3.5" /> <span className="hidden sm:inline">Vista previa</span></>, title: 'Vista previa' },
              { value: 'split', label: <span className="hidden md:inline">Dividida</span>, title: 'Edición + vista previa' },
            ]}
          />
        </div>
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 lg:flex-wrap lg:justify-end lg:overflow-visible">
          <Button size="sm" variant="ghost" icon={<WandSparkles className="size-3.5 text-accent" />} onClick={() => applyTransform('Mejorar', (t) => improvePrompt(t, spec))} title="Añade funcionalidades, seguridad, UX, escalabilidad, SEO, rendimiento y testing que falten">
            Mejorar
          </Button>
          <Button size="sm" variant="ghost" icon={<Minimize2 className="size-3.5" />} onClick={() => applyTransform('Simplificar', simplifyPrompt)} title="Genera una versión más corta">
            Simplificar
          </Button>
          <Button size="sm" variant="ghost" icon={<Maximize2 className="size-3.5" />} onClick={() => applyTransform('Expandir', (t) => expandPrompt(t, spec))} title="Amplía cada sección al nivel MASTER">
            Expandir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Sparkles className="size-3.5 text-steel" />}
            onClick={() => (aiAvailable ? setModal('ai') : toast.info('IA no configurada', 'Define ANTHROPIC_API_KEY en el servidor para habilitar la mejora con Claude.'))}
            className={cn(!aiAvailable && 'opacity-60')}
            title={aiAvailable ? 'Mejorar con Claude (requiere API)' : 'Requiere ANTHROPIC_API_KEY en el servidor'}
          >
            Con IA
          </Button>
          <span className="mx-1 hidden h-5 w-px bg-border lg:block" />
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} disabled={!spec} onClick={() => (settings.confirmBeforeRegenerate && text !== generatePrompt(spec!, active) ? setModal('regenerate') : regenerate())} title={spec ? 'Regenerar desde las respuestas' : 'Este prompt no tiene especificación'}>
            Regenerar
          </Button>
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={!undo[active].length} onClick={doUndo} title="Deshacer la última transformación">
            Deshacer
          </Button>
          <Button size="sm" variant="ghost" icon={copied === 'raw' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => copy('raw')}>
            Copiar
          </Button>
          <Button size="sm" variant="ghost" icon={<FileText className="size-3.5" />} onClick={() => download('txt')} title="Descargar TXT">
            TXT
          </Button>
          <Button size="sm" variant="ghost" icon={<FileCode className="size-3.5" />} onClick={() => download('md')} title="Descargar Markdown">
            MD
          </Button>
          {!isNew && (
            <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={() => setModal('history')}>
              Historial
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setFocus((f) => !f)} aria-label={focus ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Modo enfoque" className="h-8 w-8">
            {focus ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </Card>

      {lastChanges && (
        <div className="animate-fade-up mb-4 flex items-start justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-text">Cambios aplicados</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-text-2">
              {lastChanges.slice(0, 6).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <Button size="sm" variant="ghost" onClick={doUndo} icon={<Undo2 className="size-3.5" />}>
            Deshacer
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Editor */}
        <Card className="min-w-0 overflow-hidden">
          <div className={cn('grid', view === 'split' && 'lg:grid-cols-2 lg:divide-x lg:divide-border')}>
            {view !== 'preview' && (
              <div className="relative">
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  aria-label={`Prompt versión ${VARIANT_LABEL[active]}`}
                  className={cn(
                    'block w-full resize-y bg-code px-4 py-4 font-mono text-[12.5px] leading-[1.7] text-text outline-none sm:px-5',
                    focus ? 'min-h-[calc(100dvh-260px)]' : 'min-h-[60dvh]',
                  )}
                />
              </div>
            )}
            {view !== 'edit' && (
              <div className={cn('md-preview overflow-y-auto px-5 py-5 sm:px-7', focus ? 'max-h-[calc(100dvh-260px)]' : 'max-h-[75dvh]')} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2 font-mono text-[11px] text-muted">
            <span>
              {lines.toLocaleString('es')} líneas · {report.stats.words.toLocaleString('es')} palabras · {text.length.toLocaleString('es')} caracteres
            </span>
            <span>Markdown · {VARIANT_LABEL[active]}</span>
          </div>
        </Card>

        {/* Panel lateral */}
        <div className="space-y-4">
          <Card className="p-4">
            <QualityPanel report={report} />
            {report.score < 90 && (
              <Button variant="outline" size="sm" className="mt-4 w-full" icon={<WandSparkles className="size-3.5 text-accent" />} onClick={() => applyTransform('Mejorar', (t) => improvePrompt(t, spec))}>
                Mejorar automáticamente
              </Button>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Detalles</h3>
              <Button size="sm" variant="ghost" onClick={() => setModal('details')}>
                Editar
              </Button>
            </div>
            <dl className="space-y-2 text-[13px]">
              <div>
                <dt className="text-xs text-muted">Descripción</dt>
                <dd className="mt-0.5 line-clamp-3 text-text-2">{description || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Etiquetas</dt>
                <dd className="mt-1 flex flex-wrap gap-1">{tagList.length ? tagList.map((t) => <Badge key={t}>#{t}</Badge>) : <span className="text-text-2">—</span>}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              {spec && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<BookmarkPlus className="size-3.5" />}
                  onClick={() => {
                    setTplName(name);
                    setTplDesc(description);
                    setModal('template');
                  }}
                >
                  Guardar como plantilla
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => download(settings.exportFormat)}>
                Exportar .{settings.exportFormat}
              </Button>
              {!isNew && (
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => setModal('delete')}>
                  Eliminar
                </Button>
              )}
            </div>
          </Card>
          <p className="px-1 text-xs text-muted">
            Consejo: usa <strong className="text-text-2">MASTER</strong> para proyectos complejos y pégalo en Claude Code en un repositorio vacío. Guarda con <kbd className="font-mono">Ctrl+S</kbd>.
          </p>
        </div>
      </div>

      {/* Modales */}
      {!isNew && promptId && (
        <HistoryDrawer
          promptId={promptId}
          open={modal === 'history'}
          refreshKey={historyKey}
          onClose={() => setModal(null)}
          onRestore={(v) => {
            setActive(v.variant);
            setUndo((u) => ({ ...u, [v.variant]: [...u[v.variant].slice(-19), variants[v.variant]] }));
            setVariants((cur) => ({ ...cur, [v.variant]: v.content }));
            setModal(null);
            toast.success('Versión restaurada en el editor', 'Guarda para conservarla.');
          }}
        />
      )}
      <AiImproveModal
        open={modal === 'ai'}
        onClose={() => setModal(null)}
        text={text}
        spec={spec}
        onApply={(improved) => {
          setUndo((u) => ({ ...u, [active]: [...u[active].slice(-19), text] }));
          setText(improved);
          setLastChanges(['Prompt mejorado con Claude']);
          toast.success('Mejora con IA aplicada', 'Revisa el resultado y guarda.');
        }}
      />
      <ConfirmModal
        open={modal === 'regenerate'}
        onClose={() => setModal(null)}
        onConfirm={regenerate}
        title={`¿Regenerar la versión ${VARIANT_LABEL[active]}?`}
        description="Se sustituirá el texto actual por uno nuevo generado desde las respuestas. Podrás deshacerlo."
        confirmLabel="Regenerar"
      />
      <ConfirmModal
        open={modal === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="¿Eliminar este prompt?"
        description="Se eliminarán el prompt y todo su historial de versiones. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
      <Modal
        open={modal === 'template'}
        onClose={() => setModal(null)}
        title="Guardar como plantilla"
        description="Guarda las respuestas de este proyecto para reutilizarlas en nuevos prompts."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveTemplate} loading={busy} disabled={!tplName.trim()}>
              Guardar plantilla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre" htmlFor="tpl-name">
            <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Descripción" htmlFor="tpl-desc" optional>
            <Textarea id="tpl-desc" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} maxLength={500} rows={3} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={modal === 'details'}
        onClose={() => setModal(null)}
        title="Detalles del prompt"
        footer={
          <Button variant="primary" onClick={() => setModal(null)}>
            Listo
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre" htmlFor="pd-name">
            <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Descripción" htmlFor="pd-desc" optional>
            <Textarea id="pd-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </Field>
          <Field label="Etiquetas" htmlFor="pd-tags" hint="Separadas por comas. Ej.: cliente-x, urgente, ecommerce">
            <Input id="pd-tags" value={tags} onChange={(e) => setTags(e.target.value)} maxLength={400} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

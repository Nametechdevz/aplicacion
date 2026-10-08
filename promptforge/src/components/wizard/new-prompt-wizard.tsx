'use client';

import { ArrowLeft, ArrowRight, Check, Lightbulb, Sparkles, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Workbench } from '@/components/prompt/workbench';
import { Badge, Button, Card, cn, Textarea } from '@/components/ui/primitives';
import { CATEGORIES, getProjectType, typesByCategory } from '@/lib/engine/catalog';
import { specFromIdea, type Detection } from '@/lib/engine/detect';
import { generateAll, generatePrompt } from '@/lib/engine/generator';
import { evaluatePrompt } from '@/lib/engine/quality';
import { createSpec, displayName, featureCount, typeLabel } from '@/lib/engine/spec';
import { INTEGRATION_BY_ID, techLabels } from '@/lib/engine/techs';
import type { ProjectSpec, Variant } from '@/lib/engine/types';
import type { Settings } from '@/lib/settings';
import { QUESTION_TABS, QuestionsForm, tabProgress, type QuestionTab } from './questions-form';

const EXAMPLES = [
  'Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones, usuarios, dashboard administrativo y diseño premium.',
  'Quiero una landing page para una agencia de marketing',
  'Quiero un sistema de reservas para un hotel',
  'Quiero un SaaS de facturación',
  'Quiero un marketplace',
  'Quiero un panel administrativo',
  'Quiero una plataforma educativa',
  'Quiero una aplicación web de streaming',
  'Quiero un sistema de membresías',
  'Quiero una tienda WooCommerce',
];

const STEPS = ['Idea', 'Tipo de proyecto', 'Preguntas', 'Prompt'] as const;

function applyDefaults(spec: ProjectSpec, s: Settings): ProjectSpec {
  return {
    ...spec,
    country: spec.country || s.defaultCountry,
    currency: spec.currency || s.defaultCurrency,
    // El idioma detectado por país manda; si no, el idioma preferido del usuario.
    language: spec.country ? spec.language : s.projectLanguage || spec.language,
  };
}

/** Cambia el tipo conservando la información general del proyecto. */
function switchType(prev: ProjectSpec, typeId: string): ProjectSpec {
  const next = createSpec(typeId, { scope: prev.scope });
  return {
    ...next,
    idea: prev.idea,
    name: prev.name,
    description: prev.description,
    objective: prev.objective,
    audience: prev.audience,
    problem: prev.problem,
    country: prev.country,
    language: prev.language,
    currency: prev.currency,
    design: prev.design,
    tech: prev.tech,
    notes: prev.notes,
    multilingual: prev.multilingual,
    templateId: prev.templateId,
    customTypeLabel: prev.customTypeLabel,
  };
}

export function NewPromptWizard({
  settings,
  aiAvailable,
  initialSpec,
  templateName,
  initialIdea,
}: {
  settings: Settings;
  aiAvailable: boolean;
  initialSpec: ProjectSpec | null;
  templateName?: string;
  initialIdea?: string;
}) {
  // Si llega una idea desde el dashboard, se analiza directamente.
  const [boot] = useState(() => (initialIdea && initialIdea.trim().length >= 8 ? specFromIdea(initialIdea.trim()) : null));
  const [step, setStep] = useState(initialSpec ? 2 : boot ? 1 : 0);
  const [idea, setIdea] = useState(initialSpec?.idea ?? initialIdea ?? '');
  const [spec, setSpec] = useState<ProjectSpec>(() =>
    applyDefaults(initialSpec ?? boot?.spec ?? createSpec('custom', { scope: settings.defaultScope }), settings),
  );
  const [detection, setDetection] = useState<Detection | null>(boot?.detection ?? null);
  const [tab, setTab] = useState<QuestionTab>('general');
  const [result, setResult] = useState<Record<Variant, string> | null>(null);
  const [resultKey, setResultKey] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const analyze = () => {
    const text = idea.trim();
    if (text.length < 8) return;
    const { spec: s, detection: d } = specFromIdea(text);
    setSpec(applyDefaults(s, settings));
    setDetection(d);
    setStep(1);
  };

  const generate = () => {
    setResult(generateAll(spec));
    setResultKey((k) => k + 1);
    setStep(3);
  };

  const progress = useMemo(() => tabProgress(spec), [spec]);
  const preview = useMemo(() => (step === 2 ? evaluatePrompt(generatePrompt(spec, settings.defaultVariant), spec) : null), [spec, step, settings.defaultVariant]);
  const type = getProjectType(spec.projectType);

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-1 overflow-x-auto pb-1 sm:mb-8 sm:gap-2" aria-label="Pasos">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = i <= step || (i === 2 && step >= 1) || (i === 3 && result !== null);
          return (
            <li key={label} className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!reachable || i === step}
                onClick={() => setStep(i)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-[13px]',
                  current ? 'border-accent/50 bg-accent-soft text-text' : done ? 'border-border text-text-2 hover:bg-surface-2' : 'border-border text-muted',
                  'disabled:cursor-default',
                )}
              >
                <span className={cn('grid size-5 place-items-center rounded-full text-[10px]', current ? 'bg-accent text-accent-fg' : done ? 'bg-success text-white' : 'bg-surface-3 text-muted')}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border sm:w-8" />}
            </li>
          );
        })}
      </ol>

      {/* PASO 1 — IDEA */}
      {step === 0 && (
        <div className="animate-fade-up mx-auto max-w-3xl">
          <div className="mb-6 text-center sm:mb-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Nuevo prompt</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">¿Qué quieres construir?</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-text-2">Escríbelo como se lo contarías a un desarrollador. Detectaremos el tipo de proyecto, el stack, las integraciones y las funcionalidades clave.</p>
          </div>
          <Card className="p-2 focus-within:border-accent/50">
            <Textarea
              autoFocus
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze();
              }}
              rows={4}
              maxLength={4000}
              placeholder="Ej.: Quiero una tienda online de ropa deportiva con WooCommerce, pagos online, inventario, cupones, usuarios, dashboard administrativo y diseño premium."
              className="border-0 bg-transparent text-[15px] focus:ring-0"
              aria-label="Describe tu idea"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
              <span className="text-xs text-muted">{idea.length}/4000 · Ctrl+Enter para analizar</span>
              <Button variant="primary" onClick={analyze} disabled={idea.trim().length < 8} icon={<Sparkles className="size-4" />}>
                Analizar idea
              </Button>
            </div>
          </Card>
          <div className="mt-6">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lightbulb className="size-3.5" /> Ejemplos
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setIdea(ex)} className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-xs text-text-2 transition-colors hover:border-border-strong hover:text-text">
                  {ex.length > 70 ? `${ex.slice(0, 68)}…` : ex}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-muted">
            ¿Prefieres empezar desde cero?{' '}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setStep(1)}>
              Elegir el tipo de proyecto manualmente
            </button>
          </p>
        </div>
      )}

      {/* PASO 2 — TIPO */}
      {step === 1 && (
        <div className="animate-fade-up">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Tipo de proyecto</h1>
              <p className="mt-1 text-sm text-text-2">Confirma o cambia el tipo. Las preguntas y funcionalidades se adaptan a tu elección.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(0)}>
                Idea
              </Button>
              <Button variant="primary" onClick={() => setStep(2)} disabled={type.id === 'custom' && !spec.customTypeLabel.trim() && !spec.description.trim()}>
                Continuar <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {detection && (
            <Card className="ember-glow mb-6 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">
                  <WandSparkles className="size-3" /> Detectado
                </Badge>
                <span className="text-sm font-semibold text-text">{typeLabel(spec)}</span>
                <Badge tone={detection.confidence === 'alta' ? 'success' : detection.confidence === 'media' ? 'steel' : 'warning'}>confianza {detection.confidence}</Badge>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Stack</dt>
                  <dd className="text-text-2">{detection.techs.length ? techLabels(detection.techs).join(', ') : 'Claude elige'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Integraciones</dt>
                  <dd className="text-text-2">{detection.integrations.length ? detection.integrations.map((i) => INTEGRATION_BY_ID[i].label).join(', ') : detection.paymentsRequested ? 'Pasarela de pago (Claude elige)' : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Requisitos detectados</dt>
                  <dd className="text-text-2">{detection.requirements.length ? `${detection.requirements.length} (${detection.requirements.slice(0, 2).join(', ')}${detection.requirements.length > 2 ? '…' : ''})` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Estilo</dt>
                  <dd className="text-text-2">{[...detection.styles, ...detection.colors].join(', ') || '—'}</dd>
                </div>
              </dl>
            </Card>
          )}

          <div className="space-y-8">
            {CATEGORIES.map((cat) => (
              <section key={cat.id}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-text">{cat.label}</h2>
                  <p className="text-xs text-muted">{cat.description}</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {typesByCategory(cat.id).map((t) => {
                    const selected = spec.projectType === t.id;
                    const candidate = detection?.candidates.some((c) => c.id === t.id) && !selected;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSpec((s) => (s.projectType === t.id ? s : switchType(s, t.id)))}
                        className={cn(
                          'group relative rounded-xl border p-3.5 text-left transition-all',
                          selected ? 'border-accent/60 bg-accent-soft shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-border bg-surface hover:-translate-y-px hover:border-border-strong',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text">{t.label}</span>
                          {selected ? <Check className="size-4 text-accent" /> : candidate ? <Badge tone="steel">Sugerido</Badge> : null}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs text-text-2">{t.summary}</span>
                      </button>
                    );
                  })}
                </div>
                {cat.id === 'custom' && type.id === 'custom' && (
                  <div className="mt-3 max-w-md">
                    <input
                      value={spec.customTypeLabel}
                      onChange={(e) => setSpec((s) => ({ ...s, customTypeLabel: e.target.value }))}
                      maxLength={120}
                      placeholder="¿Qué tipo de proyecto es? Ej.: Red social para mascotas"
                      className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                      aria-label="Tipo de proyecto personalizado"
                    />
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {/* PASO 3 — PREGUNTAS */}
      {step === 2 && (
        <div className="animate-fade-up">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{typeLabel(spec)}</Badge>
                {templateName && <Badge tone="steel">Plantilla: {templateName}</Badge>}
              </div>
              <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName(spec)}</h1>
              <p className="mt-1 text-sm text-text-2">Responde lo que sepas. Lo que dejes vacío, Claude lo decidirá de forma razonable.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)}>
                Tipo
              </Button>
              <Button variant="primary" size="lg" onClick={generate} icon={<Sparkles className="size-4" />}>
                Generar prompt
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]">
            <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Secciones del formulario">
              {QUESTION_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'true' : undefined}
                  className={cn('flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors', tab === t.id ? 'bg-surface-2 font-medium text-text' : 'text-text-2 hover:bg-surface-2/60')}
                >
                  {t.label}
                  <span className="relative hidden h-1.5 w-10 overflow-hidden rounded-full bg-surface-3 lg:block" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all" style={{ width: `${Math.round(progress[t.id] * 100)}%` }} />
                  </span>
                </button>
              ))}
            </nav>

            <Card className="min-w-0 p-4 sm:p-6">
              <QuestionsForm spec={spec} update={setSpec} tab={tab} />
              <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <Button
                  variant="ghost"
                  disabled={tab === QUESTION_TABS[0].id}
                  onClick={() => setTab(QUESTION_TABS[Math.max(0, QUESTION_TABS.findIndex((t) => t.id === tab) - 1)].id)}
                  icon={<ArrowLeft className="size-4" />}
                >
                  Anterior
                </Button>
                {tab !== QUESTION_TABS[QUESTION_TABS.length - 1].id ? (
                  <Button variant="secondary" onClick={() => setTab(QUESTION_TABS[QUESTION_TABS.findIndex((t) => t.id === tab) + 1].id)}>
                    Siguiente <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button variant="primary" onClick={generate} icon={<Sparkles className="size-4" />}>
                    Generar prompt
                  </Button>
                )}
              </div>
            </Card>

            <aside className="hidden xl:block">
              <Card className="sticky top-6 p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Resumen</p>
                <dl className="mt-3 space-y-2.5 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Funcionalidades</dt>
                    <dd className="font-medium text-text">{featureCount(spec)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Roles</dt>
                    <dd className="font-medium text-text">{spec.roles.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Integraciones</dt>
                    <dd className="font-medium text-text">{spec.integrations.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">Stack</dt>
                    <dd className="truncate text-right font-medium text-text">{spec.tech.mode === 'auto' || !spec.tech.selected.length ? 'Claude elige' : techLabels(spec.tech.selected).slice(0, 3).join(', ')}</dd>
                  </div>
                </dl>
                {preview && (
                  <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
                    <p className="text-xs text-muted">Calidad estimada ({settings.defaultVariant.toUpperCase()})</p>
                    <p className="mt-0.5 font-mono text-xl font-semibold text-text">
                      {preview.score}
                      <span className="text-sm text-muted">/100</span>
                    </p>
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </div>
      )}

      {/* PASO 4 — RESULTADO */}
      {step === 3 && result && (
        <div className="animate-fade-up">
          <Workbench
            key={resultKey}
            initial={{
              name: displayName(spec),
              description: spec.description,
              tags: [type.category, type.id].map((t) => t.toLowerCase()),
              variants: result,
              activeVariant: settings.defaultVariant,
              spec,
              favorite: false,
            }}
            settings={settings}
            aiAvailable={aiAvailable}
            onBack={() => setStep(2)}
          />
        </div>
      )}
    </div>
  );
}

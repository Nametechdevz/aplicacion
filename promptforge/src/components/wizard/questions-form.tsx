'use client';

import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Chip, cn, Field, Input, Segmented, Select, Switch, Textarea } from '@/components/ui/primitives';
import { getProjectType } from '@/lib/engine/catalog';
import { questionsFor } from '@/lib/engine/questions';
import { COUNTRY_PRESETS, featureGroupsFor, STYLE_OPTIONS } from '@/lib/engine/spec';
import { INTEGRATIONS, stackWarnings, TECHS } from '@/lib/engine/techs';
import type { AnswerValue, ProjectSpec, Question, TechId } from '@/lib/engine/types';

export type QuestionTab = 'general' | 'design' | 'tech' | 'features' | 'business' | 'integrations';

export const QUESTION_TABS: { id: QuestionTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'business', label: 'Negocio' },
  { id: 'features', label: 'Funcionalidades' },
  { id: 'design', label: 'Diseño' },
  { id: 'tech', label: 'Tecnología' },
  { id: 'integrations', label: 'Integraciones' },
];

type Update = (fn: (s: ProjectSpec) => ProjectSpec) => void;

/** Progreso por pestaña (0–1), para mostrar qué falta por completar. */
export function tabProgress(spec: ProjectSpec): Record<QuestionTab, number> {
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? true : String(v ?? '').trim().length > 0);
  const ratio = (vals: unknown[]) => vals.filter(filled).length / vals.length;
  const qs = questionsFor(spec.projectType);
  return {
    general: ratio([spec.name, spec.description, spec.objective, spec.audience, spec.problem, spec.country, spec.language, spec.currency]),
    business: qs.length ? qs.filter((q) => filled(spec.answers[q.id])).length / qs.length : 1,
    features: Math.min(1, Object.values(spec.features).flat().length / 12),
    design: ratio([spec.design.styles, spec.design.colors, spec.design.typography, spec.design.references || spec.design.inspirationSites]),
    tech: spec.tech.mode === 'auto' || spec.tech.selected.length ? 1 : 0,
    integrations: 1,
  };
}

export function QuestionsForm({ spec, update, tab }: { spec: ProjectSpec; update: Update; tab: QuestionTab }) {
  switch (tab) {
    case 'general':
      return <GeneralTab spec={spec} update={update} />;
    case 'design':
      return <DesignTab spec={spec} update={update} />;
    case 'tech':
      return <TechTab spec={spec} update={update} />;
    case 'features':
      return <FeaturesTab spec={spec} update={update} />;
    case 'business':
      return <BusinessTab spec={spec} update={update} />;
    case 'integrations':
      return <IntegrationsTab spec={spec} update={update} />;
  }
}

function GeneralTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const set = (k: keyof ProjectSpec) => (e: { target: { value: string } }) => update((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="Nombre del proyecto" htmlFor="q-name" hint="Se usa como título del prompt.">
        <Input id="q-name" value={spec.name} onChange={set('name')} maxLength={160} placeholder="Ej.: Pulse Sportswear" />
      </Field>
      <Field label="Alcance" htmlFor="q-scope">
        <Select id="q-scope" value={spec.scope} onChange={(e) => update((s) => ({ ...s, scope: e.target.value as ProjectSpec['scope'] }))}>
          <option value="mvp">MVP funcional (lo esencial, con calidad de producción)</option>
          <option value="complete">Producto completo</option>
          <option value="enterprise">Empresarial (escalabilidad y auditoría)</option>
        </Select>
      </Field>
      <Field label="Descripción" htmlFor="q-desc" className="md:col-span-2" hint="Qué es el proyecto, en una o dos frases.">
        <Textarea id="q-desc" value={spec.description} onChange={set('description')} rows={2} maxLength={4000} />
      </Field>
      <Field label="Objetivo principal" htmlFor="q-obj" optional>
        <Textarea id="q-obj" value={spec.objective} onChange={set('objective')} rows={2} maxLength={2000} placeholder="Ej.: vender online en todo el país y reducir pedidos por WhatsApp" />
      </Field>
      <Field label="Público objetivo" htmlFor="q-aud" optional>
        <Textarea id="q-aud" value={spec.audience} onChange={set('audience')} rows={2} maxLength={1000} placeholder="Ej.: deportistas de 18–40 años que compran desde el móvil" />
      </Field>
      <Field label="Problema que resuelve" htmlFor="q-prob" optional className="md:col-span-2">
        <Textarea id="q-prob" value={spec.problem} onChange={set('problem')} rows={2} maxLength={2000} placeholder="Ej.: hoy las ventas se gestionan a mano por redes sociales, sin control de inventario" />
      </Field>
      <Field label="País" htmlFor="q-country">
        <Input
          id="q-country"
          list="countries"
          value={spec.country}
          maxLength={80}
          onChange={(e) => {
            const country = e.target.value;
            const preset = COUNTRY_PRESETS.find((c) => c.country.toLowerCase() === country.trim().toLowerCase());
            update((s) => ({ ...s, country, ...(preset && !s.currency ? { currency: preset.currency } : {}) }));
          }}
        />
        <datalist id="countries">
          {COUNTRY_PRESETS.map((c) => (
            <option key={c.country} value={c.country} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Idioma" htmlFor="q-lang">
          <Input id="q-lang" value={spec.language} onChange={set('language')} maxLength={80} />
        </Field>
        <Field label="Moneda" htmlFor="q-cur">
          <Input id="q-cur" value={spec.currency} onChange={(e) => update((s) => ({ ...s, currency: e.target.value.toUpperCase() }))} maxLength={10} placeholder="COP" />
        </Field>
      </div>
      <div className="space-y-4 rounded-xl border border-border p-4 md:col-span-2">
        <Switch checked={spec.multilingual} onChange={(v) => update((s) => ({ ...s, multilingual: v }))} label="Multilenguaje" description="Preparar la interfaz para varios idiomas (i18n)." />
        <Switch checked={spec.seo} onChange={(v) => update((s) => ({ ...s, seo: v }))} label="Requisitos de SEO" description="Incluir SEO técnico, metadatos, sitemap y Core Web Vitals." />
      </div>
      <Field label="Notas adicionales" htmlFor="q-notes" optional className="md:col-span-2">
        <Textarea id="q-notes" value={spec.notes} onChange={set('notes')} rows={3} maxLength={4000} placeholder="Cualquier requisito, restricción o detalle que Claude deba conocer." />
      </Field>
    </div>
  );
}

function DesignTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const d = spec.design;
  const setD = (patch: Partial<ProjectSpec['design']>) => update((s) => ({ ...s, design: { ...s.design, ...patch } }));
  return (
    <div className="space-y-6">
      <Field label="Estilo visual" hint="Puedes combinar varios.">
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((st) => (
            <Chip key={st} active={d.styles.includes(st)} onClick={() => setD({ styles: d.styles.includes(st) ? d.styles.filter((x) => x !== st) : [...d.styles, st] })}>
              {st}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Colores" htmlFor="d-colors" optional hint="Nombres o códigos. Ej.: negro, blanco y verde lima #B6FF3B">
          <Input id="d-colors" value={d.colors} onChange={(e) => setD({ colors: e.target.value })} maxLength={300} />
        </Field>
        <Field label="Tipografía" htmlFor="d-type" optional hint="Ej.: Inter para textos, Clash Display para titulares">
          <Input id="d-type" value={d.typography} onChange={(e) => setD({ typography: e.target.value })} maxLength={200} />
        </Field>
      </div>
      <Field label="Modo claro / oscuro">
        <Segmented
          value={d.themeMode}
          onChange={(v) => setD({ themeMode: v })}
          options={[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
            { value: 'both', label: 'Ambos con selector' },
          ]}
        />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Referencias visuales" htmlFor="d-refs" optional>
          <Textarea id="d-refs" value={d.references} onChange={(e) => setD({ references: e.target.value })} rows={3} maxLength={1000} placeholder="Ej.: fotografía de producto a pantalla completa, mucho espacio en blanco" />
        </Field>
        <Field label="Sitios web de inspiración" htmlFor="d-sites" optional hint="Claude se inspirará en su calidad sin copiar su interfaz.">
          <Textarea id="d-sites" value={d.inspirationSites} onChange={(e) => setD({ inspirationSites: e.target.value })} rows={3} maxLength={1000} placeholder="Ej.: nike.com, gymshark.com" />
        </Field>
      </div>
    </div>
  );
}

function TechTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const t = spec.tech;
  const groups = useMemo(() => [...new Set(TECHS.map((x) => x.group))], []);
  const toggle = (id: TechId) =>
    update((s) => ({ ...s, tech: { ...s.tech, mode: 'custom', selected: s.tech.selected.includes(id) ? s.tech.selected.filter((x) => x !== id) : [...s.tech.selected, id] } }));
  const warnings = t.mode === 'custom' ? stackWarnings(t.selected) : [];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {(['auto', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => update((s) => ({ ...s, tech: { ...s.tech, mode: m } }))}
            aria-pressed={t.mode === m}
            className={cn('rounded-xl border p-4 text-left transition-colors', t.mode === m ? 'border-accent/60 bg-accent-soft' : 'border-border hover:border-border-strong')}
          >
            <p className="text-sm font-semibold text-text">{m === 'auto' ? 'Claude puede elegir la mejor tecnología' : 'Elegir el stack yo mismo'}</p>
            <p className="mt-1 text-xs text-text-2">
              {m === 'auto' ? `Claude selecciona y justifica el stack. Sugerencia: ${getProjectType(spec.projectType).stackHint}` : 'Selecciona las tecnologías que deben usarse obligatoriamente.'}
            </p>
          </button>
        ))}
      </div>
      {t.mode === 'custom' && (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{g}</p>
              <div className="flex flex-wrap gap-2">
                {TECHS.filter((x) => x.group === g).map((x) => (
                  <Chip key={x.id} active={t.selected.includes(x.id)} onClick={() => toggle(x.id)}>
                    {x.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Field label="Hosting / despliegue previsto" htmlFor="t-host" optional hint="Ej.: VPS con Docker, Vercel + Neon, hosting compartido con cPanel…">
        <Input id="t-host" value={t.hosting} onChange={(e) => update((s) => ({ ...s, tech: { ...s.tech, hosting: e.target.value } }))} maxLength={200} />
      </Field>
    </div>
  );
}

function FeaturesTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const groups = featureGroupsFor(spec);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [newRole, setNewRole] = useState('');
  const known = new Set(groups.map((g) => g.name));
  // Grupos añadidos por el usuario o detectados en la idea
  const extraGroups = Object.keys(spec.features).filter((g) => !known.has(g));
  const toggle = (group: string, label: string) =>
    update((s) => {
      const list = s.features[group] ?? [];
      return { ...s, features: { ...s.features, [group]: list.includes(label) ? list.filter((x) => x !== label) : [...list, label] } };
    });
  const addCustom = (group: string) => {
    const v = (custom[group] ?? '').trim();
    if (!v) return;
    update((s) => ({ ...s, features: { ...s.features, [group]: [...new Set([...(s.features[group] ?? []), v])] } }));
    setCustom((c) => ({ ...c, [group]: '' }));
  };
  const all = [...groups.map((g) => ({ name: g.name, items: g.items.map((i) => ({ label: i.label, advanced: !!i.advanced })) })), ...extraGroups.map((name) => ({ name, items: [] as { label: string; advanced: boolean }[] }))];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[13px] font-medium text-text">Roles del sistema</p>
        <div className="flex flex-wrap items-center gap-2">
          {spec.roles.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 py-1 pl-2.5 pr-1 text-[13px] text-text">
              {r}
              <button type="button" aria-label={`Quitar rol ${r}`} onClick={() => update((s) => ({ ...s, roles: s.roles.filter((x) => x !== r) }))} className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-text">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const r = newRole.trim();
              if (r && !spec.roles.includes(r)) update((s) => ({ ...s, roles: [...s.roles, r].slice(0, 20) }));
              setNewRole('');
            }}
          >
            <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Añadir rol" className="h-8 w-32 text-[13px]" maxLength={80} />
            <Button type="submit" size="sm" variant="ghost" aria-label="Añadir rol">
              <Plus className="size-4" />
            </Button>
          </form>
        </div>
      </div>

      {all.map((g) => {
        const selected = spec.features[g.name] ?? [];
        const customItems = selected.filter((x) => !g.items.some((i) => i.label === x));
        return (
          <section key={g.name} className="rounded-xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-text">{g.name}</h4>
              <div className="flex items-center gap-2 text-xs">
                <Badge>{selected.length} seleccionadas</Badge>
                {g.items.length > 0 && (
                  <>
                    <button type="button" className="text-muted hover:text-text" onClick={() => update((s) => ({ ...s, features: { ...s.features, [g.name]: [...new Set([...g.items.map((i) => i.label), ...customItems])] } }))}>
                      Todas
                    </button>
                    <button type="button" className="text-muted hover:text-text" onClick={() => update((s) => ({ ...s, features: { ...s.features, [g.name]: customItems } }))}>
                      Ninguna
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.items.map((i) => (
                <Chip key={i.label} active={selected.includes(i.label)} onClick={() => toggle(g.name, i.label)} title={i.advanced ? 'Funcionalidad avanzada' : undefined}>
                  {i.label}
                  {i.advanced && <span className="rounded bg-steel-soft px-1 text-[10px] text-steel">+</span>}
                </Chip>
              ))}
              {customItems.map((label) => (
                <Chip key={label} active onClick={() => toggle(g.name, label)} title="Quitar">
                  {label}
                  <X className="size-3 text-muted" />
                </Chip>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCustom(g.name);
              }}
            >
              <Input value={custom[g.name] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [g.name]: e.target.value }))} placeholder="Añadir funcionalidad personalizada…" className="h-9 text-[13px]" maxLength={300} />
              <Button type="submit" size="md" variant="secondary" icon={<Plus className="size-4" />}>
                Añadir
              </Button>
            </form>
          </section>
        );
      })}
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void }) {
  const id = `ans-${q.id}`;
  if (q.type === 'boolean') {
    return (
      <div className="rounded-xl border border-border p-4">
        <p className="mb-3 text-[13px] font-medium text-text">{q.label}</p>
        <Segmented
          size="sm"
          value={value === true ? 'yes' : value === false ? 'no' : 'unset'}
          onChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : undefined)}
          options={[
            { value: 'yes', label: 'Sí' },
            { value: 'no', label: 'No' },
            { value: 'unset', label: 'Que decida Claude' },
          ]}
        />
      </div>
    );
  }
  if (q.type === 'single' || q.type === 'multi') {
    const arr = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [];
    return (
      <Field label={q.label} hint={q.help}>
        <div className="flex flex-wrap gap-2">
          {q.options!.map((o) => (
            <Chip
              key={o.value}
              active={arr.includes(o.value)}
              onClick={() => {
                if (q.type === 'single') onChange(arr.includes(o.value) ? undefined : o.value);
                else {
                  let next = arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value];
                  if (o.value === 'auto' && !arr.includes('auto')) next = ['auto'];
                  else if (o.value !== 'auto') next = next.filter((x) => x !== 'auto');
                  onChange(next.length ? next : undefined);
                }
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </Field>
    );
  }
  const str = typeof value === 'string' ? value : '';
  return (
    <Field label={q.label} htmlFor={id} hint={q.help} optional>
      {q.type === 'textarea' ? (
        <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value || undefined)} rows={3} placeholder={q.placeholder} maxLength={2000} />
      ) : (
        <Input id={id} value={str} onChange={(e) => onChange(e.target.value || undefined)} placeholder={q.placeholder} maxLength={2000} />
      )}
    </Field>
  );
}

function BusinessTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const qs = questionsFor(spec.projectType);
  const type = getProjectType(spec.projectType);
  if (!qs.length) return <p className="text-sm text-muted">No hay preguntas específicas para este tipo de proyecto.</p>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-2">
        Preguntas específicas para <strong className="text-text">{type.label}</strong>. Tus respuestas añaden funcionalidades e integraciones automáticamente.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {qs.map((q) => (
          <div key={q.id} className={cn(q.type === 'textarea' || q.type === 'multi' ? 'lg:col-span-2' : '')}>
            <QuestionInput
              q={q}
              value={spec.answers[q.id]}
              onChange={(v) =>
                update((s) => {
                  const answers = { ...s.answers };
                  if (v === undefined) delete answers[q.id];
                  else answers[q.id] = v;
                  return { ...s, answers };
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationsTab({ spec, update }: { spec: ProjectSpec; update: Update }) {
  const suggested = new Set(getProjectType(spec.projectType).integrations);
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-2">Integraciones detectadas para este proyecto. Claude usará SDKs oficiales y variables de entorno para todas las credenciales; nunca inventará APIs.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((i) => {
          const on = spec.integrations.includes(i.id);
          return (
            <button
              key={i.id}
              type="button"
              aria-pressed={on}
              onClick={() => update((s) => ({ ...s, integrations: on ? s.integrations.filter((x) => x !== i.id) : [...s.integrations, i.id] }))}
              className={cn('flex flex-col rounded-xl border p-3.5 text-left transition-colors', on ? 'border-accent/60 bg-accent-soft' : 'border-border hover:border-border-strong')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text">{i.label}</span>
                <span className="flex gap-1">
                  {suggested.has(i.id) && <Badge tone="steel">Sugerida</Badge>}
                  <Badge>{i.kind}</Badge>
                </span>
              </span>
              <span className="mt-1 text-xs text-text-2">{i.description}</span>
              <span className="mt-2 truncate font-mono text-[10.5px] text-muted">{i.envVars.slice(0, 2).join(' · ')}…</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileText, ImagePlus, Megaphone, Repeat, Rocket, Send, ShieldAlert, Users, X } from 'lucide-react';
import type { AudiencePreview, AudienceSpec, Campaign, CustomField, MediaItem, ProviderTemplate, Recurrence, Segment, Tag, Template } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { fmtNum, fmtPhone, isoToLocalInput } from '../lib/format';
import { ContactPicker } from '../components/ContactPicker';
import { MediaPicker } from '../components/MediaPicker';
import { MediaThumb } from '../components/MediaThumb';
import { VariableTextarea } from '../components/VariableTextarea';
import { Badge, Button, Card, Field, IconButton, InfoBox, Input, Select, Skeleton, TagChip, Toggle, cx } from '../components/ui';

const STEPS = ['Nombre', 'Destinatarios', 'Mensaje', 'Multimedia', 'Programación', 'Revisión', 'Confirmar'];
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TZS = ['America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Guayaquil', 'America/Caracas', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];

interface Draft {
  id?: number;
  name: string;
  audience: AudienceSpec;
  message_type: 'text' | 'template';
  body: string;
  media_id: number | null;
  provider_template_id: number | null;
  template_params: string[];
  timezone: string;
  when: 'now' | 'later' | 'recurring';
  scheduled_local: string;
  recurrence: Recurrence;
}

function WhatsAppPreview({ text, media, name }: { text: string; media?: MediaItem | null; name?: string | null }) {
  return (
    <div className="rounded-2xl bg-[#0b141a] p-4" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
      <p className="mb-2 text-center text-[11px] text-white/50">Vista previa para {name || 'contacto'}</p>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2 text-sm text-white shadow">
        {media && <MediaThumb media={media} large className="mb-1.5" />}
        <p className="whitespace-pre-wrap break-words">{text || <span className="opacity-50">Escriba el mensaje…</span>}</p>
        <p className="mt-1 text-right text-[10px] text-white/60">10:30 ✓✓</p>
      </div>
    </div>
  );
}

export function CampaignWizard() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { accounts, accountId } = useStore();
  const acc = accounts.find((a) => a.id === accountId);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [sample, setSample] = useState<number | undefined>();
  const [pickContacts, setPickContacts] = useState(false);
  const [pickMedia, setPickMedia] = useState(false);
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [consentAck, setConsentAck] = useState(false);
  const tags = useQuery<Tag[]>('tags.list');
  const segments = useQuery<Segment[]>('segments.list');
  const batches = useQuery<any[]>('campaigns.importBatches');
  const fields = useQuery<CustomField[]>('fields.list');
  const approved = useQuery<ProviderTemplate[]>('templates.provider', { onlyApproved: true });
  const internal = useQuery<{ templates: Template[] }>('templates.list');
  const sending = useQuery<any>('settings.get', { key: 'sending' });
  const general = useQuery<any>('settings.get', { key: 'general' });
  const caps = useQuery<any>('accounts.current');
  const windowHours = caps.data?.capabilities?.customerServiceWindowHours ?? null;

  // Inicialización (nuevo o edición)
  useEffect(() => {
    if (id) {
      void call<Campaign>('campaigns.get', { id: Number(id) }).then((c) => {
        const rec = c.recurrence ?? { freq: 'weekly', interval: 1, byWeekday: [1], time: '10:30' };
        setD({
          id: c.id,
          name: c.name,
          audience: c.audience,
          message_type: c.message_type,
          body: c.body ?? '',
          media_id: c.media_id,
          provider_template_id: c.provider_template_id,
          template_params: c.template_params ?? [],
          timezone: c.timezone,
          when: c.recurrence ? 'recurring' : c.scheduled_at ? 'later' : 'now',
          scheduled_local: isoToLocalInput(c.scheduled_at ?? new Date(Date.now() + 3600000).toISOString()),
          recurrence: rec,
        });
        if (c.media_id) void call<MediaItem[]>('media.list', {}).then((l) => setMedia(l.find((m) => m.id === c.media_id) ?? null));
      });
    } else if (general.data) {
      let audience: AudienceSpec = { type: 'all' };
      if (params.get('tag')) audience = { type: 'tag', tagIds: [Number(params.get('tag'))], tagMode: 'any' };
      if (params.get('segment')) audience = { type: 'segment', segmentId: Number(params.get('segment')) };
      if (params.get('manual')) {
        const ids = JSON.parse(sessionStorage.getItem('wcrm:campaign-contacts') ?? '[]');
        audience = { type: 'manual', contactIds: ids };
      }
      setD({
        name: '',
        audience,
        message_type: 'text',
        body: 'Hola {{nombre}} 👋\n',
        media_id: null,
        provider_template_id: null,
        template_params: [],
        timezone: general.data.timezone,
        when: 'now',
        scheduled_local: isoToLocalInput(new Date(Date.now() + 3600000).toISOString()),
        recurrence: { freq: 'weekly', interval: 1, byWeekday: [1], time: '10:30' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, general.data]);

  const payload = useMemo(() => {
    if (!d) return null;
    const scheduledIso = d.when === 'now' ? null : new Date(d.scheduled_local).toISOString();
    return {
      id: d.id,
      name: d.name.trim() || 'Campaña sin nombre',
      audience: d.audience,
      message_type: d.message_type,
      body: d.message_type === 'text' ? d.body : null,
      media_id: d.media_id,
      provider_template_id: d.message_type === 'template' ? d.provider_template_id : null,
      template_params: d.message_type === 'template' ? d.template_params : null,
      timezone: d.timezone,
      scheduled_at: scheduledIso,
      recurrence: d.when === 'recurring' ? { ...d.recurrence, time: d.recurrence.time } : null,
    };
  }, [d]);

  // Vista previa en vivo de la audiencia/mensaje
  useEffect(() => {
    if (!payload || step < 1) return;
    const t = setTimeout(() => {
      call<AudiencePreview>('campaigns.previewDraft', { ...payload, sampleContactId: sample })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [payload, sample, step]);

  if (!d) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const selTemplate = approved.data?.find((t) => t.id === d.provider_template_id);
  const threshold = sending.data?.confirmThreshold ?? 50;
  const needsTyping = (preview?.eligible ?? 0) >= threshold;

  const stepValid = (s: number): string | null => {
    if (s === 0 && !d.name.trim()) return 'Ponga un nombre a la campaña';
    if (s === 1) {
      if (d.audience.type === 'tag' && !d.audience.tagIds?.length) return 'Seleccione al menos una etiqueta';
      if (d.audience.type === 'segment' && !d.audience.segmentId) return 'Seleccione un segmento';
      if (d.audience.type === 'import' && !d.audience.importBatchId) return 'Seleccione una importación';
      if (d.audience.type === 'manual' && !d.audience.contactIds?.length) return 'Seleccione contactos';
    }
    if (s === 2) {
      if (d.message_type === 'text' && !d.body.trim() && !d.media_id) return 'Escriba el mensaje';
      if (d.message_type === 'template' && !selTemplate) return 'Seleccione una plantilla aprobada';
      if (d.message_type === 'template' && selTemplate && d.template_params.slice(0, selTemplate.param_count).some((p) => !p.trim())) return 'Complete los parámetros de la plantilla';
    }
    if (s === 4 && d.when !== 'now') {
      if (!d.scheduled_local || Number.isNaN(new Date(d.scheduled_local).getTime())) return 'Indique fecha y hora';
      if (d.when === 'later' && new Date(d.scheduled_local) < new Date()) return 'La fecha programada ya pasó';
      if (d.when === 'recurring' && d.recurrence.freq === 'weekly' && !d.recurrence.byWeekday?.length) return 'Seleccione los días';
    }
    return null;
  };

  const saveDraft = async (silent = true): Promise<Campaign | undefined> => {
    const r = await attempt(() => call<Campaign>('campaigns.save', payload));
    if (r) {
      setD({ ...d, id: r.id });
      if (!silent) toast.success('Borrador guardado');
    }
    return r;
  };

  const next = async () => {
    const err = stepValid(step);
    if (err) return toast.warning(err);
    if (step >= 1) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    setStep(step + 1);
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    const saved = await saveDraft();
    if (!saved) return setBusy(false);
    const r = await attempt(() => call<Campaign>('campaigns.confirm', { id: saved.id, expectedCount: preview.eligible }));
    setBusy(false);
    if (r) {
      toast.success(r.status === 'running' ? '🚀 Campaña en marcha' : '📅 Campaña programada', r.status === 'running' ? `${fmtNum(preview.eligible)} mensajes en cola` : undefined);
      nav(`/campaigns/${r.id}`);
    }
  };

  const audienceLabel = () => {
    const a = d.audience;
    if (a.type === 'all') return 'Todos los contactos';
    if (a.type === 'tag') return `Etiqueta: ${a.tagIds?.map((t) => tags.data?.find((x) => x.id === t)?.name).join(a.tagMode === 'all' ? ' y ' : ' o ')}`;
    if (a.type === 'segment') return `Segmento: ${segments.data?.find((s) => s.id === a.segmentId)?.name ?? ''}`;
    if (a.type === 'import') return `Importación ${a.importBatchId}`;
    return `${a.contactIds?.length ?? 0} contactos seleccionados`;
  };

  return (
    <div className="mx-auto max-w-[1300px] p-8">
      <button onClick={() => nav('/campaigns')} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Campañas
      </button>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 text-brand">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{id ? 'Editar campaña' : 'Nueva campaña'}</h1>
          <p className="text-sm text-muted">{d.name || 'Sin nombre'}</p>
        </div>
      </div>
      {/* Pasos */}
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button disabled={i > step} onClick={() => setStep(i)} className={cx('flex items-center gap-2 text-xs font-medium', i === step ? 'text-fg' : i < step ? 'text-brand' : 'text-muted')}>
              <span className={cx('flex h-7 w-7 items-center justify-center rounded-full border text-[11px]', i < step ? 'border-brand bg-brand text-white' : i === step ? 'border-brand text-brand' : 'border-line')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className={cx('h-px flex-1', i < step ? 'bg-brand' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <Card>
          {step === 0 && (
            <div className="space-y-4">
              <Field label="Nombre de la campaña" hint='Ej. "Promoción octubre". Solo es visible internamente.'>
                <Input autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && next()} maxLength={120} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-5 gap-2">
                {[
                  ['all', 'Todos'],
                  ['tag', 'Etiqueta'],
                  ['segment', 'Segmento'],
                  ['import', 'Importados'],
                  ['manual', 'Selección manual'],
                ].map(([t, l]) => (
                  <button key={t} onClick={() => set({ audience: { type: t as any, tagMode: 'any' } })} className={cx('rounded-xl border px-3 py-3 text-sm font-medium transition', d.audience.type === t ? 'border-brand bg-brand/10 text-fg' : 'border-line text-muted hover:text-fg')}>
                    {l}
                  </button>
                ))}
              </div>
              {d.audience.type === 'tag' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {tags.data?.filter((t) => !t.is_system).map((t) => {
                      const on = d.audience.tagIds?.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => set({ audience: { ...d.audience, tagIds: on ? d.audience.tagIds!.filter((x) => x !== t.id) : [...(d.audience.tagIds ?? []), t.id] } })} className={cx('rounded-full transition', !on && 'opacity-40 grayscale hover:opacity-70')}>
                          <TagChip tag={{ ...t, name: `${t.name} · ${t.contact_count}` }} />
                        </button>
                      );
                    })}
                  </div>
                  {(d.audience.tagIds?.length ?? 0) > 1 && (
                    <Select className="w-72" value={d.audience.tagMode ?? 'any'} onChange={(e) => set({ audience: { ...d.audience, tagMode: e.target.value as any } })}>
                      <option value="any">Con cualquiera de las etiquetas</option>
                      <option value="all">Con todas las etiquetas</option>
                    </Select>
                  )}
                </div>
              )}
              {d.audience.type === 'segment' && (
                <Select value={d.audience.segmentId ?? ''} onChange={(e) => set({ audience: { type: 'segment', segmentId: Number(e.target.value) } })}>
                  <option value="">Seleccione un segmento…</option>
                  {segments.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.contact_count})
                    </option>
                  ))}
                </Select>
              )}
              {d.audience.type === 'import' && (
                <Select value={d.audience.importBatchId ?? ''} onChange={(e) => set({ audience: { type: 'import', importBatchId: e.target.value } })}>
                  <option value="">Seleccione una importación…</option>
                  {batches.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.count} contactos
                    </option>
                  ))}
                </Select>
              )}
              {d.audience.type === 'manual' && (
                <div className="flex items-center gap-3">
                  <Button icon={<Users className="h-4 w-4" />} onClick={() => setPickContacts(true)}>
                    Elegir contactos
                  </Button>
                  <span className="text-sm text-muted">{d.audience.contactIds?.length ?? 0} seleccionados</span>
                </div>
              )}
              <InfoBox tone="info" icon={<ShieldAlert className="h-4 w-4" />}>
                Se excluyen automáticamente: contactos con opt-out, en lista negra o con la etiqueta "No contactar", números inválidos y duplicados
                {windowHours ? <>, y —para mensajes de texto libre— quienes no escribieron en las últimas {windowHours} h (WhatsApp exige plantilla aprobada).</> : '.'}
              </InfoBox>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => set({ message_type: 'text' })} className={cx('flex-1 rounded-xl border p-3 text-left text-sm', d.message_type === 'text' ? 'border-brand bg-brand/10' : 'border-line')}>
                  <p className="font-medium">Mensaje libre</p>
                  <p className="text-xs text-muted">{windowHours ? `Solo llega a quienes escribieron en las últimas ${windowHours} h.` : 'Texto con variables y multimedia.'}</p>
                </button>
                <button disabled={caps.data?.capabilities && !caps.data.capabilities.templates} title={caps.data?.capabilities && !caps.data.capabilities.templates ? 'Las plantillas de Meta solo existen en la Cloud API oficial' : undefined} onClick={() => set({ message_type: 'template' })} className={cx('flex-1 rounded-xl border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40', d.message_type === 'template' ? 'border-brand bg-brand/10' : 'border-line')}>
                  <p className="font-medium">Plantilla aprobada por WhatsApp</p>
                  <p className="text-xs text-muted">Necesaria para iniciar conversaciones (marketing / utilidad).</p>
                </button>
              </div>
              {d.message_type === 'text' ? (
                <>
                  <VariableTextarea value={d.body} onChange={(body) => set({ body })} fields={fields.data} rows={8} maxLength={d.media_id ? 1024 : 4096} placeholder={'Hola {{nombre}} 👋\nTenemos una promoción especial para ti.'} />
                  {!!internal.data?.templates.length && (
                    <Select value="" onChange={(e) => e.target.value && set({ body: internal.data!.templates.find((t) => t.id === Number(e.target.value))!.body })}>
                      <option value="">Usar una plantilla interna…</option>
                      {internal.data.templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.category}] {t.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {approved.data?.length === 0 && <InfoBox tone="warn">No hay plantillas aprobadas sincronizadas. Créelas en el administrador de WhatsApp de Meta y sincronícelas en Configuración → WhatsApp.</InfoBox>}
                  <Select value={d.provider_template_id ?? ''} onChange={(e) => { const t = approved.data?.find((x) => x.id === Number(e.target.value)); set({ provider_template_id: t?.id ?? null, template_params: Array.from({ length: t?.param_count ?? 0 }, (_, i) => d.template_params[i] ?? (i === 0 ? '{{nombre}}' : '')) }); }}>
                    <option value="">Seleccione una plantilla…</option>
                    {approved.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language}) · {t.category}
                      </option>
                    ))}
                  </Select>
                  {selTemplate && (
                    <>
                      <p className="rounded-xl bg-elevated/60 p-3 text-sm">{selTemplate.body_text}</p>
                      {selTemplate.header_type && selTemplate.header_type !== 'TEXT' && <InfoBox tone="info">Esta plantilla tiene encabezado multimedia ({selTemplate.header_type}): agréguelo en el paso Multimedia.</InfoBox>}
                      {d.template_params.map((p, i) => (
                        <Field key={i} label={`Parámetro {{${i + 1}}}`} hint="Texto fijo o variable del contacto, ej. {{nombre}}, {{producto}}.">
                          <Input value={p} onChange={(e) => set({ template_params: d.template_params.map((x, j) => (j === i ? e.target.value : x)) })} />
                        </Field>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">Opcional. Imagen (JPG/PNG ≤5 MB), video (MP4 ≤16 MB) o documento (PDF, DOCX, XLSX… ≤100 MB). Los WEBP se envían como documento.</p>
              {media ? (
                <div className="flex items-center gap-4 rounded-xl border border-line p-3">
                  <div className="h-20 w-20 overflow-hidden rounded-lg">
                    <MediaThumb media={media} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{media.title || media.file_name}</p>
                    <p className="text-xs text-muted">{media.kind}</p>
                  </div>
                  <IconButton title="Quitar" onClick={() => (setMedia(null), set({ media_id: null }))}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              ) : (
                <button onClick={() => setPickMedia(true)} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-line p-10 transition hover:border-brand">
                  <ImagePlus className="h-8 w-8 text-brand" />
                  <p className="mt-2 font-medium">Elegir de la biblioteca o subir archivo</p>
                </button>
              )}
              {d.message_type === 'text' && media && d.body.length > 1024 && <InfoBox tone="warn">Con multimedia, el texto (pie de foto) no puede superar 1024 caracteres.</InfoBox>}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['now', 'Enviar al confirmar', <Send key="a" className="h-4 w-4" />],
                  ['later', 'Programar fecha y hora', <CalendarClock key="b" className="h-4 w-4" />],
                  ['recurring', 'Recurrente', <Repeat key="c" className="h-4 w-4" />],
                ].map(([k, l, icon]) => (
                  <button key={k as string} onClick={() => set({ when: k as any })} className={cx('flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium', d.when === k ? 'border-brand bg-brand/10' : 'border-line text-muted')}>
                    {icon}
                    {l}
                  </button>
                ))}
              </div>
              {d.when !== 'now' && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={d.when === 'recurring' ? 'Inicio' : 'Fecha y hora'} hint="En la hora local de este equipo.">
                    <Input type="datetime-local" value={d.scheduled_local} onChange={(e) => set({ scheduled_local: e.target.value })} />
                  </Field>
                  <Field label="Zona horaria de la campaña" hint="Se usa para la recurrencia y variables de fecha.">
                    <Select value={d.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                      {[...new Set([d.timezone, ...TZS])].map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
              {d.when === 'recurring' && (
                <div className="space-y-4 rounded-xl border border-line/60 p-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Frecuencia">
                      <Select value={d.recurrence.freq} onChange={(e) => set({ recurrence: { ...d.recurrence, freq: e.target.value as any } })}>
                        <option value="daily">Todos los días</option>
                        <option value="weekly">Cada semana</option>
                        <option value="monthly">Cada mes</option>
                      </Select>
                    </Field>
                    <Field label="Cada">
                      <Select value={d.recurrence.interval} onChange={(e) => set({ recurrence: { ...d.recurrence, interval: Number(e.target.value) } })}>
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n} {d.recurrence.freq === 'daily' ? 'día(s)' : d.recurrence.freq === 'weekly' ? 'semana(s)' : 'mes(es)'}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Hora">
                      <Input type="time" value={d.recurrence.time} onChange={(e) => set({ recurrence: { ...d.recurrence, time: e.target.value } })} />
                    </Field>
                  </div>
                  {d.recurrence.freq === 'weekly' && (
                    <div className="flex gap-1.5">
                      {DAYS.map((l, i) => {
                        const on = d.recurrence.byWeekday?.includes(i + 1);
                        return (
                          <button key={l} onClick={() => set({ recurrence: { ...d.recurrence, byWeekday: on ? d.recurrence.byWeekday!.filter((x) => x !== i + 1) : [...(d.recurrence.byWeekday ?? []), i + 1].sort() } })} className={cx('h-9 w-9 rounded-full text-sm font-medium', on ? 'bg-brand text-white' : 'bg-elevated text-muted')}>
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {d.recurrence.freq === 'monthly' && (
                    <Field label="Día del mes" className="w-40">
                      <Input type="number" min={1} max={31} value={d.recurrence.byMonthDay ?? new Date(d.scheduled_local).getDate()} onChange={(e) => set({ recurrence: { ...d.recurrence, byMonthDay: Number(e.target.value) } })} />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Finaliza (opcional)">
                      <Input type="date" value={d.recurrence.until ?? ''} onChange={(e) => set({ recurrence: { ...d.recurrence, until: e.target.value || null } })} />
                    </Field>
                    <Field label="Máximo de envíos (opcional)">
                      <Input type="number" min={1} value={d.recurrence.maxRuns ?? ''} onChange={(e) => set({ recurrence: { ...d.recurrence, maxRuns: e.target.value ? Number(e.target.value) : null } })} />
                    </Field>
                  </div>
                  <InfoBox tone="info">
                    Salvaguardas: no se acumulan envíos perdidos si la aplicación estuvo cerrada, no se inicia un envío si el anterior sigue en curso, y si la audiencia crece más de 50% la campaña se pausa para que la reconfirme.
                  </InfoBox>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-elevated/50 p-4">
                  <p className="text-xs text-muted">Audiencia</p>
                  <p className="text-2xl font-semibold">{fmtNum(preview?.total)}</p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-4">
                  <p className="text-xs text-muted">Recibirán el mensaje</p>
                  <p className="text-2xl font-semibold text-emerald-400">{fmtNum(preview?.eligible)}</p>
                </div>
                <div className="rounded-xl bg-amber-500/10 p-4">
                  <p className="text-xs text-muted">Excluidos</p>
                  <p className="text-2xl font-semibold text-amber-400">{fmtNum((preview?.total ?? 0) - (preview?.eligible ?? 0))}</p>
                </div>
              </div>
              {preview && (
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {[
                    ['Opt-out (pidieron no recibir)', preview.excluded.opted_out],
                    ['Lista negra', preview.excluded.blacklisted],
                    ['Etiqueta "No contactar"', preview.excluded.no_contact_tag],
                    ['Teléfono inválido', preview.excluded.invalid_phone],
                    ['Duplicados', preview.excluded.duplicates],
                    ['Fuera de la ventana de 24 h', preview.excluded.outside_window],
                  ].map(([l, v]) => (
                    <li key={l as string} className="flex justify-between border-b border-line/40 py-1.5">
                      <span className="text-muted">{l}</span>
                      <b className="tabular-nums">{fmtNum(v as number)}</b>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="label">Vista previa real por contacto</p>
                <div className="flex flex-wrap gap-2">
                  {preview?.sample.map((s) => (
                    <button key={s.contact_id} onClick={() => setSample(s.contact_id)} className={cx('rounded-full border px-3 py-1 text-xs', (sample ?? preview.sample[0]?.contact_id) === s.contact_id ? 'border-brand bg-brand/10' : 'border-line text-muted')}>
                      {s.name || fmtPhone(s.phone)}
                    </button>
                  ))}
                </div>
                {preview?.sample.find((s) => s.contact_id === (sample ?? preview.sample[0]?.contact_id))?.missing.length ? (
                  <InfoBox tone="warn" className="mt-3">
                    Variables sin dato para este contacto: {preview.sample.find((s) => s.contact_id === (sample ?? preview.sample[0]?.contact_id))!.missing.map((m) => `{{${m}}}`).join(', ')}. Se reemplazarán por texto vacío (use {'{{variable|valor por defecto}}'}).
                  </InfoBox>
                ) : null}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted">Campaña</dt>
                  <dd className="font-medium">{d.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Destinatarios</dt>
                  <dd className="font-medium">
                    {audienceLabel()} → <b className="text-emerald-400">{fmtNum(preview?.eligible)}</b> mensajes
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Mensaje</dt>
                  <dd className="font-medium">{d.message_type === 'template' ? `Plantilla ${selTemplate?.name}` : 'Texto libre'}{media ? ` + ${media.kind}` : ''}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Envío</dt>
                  <dd className="font-medium">{d.when === 'now' ? 'Inmediato (cola controlada)' : d.when === 'later' ? new Date(d.scheduled_local).toLocaleString('es-CO') : `Recurrente desde ${new Date(d.scheduled_local).toLocaleString('es-CO')}`}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Ritmo de envío</dt>
                  <dd className="font-medium">{sending.data?.ratePerMinute} mensajes/minuto · tope diario {fmtNum(sending.data?.dailyCap)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Cuenta</dt>
                  <dd className="font-medium">
                    {acc?.name} {acc?.status !== 'connected' && <Badge tone="red">Desconectada</Badge>}
                  </dd>
                </div>
              </dl>
              {preview && preview.eligible > 0 && sending.data && <p className="text-sm text-muted">Duración estimada del envío: ~{Math.ceil(preview.eligible / sending.data.ratePerMinute)} min.</p>}
              {acc?.status !== 'connected' && d.when === 'now' && <InfoBox tone="danger">WhatsApp está desconectado. Reconecte la cuenta o programe la campaña.</InfoBox>}
              <Toggle checked={consentAck} onChange={setConsentAck} label="Confirmo que los destinatarios aceptaron recibir mensajes de mi negocio" hint="Uso legítimo: las campañas no solicitadas pueden generar bloqueos del número." />
              {needsTyping && (
                <Field label={`Por seguridad, escriba el número de destinatarios (${preview?.eligible}) para confirmar`}>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-48" />
                </Field>
              )}
              <Button variant="primary" size="lg" loading={busy} icon={<Rocket className="h-4 w-4" />} disabled={!preview?.eligible || !consentAck || (needsTyping && confirmText.trim() !== String(preview?.eligible)) || (acc?.status !== 'connected' && d.when === 'now')} onClick={confirm}>
                {d.when === 'now' ? `Enviar a ${fmtNum(preview?.eligible)} contactos` : 'Programar campaña'}
              </Button>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line/60 pt-5">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft className="h-4 w-4" />}>
              Anterior
            </Button>
            <div className="flex gap-2">
              {step >= 1 && (
                <Button variant="ghost" icon={<FileText className="h-4 w-4" />} onClick={() => saveDraft(false)}>
                  Guardar borrador
                </Button>
              )}
              {step < 6 && (
                <Button variant="primary" onClick={next}>
                  Siguiente <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Vista previa" subtitle="Exactamente lo que recibirá el contacto">
            {d.message_type === 'template' && !selTemplate ? (
              <p className="text-sm text-muted">Seleccione una plantilla.</p>
            ) : (
              (() => {
                const s = preview?.sample.find((x) => x.contact_id === sample) ?? preview?.sample[0];
                return <WhatsAppPreview text={s?.text ?? (d.message_type === 'text' ? d.body : selTemplate?.body_text ?? '')} media={media} name={s?.name ?? (s ? fmtPhone(s.phone) : null)} />;
              })()
            )}
          </Card>
          <Card>
            <p className="text-xs text-muted">Destinatarios elegibles</p>
            <p className="text-3xl font-semibold text-emerald-400">{preview ? fmtNum(preview.eligible) : '—'}</p>
            <p className="text-xs text-muted">de {fmtNum(preview?.total)} en la audiencia</p>
          </Card>
        </div>
      </div>
      <ContactPicker
        open={pickContacts}
        initial={d.audience.contactIds}
        onClose={() => setPickContacts(false)}
        onDone={(ids) => {
          set({ audience: { type: 'manual', contactIds: ids } });
          setPickContacts(false);
        }}
      />
      <MediaPicker open={pickMedia} onClose={() => setPickMedia(false)} onPick={(m) => (setMedia(m), set({ media_id: m.id }), setPickMedia(false))} />
    </div>
  );
}

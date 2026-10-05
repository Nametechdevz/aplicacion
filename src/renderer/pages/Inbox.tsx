import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Ban,
  Bot,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  FileText,
  Hand,
  ImagePlus,
  Inbox as InboxIcon,
  ListChecks,
  Paperclip,
  Play,
  RotateCcw,
  Search,
  Send,
  StickyNote,
  Tag as TagIcon,
  Timer,
  Upload,
  X,
} from 'lucide-react';
import type { Contact, Conversation, MediaItem, Message, ProviderTemplate, QuickReply, Tag, Template } from '@shared/types';
import { call, useAppEvent, useQuery, uuid } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { CONSENT, fmtDate, fmtDateTime, fmtPhone, fmtTime, isoToLocalInput, MESSAGE_STATUS, relTime } from '../lib/format';
import { MediaThumb } from '../components/MediaThumb';
import { MediaPicker } from '../components/MediaPicker';
import { EmojiPicker } from '../components/EmojiPicker';
import { Avatar, Badge, Button, Dropdown, EmptyState, ErrorState, Field, IconButton, InfoBox, Input, Modal, Select, SkeletonRows, TagChip, Textarea, cx } from '../components/ui';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'No leídos' },
  { id: 'unanswered', label: 'Sin responder' },
  { id: 'assigned_me', label: 'Asignados a mí' },
  { id: 'tagged', label: 'Etiquetados' },
  { id: 'recent', label: 'Recientes' },
] as const;

export function Inbox() {
  const { id } = useParams();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [tagId, setTagId] = useState<number | undefined>();
  const tags = useQuery<Tag[]>('tags.list');
  const list = useQuery<{ rows: Conversation[]; total: number }>('inbox.list', { search, filter, tagId, limit: 100 }, { refreshOn: ['message.received', 'conversation.updated', 'message.status'], debounceMs: 300 });
  const selected = id ? Number(id) : null;

  return (
    <div className="flex h-full">
      <section className="flex w-[340px] shrink-0 flex-col border-r border-line/60 bg-surface/30">
        <div className="space-y-3 border-b border-line/60 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Buscar nombre, número o texto…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={cx('rounded-full px-2.5 py-1 text-[11px] font-medium transition', filter === f.id ? 'bg-brand text-white' : 'bg-elevated text-muted hover:text-fg')}>
                {f.label}
              </button>
            ))}
            <Dropdown
              align="left"
              trigger={
                <button className={cx('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium', tagId ? 'bg-violet-500 text-white' : 'bg-elevated text-muted hover:text-fg')}>
                  <TagIcon className="h-3 w-3" /> {tagId ? tags.data?.find((t) => t.id === tagId)?.name : 'Etiqueta'}
                </button>
              }
              items={[{ label: 'Todas las etiquetas', onClick: () => setTagId(undefined) }, 'sep', ...(tags.data ?? []).map((t) => ({ label: <TagChip tag={t} small />, onClick: () => setTagId(t.id) }))]}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : !list.data ? (
            <SkeletonRows rows={8} />
          ) : list.data.rows.length === 0 ? (
            <EmptyState icon={<InboxIcon className="h-6 w-6" />} title={search || filter !== 'all' || tagId ? 'Sin resultados' : 'Aún no hay conversaciones'} body={search || filter !== 'all' ? 'Pruebe con otro filtro o búsqueda.' : 'Cuando un cliente escriba a su número aparecerá aquí.'} />
          ) : (
            list.data.rows.map((c) => (
              <button key={c.id} onClick={() => nav(`/inbox/${c.id}`)} className={cx('flex w-full items-start gap-3 border-b border-line/40 px-4 py-3 text-left transition', selected === c.id ? 'bg-brand/10' : 'hover:bg-elevated/50')}>
                <Avatar name={c.contact_name} phone={c.contact_phone} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cx('truncate text-sm', c.unread_count ? 'font-semibold' : 'font-medium')}>{c.contact_name || fmtPhone(c.contact_phone)}</p>
                    <span className={cx('shrink-0 text-[11px]', c.unread_count ? 'text-brand' : 'text-muted')}>{relTime(c.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-muted">
                      {c.last_direction === 'out' && <CheckCheck className="mr-1 inline h-3 w-3" />}
                      {c.last_message_preview}
                    </p>
                    {c.bot_paused_until && new Date(c.bot_paused_until) > new Date() && <Hand className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                    {!!c.unread_count && <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">{c.unread_count}</span>}
                  </div>
                  {!!c.tags?.length && <div className="mt-1.5 flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} small />)}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      </section>
      {selected ? <ConversationView key={selected} conversationId={selected} /> : <EmptyState className="flex-1" icon={<InboxIcon className="h-6 w-6" />} title="Seleccione una conversación" body="Responda, envíe archivos, use respuestas rápidas (/atajo) y gestione el contacto sin salir de la bandeja." />}
    </div>
  );
}

function StatusTick({ m }: { m: Message }) {
  if (m.direction === 'in') return null;
  const title = MESSAGE_STATUS[m.status];
  if (m.status === 'queued' || m.status === 'sending') return <Clock className="h-3.5 w-3.5 opacity-70" aria-label={title} />;
  if (m.status === 'sent') return <Check className="h-3.5 w-3.5 opacity-70" aria-label={title} />;
  if (m.status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label={title} />;
  if (m.status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label={title} />;
  if (m.status === 'cancelled') return <Ban className="h-3.5 w-3.5 opacity-70" aria-label={title} />;
  return <AlertCircle className="h-3.5 w-3.5 text-red-300" aria-label={title} />;
}

const SOURCE_LABEL: Record<string, string> = { campaign: 'Campaña', automation: 'Automatización', ai: 'IA', scheduled: 'Programado', system: 'Sistema' };

function ConversationView({ conversationId }: { conversationId: number }) {
  const { can } = useStore();
  const conv = useQuery<Conversation>('inbox.get', { id: conversationId }, { refreshOn: ['conversation.updated'] });
  const msgs = useQuery<Message[]>('inbox.messages', { conversationId, limit: 80 }, { refreshOn: ['message.received', 'message.status', 'conversation.updated'], debounceMs: 120 });
  const [older, setOlder] = useState<Message[]>([]);
  const [noMore, setNoMore] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    void call('inbox.markRead', { conversationId });
  }, [conversationId, msgs.data?.length]);
  useEffect(() => {
    const n = msgs.data?.length ?? 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));
    }
  }, [msgs.data]);

  const loadOlder = async () => {
    const first = (older[0] ?? msgs.data?.[0])?.id;
    if (!first) return;
    const r = await call<Message[]>('inbox.messages', { conversationId, beforeId: first, limit: 80 });
    if (r.length < 80) setNoMore(true);
    setOlder([...r, ...older]);
  };

  const all = [...older, ...(msgs.data ?? [])];
  const c = conv.data;
  const paused = c?.bot_paused_until && new Date(c.bot_paused_until) > new Date();

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] shrink-0 items-center gap-3 border-b border-line/60 px-5">
          {c && <Avatar name={c.contact_name} phone={c.contact_phone} size={38} />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c ? c.contact_name || fmtPhone(c.contact_phone) : '…'}</p>
            <p className="text-xs text-muted">{c && fmtPhone(c.contact_phone)}</p>
          </div>
          {paused ? (
            <Button size="sm" variant="subtle" icon={<Play className="h-4 w-4" />} onClick={() => attempt(() => call('inbox.setBotPause', { conversationId, minutes: 0 }).then(conv.reload), 'Automatización reactivada')} title={`Pausada hasta ${fmtDateTime(c!.bot_paused_until)}`}>
              Bot en pausa
            </Button>
          ) : (
            can('messages.send') && (
              <Dropdown
                trigger={
                  <Button size="sm" variant="ghost" icon={<Hand className="h-4 w-4" />}>
                    Modo humano
                  </Button>
                }
                items={[30, 60, 240, 1440].map((m) => ({ label: `Pausar automatizaciones ${m < 60 ? m + ' min' : m / 60 + ' h'}`, onClick: () => attempt(() => call('inbox.setBotPause', { conversationId, minutes: m }).then(conv.reload), 'Automatización pausada') }))}
              />
            )
          )}
          {c && can('messages.send') && (
            <Button size="sm" variant="ghost" onClick={() => attempt(() => call('inbox.setStatus', { conversationId, status: c.status === 'open' ? 'closed' : 'open' }).then(conv.reload))}>
              {c.status === 'open' ? 'Marcar resuelta' : 'Reabrir'}
            </Button>
          )}
        </header>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 py-4" style={{ backgroundImage: 'radial-gradient(rgb(var(--line) / .35) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
          {msgs.loading && !msgs.data ? (
            <SkeletonRows rows={5} />
          ) : (
            <>
              {all.length >= 80 && !noMore && (
                <div className="mb-3 text-center">
                  <Button size="sm" variant="ghost" onClick={loadOlder}>
                    Cargar mensajes anteriores
                  </Button>
                </div>
              )}
              {all.map((m, i) => {
                const prev = all[i - 1];
                const newDay = !prev || fmtDate(prev.created_at) !== fmtDate(m.created_at);
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 text-center">
                        <span className="rounded-full bg-elevated px-3 py-1 text-[11px] text-muted">{fmtDate(m.created_at)}</span>
                      </div>
                    )}
                    <Bubble m={m} onRetry={() => attempt(() => call('inbox.retry', { messageId: m.id }).then(msgs.reload), 'Reintentando envío')} />
                  </div>
                );
              })}
            </>
          )}
        </div>
        {c && <Composer contactId={c.contact_id} onSent={msgs.reload} />}
      </section>
      {c && <ContactPanel contactId={c.contact_id} />}
    </div>
  );
}

function Bubble({ m, onRetry }: { m: Message; onRetry: () => void }) {
  const out = m.direction === 'out';
  return (
    <div className={cx('mb-1.5 flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[68%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', out ? 'rounded-br-md bg-gradient-to-br from-emerald-600 to-emerald-700 text-white' : 'rounded-bl-md border border-line/60 bg-surface')}>
        {out && m.source !== 'manual' && (
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide opacity-75">
            {m.source === 'ai' ? <Bot className="h-3 w-3" /> : null}
            {SOURCE_LABEL[m.source] ?? m.source}
          </p>
        )}
        {m.type === 'template' && <p className="mb-1 text-[10px] uppercase opacity-70">📋 Plantilla {m.template_name}</p>}
        {m.media && <MediaThumb media={m.media} large className="mb-1.5" />}
        {!m.media && ['image', 'video', 'audio', 'document', 'sticker'].includes(m.type) && <p className="mb-1 text-xs italic opacity-70">{m.error_message ?? 'Descargando archivo…'}</p>}
        {m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
        <div className={cx('mt-1 flex items-center justify-end gap-1 text-[10px]', out ? 'text-white/70' : 'text-muted')}>
          <span>{fmtTime(m.created_at)}</span>
          <StatusTick m={m} />
        </div>
        {m.status === 'failed' && (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">❌ No se pudo enviar. {m.error_message}</span>
            <button onClick={onRetry} className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-white/10">
              <RotateCcw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ contactId, onSent }: { contactId: number; onSent: () => void }) {
  const { can } = useStore();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const qr = useQuery<QuickReply[]>('quickReplies.list');
  const win = useQuery<{ open: boolean; windowHours: number | null }>('inbox.windowOpen', { contactId }, { refreshOn: ['message.received'] });
  const slash = text.startsWith('/') && !text.includes(' ') ? text.slice(1).toLowerCase() : null;
  const matches = useMemo(() => (slash === null ? [] : (qr.data ?? []).filter((q) => q.shortcut.startsWith(slash)).slice(0, 6)), [slash, qr.data]);
  const [hl, setHl] = useState(0);

  if (!can('messages.send')) return <div className="border-t border-line/60 p-4 text-center text-sm text-muted">Su rol no permite enviar mensajes.</div>;
  const windowClosed = win.data && !win.data.open;

  const applyQuick = async (q: QuickReply) => {
    const r = await call<{ text: string }>('inbox.render', { contactId, text: q.body });
    setText(r.text);
    if (q.media_id) setMedia({ id: q.media_id } as MediaItem);
    ta.current?.focus();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const f = [...files][0];
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) return toast.error('Archivo demasiado grande', 'El máximo es 100 MB.');
    const data = new Uint8Array(await f.arrayBuffer());
    const m = await attempt(() => call<MediaItem>('media.upload', { fileName: f.name, mimeType: f.type || null, data, inLibrary: false }));
    if (m) setMedia(m);
  };

  const send = async () => {
    if (busy || (!text.trim() && !media)) return;
    setBusy(true);
    const ok = await attempt(() => call('inbox.send', { contactId, text: text.trim() || null, mediaId: media?.id ?? null, clientKey: uuid() }));
    setBusy(false);
    if (ok) {
      setText('');
      setMedia(null);
      onSent();
    }
  };

  return (
    <div
      className={cx('relative border-t border-line/60 bg-surface/40 p-3', drag && 'ring-2 ring-inset ring-brand')}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void uploadFiles(e.dataTransfer.files);
      }}
    >
      {windowClosed && (
        <InfoBox tone="warn" className="mb-2" icon={<Timer className="h-4 w-4" />}>
          Pasaron más de {win.data!.windowHours} h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una <b>plantilla aprobada</b>.{' '}
          <button className="underline" onClick={() => setTplOpen(true)}>
            Enviar plantilla
          </button>
        </InfoBox>
      )}
      {matches.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          {matches.map((q, i) => (
            <button key={q.id} onMouseEnter={() => setHl(i)} onClick={() => applyQuick(q)} className={cx('block w-full px-4 py-2 text-left', hl === i && 'bg-elevated')}>
              <span className="font-mono text-xs text-brand">/{q.shortcut}</span>
              <span className="ml-3 line-clamp-1 text-sm text-muted">{q.body}</span>
            </button>
          ))}
        </div>
      )}
      {media && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-elevated/60 p-2">
          <div className="h-12 w-12 overflow-hidden rounded-lg">{media.file_name ? <MediaThumb media={media} /> : <ImagePlus className="m-3 h-6 w-6 text-muted" />}</div>
          <p className="flex-1 truncate text-sm">{media.file_name ?? 'Archivo de respuesta rápida'}</p>
          <IconButton title="Quitar archivo" onClick={() => setMedia(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex items-center">
          <EmojiPicker onPick={(e) => setText((t) => t + e)} />
          <Dropdown
            align="left"
            trigger={
              <IconButton title="Adjuntar">
                <Paperclip className="h-5 w-5" />
              </IconButton>
            }
            items={[
              { label: 'Desde la biblioteca', icon: <ImagePlus className="h-4 w-4" />, onClick: () => setPicker(true) },
              { label: 'Desde el equipo…', icon: <Upload className="h-4 w-4" />, onClick: () => fileInput.current?.click() },
              { label: 'Plantillas', icon: <FileText className="h-4 w-4" />, onClick: () => setTplOpen(true) },
              { label: 'Programar mensaje', icon: <Clock className="h-4 w-4" />, onClick: () => setSchedOpen(true) },
            ]}
          />
          <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files && uploadFiles(e.target.files).finally(() => (e.target.value = ''))} />
        </div>
        <textarea
          ref={ta}
          rows={1}
          value={text}
          onChange={(e) => (setText(e.target.value), setHl(0))}
          placeholder={windowClosed ? 'Ventana de 24 h cerrada — use una plantilla' : 'Escriba un mensaje… ( / para respuestas rápidas)'}
          className="input max-h-40 min-h-[42px] flex-1 resize-none py-2.5 leading-relaxed"
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void uploadFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === 'ArrowDown') return (e.preventDefault(), setHl((hl + 1) % matches.length));
              if (e.key === 'ArrowUp') return (e.preventDefault(), setHl((hl - 1 + matches.length) % matches.length));
              if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), void applyQuick(matches[hl]));
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" className="h-[42px] w-[42px] px-0" loading={busy} disabled={!text.trim() && !media} onClick={send} title="Enviar (Enter)">
          {!busy && <Send className="h-4 w-4" />}
        </Button>
      </div>
      <MediaPicker open={picker} onClose={() => setPicker(false)} onPick={(m) => (setMedia(m), setPicker(false))} />
      <TemplateSend open={tplOpen} onClose={() => setTplOpen(false)} contactId={contactId} onInsert={(t) => setText(t)} onSent={onSent} windowClosed={!!windowClosed} />
      <ScheduleMessage open={schedOpen} onClose={() => setSchedOpen(false)} contactId={contactId} initial={text} />
    </div>
  );
}

function TemplateSend({ open, onClose, contactId, onInsert, onSent, windowClosed }: { open: boolean; onClose: () => void; contactId: number; onInsert: (t: string) => void; onSent: () => void; windowClosed: boolean }) {
  const internal = useQuery<{ templates: Template[] }>(open ? 'templates.list' : null);
  const approved = useQuery<ProviderTemplate[]>(open ? 'templates.provider' : null, { onlyApproved: true });
  const [sel, setSel] = useState<ProviderTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  useEffect(() => {
    if (sel) setParams(Array.from({ length: sel.param_count }, (_, i) => params[i] ?? (i === 0 ? '{{nombre}}' : '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  const sendApproved = async () => {
    if (!sel) return;
    const rendered = await Promise.all(params.map((p) => call<{ text: string }>('inbox.render', { contactId, text: p }).then((r) => r.text)));
    const ok = await attempt(() => call('inbox.send', { contactId, template: { providerTemplateId: sel.id, params: rendered }, clientKey: uuid() }), 'Plantilla enviada a la cola');
    if (ok) {
      onSent();
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Plantillas">
      <div className="grid grid-cols-2 gap-5">
        <div>
          <p className="label">Plantillas aprobadas por WhatsApp</p>
          <p className="mb-2 text-xs text-muted">Obligatorias para iniciar conversación o escribir fuera de la ventana de 24 h.</p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {approved.data?.length === 0 && <p className="text-sm text-muted">No hay plantillas aprobadas sincronizadas. Créelas en Meta y pulse "Sincronizar plantillas" en Configuración → WhatsApp.</p>}
            {approved.data?.map((t) => (
              <button key={t.id} onClick={() => setSel(t)} className={cx('w-full rounded-xl border p-3 text-left text-sm transition', sel?.id === t.id ? 'border-brand bg-brand/10' : 'border-line hover:bg-elevated')}>
                <p className="font-medium">
                  {t.name} <span className="text-xs text-muted">({t.language})</span>
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-muted">{t.body_text}</p>
              </button>
            ))}
          </div>
          {sel && (
            <div className="mt-3 space-y-2">
              {params.map((p, i) => (
                <Field key={i} label={`Parámetro {{${i + 1}}}`}>
                  <Input value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Texto o variable, ej. {{nombre}}" />
                </Field>
              ))}
              <Button variant="primary" className="w-full" onClick={sendApproved}>
                Enviar plantilla aprobada
              </Button>
            </div>
          )}
        </div>
        <div>
          <p className="label">Plantillas internas</p>
          <p className="mb-2 text-xs text-muted">Textos reutilizables (se insertan en el editor{windowClosed ? '; requieren la ventana de 24 h abierta' : ''}).</p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {internal.data?.templates.length === 0 && <p className="text-sm text-muted">Aún no hay plantillas internas.</p>}
            {internal.data?.templates.map((t) => (
              <button
                key={t.id}
                disabled={windowClosed}
                onClick={async () => {
                  const r = await call<{ text: string }>('inbox.render', { contactId, text: t.body });
                  onInsert(r.text);
                  onClose();
                }}
                className="w-full rounded-xl border border-line p-3 text-left text-sm transition hover:bg-elevated disabled:opacity-50"
              >
                <p className="font-medium">
                  {t.name} <Badge className="ml-1">{t.category}</Badge>
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{t.body}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleMessage({ open, onClose, contactId, initial }: { open: boolean; onClose: () => void; contactId: number; initial: string }) {
  const [body, setBody] = useState('');
  const [at, setAt] = useState('');
  useEffect(() => {
    if (open) {
      setBody(initial);
      setAt(isoToLocalInput(new Date(Date.now() + 3600000).toISOString()));
    }
  }, [open, initial]);
  const save = async () => {
    const ok = await attempt(() => call('scheduled.create', { contactId, body, scheduledAt: new Date(at).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), 'Mensaje programado');
    if (ok) onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Programar mensaje" subtitle="Se enviará automáticamente aunque la ventana esté minimizada en la bandeja." footer={<Button variant="primary" onClick={save} disabled={!body.trim() || !at}>Programar</Button>}>
      <div className="space-y-4">
        <Field label="Mensaje" hint="Admite variables como {{nombre}}.">
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Fecha y hora (hora local)">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function ContactPanel({ contactId }: { contactId: number }) {
  const nav = useNavigate();
  const { can } = useStore();
  const d = useQuery<any>('contacts.detail', { id: contactId }, { refreshOn: ['contact.updated', 'conversation.updated', 'task.created'], debounceMs: 500 });
  const tags = useQuery<Tag[]>('tags.list');
  const users = useQuery<{ id: number; display_name: string }[]>('users.basic');
  const [note, setNote] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const c: Contact | undefined = d.data?.contact;
  if (!c) return <aside className="w-[320px] shrink-0 border-l border-line/60"><SkeletonRows rows={4} /></aside>;
  const has = new Set(c.tags?.map((t) => t.id));
  return (
    <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-line/60 bg-surface/30">
      <div className="flex flex-col items-center border-b border-line/60 px-5 py-6 text-center">
        <Avatar name={c.name} phone={c.phone} size={72} />
        <p className="mt-3 font-semibold">{c.name || fmtPhone(c.phone)}</p>
        <p className="text-sm text-muted">{fmtPhone(c.phone)}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {c.consent_status !== 'unknown' && <Badge tone={c.consent_status === 'opted_out' ? 'red' : 'green'}>{CONSENT[c.consent_status]}</Badge>}
          {!!c.blacklisted && <Badge tone="red">Lista negra</Badge>}
          {c.stage && <Badge tone="violet">{c.stage.stage_name}</Badge>}
        </div>
        <Button size="sm" variant="ghost" className="mt-3" icon={<ExternalLink className="h-4 w-4" />} onClick={() => nav(`/contacts/${c.id}`)}>
          Ver ficha CRM
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <p className="label">Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {c.tags?.map((t) => <TagChip key={t.id} tag={t} onRemove={can('contacts.edit') ? () => attempt(() => call('tags.unassign', { contactIds: [c.id], tagId: t.id }).then(d.reload)) : undefined} />)}
            {can('contacts.edit') && (
              <Dropdown
                align="left"
                trigger={<button className="chip border border-dashed border-line text-muted hover:text-fg">+ Etiqueta</button>}
                items={(tags.data ?? []).filter((t) => !has.has(t.id)).map((t) => ({ label: <TagChip tag={t} small />, onClick: () => attempt(() => call('tags.assign', { contactIds: [c.id], tagId: t.id }).then(d.reload)) }))}
              />
            )}
          </div>
        </div>
        {can('contacts.edit') && (
          <Field label="Asignado a">
            <Select value={c.assigned_to ?? ''} onChange={(e) => attempt(() => call('contacts.assign', { ids: [c.id], userId: e.target.value ? Number(e.target.value) : null }).then(d.reload), 'Asignación actualizada')}>
              <option value="">Sin asignar</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">Email</p>
            <p className="truncate">{c.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Empresa</p>
            <p className="truncate">{c.company || '—'}</p>
          </div>
          {Object.entries(c.custom ?? {}).map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-muted">{k}</p>
              <p className="truncate">{v || '—'}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="label">Notas</p>
          {can('contacts.edit') && (
            <div className="mb-2 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agregar nota…" onKeyDown={(e) => e.key === 'Enter' && note.trim() && attempt(() => call('contacts.addNote', { contactId: c.id, body: note }).then(() => (setNote(''), d.reload())))} />
              <IconButton title="Guardar nota" onClick={() => note.trim() && attempt(() => call('contacts.addNote', { contactId: c.id, body: note }).then(() => (setNote(''), d.reload())))}>
                <StickyNote className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          <div className="space-y-2">
            {d.data.notes.slice(0, 5).map((n: any) => (
              <div key={n.id} className="rounded-xl bg-amber-500/10 p-2.5 text-xs">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-muted">
                  {n.author_name ?? 'Sistema'} · {relTime(n.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
        {can('tasks.manage') && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="label mb-0">Seguimientos</p>
              <Button size="sm" variant="ghost" icon={<ListChecks className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>
                Nuevo
              </Button>
            </div>
            {d.data.tasks.filter((t: any) => t.status === 'pending').map((t: any) => (
              <div key={t.id} className="mb-1.5 flex items-center gap-2 rounded-lg bg-elevated/60 px-2.5 py-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-muted" />
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-muted">{fmtDate(t.due_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <QuickTask open={taskOpen} onClose={() => setTaskOpen(false)} contactId={c.id} onDone={d.reload} />
    </aside>
  );
}

export function QuickTask({ open, onClose, contactId, onDone }: { open: boolean; onClose: () => void; contactId: number; onDone: () => void }) {
  const [title, setTitle] = useState('Seguimiento');
  const [hours, setHours] = useState(24);
  const save = async () => {
    const ok = await attempt(() => call('tasks.create', { title, contact_id: contactId, due_at: new Date(Date.now() + hours * 3600000).toISOString() }), 'Seguimiento creado');
    if (ok) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Nuevo seguimiento" footer={<Button variant="primary" onClick={save}>Crear</Button>}>
      <div className="space-y-4">
        <Field label="Tarea">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Contactar en">
          <Select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>1 hora</option>
            <option value={4}>4 horas</option>
            <option value={24}>24 horas</option>
            <option value={48}>2 días</option>
            <option value={168}>1 semana</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

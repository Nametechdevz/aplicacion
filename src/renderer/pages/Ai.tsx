import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, BookOpen, FileText, FlaskConical, KeyRound, MoreHorizontal, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Tag } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { fmtNum, relTime } from '../lib/format';
import { Badge, Button, Card, Dropdown, EmptyState, Field, IconButton, InfoBox, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, TagChip, Textarea, Toggle, confirmDialog, cx } from '../components/ui';

const DEFAULT_INSTRUCTIONS = `Eres un asistente de ventas.
Responde de manera amable.
No inventes precios.
Si el cliente pregunta por un producto que no existe, indica que debe consultar con un asesor.
Si el cliente quiere comprar, solicita los datos necesarios.`;

export function AiPage() {
  const [tab, setTab] = useState<'assistants' | 'kb'>('assistants');
  const status = useQuery<{ configured: boolean; model: string }>('ai.status');
  const nav = useNavigate();
  const { can } = useStore();
  return (
    <div className="mx-auto max-w-[1300px] p-8">
      <PageHeader icon={<Bot className="h-5 w-5" />} title="IA y base de conocimiento" subtitle="Respuestas automáticas inteligentes con instrucciones y documentos de su negocio" actions={<Tabs value={tab} onChange={setTab} tabs={[{ id: 'assistants', label: 'Asistentes' }, { id: 'kb', label: 'Base de conocimiento' }]} />} />
      {status.data && !status.data.configured && (
        <InfoBox tone="warn" className="mb-5" icon={<KeyRound className="h-4 w-4" />}>
          <div className="flex items-center justify-between gap-4">
            <span>La IA no está configurada. Agregue su API key de Anthropic (Claude) para activar los asistentes.</span>
            {can('settings.manage') && (
              <Button size="sm" onClick={() => nav('/settings/ai')}>
                Configurar IA
              </Button>
            )}
          </div>
        </InfoBox>
      )}
      {tab === 'assistants' ? <Assistants configured={!!status.data?.configured} /> : <KnowledgeBases />}
    </div>
  );
}

function Assistants({ configured }: { configured: boolean }) {
  const { can } = useStore();
  const q = useQuery<any[]>('ai.list');
  const [edit, setEdit] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Un asistente responde solo cuando: está activo, la conversación no está en modo humano, el contacto no hizo opt-out, cumple alcance/etiquetas/horario y no superó el límite por hora. Si ya respondió una automatización, la IA no duplica.</p>
        {can('automations.manage') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: 'Asistente de ventas', instructions: DEFAULT_INSTRUCTIONS, enabled: false, scope: 'all', allowed_tag_ids: [], excluded_tag_ids: [], knowledge_base_ids: [], max_replies_per_hour: 6, only_business_hours: false })}>
            Nuevo asistente
          </Button>
        )}
      </div>
      {!q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Bot className="h-6 w-6" />} title="Sin asistentes" body="Defina instrucciones como si capacitara a un nuevo empleado, y conéctelo a su base de conocimiento." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {q.data.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-muted">{a.model || 'Modelo por defecto'} · máx. {a.max_replies_per_hour} resp./hora</p>
                  </div>
                </div>
                <Toggle checked={!!a.enabled} disabled={!can('automations.manage') || (!configured && !a.enabled)} onChange={(v) => attempt(() => call('ai.save', { ...a, enabled: v }).then(q.reload), v ? 'Asistente activado' : 'Asistente desactivado')} />
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{a.instructions}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{a.scope === 'all' ? 'Todas las conversaciones' : a.scope === 'unassigned' ? 'Solo sin asignar' : 'Solo etiquetas permitidas'}</Badge>
                {!!a.only_business_hours && <Badge tone="blue">Solo en horario</Badge>}
                {!!a.knowledge_base_ids.length && <Badge tone="violet">{a.knowledge_base_ids.length} base(s) de conocimiento</Badge>}
              </div>
              {can('automations.manage') && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => setEdit(a)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="subtle" icon={<FlaskConical className="h-4 w-4" />} disabled={!configured} onClick={() => setTest(a)}>
                    Probar
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => (await confirmDialog({ title: `Eliminar "${a.name}"`, danger: true, confirmText: 'Eliminar' })) && attempt(() => call('ai.delete', { id: a.id }).then(q.reload))} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <AssistantForm value={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), q.reload())} />
      <TestAssistant assistant={test} onClose={() => setTest(null)} />
    </>
  );
}

function AssistantForm({ value, onClose, onSaved }: { value: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<any>(value);
  const tags = useQuery<Tag[]>(value ? 'tags.list' : null);
  const kbs = useQuery<any[]>(value ? 'kb.list' : null);
  useEffect(() => setV(value), [value]);
  if (!value || !v) return null;
  const toggleId = (key: string, id: number) => setV({ ...v, [key]: v[key].includes(id) ? v[key].filter((x: number) => x !== id) : [...v[key], id] });
  const save = async () => {
    const ok = await attempt(() => call('ai.save', { ...v, model: v.model || null, handoff_tag_id: v.handoff_tag_id || null }), 'Asistente guardado');
    if (ok) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="xl" title={v.id ? 'Editar asistente' : 'Nuevo asistente'} footer={<Button variant="primary" onClick={save}>Guardar</Button>}>
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <Field label="Nombre">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Instrucciones" hint="El asistente siempre aplica además reglas de seguridad: no inventar datos, derivar a un humano si no sabe, no pedir contraseñas ni datos de tarjetas.">
            <Textarea rows={12} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
          </Field>
          <div>
            <p className="label">Base de conocimiento</p>
            {kbs.data?.length === 0 && <p className="text-sm text-muted">Aún no hay bases de conocimiento.</p>}
            <div className="flex flex-wrap gap-2">
              {kbs.data?.map((k) => (
                <button key={k.id} type="button" onClick={() => toggleId('knowledge_base_ids', k.id)} className={cx('rounded-xl border px-3 py-1.5 text-sm', v.knowledge_base_ids.includes(k.id) ? 'border-violet-500 bg-violet-500/15' : 'border-line text-muted')}>
                  📚 {k.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Toggle checked={!!v.enabled} onChange={(x) => setV({ ...v, enabled: x })} label="Activo" hint="Responde automáticamente a los mensajes entrantes." />
          <Toggle checked={!!v.only_business_hours} onChange={(x) => setV({ ...v, only_business_hours: x })} label="Solo en horario de atención" />
          <Field label="Conversaciones permitidas">
            <Select value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value })}>
              <option value="all">Todas</option>
              <option value="unassigned">Solo sin agente asignado</option>
              <option value="tagged">Solo contactos con etiquetas permitidas</option>
            </Select>
          </Field>
          {v.scope === 'tagged' && (
            <Field label="Etiquetas permitidas">
              <div className="flex flex-wrap gap-1">
                {tags.data?.map((t) => (
                  <button key={t.id} type="button" onClick={() => toggleId('allowed_tag_ids', t.id)} className={cx(!v.allowed_tag_ids.includes(t.id) && 'opacity-40 grayscale')}>
                    <TagChip tag={t} small />
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Nunca responder a contactos con">
            <div className="flex flex-wrap gap-1">
              {tags.data?.map((t) => (
                <button key={t.id} type="button" onClick={() => toggleId('excluded_tag_ids', t.id)} className={cx(!v.excluded_tag_ids.includes(t.id) && 'opacity-40 grayscale')}>
                  <TagChip tag={t} small />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Máximo de respuestas por conversación y hora">
            <Input type="number" min={1} max={60} value={v.max_replies_per_hour} onChange={(e) => setV({ ...v, max_replies_per_hour: Number(e.target.value) })} />
          </Field>
          <Field label="Etiqueta al derivar a humano">
            <Select value={v.handoff_tag_id ?? ''} onChange={(e) => setV({ ...v, handoff_tag_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Ninguna</option>
              {tags.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Modelo (opcional)" hint="Vacío = modelo configurado en Configuración → IA.">
            <Input value={v.model ?? ''} onChange={(e) => setV({ ...v, model: e.target.value })} placeholder="claude-opus-5-5" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function TestAssistant({ assistant, onClose }: { assistant: any; onClose: () => void }) {
  const [msg, setMsg] = useState('Hola, ¿cuánto cuesta el plan premium?');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRes(null), [assistant]);
  if (!assistant) return null;
  const run = async () => {
    setBusy(true);
    setRes(await attempt(() => call('ai.test', { id: assistant.id, message: msg })));
    setBusy(false);
  };
  return (
    <Modal open onClose={onClose} title={`Probar "${assistant.name}"`} subtitle="Genera una respuesta sin enviarla a nadie.">
      <div className="space-y-4">
        <Field label="Mensaje del cliente">
          <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </Field>
        <Button variant="primary" loading={busy} onClick={run}>
          Generar respuesta
        </Button>
        {res && (
          <div className="space-y-2">
            <div className="rounded-2xl rounded-br-md bg-emerald-700 px-4 py-3 text-sm text-white">{res.reply || <i>(sin respuesta)</i>}</div>
            {res.needs_human && <InfoBox tone="warn">Derivaría a un humano: {res.reason}</InfoBox>}
            {!res.needs_human && res.reason && <p className="text-xs text-muted">Motivo interno: {res.reason}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function KnowledgeBases() {
  const { can } = useStore();
  const q = useQuery<any[]>('kb.list');
  const [sel, setSel] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (!sel && q.data?.length) setSel(q.data[0].id);
  }, [q.data, sel]);
  return (
    <div className="grid grid-cols-[280px_1fr] gap-5">
      <Card
        title="Bases"
        padded={false}
        actions={
          can('automations.manage') && (
            <IconButton title="Nueva base" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
            </IconButton>
          )
        }
      >
        {q.data?.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Sin bases" body="Cree una para cargar documentos." />
        ) : (
          <ul className="p-2">
            {q.data?.map((k) => (
              <li key={k.id}>
                <button onClick={() => setSel(k.id)} className={cx('w-full rounded-xl px-3 py-2.5 text-left', sel === k.id ? 'bg-brand/10' : 'hover:bg-elevated/50')}>
                  <p className="text-sm font-medium">📚 {k.name}</p>
                  <p className="text-xs text-muted">
                    {k.document_count} documento(s) · {fmtNum(k.char_count)} caracteres
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {sel ? <KbDetail key={sel} kbId={sel} name={q.data?.find((k) => k.id === sel)?.name ?? ''} onChanged={q.reload} onDeleted={() => (setSel(null), q.reload())} /> : <Card><EmptyState title="Seleccione una base de conocimiento" /></Card>}
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        size="sm"
        title="Nueva base de conocimiento"
        footer={
          <Button variant="primary" disabled={!name.trim()} onClick={async () => { const id = await attempt(() => call<number>('kb.save', { name }), 'Base creada'); if (id) { setNewOpen(false); setName(''); await q.reload(); setSel(id); } }}>
            Crear
          </Button>
        }
      >
        <Field label="Nombre">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Productos y precios" />
        </Field>
      </Modal>
    </div>
  );
}

function KbDetail({ kbId, name, onChanged, onDeleted }: { kbId: number; name: string; onChanged: () => void; onDeleted: () => void }) {
  const { can } = useStore();
  const docs = useQuery<any[]>('kb.documents', { kbId });
  const [mode, setMode] = useState<'faq' | 'text' | null>(null);
  const [faq, setFaq] = useState([{ q: '¿Cuánto cuesta?', a: '' }, { q: '¿Cuánto demora?', a: '' }, { q: '¿Qué métodos de pago existen?', a: '' }, { q: '¿Qué incluye?', a: '' }]);
  const [text, setText] = useState({ title: '', content: '' });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [view, setView] = useState<any>(null);
  const reload = () => (docs.reload(), onChanged());
  const upload = async () => {
    const r = await attempt(() => call<{ added: number; errors: string[] }>('kb.addFiles', { kbId }));
    if (!r) return;
    r.errors.forEach((e) => toast.error('No se pudo cargar', e));
    if (r.added) toast.success(`${r.added} documento(s) cargados`);
    reload();
  };
  return (
    <div className="space-y-5">
      <Card
        title={`📚 ${name}`}
        subtitle='"Utiliza esta información para responder": los asistentes conectados buscan aquí antes de contestar.'
        actions={
          can('automations.manage') && (
            <>
              <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={upload}>
                PDF / DOCX / TXT
              </Button>
              <Button size="sm" onClick={() => setMode('faq')}>
                Preguntas frecuentes
              </Button>
              <Button size="sm" onClick={() => setMode('text')}>
                Texto
              </Button>
              <Dropdown
                trigger={
                  <IconButton title="Más">
                    <MoreHorizontal className="h-4 w-4" />
                  </IconButton>
                }
                items={[{ label: 'Eliminar base', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: `Eliminar "${name}"`, body: 'Se eliminarán todos sus documentos.', danger: true, confirmText: 'Eliminar' })) && (await attempt(() => call('kb.delete', { id: kbId }), 'Base eliminada')) !== undefined && onDeleted() }]}
              />
            </>
          )
        }
        padded={false}
      >
        {!docs.data ? (
          <SkeletonRows rows={3} />
        ) : docs.data.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Sin documentos" body="Cargue PDF, DOCX o TXT, o escriba preguntas frecuentes e información de productos." />
        ) : (
          <ul className="divide-y divide-line/50">
            {docs.data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <FileText className="h-5 w-5 text-muted" />
                <button className="min-w-0 flex-1 text-left" onClick={() => call('kb.document', { id: d.id }).then(setView)}>
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="truncate text-xs text-muted">{d.excerpt}</p>
                </button>
                <Badge>{d.source_type.toUpperCase()}</Badge>
                <span className="w-24 text-right text-xs text-muted">{relTime(d.created_at)}</span>
                {can('automations.manage') && (
                  <IconButton title="Eliminar" onClick={() => attempt(() => call('kb.deleteDocument', { id: d.id }).then(reload))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Probar búsqueda" subtitle="Qué fragmentos encontraría la IA para una pregunta">
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. ¿cuánto demora el envío?" onKeyDown={(e) => e.key === 'Enter' && call<any[]>('kb.search', { kbIds: [kbId], query: search }).then(setResults)} />
          <Button icon={<Search className="h-4 w-4" />} onClick={() => call<any[]>('kb.search', { kbIds: [kbId], query: search }).then(setResults)}>
            Buscar
          </Button>
        </div>
        {results && (
          <div className="mt-3 space-y-2">
            {results.length === 0 ? <p className="text-sm text-muted">Sin coincidencias: la IA indicaría que no tiene la información.</p> : results.map((r, i) => (
              <div key={i} className="rounded-xl bg-elevated/50 p-3 text-xs">
                <p className="mb-1 font-medium">{r.title}</p>
                <p className="whitespace-pre-wrap text-muted">{r.content.slice(0, 500)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal
        open={mode === 'faq'}
        onClose={() => setMode(null)}
        size="lg"
        title="Preguntas frecuentes"
        footer={<Button variant="primary" onClick={async () => (await attempt(() => call('kb.addFaq', { kbId, title: 'Preguntas frecuentes', items: faq }), 'Preguntas guardadas')) !== undefined && (setMode(null), reload())}>Guardar</Button>}
      >
        <div className="space-y-3">
          {faq.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
              <Input value={f.q} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Pregunta" />
              <Textarea rows={2} value={f.a} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} placeholder="Respuesta" className="min-h-[42px]" />
              <IconButton title="Quitar" onClick={() => setFaq(faq.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setFaq([...faq, { q: '', a: '' }])}>
            Agregar pregunta
          </Button>
        </div>
      </Modal>
      <Modal open={mode === 'text'} onClose={() => setMode(null)} size="lg" title="Agregar información" footer={<Button variant="primary" disabled={!text.content.trim()} onClick={async () => (await attempt(() => call('kb.addText', { kbId, title: text.title || 'Información', content: text.content }), 'Documento agregado')) !== undefined && (setMode(null), setText({ title: '', content: '' }), reload())}>Guardar</Button>}>
        <div className="space-y-3">
          <Field label="Título">
            <Input value={text.title} onChange={(e) => setText({ ...text, title: e.target.value })} placeholder="Ej. Información de productos" />
          </Field>
          <Field label="Contenido">
            <Textarea rows={14} value={text.content} onChange={(e) => setText({ ...text, content: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} size="lg" title={view?.title}>
        <pre className="whitespace-pre-wrap font-sans text-sm text-muted">{view?.content}</pre>
      </Modal>
    </div>
  );
}

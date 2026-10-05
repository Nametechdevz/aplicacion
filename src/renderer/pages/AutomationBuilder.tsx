import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Bot, Clock, Copy, GitBranch, History, ListChecks, Play, Save, Trash2, Zap } from 'lucide-react';
import type { Automation, AutomationNode, CustomField, MediaItem, Segment, Tag } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { fmtDateTime } from '../lib/format';
import { VariableTextarea } from '../components/VariableTextarea';
import { MediaPicker } from '../components/MediaPicker';
import { Badge, Button, Checkbox, Drawer, EmptyState, Field, IconButton, InfoBox, Input, Select, Tabs, Textarea, Toggle, cx } from '../components/ui';

type NData = { subtype: string; config: Record<string, any>; kind: AutomationNode['type'] };
type RFNode = Node<NData>;

const COLORS = {
  trigger: { ring: 'ring-violet-500/60', bg: 'from-violet-500/25 to-violet-500/5', text: 'text-violet-300', icon: Zap, title: 'CUANDO' },
  condition: { ring: 'ring-amber-500/60', bg: 'from-amber-500/25 to-amber-500/5', text: 'text-amber-300', icon: GitBranch, title: 'SI' },
  action: { ring: 'ring-emerald-500/60', bg: 'from-emerald-500/25 to-emerald-500/5', text: 'text-emerald-300', icon: Play, title: 'ENTONCES' },
};
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

let catalog: any = null;
let lookup: { tags: Tag[]; users: any[]; automations: Automation[]; stages: any[]; assistants: any[]; fields: CustomField[]; segments: Segment[] } = { tags: [], users: [], automations: [], stages: [], assistants: [], fields: [], segments: [] };

function summary(n: NData): string {
  const c = n.config ?? {};
  const tag = (id: any) => lookup.tags.find((t) => t.id === Number(id))?.name ?? '—';
  switch (n.subtype) {
    case 'message_contains':
      return `Contiene ${(c.mode === 'all' ? 'todas: ' : '')}${(c.keywords ?? []).map((k: string) => `"${k}"`).join(', ') || '…'}`;
    case 'message_starts_with':
      return `Comienza con "${c.text ?? ''}"`;
    case 'message_ends_with':
      return `Termina con "${c.text ?? ''}"`;
    case 'message_equals':
      return `Es "${c.text ?? ''}"`;
    case 'has_tag':
      return `Tiene ${tag(c.tagId)}`;
    case 'not_has_tag':
      return `No tiene ${tag(c.tagId)}`;
    case 'tag_added':
    case 'tag_removed':
      return c.tagId ? tag(c.tagId) : 'Cualquier etiqueta';
    case 'add_tag':
      return `+ ${tag(c.tagId)}`;
    case 'remove_tag':
      return `− ${tag(c.tagId)}`;
    case 'send_message':
      return c.text ? `"${String(c.text).slice(0, 60)}${c.text.length > 60 ? '…' : ''}"` : 'Sin texto';
    case 'send_media':
      return c.mediaId ? `Archivo #${c.mediaId}${c.caption ? ` · "${c.caption.slice(0, 30)}"` : ''}` : 'Sin archivo';
    case 'wait':
      return `${c.amount ?? '?'} ${c.unit === 'days' ? 'día(s)' : c.unit === 'hours' ? 'hora(s)' : 'minuto(s)'}`;
    case 'business_hours':
      return c.inside === false ? 'Fuera del horario' : 'Dentro del horario';
    case 'day_of_week':
      return (c.days ?? []).map((d: number) => DAYS[d - 1]).join(' ');
    case 'time_range':
      return `${c.from ?? '--'} – ${c.to ?? '--'}`;
    case 'phone_matches':
      return `${c.mode === 'contains' ? 'Contiene' : 'Empieza con'} ${c.value ?? ''}`;
    case 'schedule':
      return `${(c.days ?? []).map((d: number) => DAYS[d - 1]).join(' ')} ${c.time ?? ''} · ${c.tagId ? tag(c.tagId) : c.segmentId ? lookup.segments.find((s) => s.id === Number(c.segmentId))?.name : '—'}`;
    case 'date_field':
      return `${c.fieldKey ?? '—'} ${c.offsetDays ? `+${c.offsetDays}d` : ''} ${c.time ?? ''}`;
    case 'create_task':
      return c.title ?? '';
    case 'assign':
      return lookup.users.find((u) => u.id === Number(c.userId))?.display_name ?? 'Sin asignar';
    case 'run_automation':
      return lookup.automations.find((a) => a.id === Number(c.automationId))?.name ?? '—';
    case 'add_note':
      return c.text ?? '';
    case 'set_stage':
      return lookup.stages.find((s) => s.id === Number(c.stageId))?.name ?? '—';
    case 'ai_reply':
      return lookup.assistants.find((a) => a.id === Number(c.assistantId))?.name ?? 'Asistente activo';
    case 'custom_field':
      return `${c.fieldKey ?? '—'} ${c.op ?? '='} ${c.value ?? ''}`;
    case 'contact_status':
      return `${c.field ?? ''} = ${c.value ?? ''}`;
    case 'message_sent':
      return (c.sources ?? ['manual', 'campaign']).join(', ');
    default:
      return '';
  }
}

function FlowNode({ data, selected }: NodeProps<RFNode>) {
  const col = COLORS[data.kind];
  const Icon = col.icon;
  const label = catalog ? (data.kind === 'trigger' ? catalog.triggers : data.kind === 'condition' ? catalog.conditions : catalog.actions)[data.subtype]?.label : data.subtype;
  return (
    <div className={cx('w-[260px] rounded-2xl border border-line bg-surface shadow-xl transition', selected && `ring-2 ${col.ring}`)}>
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-surface !bg-slate-400" />}
      <div className={cx('flex items-center gap-2 rounded-t-2xl bg-gradient-to-b px-3 py-2', col.bg)}>
        <Icon className={cx('h-4 w-4', col.text)} />
        <span className={cx('text-[10px] font-bold tracking-widest', col.text)}>{col.title}</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{summary(data)}</p>
      </div>
      {data.kind === 'condition' ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: '28%' }} className="!h-3 !w-3 !border-2 !border-surface !bg-emerald-400" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: '72%' }} className="!h-3 !w-3 !border-2 !border-surface !bg-red-400" />
          <div className="flex justify-between px-12 pb-1 text-[10px] font-semibold">
            <span className="text-emerald-400">Sí</span>
            <span className="text-red-400">No</span>
          </div>
        </>
      ) : data.subtype !== 'stop' ? (
        <Handle id="next" type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-surface !bg-slate-400" />
      ) : null}
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

function toRF(n: AutomationNode): RFNode {
  return { id: n.id, type: 'flow', position: n.position, data: { subtype: n.subtype, config: n.config, kind: n.type } };
}
function edgeStyle(e: { sourceHandle?: string | null }) {
  const color = e.sourceHandle === 'true' ? '#34d399' : e.sourceHandle === 'false' ? '#f87171' : undefined;
  return { animated: false, style: color ? { stroke: color } : undefined, label: e.sourceHandle === 'true' ? 'Sí' : e.sourceHandle === 'false' ? 'No' : undefined, labelStyle: { fill: color, fontWeight: 600, fontSize: 11 }, labelBgStyle: { fill: 'rgb(var(--surface))' } };
}

const EXAMPLE = (interesadoTagId?: number): { nodes: AutomationNode[]; edges: any[]; name: string } => ({
  name: 'Consulta de precios',
  nodes: [
    { id: 't1', type: 'trigger', subtype: 'message_received', config: {}, position: { x: 250, y: 0 } },
    { id: 'c1', type: 'condition', subtype: 'message_contains', config: { keywords: ['precio', 'cuánto cuesta', 'valor'], mode: 'any' }, position: { x: 250, y: 150 } },
    { id: 'a1', type: 'action', subtype: 'send_message', config: { text: 'Hola {{nombre}} 👋\nClaro, te comparto nuestros precios...' }, position: { x: 100, y: 320 } },
    { id: 'a2', type: 'action', subtype: 'add_tag', config: { tagId: interesadoTagId }, position: { x: 100, y: 470 } },
  ],
  edges: [
    { id: 'e1', source: 't1', target: 'c1', sourceHandle: 'next' },
    { id: 'e2', source: 'c1', target: 'a1', sourceHandle: 'true' },
    { id: 'e3', source: 'a1', target: 'a2', sourceHandle: 'next' },
  ],
});

export function AutomationBuilder() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  );
}

function Builder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { can } = useStore();
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const cat = useQuery<any>('automations.catalog');
  const tags = useQuery<Tag[]>('tags.list');
  const users = useQuery<any[]>('users.basic');
  const autos = useQuery<Automation[]>('automations.list');
  const pipes = useQuery<any[]>('pipeline.list');
  const assistants = useQuery<any[]>('ai.list');
  const fields = useQuery<CustomField[]>('fields.list');
  const segments = useQuery<Segment[]>('segments.list');
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [meta, setMeta] = useState({ id: undefined as number | undefined, name: 'Nueva automatización', description: '', enabled: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  catalog = cat.data;
  lookup = { tags: tags.data ?? [], users: users.data ?? [], automations: autos.data ?? [], stages: (pipes.data ?? []).flatMap((p) => p.stages), assistants: assistants.data ?? [], fields: fields.data ?? [], segments: segments.data ?? [] };

  useEffect(() => {
    if (id) {
      void call<Automation>('automations.get', { id: Number(id) }).then((a) => {
        setMeta({ id: a.id, name: a.name, description: a.description ?? '', enabled: !!a.enabled });
        setNodes(a.nodes.map(toRF));
        setEdges(a.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? 'next', ...edgeStyle(e) })));
        setTimeout(() => rf.fitView({ padding: 0.3 }), 50);
      });
    } else if (tags.data) {
      const ex = params.get('example') === 'precio' ? EXAMPLE(tags.data.find((t) => t.name === 'Interesado')?.id) : null;
      if (ex) {
        setMeta((m) => ({ ...m, name: ex.name }));
        setNodes(ex.nodes.map(toRF));
        setEdges(ex.edges.map((e) => ({ ...e, ...edgeStyle(e) })));
      } else setNodes([toRF({ id: 't1', type: 'trigger', subtype: 'message_received', config: {}, position: { x: 250, y: 40 } })]);
      setTimeout(() => rf.fitView({ padding: 0.4, maxZoom: 1 }), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tags.data]);

  const onConnect = useCallback(
    (c: Connection) => {
      const handle = c.sourceHandle ?? 'next';
      setEdges((eds) => addEdge({ ...c, id: `${c.source}-${handle}-${c.target}`, sourceHandle: handle, ...edgeStyle({ sourceHandle: handle }) }, eds.filter((e) => !(e.source === c.source && (e.sourceHandle ?? 'next') === handle))));
      setDirty(true);
    },
    [setEdges],
  );

  const addNode = (kind: AutomationNode['type'], subtype: string, pos?: { x: number; y: number }) => {
    if (kind === 'trigger' && nodes.some((n) => n.data.kind === 'trigger')) {
      // Reemplaza el trigger existente
      setNodes((ns) => ns.map((n) => (n.data.kind === 'trigger' ? { ...n, data: { ...n.data, subtype, config: {} } } : n)));
      setDirty(true);
      return;
    }
    const sel = nodes.find((n) => n.id === selected);
    const position = pos ?? (sel ? { x: sel.position.x, y: sel.position.y + 170 } : { x: 250, y: (Math.max(0, ...nodes.map((n) => n.position.y)) || 0) + 170 });
    const nid = `${kind[0]}${Date.now().toString(36)}`;
    const defaults: Record<string, any> = { wait: { amount: 30, unit: 'minutes' }, business_hours: { inside: true }, message_contains: { keywords: [], mode: 'any' }, day_of_week: { days: [1, 2, 3, 4, 5] }, time_range: { from: '08:00', to: '18:00' }, create_task: { title: 'Seguimiento a {{nombre}}', dueInHours: 24 } };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: nid, type: 'flow', position, selected: true, data: { kind, subtype, config: defaults[subtype] ?? {} } }]);
    if (sel && !pos) {
      const handle = sel.data.kind === 'condition' ? 'true' : 'next';
      if (!edges.some((e) => e.source === sel.id && (e.sourceHandle ?? 'next') === handle) && sel.data.subtype !== 'stop') setEdges((es) => [...es, { id: `${sel.id}-${handle}-${nid}`, source: sel.id, target: nid, sourceHandle: handle, ...edgeStyle({ sourceHandle: handle }) }]);
    }
    setSelected(nid);
    setDirty(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/automation-node');
    if (!raw) return;
    const { kind, subtype } = JSON.parse(raw);
    addNode(kind, subtype, rf.screenToFlowPosition({ x: e.clientX - 130, y: e.clientY - 30 }));
  };

  const updateConfig = (nid: string, config: Record<string, any>) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, config } } : n)));
    setDirty(true);
  };

  const duplicate = (nid: string) => {
    const n = nodes.find((x) => x.id === nid);
    if (!n || n.data.kind === 'trigger') return;
    const copyId = `${n.data.kind[0]}${Date.now().toString(36)}`;
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...n, id: copyId, selected: true, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: structuredClone(n.data) }]);
    setSelected(copyId);
    setDirty(true);
  };
  const remove = (nid: string) => {
    if (nodes.find((x) => x.id === nid)?.data.kind === 'trigger') return toast.warning('El disparador no se puede eliminar; puede cambiarlo por otro.');
    setNodes((ns) => ns.filter((n) => n.id !== nid));
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid));
    setSelected(null);
    setDirty(true);
  };

  const save = async (enabled = meta.enabled) => {
    setSaving(true);
    const payload = {
      id: meta.id,
      name: meta.name,
      description: meta.description || null,
      enabled,
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, subtype: n.data.subtype, config: n.data.config, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle as any) ?? 'next' })),
    };
    const r = await attempt(() => call<Automation>('automations.save', payload), 'Automatización guardada');
    setSaving(false);
    if (r) {
      setMeta({ ...meta, id: r.id, enabled: !!r.enabled });
      setDirty(false);
      if (!id) nav(`/automations/${r.id}`, { replace: true });
    }
  };

  const sel = nodes.find((n) => n.id === selected);
  const readOnly = !can('automations.manage');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3">
        <IconButton title="Volver" onClick={() => nav('/automations')}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <Input className="w-80 font-semibold" value={meta.name} onChange={(e) => (setMeta({ ...meta, name: e.target.value }), setDirty(true))} disabled={readOnly} />
        <Input className="w-96" placeholder="Descripción (opcional)" value={meta.description} onChange={(e) => (setMeta({ ...meta, description: e.target.value }), setDirty(true))} disabled={readOnly} />
        <div className="flex-1" />
        {dirty && <Badge tone="amber">Cambios sin guardar</Badge>}
        {meta.id && (
          <Button icon={<History className="h-4 w-4" />} onClick={() => setRunsOpen(true)}>
            Ejecuciones
          </Button>
        )}
        {!readOnly && (
          <>
            <Toggle checked={meta.enabled} onChange={(v) => save(v)} label={meta.enabled ? 'Activa' : 'Inactiva'} />
            <Button variant="primary" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => save()}>
              Guardar
            </Button>
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        {!readOnly && (
          <aside className="w-[230px] shrink-0 overflow-y-auto border-r border-line/60 p-3">
            {cat.data &&
              (
                [
                  ['trigger', 'Disparadores', cat.data.triggers],
                  ['condition', 'Condiciones', cat.data.conditions],
                  ['action', 'Acciones', cat.data.actions],
                ] as const
              ).map(([kind, label, items]) => (
                <div key={kind} className="mb-4">
                  <p className={cx('mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest', COLORS[kind].text)}>{label}</p>
                  {Object.entries(items as Record<string, { label: string }>).map(([sub, v]) => (
                    <div
                      key={sub}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('application/automation-node', JSON.stringify({ kind, subtype: sub }))}
                      onClick={() => addNode(kind, sub)}
                      className="mb-1 cursor-grab rounded-lg border border-line/60 bg-elevated/40 px-2.5 py-1.5 text-xs transition hover:border-line hover:bg-elevated active:cursor-grabbing"
                      title="Arrastre al lienzo o haga clic para agregar debajo del nodo seleccionado"
                    >
                      {v.label}
                    </div>
                  ))}
                </div>
              ))}
          </aside>
        )}
        <div ref={wrapper} className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => (onNodesChange(c), c.some((x) => x.type === 'position' || x.type === 'remove') && setDirty(true))}
            onEdgesChange={(c) => (onEdgesChange(c), c.some((x) => x.type === 'remove') && setDirty(true))}
            onConnect={onConnect}
            onSelectionChange={({ nodes: ns }) => setSelected(ns[0]?.id ?? null)}
            onNodesDelete={(ns) => ns.some((n) => n.data.kind === 'trigger') && toast.warning('El disparador no se puede eliminar.')}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            fitView
            minZoom={0.3}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            colorMode={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => ((n.data as NData).kind === 'trigger' ? '#8b5cf6' : (n.data as NData).kind === 'condition' ? '#f59e0b' : '#10b981')} />
          </ReactFlow>
          {nodes.length <= 1 && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-line bg-surface/90 px-4 py-2 text-xs text-muted">
              Arrastre condiciones y acciones desde el panel izquierdo y conéctelas desde los puntos inferiores.
            </div>
          )}
        </div>
        <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-line/60">
          {sel ? (
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className={cx('text-[10px] font-bold uppercase tracking-widest', COLORS[sel.data.kind].text)}>{COLORS[sel.data.kind].title}</p>
                  <p className="font-semibold">{(sel.data.kind === 'trigger' ? cat.data?.triggers : sel.data.kind === 'condition' ? cat.data?.conditions : cat.data?.actions)?.[sel.data.subtype]?.label}</p>
                </div>
                {!readOnly && sel.data.kind !== 'trigger' && (
                  <div className="flex">
                    <IconButton title="Duplicar" onClick={() => duplicate(sel.id)}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Eliminar" onClick={() => remove(sel.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
              </div>
              {sel.data.kind === 'trigger' && cat.data && (
                <Field label="Disparador" className="mb-4">
                  <Select value={sel.data.subtype} disabled={readOnly} onChange={(e) => addNode('trigger', e.target.value)}>
                    {Object.entries(cat.data.triggers).map(([k, v]: any) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted">{cat.data.triggers[sel.data.subtype]?.description}</p>
                </Field>
              )}
              <fieldset disabled={readOnly}>
                <NodeConfig node={sel.data} onChange={(c) => updateConfig(sel.id, c)} />
              </fieldset>
            </div>
          ) : (
            <div className="space-y-4 p-5 text-sm text-muted">
              <p className="font-medium text-fg">Cómo funciona</p>
              <p>
                <b className="text-violet-300">CUANDO</b> ocurre el disparador, se evalúan las <b className="text-amber-300">condiciones</b> (salida verde = Sí, roja = No) y se ejecutan las <b className="text-emerald-300">acciones</b> en orden.
              </p>
              <InfoBox tone="info" icon={<Bot className="h-4 w-4" />}>
                Protecciones automáticas: modo humano (si un agente responde, se pausa), opt-out, lista negra, límite de ejecuciones por contacto/hora y ventana de 24 h de WhatsApp.
              </InfoBox>
              <p>Seleccione un nodo para editarlo. Tecla Supr para eliminar.</p>
            </div>
          )}
        </aside>
      </div>
      {meta.id && <RunsDrawer open={runsOpen} onClose={() => setRunsOpen(false)} automationId={meta.id} />}
    </div>
  );
}

function NodeConfig({ node, onChange }: { node: NData; onChange: (c: Record<string, any>) => void }) {
  const c = node.config ?? {};
  const set = (p: Record<string, any>) => onChange({ ...c, ...p });
  const [mediaOpen, setMediaOpen] = useState(false);
  const media = useQuery<MediaItem[]>(node.subtype === 'send_media' ? 'media.list' : null, {});
  const tagSelect = (key = 'tagId', allowAny = false) => (
    <Field label="Etiqueta">
      <Select value={c[key] ?? ''} onChange={(e) => set({ [key]: e.target.value ? Number(e.target.value) : undefined })}>
        <option value="">{allowAny ? 'Cualquier etiqueta' : 'Seleccione…'}</option>
        {lookup.tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.emoji} {t.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const days = (key = 'days') => (
    <Field label="Días">
      <div className="flex gap-1">
        {DAYS.map((l, i) => {
          const on = (c[key] ?? []).includes(i + 1);
          return (
            <button type="button" key={l} onClick={() => set({ [key]: on ? c[key].filter((x: number) => x !== i + 1) : [...(c[key] ?? []), i + 1].sort() })} className={cx('h-8 w-8 rounded-full text-xs font-medium', on ? 'bg-brand text-white' : 'bg-elevated text-muted')}>
              {l}
            </button>
          );
        })}
      </div>
    </Field>
  );
  switch (node.subtype) {
    case 'message_received':
    case 'message_replied':
    case 'contact_created':
    case 'is_new_contact':
    case 'stop':
      return <p className="text-sm text-muted">No requiere configuración.</p>;
    case 'message_sent':
      return (
        <Field label="Origen del mensaje">
          {['manual', 'campaign'].map((s) => (
            <label key={s} className="mb-1 flex items-center gap-2 text-sm">
              <Checkbox checked={(c.sources ?? ['manual', 'campaign']).includes(s)} onChange={(v) => set({ sources: v ? [...new Set([...(c.sources ?? ['manual', 'campaign']), s])] : (c.sources ?? ['manual', 'campaign']).filter((x: string) => x !== s) })} />
              {s === 'manual' ? 'Enviado manualmente por un agente' : 'Enviado por una campaña'}
            </label>
          ))}
        </Field>
      );
    case 'tag_added':
    case 'tag_removed':
      return tagSelect('tagId', true);
    case 'has_tag':
    case 'not_has_tag':
    case 'add_tag':
    case 'remove_tag':
      return tagSelect();
    case 'schedule':
      return (
        <div className="space-y-4">
          <Field label="Hora (zona del horario de atención)">
            <Input type="time" value={c.time ?? ''} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          {days()}
          {tagSelect()}
          <Field label="…o segmento">
            <Select value={c.segmentId ?? ''} onChange={(e) => set({ segmentId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">—</option>
              {lookup.segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Máximo de contactos por ejecución">
            <Input type="number" value={c.limit ?? 500} onChange={(e) => set({ limit: Number(e.target.value) })} />
          </Field>
          <InfoBox tone="warn">Los mensajes a contactos fuera de la ventana de 24 h se omiten (WhatsApp exige plantilla). Use campañas con plantilla para envíos masivos.</InfoBox>
        </div>
      );
    case 'date_field':
      return (
        <div className="space-y-4">
          <Field label="Campo de fecha">
            <Select value={c.fieldKey ?? ''} onChange={(e) => set({ fieldKey: e.target.value })}>
              <option value="">Seleccione…</option>
              {lookup.fields.filter((f) => f.type === 'date').map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Días después de la fecha" hint="0 = el mismo día; 7 = una semana después.">
            <Input type="number" value={c.offsetDays ?? 0} onChange={(e) => set({ offsetDays: Number(e.target.value) })} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={c.time ?? ''} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          <Toggle checked={!!c.yearly} onChange={(v) => set({ yearly: v })} label="Repetir cada año (ej. cumpleaños)" />
        </div>
      );
    case 'message_contains':
      return (
        <div className="space-y-4">
          <Field label="Palabras o frases" hint="Separadas por coma. No distingue mayúsculas ni acentos.">
            <Input value={(c.keywords ?? []).join(', ')} onChange={(e) => set({ keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Coincidencia">
            <Select value={c.mode ?? 'any'} onChange={(e) => set({ mode: e.target.value })}>
              <option value="any">Contiene alguna</option>
              <option value="all">Contiene todas</option>
            </Select>
          </Field>
          <Toggle checked={!!c.wholeWord} onChange={(v) => set({ wholeWord: v })} label="Solo palabra completa" />
        </div>
      );
    case 'message_starts_with':
    case 'message_ends_with':
    case 'message_equals':
      return (
        <Field label="Texto">
          <Input value={c.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      );
    case 'phone_matches':
      return (
        <div className="space-y-4">
          <Field label="Dígitos" hint="Ej. 57300 para números colombianos que empiezan por 300.">
            <Input value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })} />
          </Field>
          <Select value={c.mode ?? 'prefix'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="prefix">Empieza con</option>
            <option value="contains">Contiene</option>
          </Select>
        </div>
      );
    case 'business_hours':
      return (
        <Select value={c.inside === false ? 'out' : 'in'} onChange={(e) => set({ inside: e.target.value === 'in' })}>
          <option value="in">Dentro del horario de atención</option>
          <option value="out">Fuera del horario de atención</option>
        </Select>
      );
    case 'day_of_week':
      return days();
    case 'time_range':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde">
            <Input type="time" value={c.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="time" value={c.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
          </Field>
        </div>
      );
    case 'custom_field':
      return (
        <div className="space-y-4">
          <Field label="Campo">
            <Select value={c.fieldKey ?? ''} onChange={(e) => set({ fieldKey: e.target.value })}>
              <option value="">Seleccione…</option>
              {lookup.fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Select value={c.op ?? 'equals'} onChange={(e) => set({ op: e.target.value })}>
            <option value="equals">es igual a</option>
            <option value="not_equals">no es igual a</option>
            <option value="contains">contiene</option>
            <option value="gt">mayor que</option>
            <option value="lt">menor que</option>
            <option value="is_empty">está vacío</option>
            <option value="not_empty">no está vacío</option>
          </Select>
          {!['is_empty', 'not_empty'].includes(c.op) && <Input value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder="Valor" />}
        </div>
      );
    case 'contact_status':
      return (
        <div className="space-y-4">
          <Select value={c.field ?? 'consent_status'} onChange={(e) => set({ field: e.target.value, value: '' })}>
            <option value="consent_status">Consentimiento</option>
            <option value="status">Estado (activo/archivado)</option>
            <option value="pipeline_stage">Etapa del pipeline</option>
            <option value="assigned">Asignación</option>
          </Select>
          {(c.field ?? 'consent_status') === 'consent_status' && (
            <Select value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })}>
              <option value="">—</option>
              <option value="unknown">Sin registrar</option>
              <option value="opted_in">Opt-in</option>
            </Select>
          )}
          {c.field === 'status' && (
            <Select value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })}>
              <option value="active">Activo</option>
              <option value="archived">Archivado</option>
            </Select>
          )}
          {c.field === 'pipeline_stage' && (
            <Select value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })}>
              <option value="">—</option>
              {lookup.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          {c.field === 'assigned' && (
            <Select value={c.value ?? ''} onChange={(e) => set({ value: e.target.value })}>
              <option value="unassigned">Sin asignar</option>
              {lookup.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </Select>
          )}
        </div>
      );
    case 'send_message':
      return (
        <div className="space-y-3">
          <VariableTextarea value={c.text ?? ''} onChange={(text) => set({ text })} fields={lookup.fields} rows={7} />
          <p className="text-xs text-muted">Se envía por la cola (con ritmo y reintentos). Se omite si el contacto hizo opt-out, está en modo humano o fuera de la ventana de 24 h.</p>
        </div>
      );
    case 'send_media': {
      const m = media.data?.find((x) => x.id === Number(c.mediaId));
      return (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => setMediaOpen(true)}>
            {m ? `📎 ${m.title || m.file_name}` : 'Elegir archivo'}
          </Button>
          <Field label="Texto (opcional)">
            <Textarea rows={3} value={c.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} maxLength={1024} />
          </Field>
          <MediaPicker open={mediaOpen} onClose={() => setMediaOpen(false)} onPick={(x) => (set({ mediaId: x.id }), setMediaOpen(false))} />
        </div>
      );
    }
    case 'add_note':
      return (
        <Field label="Nota" hint="Admite variables.">
          <Textarea rows={4} value={c.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      );
    case 'assign':
      return (
        <Field label="Asignar a">
          <Select value={c.userId ?? ''} onChange={(e) => set({ userId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin asignar</option>
            {lookup.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'wait':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad">
              <Input type="number" min={1} value={c.amount ?? ''} onChange={(e) => set({ amount: Number(e.target.value) })} />
            </Field>
            <Field label="Unidad">
              <Select value={c.unit ?? 'minutes'} onChange={(e) => set({ unit: e.target.value })}>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </Select>
            </Field>
          </div>
          <InfoBox tone="info" icon={<Clock className="h-4 w-4" />}>
            La espera se guarda en la base de datos: continúa aunque cierre la aplicación.
          </InfoBox>
        </div>
      );
    case 'run_automation':
      return (
        <Field label="Automatización a ejecutar">
          <Select value={c.automationId ?? ''} onChange={(e) => set({ automationId: Number(e.target.value) })}>
            <option value="">Seleccione…</option>
            {lookup.automations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'create_task':
      return (
        <div className="space-y-3">
          <Field label="Título">
            <Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Descripción">
            <Textarea rows={2} value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Vence en (horas)">
            <Input type="number" value={c.dueInHours ?? ''} onChange={(e) => set({ dueInHours: Number(e.target.value) })} />
          </Field>
          <Field label="Asignar a">
            <Select value={c.assignTo ?? ''} onChange={(e) => set({ assignTo: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Responsable del contacto</option>
              {lookup.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      );
    case 'set_stage':
      return (
        <Field label="Etapa">
          <Select value={c.stageId ?? ''} onChange={(e) => set({ stageId: Number(e.target.value) })}>
            <option value="">Seleccione…</option>
            {lookup.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'ai_reply':
      return (
        <Field label="Asistente" hint="Genera la respuesta con la IA configurada y su base de conocimiento.">
          <Select value={c.assistantId ?? ''} onChange={(e) => set({ assistantId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Primer asistente activo</option>
            {lookup.assistants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    default:
      return null;
  }
}

function RunsDrawer({ open, onClose, automationId }: { open: boolean; onClose: () => void; automationId: number }) {
  const runs = useQuery<any[]>(open ? 'automations.runs' : null, { id: automationId }, { refreshOn: ['automation.run'] });
  const [runId, setRunId] = useState<number | null>(null);
  const logs = useQuery<any[]>(runId ? 'automations.runLogs' : null, { runId });
  const tone: Record<string, string> = { completed: 'green', waiting: 'blue', failed: 'red', cancelled: 'slate', running: 'amber', skipped: 'slate' };
  return (
    <Drawer open={open} onClose={onClose} title="Ejecuciones y logs" width={560}>
      {!runs.data?.length ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Sin ejecuciones todavía" />
      ) : (
        <ul className="divide-y divide-line/50">
          {runs.data.map((r) => (
            <li key={r.id}>
              <button onClick={() => setRunId(runId === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-elevated/50">
                <Badge tone={tone[r.status]}>{r.status}</Badge>
                <span className="flex-1 truncate text-sm">{r.contact_name ?? (r.contact_phone ? '+' + r.contact_phone : '—')}</span>
                <span className="text-xs text-muted">{fmtDateTime(r.started_at)}</span>
              </button>
              {runId === r.id && (
                <div className="space-y-1 bg-elevated/30 px-5 py-3 font-mono text-[11px]">
                  {r.status === 'waiting' && (
                    <div className="mb-2 flex items-center justify-between font-sans text-xs">
                      <span>En espera hasta {fmtDateTime(r.resume_at)}</span>
                      <Button size="sm" variant="ghost" onClick={() => attempt(() => call('automations.cancelRun', { runId: r.id }).then(runs.reload), 'Ejecución cancelada')}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {logs.data?.map((l) => (
                    <p key={l.id} className={cx(l.level === 'error' && 'text-red-400', l.level === 'warn' && 'text-amber-400')}>
                      {new Date(l.created_at).toLocaleTimeString('es-CO')} {l.message}
                    </p>
                  ))}
                  {r.error && <p className="text-red-400">{r.error}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}


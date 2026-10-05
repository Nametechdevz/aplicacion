import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Settings2, SquareKanban, Trash2 } from 'lucide-react';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { fmtPhone, relTime } from '../lib/format';
import { ContactPicker } from '../components/ContactPicker';
import { Avatar, Button, IconButton, Input, Modal, PageHeader, Select, Skeleton, cx } from '../components/ui';

export function Pipeline() {
  const nav = useNavigate();
  const { can } = useStore();
  const pipes = useQuery<any[]>('pipeline.list');
  const [pid, setPid] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [over, setOver] = useState<number | null>(null);
  const [addTo, setAddTo] = useState<number | null>(null);
  const [editStages, setEditStages] = useState(false);
  useEffect(() => {
    if (!pid && pipes.data?.length) setPid(pipes.data[0].id);
  }, [pipes.data, pid]);
  const board = useQuery<any>(pid ? 'pipeline.board' : null, { pipelineId: pid, search: search || null }, { refreshOn: ['contact.updated'] });

  const drop = async (e: React.DragEvent, stageId: number) => {
    e.preventDefault();
    setOver(null);
    const contactId = Number(e.dataTransfer.getData('text/contact'));
    if (!contactId) return;
    // Actualización optimista
    board.setData((b: any) => {
      const card = b.stages.flatMap((s: any) => s.cards).find((c: any) => c.id === contactId);
      return { ...b, stages: b.stages.map((s: any) => ({ ...s, cards: s.id === stageId ? [card, ...s.cards.filter((c: any) => c.id !== contactId)] : s.cards.filter((c: any) => c.id !== contactId) })) };
    });
    await attempt(() => call('pipeline.setStage', { contactIds: [contactId], stageId }));
    void board.reload();
  };

  return (
    <div className="flex h-full flex-col p-8">
      <PageHeader
        icon={<SquareKanban className="h-5 w-5" />}
        title="CRM · Pipeline"
        subtitle="Arrastre los contactos entre etapas"
        actions={
          <>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input className="pl-9" placeholder="Buscar en el pipeline…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {(pipes.data?.length ?? 0) > 1 && (
              <Select className="w-48" value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))}>
                {pipes.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            {can('settings.manage') && (
              <Button icon={<Settings2 className="h-4 w-4" />} onClick={() => setEditStages(true)}>
                Etapas
              </Button>
            )}
          </>
        }
      />
      {!board.data ? (
        <div className="flex gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-96 w-72" />)}</div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
          {board.data.stages.map((s: any) => (
            <div key={s.id} className="flex w-[290px] shrink-0 flex-col">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-semibold uppercase tracking-wide">{s.name}</span>
                <span className="rounded-full bg-elevated px-2 text-xs text-muted">{s.cards.length}</span>
                <div className="flex-1" />
                {can('tasks.manage') && (
                  <IconButton title="Agregar contactos" onClick={() => setAddTo(s.id)}>
                    <Plus className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
              <div
                onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => drop(e, s.id)}
                className={cx('min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-dashed p-2 transition', over === s.id ? 'border-brand bg-brand/5' : 'border-transparent bg-elevated/30')}
              >
                {s.cards.map((c: any) => (
                  <div
                    key={c.id}
                    draggable={can('tasks.manage')}
                    onDragStart={(e) => e.dataTransfer.setData('text/contact', String(c.id))}
                    onClick={() => nav(`/contacts/${c.id}`)}
                    className="card cursor-grab p-3 transition hover:border-brand/40 active:cursor-grabbing"
                    style={{ borderLeft: `3px solid ${s.color}` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} phone={c.phone} size={30} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name || fmtPhone(c.phone)}</p>
                        <p className="truncate text-xs text-muted">{c.company || fmtPhone(c.phone)}</p>
                      </div>
                    </div>
                    {c.last_message_preview && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.last_message_preview}</p>}
                    <div className="mt-2 flex justify-between text-[11px] text-muted">
                      <span>{c.assigned_name ?? 'Sin asignar'}</span>
                      <span>{relTime(c.last_message_at)}</span>
                    </div>
                  </div>
                ))}
                {s.cards.length === 0 && <p className="py-6 text-center text-xs text-muted">Arrastre contactos aquí</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ContactPicker open={!!addTo} onClose={() => setAddTo(null)} onDone={async (ids) => { await attempt(() => call('pipeline.setStage', { contactIds: ids, stageId: addTo }), 'Contactos agregados'); setAddTo(null); void board.reload(); }} />
      {pid && editStages && <StagesEditor pipeline={pipes.data!.find((p) => p.id === pid)} onClose={() => setEditStages(false)} onSaved={() => (setEditStages(false), pipes.reload(), board.reload())} />}
    </div>
  );
}

function StagesEditor({ pipeline, onClose, onSaved }: { pipeline: any; onClose: () => void; onSaved: () => void }) {
  const [stages, setStages] = useState<any[]>(pipeline.stages.map((s: any) => ({ id: s.id, name: s.name, color: s.color })));
  return (
    <Modal open onClose={onClose} title={`Etapas de "${pipeline.name}"`} footer={<Button variant="primary" onClick={() => attempt(() => call('pipeline.saveStages', { pipelineId: pipeline.id, stages }), 'Etapas guardadas').then((r) => r !== undefined && onSaved())}>Guardar</Button>}>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="color" value={s.color} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-9 w-10 cursor-pointer rounded-lg border border-line bg-transparent" />
            <Input value={s.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <IconButton title="Subir" disabled={i === 0} onClick={() => { const n = [...stages]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setStages(n); }}>
              ↑
            </IconButton>
            <IconButton title="Eliminar" onClick={() => setStages(stages.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setStages([...stages, { name: 'Nueva etapa', color: '#64748b' }])}>
          Agregar etapa
        </Button>
        <p className="pt-2 text-xs text-muted">Al eliminar una etapa, sus contactos salen del pipeline (no se eliminan).</p>
      </div>
    </Modal>
  );
}

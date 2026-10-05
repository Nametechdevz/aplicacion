import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, CheckCircle2, ListChecks, Plus, Trash2 } from 'lucide-react';
import type { Task } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { fmtDateTime, isoToLocalInput } from '../lib/format';
import { ContactPicker } from '../components/ContactPicker';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, cx } from '../components/ui';

export function Tasks() {
  const nav = useNavigate();
  const { user } = useStore();
  const [tab, setTab] = useState<'pending' | 'overdue' | 'mine' | 'done'>('pending');
  const filter = tab === 'done' ? { status: 'done' } : tab === 'overdue' ? { overdue: true } : tab === 'mine' ? { status: 'pending', assignedTo: user!.id } : { status: 'pending' };
  const q = useQuery<Task[]>('tasks.list', filter, { refreshOn: ['task.created'] });
  const users = useQuery<any[]>('users.basic');
  const [edit, setEdit] = useState<any>(null);
  const [pick, setPick] = useState(false);
  const now = Date.now();
  const save = async () => {
    const payload = { ...edit, due_at: edit.due_local ? new Date(edit.due_local).toISOString() : null, contact_id: edit.contact_id ?? null, assigned_to: edit.assigned_to ?? null };
    delete payload.due_local;
    delete payload.contact_name;
    const ok = await attempt(() => (edit.id ? call('tasks.update', payload) : call('tasks.create', payload)), 'Seguimiento guardado');
    if (ok) (setEdit(null), q.reload());
  };
  return (
    <div className="mx-auto max-w-[1100px] p-8">
      <PageHeader
        icon={<ListChecks className="h-5 w-5" />}
        title="Tareas y seguimientos"
        subtitle="Recordatorios para contactar clientes. Se notifican al vencer."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ title: '', description: '', due_local: isoToLocalInput(new Date(now + 86400000).toISOString()), assigned_to: user!.id })}>
            Nuevo seguimiento
          </Button>
        }
      />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Pendientes' }, { id: 'overdue', label: 'Vencidos' }, { id: 'mine', label: 'Asignados a mí' }, { id: 'done', label: 'Completados' }]} />
      <Card padded={false}>
        {!q.data ? (
          <SkeletonRows />
        ) : q.data.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nada pendiente" body="Las automatizaciones y la IA también pueden crear seguimientos automáticamente." />
        ) : (
          <ul className="divide-y divide-line/50">
            {q.data.map((t) => {
              const overdue = t.status === 'pending' && t.due_at && new Date(t.due_at).getTime() < now;
              return (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                  <input type="checkbox" className="h-5 w-5 cursor-pointer accent-emerald-500" checked={t.status === 'done'} onChange={(e) => attempt(() => call('tasks.update', { id: t.id, status: e.target.checked ? 'done' : 'pending' }).then(q.reload))} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEdit({ ...t, due_local: isoToLocalInput(t.due_at) })}>
                    <p className={cx('font-medium', t.status === 'done' && 'text-muted line-through')}>{t.title}</p>
                    <p className="truncate text-xs text-muted">
                      {t.contact_name && (
                        <span className="cursor-pointer text-brand hover:underline" onClick={(e) => (e.stopPropagation(), nav(`/contacts/${t.contact_id}`))}>
                          {t.contact_name}
                        </span>
                      )}
                      {t.description ? ` · ${t.description}` : ''}
                    </p>
                  </button>
                  {t.source !== 'manual' && <Badge tone="violet">{t.source === 'ai' ? 'IA' : 'Automatización'}</Badge>}
                  <span className={cx('flex w-44 items-center justify-end gap-1.5 text-xs', overdue ? 'text-red-400' : 'text-muted')}>
                    <AlarmClock className="h-3.5 w-3.5" /> {fmtDateTime(t.due_at)}
                  </span>
                  <span className="w-28 truncate text-right text-xs text-muted">{t.assigned_name ?? 'Sin asignar'}</span>
                  <IconButton title="Eliminar" onClick={() => attempt(() => call('tasks.delete', { id: t.id }).then(q.reload))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar seguimiento' : 'Nuevo seguimiento'} footer={<Button variant="primary" disabled={!edit?.title?.trim()} onClick={save}>Guardar</Button>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Título">
              <Input autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ej. Contactar en 24 horas" />
            </Field>
            <Field label="Descripción">
              <Textarea rows={3} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vence">
                <Input type="datetime-local" value={edit.due_local ?? ''} onChange={(e) => setEdit({ ...edit, due_local: e.target.value })} />
              </Field>
              <Field label="Asignado a">
                <Select value={edit.assigned_to ?? ''} onChange={(e) => setEdit({ ...edit, assigned_to: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sin asignar</option>
                  {users.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {!edit.id && (
              <Field label="Contacto">
                <Button onClick={() => setPick(true)}>{edit.contact_name ?? 'Elegir contacto (opcional)'}</Button>
              </Field>
            )}
          </div>
        )}
      </Modal>
      <ContactPicker open={pick} single onClose={() => setPick(false)} onDone={(ids, cs) => (setEdit({ ...edit, contact_id: ids[0], contact_name: cs[0]?.name ?? '+' + cs[0]?.phone }), setPick(false))} />
    </div>
  );
}

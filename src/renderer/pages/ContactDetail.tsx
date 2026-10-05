import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Ban, Building2, Clock, Mail, Megaphone, MessageCircle, Pencil, Phone, StickyNote, Trash2, UserCheck, UserX } from 'lucide-react';
import type { Tag } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { CONSENT, fmtDate, fmtDateTime, fmtNum, fmtPhone, MESSAGE_STATUS, relTime } from '../lib/format';
import { Avatar, Badge, Button, Card, Dropdown, EmptyState, ErrorState, IconButton, Input, Select, SkeletonRows, TagChip, Tabs, confirmDialog } from '../components/ui';
import { ContactForm } from './Contacts';
import { QuickTask } from './Inbox';

const EVENT_LABEL: Record<string, string> = {
  created: 'Contacto creado',
  updated: 'Datos actualizados',
  tag_added: 'Etiqueta agregada',
  tag_removed: 'Etiqueta quitada',
  note_added: 'Nota agregada',
  note_deleted: 'Nota eliminada',
  assigned: 'Asignación',
  consent_changed: 'Consentimiento',
  blacklisted: 'Agregado a lista negra',
  unblacklisted: 'Quitado de lista negra',
  archived: 'Archivado',
  unarchived: 'Desarchivado',
  stage_changed: 'Cambio de etapa',
  campaign_queued: 'Incluido en campaña',
  task_created: 'Seguimiento creado',
  task_done: 'Seguimiento completado',
  task_cancelled: 'Seguimiento cancelado',
};

function describe(e: any): string {
  const d = e.details ?? {};
  switch (e.type) {
    case 'tag_added':
    case 'tag_removed':
      return d.name + (d.source && d.source !== 'manual' ? ` (${d.source})` : '');
    case 'assigned':
      return d.name ?? 'Sin asignar';
    case 'consent_changed':
      return `${CONSENT[d.from] ?? d.from} → ${CONSENT[d.to] ?? d.to}${d.source ? ` · ${d.source}` : ''}`;
    case 'stage_changed':
      return `${d.from ?? '—'} → ${d.to}`;
    case 'campaign_queued':
      return d.name;
    case 'created':
      return `Origen: ${d.source ?? 'manual'}`;
    case 'task_created':
    case 'task_done':
      return d.title;
    case 'updated':
      return (d.fields ?? []).join(', ');
    case 'blacklisted':
      return d.reason ?? '';
    default:
      return '';
  }
}

export function ContactDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useStore();
  const d = useQuery<any>('contacts.detail', { id: Number(id) }, { refreshOn: ['contact.updated', 'task.created', 'message.received'], debounceMs: 500 });
  const tags = useQuery<Tag[]>('tags.list');
  const pipes = useQuery<any[]>('pipeline.list');
  const [tab, setTab] = useState<'activity' | 'notes' | 'history' | 'campaigns'>('activity');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} className="mt-20" />;
  if (!d.data) return <SkeletonRows rows={8} />;
  const { contact: c, activity, notes, timeline, tasks, conversationId } = d.data;
  const has = new Set<number>(c.tags.map((t: Tag) => t.id));
  const stages = (pipes.data ?? []).flatMap((p) => p.stages.map((s: any) => ({ ...s, pipeline: p.name })));
  return (
    <div className="mx-auto max-w-[1300px] p-8">
      <button onClick={() => nav(-1)} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      <div className="grid grid-cols-[360px_1fr] gap-6">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col items-center text-center">
              <Avatar name={c.name} phone={c.phone} size={88} />
              <h1 className="mt-4 text-xl font-semibold">{(c.name || fmtPhone(c.phone)).toUpperCase()}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Phone className="h-3.5 w-3.5" /> {fmtPhone(c.phone)}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <Badge tone={c.consent_status === 'opted_out' ? 'red' : c.consent_status === 'opted_in' ? 'green' : 'slate'}>{CONSENT[c.consent_status]}</Badge>
                {!!c.blacklisted && <Badge tone="red">Lista negra</Badge>}
                {c.status === 'archived' && <Badge>Archivado</Badge>}
              </div>
              <div className="mt-5 flex gap-2">
                <Button variant="primary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => nav(`/inbox/${conversationId}`)}>
                  Conversación
                </Button>
                {can('contacts.edit') && (
                  <IconButton title="Editar" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                )}
                {can('contacts.edit') && (
                  <Dropdown
                    trigger={
                      <IconButton title="Más">
                        <Ban className="h-4 w-4" />
                      </IconButton>
                    }
                    items={[
                      c.consent_status === 'opted_out'
                        ? { label: 'Registrar opt-in (acepta mensajes)', icon: <UserCheck className="h-4 w-4" />, onClick: () => attempt(() => call('contacts.setConsent', { ids: [c.id], status: 'opted_in', source: 'manual' }).then(d.reload), 'Consentimiento registrado') }
                        : { label: 'Marcar "No contactar"', icon: <UserX className="h-4 w-4" />, onClick: () => attempt(() => call('contacts.setConsent', { ids: [c.id], status: 'opted_out', source: 'manual' }).then(d.reload), 'Marcado como No contactar') },
                      c.blacklisted
                        ? { label: 'Quitar de lista negra', onClick: () => attempt(() => call('contacts.setBlacklist', { ids: [c.id], blacklisted: false }).then(d.reload)) }
                        : { label: 'Agregar a lista negra', icon: <Ban className="h-4 w-4" />, onClick: () => attempt(() => call('contacts.setBlacklist', { ids: [c.id], blacklisted: true, reason: 'manual' }).then(d.reload)) },
                      'sep',
                      ...(can('contacts.delete')
                        ? [{ label: 'Eliminar contacto', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: 'Eliminar contacto', body: 'Se borrará con su historial.', danger: true, confirmText: 'Eliminar' })) && (await attempt(() => call('contacts.delete', { ids: [c.id] }), 'Contacto eliminado')) !== undefined && nav('/contacts') }]
                        : []),
                    ]}
                  />
                )}
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-line/60 pt-5 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted" /> {c.email || <span className="text-muted">Sin email</span>}
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted" /> {c.company || <span className="text-muted">Sin empresa</span>}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted" /> Creado {fmtDate(c.created_at)} · {c.source}
              </p>
              {c.consent_date && <p className="text-xs text-muted">Consentimiento: {c.consent_source} · {fmtDateTime(c.consent_date)}</p>}
            </div>
          </Card>
          <Card title="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t: Tag) => <TagChip key={t.id} tag={t} onRemove={can('contacts.edit') ? () => attempt(() => call('tags.unassign', { contactIds: [c.id], tagId: t.id }).then(d.reload)) : undefined} />)}
              {can('contacts.edit') && (
                <Dropdown align="left" trigger={<button className="chip border border-dashed border-line text-muted hover:text-fg">+ Agregar</button>} items={(tags.data ?? []).filter((t) => !has.has(t.id)).map((t) => ({ label: <TagChip tag={t} small />, onClick: () => attempt(() => call('tags.assign', { contactIds: [c.id], tagId: t.id }).then(d.reload)) }))} />
              )}
            </div>
          </Card>
          <Card title="Pipeline">
            <Select value={c.stage?.stage_id ?? ''} disabled={!can('tasks.manage')} onChange={(e) => e.target.value && attempt(() => call('pipeline.setStage', { contactIds: [c.id], stageId: Number(e.target.value) }).then(d.reload), 'Etapa actualizada')}>
              <option value="">Sin etapa</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.pipeline} · {s.name}
                </option>
              ))}
            </Select>
          </Card>
          <Card title="Campos personalizados">
            {Object.keys(c.custom ?? {}).length === 0 ? (
              <p className="text-sm text-muted">Sin datos. Defina campos en Configuración → Campos personalizados.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                {Object.entries(c.custom).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{(v as string) || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-4">
            {[
              ['Último contacto', relTime(c.last_message_at) || '—'],
              ['Mensajes enviados', fmtNum(activity.messagesSent)],
              ['Mensajes recibidos', fmtNum(activity.messagesReceived)],
              ['Campañas recibidas / respondidas', `${fmtNum(activity.campaignsReceived)} / ${fmtNum(activity.campaignsReplied)}`],
            ].map(([l, v]) => (
              <div key={l} className="card p-4">
                <p className="text-xs text-muted">{l}</p>
                <p className="mt-1 text-xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <Card
            padded={false}
            title={<Tabs value={tab} onChange={setTab} tabs={[{ id: 'activity', label: 'Actividad' }, { id: 'notes', label: 'Notas', count: notes.length }, { id: 'campaigns', label: 'Campañas' }, { id: 'history', label: 'Historial' }]} />}
            actions={can('tasks.manage') && <Button size="sm" onClick={() => setTaskOpen(true)}>Nuevo seguimiento</Button>}
          >
            {tab === 'activity' && (
              <div className="p-5">
                <p className="label">Seguimientos</p>
                {tasks.length === 0 ? (
                  <p className="mb-5 text-sm text-muted">Sin seguimientos.</p>
                ) : (
                  <ul className="mb-5 space-y-2">
                    {tasks.map((t: any) => (
                      <li key={t.id} className="flex items-center gap-3 rounded-xl bg-elevated/50 px-3 py-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={t.status === 'done'} onChange={(e) => attempt(() => call('tasks.update', { id: t.id, status: e.target.checked ? 'done' : 'pending' }).then(d.reload))} />
                        <span className={t.status === 'done' ? 'flex-1 text-muted line-through' : 'flex-1'}>{t.title}</span>
                        <span className="text-xs text-muted">{fmtDateTime(t.due_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="label">Automatizaciones recientes</p>
                {activity.automations.length === 0 ? (
                  <p className="text-sm text-muted">Ninguna automatización se ha ejecutado para este contacto.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {activity.automations.map((r: any) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-muted" /> {r.name} <Badge>{r.status}</Badge> <span className="text-xs text-muted">{fmtDateTime(r.started_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 'notes' && (
              <div className="p-5">
                {can('contacts.edit') && (
                  <div className="mb-4 flex gap-2">
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder='Ej. "Interesado en el plan premium"' />
                    <Button icon={<StickyNote className="h-4 w-4" />} disabled={!note.trim()} onClick={() => attempt(() => call('contacts.addNote', { contactId: c.id, body: note }).then(() => (setNote(''), d.reload())))}>
                      Agregar
                    </Button>
                  </div>
                )}
                {notes.length === 0 ? (
                  <EmptyState icon={<StickyNote className="h-6 w-6" />} title="Sin notas" />
                ) : (
                  <ul className="space-y-3">
                    {notes.map((n: any) => (
                      <li key={n.id} className="group rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
                        <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <span>
                            {n.author_name ?? 'Sistema / automatización'} · {fmtDateTime(n.created_at)}
                          </span>
                          {can('contacts.edit') && (
                            <button className="opacity-0 transition group-hover:opacity-100 hover:text-danger" onClick={() => attempt(() => call('contacts.deleteNote', { id: n.id }).then(d.reload))}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 'campaigns' && (
              <div className="p-5">
                {activity.campaigns.length === 0 ? (
                  <EmptyState icon={<Megaphone className="h-6 w-6" />} title="No ha recibido campañas" />
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {activity.campaigns.map((r: any, i: number) => (
                        <tr key={i} className="table-row cursor-pointer" onClick={() => nav(`/campaigns/${r.campaign_id}`)}>
                          <td className="py-2.5">{r.name}</td>
                          <td>
                            <Badge tone={r.status === 'read' ? 'blue' : r.status === 'failed' ? 'red' : r.status === 'skipped' ? 'amber' : 'green'}>{MESSAGE_STATUS[r.status] ?? r.status}</Badge>
                          </td>
                          <td>{r.replied_at ? <Badge tone="violet">Respondió</Badge> : null}</td>
                          <td className="text-right text-xs text-muted">{fmtDateTime(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {tab === 'history' && (
              <ol className="relative space-y-4 p-6 before:absolute before:bottom-6 before:left-[29px] before:top-6 before:w-px before:bg-line">
                {timeline.map((e: any) => (
                  <li key={e.id} className="relative flex gap-4 pl-8">
                    <span className="absolute left-0 top-1 h-3 w-3 rounded-full border-2 border-brand bg-surface" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <b>{EVENT_LABEL[e.type] ?? e.type}</b> {describe(e) && <span className="text-muted">— {describe(e)}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDateTime(e.created_at)}
                        {e.user_name ? ` · ${e.user_name}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
      {editing && <ContactForm contact={c} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), d.reload())} />}
      <QuickTask open={taskOpen} onClose={() => setTaskOpen(false)} contactId={c.id} onDone={d.reload} />
    </div>
  );
}

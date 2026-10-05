import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Ban,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import type { Contact, ContactFilter, CustomField, Segment, SegmentDefinition, SegmentRule, Tag } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { CONSENT, fmtDate, fmtNum, fmtPhone, relTime } from '../lib/format';
import { Avatar, Badge, Button, Card, Checkbox, Dropdown, EmptyState, ErrorState, Field, IconButton, InfoBox, Input, Modal, PageHeader, Select, SkeletonRows, TagChip, Tabs, confirmDialog, cx } from '../components/ui';
import { ImportWizard } from './ImportWizard';

const PAGE = 50;

export function Contacts() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'contacts' | 'tags' | 'segments') ?? 'contacts';
  return (
    <div className="mx-auto max-w-[1500px] p-8">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Contactos"
        subtitle="Gestione su base de clientes, etiquetas y segmentos"
        actions={<Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'contacts', label: 'Contactos' }, { id: 'tags', label: 'Etiquetas' }, { id: 'segments', label: 'Segmentos' }]} />}
      />
      {tab === 'contacts' && <ContactsTable />}
      {tab === 'tags' && <TagsManager />}
      {tab === 'segments' && <SegmentsManager />}
    </div>
  );
}

function ContactsTable() {
  const nav = useNavigate();
  const { can } = useStore();
  const [params] = useSearchParams();
  const [f, setF] = useState<ContactFilter>(() => ({ tagIds: params.get('tag') ? [Number(params.get('tag'))] : undefined, segmentId: params.get('segment') ? Number(params.get('segment')) : undefined }));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [edit, setEdit] = useState<Contact | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(!!(f.tagIds || f.segmentId));
  const filter = { ...f, search: search || undefined };
  const q = useQuery<{ rows: Contact[]; total: number }>('contacts.list', { ...filter, limit: PAGE, offset: page * PAGE }, { refreshOn: ['contact.created', 'contact.updated'], debounceMs: 800 });
  const tags = useQuery<Tag[]>('tags.list');
  const segments = useQuery<Segment[]>('segments.list');
  const users = useQuery<{ id: number; display_name: string }[]>('users.basic');
  useEffect(() => {
    setPage(0);
    setSel(new Set());
    setAllMatching(false);
  }, [JSON.stringify(filter)]);

  const rows = q.data?.rows ?? [];
  const pageAll = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const selCount = allMatching ? q.data?.total ?? 0 : sel.size;
  const selectedIds = async (): Promise<number[]> => (allMatching ? call<number[]>('contacts.ids', filter) : [...sel]);
  const after = () => {
    setSel(new Set());
    setAllMatching(false);
    void q.reload();
    void tags.reload();
  };
  const bulk = async (fn: (ids: number[]) => Promise<unknown>, ok: string) => {
    const ids = await selectedIds();
    if (await attempt(() => fn(ids), ok)) after();
  };

  const exportAs = async (format: 'csv' | 'xlsx') => {
    const r = await attempt(() => call<{ count: number; filePath: string } | null>('export.contacts', { filter, format }));
    if (r) toast.success(`${fmtNum(r.count)} contactos exportados`, r.filePath);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Buscar nombre, número, email, empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button icon={<Filter className="h-4 w-4" />} variant={showFilters ? 'subtle' : 'secondary'} onClick={() => setShowFilters(!showFilters)}>
          Filtros
        </Button>
        <div className="flex-1" />
        {can('contacts.export') && (
          <Dropdown
            trigger={<Button icon={<Download className="h-4 w-4" />}>Exportar</Button>}
            items={[
              { label: 'CSV (filtros aplicados)', icon: <Download className="h-4 w-4" />, onClick: () => exportAs('csv') },
              { label: 'Excel (filtros aplicados)', icon: <FileSpreadsheet className="h-4 w-4" />, onClick: () => exportAs('xlsx') },
            ]}
          />
        )}
        {can('contacts.import') && (
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
            Importar CSV
          </Button>
        )}
        {can('contacts.edit') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>
            Nuevo contacto
          </Button>
        )}
      </div>

      {showFilters && (
        <Card className="mb-4" padded>
          <div className="grid grid-cols-5 gap-3">
            <Field label="Etiquetas">
              <Select value={f.tagIds?.[0] ?? ''} onChange={(e) => setF({ ...f, tagIds: e.target.value ? [Number(e.target.value)] : undefined })}>
                <option value="">Todas</option>
                {tags.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.name} ({t.contact_count})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Segmento">
              <Select value={f.segmentId ?? ''} onChange={(e) => setF({ ...f, segmentId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Ninguno</option>
                {segments.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Consentimiento">
              <Select value={f.consent ?? ''} onChange={(e) => setF({ ...f, consent: (e.target.value || undefined) as any })}>
                <option value="">Todos</option>
                {Object.entries(CONSENT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Asignado a">
              <Select value={f.assignedTo === null ? 'none' : f.assignedTo ?? ''} onChange={(e) => setF({ ...f, assignedTo: e.target.value === '' ? undefined : e.target.value === 'none' ? null : Number(e.target.value) })}>
                <option value="">Cualquiera</option>
                <option value="none">Sin asignar</option>
                {users.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select
                value={f.blacklisted ? 'blacklist' : f.status ?? 'active'}
                onChange={(e) => setF({ ...f, status: e.target.value === 'archived' ? 'archived' : 'active', blacklisted: e.target.value === 'blacklist' ? true : undefined })}
              >
                <option value="active">Activos</option>
                <option value="blacklist">Lista negra</option>
                <option value="archived">Archivados</option>
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {selCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm animate-fade-in">
          <b>{fmtNum(selCount)}</b> seleccionados
          {pageAll && !allMatching && q.data && q.data.total > rows.length && (
            <button className="text-brand underline" onClick={() => setAllMatching(true)}>
              Seleccionar los {fmtNum(q.data.total)} que coinciden
            </button>
          )}
          <div className="flex-1" />
          {can('contacts.edit') && (
            <>
              <Dropdown trigger={<Button size="sm" icon={<TagIcon className="h-4 w-4" />}>Etiquetar</Button>} items={(tags.data ?? []).map((t) => ({ label: <TagChip tag={t} small />, onClick: () => bulk((ids) => call('tags.assign', { contactIds: ids, tagId: t.id }), `Etiqueta "${t.name}" asignada`) }))} />
              <Dropdown trigger={<Button size="sm">Quitar etiqueta</Button>} items={(tags.data ?? []).map((t) => ({ label: <TagChip tag={t} small />, onClick: () => bulk((ids) => call('tags.unassign', { contactIds: ids, tagId: t.id }), `Etiqueta "${t.name}" quitada`) }))} />
              <Dropdown
                trigger={<Button size="sm" icon={<UserCheck className="h-4 w-4" />}>Asignar</Button>}
                items={[{ label: 'Sin asignar', onClick: () => bulk((ids) => call('contacts.assign', { ids, userId: null }), 'Asignación quitada') }, ...(users.data ?? []).map((u) => ({ label: u.display_name, onClick: () => bulk((ids) => call('contacts.assign', { ids, userId: u.id }), `Asignados a ${u.display_name}`) }))]}
              />
            </>
          )}
          {can('campaigns.manage') && (
            <Button
              size="sm"
              variant="primary"
              icon={<Megaphone className="h-4 w-4" />}
              onClick={async () => {
                const ids = await selectedIds();
                sessionStorage.setItem('wcrm:campaign-contacts', JSON.stringify(ids));
                nav('/campaigns/new?manual=1');
              }}
            >
              Crear campaña
            </Button>
          )}
          {can('contacts.edit') && (
            <Dropdown
              trigger={
                <IconButton title="Más acciones">
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              }
              items={[
                { label: 'Marcar consentimiento (opt-in)', icon: <UserCheck className="h-4 w-4" />, onClick: () => bulk((ids) => call('contacts.setConsent', { ids, status: 'opted_in', source: 'manual' }), 'Consentimiento registrado') },
                { label: 'Marcar "No contactar" (opt-out)', icon: <UserX className="h-4 w-4" />, onClick: () => bulk((ids) => call('contacts.setConsent', { ids, status: 'opted_out', source: 'manual' }), 'Marcados como No contactar') },
                { label: 'Agregar a lista negra', icon: <Ban className="h-4 w-4" />, onClick: () => bulk((ids) => call('contacts.setBlacklist', { ids, blacklisted: true, reason: 'manual' }), 'Agregados a la lista negra') },
                { label: 'Quitar de lista negra', onClick: () => bulk((ids) => call('contacts.setBlacklist', { ids, blacklisted: false }), 'Quitados de la lista negra') },
                { label: f.status === 'archived' ? 'Desarchivar' : 'Archivar', onClick: () => bulk((ids) => call('contacts.archive', { ids, archived: f.status !== 'archived' }), 'Listo') },
                'sep',
                ...(can('contacts.delete')
                  ? [
                      {
                        label: 'Eliminar',
                        icon: <Trash2 className="h-4 w-4" />,
                        danger: true,
                        onClick: async () => {
                          if (await confirmDialog({ title: `Eliminar ${fmtNum(selCount)} contactos`, body: 'Se borrarán sus conversaciones, notas e historial. Esta acción no se puede deshacer.', danger: true, confirmText: 'Eliminar', requireText: selCount > 20 ? 'ELIMINAR' : undefined }))
                            await bulk((ids) => call('contacts.delete', { ids }), 'Contactos eliminados');
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      )}

      <Card padded={false}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={search || Object.values(f).some((v) => v !== undefined) ? 'Ningún contacto coincide' : 'Aún no hay contactos'}
            body="Los contactos se crean automáticamente al recibir mensajes, o puede agregarlos manualmente o importarlos desde un CSV."
            action={
              can('contacts.edit') && (
                <div className="flex gap-2">
                  <Button onClick={() => setImportOpen(true)} icon={<Upload className="h-4 w-4" />}>
                    Importar CSV
                  </Button>
                  <Button variant="primary" onClick={() => setEdit('new')} icon={<Plus className="h-4 w-4" />}>
                    Nuevo contacto
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="w-10 py-3 pl-5">
                  <Checkbox
                    checked={pageAll}
                    indeterminate={!pageAll && rows.some((r) => sel.has(r.id))}
                    onChange={(v) => {
                      const n = new Set(sel);
                      rows.forEach((r) => (v ? n.add(r.id) : n.delete(r.id)));
                      setSel(n);
                      if (!v) setAllMatching(false);
                    }}
                  />
                </th>
                <th className="py-3">Contacto</th>
                <th>Etiquetas</th>
                <th>Último mensaje</th>
                <th>Estado</th>
                <th>Asignado</th>
                <th>Creado</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="table-row cursor-pointer" onClick={() => nav(`/contacts/${c.id}`)}>
                  <td className="py-2.5 pl-5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={allMatching || sel.has(c.id)}
                      onChange={(v) => {
                        setAllMatching(false);
                        const n = new Set(sel);
                        v ? n.add(c.id) : n.delete(c.id);
                        setSel(n);
                      }}
                    />
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} phone={c.phone} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name || '—'}</p>
                        <p className="text-xs text-muted">
                          {fmtPhone(c.phone)}
                          {c.company ? ` · ${c.company}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {c.tags?.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} small />)}
                      {(c.tags?.length ?? 0) > 3 && <span className="text-xs text-muted">+{c.tags!.length - 3}</span>}
                    </div>
                  </td>
                  <td className="max-w-[240px]">
                    <p className="truncate text-xs">{c.last_message_preview ?? <span className="text-muted">—</span>}</p>
                    <p className="text-[11px] text-muted">{relTime(c.last_message_at)}</p>
                  </td>
                  <td>
                    {c.blacklisted ? <Badge tone="red">Lista negra</Badge> : c.consent_status === 'opted_out' ? <Badge tone="red">No contactar</Badge> : c.consent_status === 'opted_in' ? <Badge tone="green">Opt-in</Badge> : <Badge>Activo</Badge>}
                  </td>
                  <td className="text-xs text-muted">{c.assigned_name ?? '—'}</td>
                  <td className="text-xs text-muted">{fmtDate(c.created_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {can('contacts.edit') && (
                      <IconButton title="Editar" onClick={() => setEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {q.data && q.data.total > PAGE && (
          <div className="flex items-center justify-between border-t border-line/60 px-5 py-3 text-sm text-muted">
            <span>
              {fmtNum(page * PAGE + 1)}–{fmtNum(Math.min((page + 1) * PAGE, q.data.total))} de {fmtNum(q.data.total)}
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button size="sm" disabled={(page + 1) * PAGE >= q.data.total} onClick={() => setPage(page + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>
      <ContactForm contact={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), q.reload(), tags.reload())} />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} onDone={() => (q.reload(), tags.reload())} />
    </>
  );
}

export function ContactForm({ contact, onClose, onSaved }: { contact: Contact | 'new' | null; onClose: () => void; onSaved: (c: Contact) => void }) {
  const fields = useQuery<CustomField[]>(contact ? 'fields.list' : null);
  const tags = useQuery<Tag[]>(contact === 'new' ? 'tags.list' : null);
  const [v, setV] = useState<any>({});
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (contact === 'new') setV({ name: '', phone: '', email: '', company: '', custom: {}, consent_status: 'unknown' });
    else if (contact) setV({ name: contact.name ?? '', phone: '+' + contact.phone, email: contact.email ?? '', company: contact.company ?? '', custom: contact.custom ?? {} });
    setTagIds([]);
  }, [contact]);
  useEffect(() => {
    if (contact && contact !== 'new' && !contact.custom) void call<Contact>('contacts.get', { id: contact.id }).then((c) => setV((p: any) => ({ ...p, custom: c.custom ?? {} })));
  }, [contact]);
  if (!contact) return null;
  const save = async () => {
    setBusy(true);
    const payload = { name: v.name || null, phone: v.phone, email: v.email || null, company: v.company || null, custom: v.custom };
    const r = await attempt(() =>
      contact === 'new'
        ? call<Contact>('contacts.create', { ...payload, tagIds, consent_status: v.consent_status, consent_source: v.consent_status !== 'unknown' ? 'manual' : null })
        : call<Contact>('contacts.update', { id: contact.id, patch: payload }),
      contact === 'new' ? 'Contacto creado' : 'Contacto actualizado',
    );
    setBusy(false);
    if (r) onSaved(r);
  };
  return (
    <Modal open onClose={onClose} title={contact === 'new' ? 'Nuevo contacto' : 'Editar contacto'} size="lg" footer={<Button variant="primary" loading={busy} disabled={!v.phone} onClick={save}>Guardar</Button>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre">
          <Input autoFocus value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Teléfono (WhatsApp)" hint="Con código de país, ej. +57 300 123 4567. Sin código se usa el país configurado.">
          <Input value={v.phone ?? ''} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={v.email ?? ''} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label="Empresa">
          <Input value={v.company ?? ''} onChange={(e) => setV({ ...v, company: e.target.value })} />
        </Field>
        {fields.data?.map((f) => (
          <Field key={f.id} label={f.label}>
            {f.type === 'select' ? (
              <Select value={v.custom?.[f.key] ?? ''} onChange={(e) => setV({ ...v, custom: { ...v.custom, [f.key]: e.target.value } })}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : (
              <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v.custom?.[f.key] ?? ''} onChange={(e) => setV({ ...v, custom: { ...v.custom, [f.key]: e.target.value } })} />
            )}
          </Field>
        ))}
        {contact === 'new' && (
          <>
            <Field label="Consentimiento">
              <Select value={v.consent_status} onChange={(e) => setV({ ...v, consent_status: e.target.value })}>
                <option value="unknown">Sin registrar</option>
                <option value="opted_in">El contacto aceptó recibir mensajes (opt-in)</option>
              </Select>
            </Field>
            <Field label="Etiquetas" className="col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {tags.data?.filter((t) => !t.is_system).map((t) => (
                  <button key={t.id} type="button" onClick={() => setTagIds(tagIds.includes(t.id) ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])} className={cx('rounded-full transition', !tagIds.includes(t.id) && 'opacity-40 grayscale')}>
                    <TagChip tag={t} />
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

const PALETTE = ['#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ef4444', '#f97316', '#a16207', '#14b8a6', '#ec4899', '#64748b', '#111827'];
const EMOJIS = ['🟢', '🔵', '🟡', '🟣', '🔴', '🟠', '🟤', '⚫', '⭐', '🔥', '💎', '🎓', '🛒', '💰', '📌', '❤️'];

function TagsManager() {
  const nav = useNavigate();
  const { can } = useStore();
  const q = useQuery<Tag[]>('tags.list', undefined, { refreshOn: ['contact.updated'] });
  const [edit, setEdit] = useState<Partial<Tag> | null>(null);
  const save = async () => {
    if (!edit) return;
    const ok = await attempt(() => (edit.id ? call('tags.update', { id: edit.id, name: edit.name, color: edit.color, emoji: edit.emoji ?? null }) : call('tags.create', { name: edit.name, color: edit.color, emoji: edit.emoji ?? null })), 'Etiqueta guardada');
    if (ok) {
      setEdit(null);
      void q.reload();
    }
  };
  return (
    <>
      <div className="mb-4 flex justify-end">
        {can('tags.manage') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', color: PALETTE[0], emoji: '🟢' })}>
            Nueva etiqueta
          </Button>
        )}
      </div>
      {!q.data ? (
        <SkeletonRows />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {q.data.map((t) => (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between">
                <TagChip tag={t} />
                {can('tags.manage') && !t.is_system && (
                  <Dropdown
                    trigger={
                      <IconButton title="Opciones">
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    }
                    items={[
                      { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setEdit(t) },
                      {
                        label: 'Eliminar',
                        icon: <Trash2 className="h-4 w-4" />,
                        danger: true,
                        onClick: async () => {
                          if (await confirmDialog({ title: `Eliminar "${t.name}"`, body: `Se quitará de ${t.contact_count} contactos. Los contactos no se eliminan.`, danger: true, confirmText: 'Eliminar' })) await attempt(() => call('tags.delete', { id: t.id }).then(q.reload), 'Etiqueta eliminada');
                        },
                      },
                    ]}
                  />
                )}
              </div>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{fmtNum(t.contact_count)}</p>
              <p className="text-xs text-muted">contactos{t.is_system ? ' · etiqueta del sistema (excluida de campañas)' : ''}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => nav(`/contacts?tab=contacts&tag=${t.id}`)}>
                  Ver contactos
                </Button>
                {can('campaigns.manage') && !t.is_system && (
                  <Button size="sm" variant="subtle" icon={<Megaphone className="h-4 w-4" />} disabled={!t.contact_count} onClick={() => nav(`/campaigns/new?tag=${t.id}`)}>
                    Crear campaña
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit?.id ? 'Editar etiqueta' : 'Nueva etiqueta'} footer={<Button variant="primary" onClick={save} disabled={!edit?.name?.trim()}>Guardar</Button>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre">
              <Input autoFocus value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Color">
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })} className={cx('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface', edit.color === c && 'ring-2 ring-white')} style={{ background: c }} />
                ))}
              </div>
            </Field>
            <Field label="Icono">
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setEdit({ ...edit, emoji: e })} className={cx('rounded-lg p-1.5 text-lg', edit.emoji === e && 'bg-elevated')}>
                    {e}
                  </button>
                ))}
              </div>
            </Field>
            <div>
              <p className="label">Vista previa</p>
              <TagChip tag={{ name: edit.name || 'Etiqueta', color: edit.color ?? PALETTE[0], emoji: edit.emoji ?? null }} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const SEG_FIELDS: { id: SegmentRule['field']; label: string; kind: 'tag' | 'text' | 'date' | 'enum' | 'custom' | 'stage' | 'campaign' | 'user' | 'days' }[] = [
  { id: 'tag', label: 'Etiqueta', kind: 'tag' },
  { id: 'name', label: 'Nombre', kind: 'text' },
  { id: 'phone', label: 'Número', kind: 'text' },
  { id: 'email', label: 'Email', kind: 'text' },
  { id: 'company', label: 'Empresa', kind: 'text' },
  { id: 'last_message_at', label: 'Último mensaje (cualquiera)', kind: 'date' },
  { id: 'last_inbound_at', label: 'Última conversación del cliente', kind: 'date' },
  { id: 'created_at', label: 'Fecha de creación', kind: 'date' },
  { id: 'consent_status', label: 'Consentimiento', kind: 'enum' },
  { id: 'status', label: 'Estado', kind: 'enum' },
  { id: 'assigned_to', label: 'Asignado a', kind: 'user' },
  { id: 'custom_field', label: 'Campo personalizado', kind: 'custom' },
  { id: 'pipeline_stage', label: 'Etapa del pipeline', kind: 'stage' },
  { id: 'campaign_received', label: 'Recibió la campaña', kind: 'campaign' },
  { id: 'replied', label: 'Interacción (respondió)', kind: 'days' },
];
const OPS: Record<string, { id: string; label: string }[]> = {
  tag: [{ id: 'is', label: 'tiene' }, { id: 'is_not', label: 'no tiene' }],
  text: [{ id: 'contains', label: 'contiene' }, { id: 'not_contains', label: 'no contiene' }, { id: 'starts_with', label: 'comienza con' }, { id: 'equals', label: 'es igual a' }, { id: 'is_empty', label: 'está vacío' }, { id: 'not_empty', label: 'no está vacío' }],
  date: [{ id: 'older_than_days', label: 'hace más de (días)' }, { id: 'within_days', label: 'en los últimos (días)' }, { id: 'before', label: 'antes de' }, { id: 'after', label: 'después de' }, { id: 'is_empty', label: 'nunca' }],
  enum: [{ id: 'is', label: 'es' }, { id: 'is_not', label: 'no es' }],
  user: [{ id: 'is', label: 'es' }, { id: 'is_empty', label: 'sin asignar' }],
  custom: [{ id: 'equals', label: 'es igual a' }, { id: 'contains', label: 'contiene' }, { id: 'gt', label: 'mayor que' }, { id: 'lt', label: 'menor que' }, { id: 'before', label: 'antes de (fecha)' }, { id: 'after', label: 'después de (fecha)' }, { id: 'is_empty', label: 'está vacío' }, { id: 'not_empty', label: 'no está vacío' }],
  stage: [{ id: 'is', label: 'es' }, { id: 'is_not', label: 'no es' }],
  campaign: [{ id: 'is', label: 'sí' }, { id: 'is_not', label: 'no' }],
  days: [{ id: 'within_days', label: 'en los últimos (días)' }, { id: 'older_than_days', label: 'no en los últimos (días)' }],
};

export function SegmentBuilder({ def, setDef }: { def: SegmentDefinition; setDef: (d: SegmentDefinition) => void }) {
  const tags = useQuery<Tag[]>('tags.list');
  const fields = useQuery<CustomField[]>('fields.list');
  const users = useQuery<{ id: number; display_name: string }[]>('users.basic');
  const pipes = useQuery<any[]>('pipeline.list');
  const camps = useQuery<any[]>('campaigns.list', {});
  const stages = useMemo(() => (pipes.data ?? []).flatMap((p) => p.stages.map((s: any) => ({ ...s, label: `${p.name} · ${s.name}` }))), [pipes.data]);
  const update = (i: number, r: Partial<SegmentRule>) => setDef({ ...def, rules: def.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        Contactos que cumplan
        <Select className="w-32" value={def.match} onChange={(e) => setDef({ ...def, match: e.target.value as any })}>
          <option value="all">todas</option>
          <option value="any">alguna</option>
        </Select>
        de estas condiciones:
      </div>
      {def.rules.map((r, i) => {
        const meta = SEG_FIELDS.find((f) => f.id === r.field)!;
        const noValue = ['is_empty', 'not_empty'].includes(r.op);
        return (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-line/60 bg-elevated/40 p-2">
            <span className="w-6 text-center text-xs text-muted">{i === 0 ? 'Si' : def.match === 'all' ? 'Y' : 'O'}</span>
            <Select className="w-56" value={r.field} onChange={(e) => update(i, { field: e.target.value as any, op: OPS[SEG_FIELDS.find((f) => f.id === e.target.value)!.kind][0].id as any, value: '' })}>
              {SEG_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
            {meta.kind === 'custom' && (
              <Select className="w-44" value={r.fieldKey ?? ''} onChange={(e) => update(i, { fieldKey: e.target.value })}>
                <option value="">Campo…</option>
                {fields.data?.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            )}
            <Select className="w-48" value={r.op} onChange={(e) => update(i, { op: e.target.value as any })}>
              {OPS[meta.kind].map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            {!noValue && (
              <div className="flex-1">
                {meta.kind === 'tag' ? (
                  <Select value={r.value ?? ''} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                    <option value="">Etiqueta…</option>
                    {tags.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.emoji} {t.name}
                      </option>
                    ))}
                  </Select>
                ) : meta.kind === 'enum' ? (
                  <Select value={r.value ?? ''} onChange={(e) => update(i, { value: e.target.value })}>
                    <option value="">—</option>
                    {r.field === 'consent_status' ? Object.entries(CONSENT).map(([k, v]) => <option key={k} value={k}>{v}</option>) : [<option key="a" value="active">Activo</option>, <option key="b" value="archived">Archivado</option>]}
                  </Select>
                ) : meta.kind === 'user' ? (
                  <Select value={r.value ?? ''} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                    <option value="">Usuario…</option>
                    {users.data?.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                  </Select>
                ) : meta.kind === 'stage' ? (
                  <Select value={r.value ?? ''} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                    <option value="">Etapa…</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                ) : meta.kind === 'campaign' ? (
                  <Select value={r.value ?? ''} onChange={(e) => update(i, { value: Number(e.target.value) })}>
                    <option value="">Campaña…</option>
                    {camps.data?.filter((c) => c.status !== 'draft').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                ) : (
                  <Input type={['before', 'after'].includes(r.op) ? 'date' : ['older_than_days', 'within_days', 'gt', 'lt'].includes(r.op) ? 'number' : 'text'} value={r.value ?? ''} onChange={(e) => update(i, { value: ['older_than_days', 'within_days', 'gt', 'lt'].includes(r.op) ? Number(e.target.value) : e.target.value })} />
                )}
              </div>
            )}
            <IconButton title="Quitar condición" onClick={() => setDef({ ...def, rules: def.rules.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        );
      })}
      <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setDef({ ...def, rules: [...def.rules, { field: 'tag', op: 'is', value: '' as any }] })}>
        Agregar condición
      </Button>
    </div>
  );
}

function SegmentsManager() {
  const nav = useNavigate();
  const { can } = useStore();
  const q = useQuery<Segment[]>('segments.list');
  const [edit, setEdit] = useState<{ id?: number; name: string; description?: string | null; definition: SegmentDefinition } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);
  useEffect(() => {
    if (!edit) return;
    const valid = edit.definition.rules.every((r) => ['is_empty', 'not_empty'].includes(r.op) || (r.value !== '' && r.value !== undefined && r.value !== null));
    if (!valid) return setCount(null);
    const t = setTimeout(() => {
      call<number>('segments.count', { definition: edit.definition })
        .then((n) => (setCount(n), setCountErr(null)))
        .catch((e) => setCountErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [edit?.definition]);
  const save = async () => {
    const ok = await attempt(() => call('segments.save', edit), 'Segmento guardado');
    if (ok) {
      setEdit(null);
      void q.reload();
    }
  };
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">Los segmentos son dinámicos: se recalculan cada vez que se usan.</p>
        {can('tags.manage') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', definition: { match: 'all', rules: [{ field: 'tag', op: 'is', value: '' as any }] } })}>
            Nuevo segmento
          </Button>
        )}
      </div>
      {!q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Layers className="h-6 w-6" />} title="Sin segmentos" body='Ejemplo: "Clientes VIP inactivos" = Etiqueta Cliente VIP y último mensaje hace más de 30 días.' />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {q.data.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted">{s.definition.rules.length} condición(es) · {s.definition.match === 'all' ? 'todas' : 'alguna'}</p>
                </div>
                {can('tags.manage') && (
                  <Dropdown
                    trigger={
                      <IconButton title="Opciones">
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    }
                    items={[
                      { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setEdit(s) },
                      { label: 'Eliminar', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: `Eliminar "${s.name}"`, danger: true, confirmText: 'Eliminar' })) && attempt(() => call('segments.delete', { id: s.id }).then(q.reload)) },
                    ]}
                  />
                )}
              </div>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{fmtNum(s.contact_count)}</p>
              <p className="text-xs text-muted">contactos ahora</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => nav(`/contacts?tab=contacts&segment=${s.id}`)}>
                  Ver contactos
                </Button>
                {can('campaigns.manage') && (
                  <Button size="sm" variant="subtle" icon={<Megaphone className="h-4 w-4" />} onClick={() => nav(`/campaigns/new?segment=${s.id}`)}>
                    Crear campaña
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="xl"
        title={edit?.id ? 'Editar segmento' : 'Nuevo segmento'}
        footer={
          <>
            <span className="mr-auto text-sm">{countErr ? <span className="text-danger">{countErr}</span> : count !== null ? <>Coinciden <b>{fmtNum(count)}</b> contactos</> : <span className="text-muted">Complete las condiciones</span>}</span>
            <Button variant="primary" onClick={save} disabled={!edit?.name.trim()}>
              Guardar segmento
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-5">
            <Field label="Nombre">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ej. Clientes VIP inactivos" />
            </Field>
            <SegmentBuilder def={edit.definition} setDef={(d) => setEdit({ ...edit, definition: d })} />
            <InfoBox tone="info">Los contactos con opt-out, en lista negra o con la etiqueta "No contactar" se excluyen automáticamente de las campañas aunque estén en el segmento.</InfoBox>
          </div>
        )}
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { FileText, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import type { CustomField, ProviderTemplate, QuickReply, Template } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { fmtDateTime } from '../lib/format';
import { VariableTextarea } from '../components/VariableTextarea';
import { Badge, Button, Card, Dropdown, EmptyState, Field, IconButton, InfoBox, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, confirmDialog, cx } from '../components/ui';

export function Templates() {
  const [tab, setTab] = useState<'templates' | 'quick' | 'approved'>('templates');
  return (
    <div className="mx-auto max-w-[1300px] p-8">
      <PageHeader icon={<FileText className="h-5 w-5" />} title="Plantillas" subtitle="Textos reutilizables, respuestas rápidas y plantillas aprobadas por WhatsApp" actions={<Tabs value={tab} onChange={setTab} tabs={[{ id: 'templates', label: 'Biblioteca' }, { id: 'quick', label: 'Respuestas rápidas' }, { id: 'approved', label: 'Aprobadas por WhatsApp' }]} />} />
      {tab === 'templates' && <TemplateLibrary />}
      {tab === 'quick' && <QuickReplies />}
      {tab === 'approved' && <Approved />}
    </div>
  );
}

function TemplateLibrary() {
  const { can } = useStore();
  const q = useQuery<{ templates: Template[]; categories: string[]; fields: CustomField[] }>('templates.list');
  const [cat, setCat] = useState('Todas');
  const [edit, setEdit] = useState<Partial<Template> | null>(null);
  const list = (q.data?.templates ?? []).filter((t) => cat === 'Todas' || t.category === cat);
  const save = async () => {
    const ok = await attempt(() => call('templates.save', edit), 'Plantilla guardada');
    if (ok) (setEdit(null), q.reload());
  };
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Tabs value={cat} onChange={setCat} tabs={['Todas', ...(q.data?.categories ?? [])].map((c) => ({ id: c, label: c, count: c === 'Todas' ? q.data?.templates.length : q.data?.templates.filter((t) => t.category === c).length }))} />
        {can('templates.manage') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: '', category: cat === 'Todas' ? 'Ventas' : cat, body: 'Hola {{nombre}}, ¿cómo estás? 👋' })}>
            Nueva plantilla
          </Button>
        )}
      </div>
      {!q.data ? (
        <SkeletonRows />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Sin plantillas" body="Guarde los mensajes que más usa para reutilizarlos en el inbox y en campañas." />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {list.map((t) => (
            <div key={t.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <Badge className="mt-1">{t.category}</Badge>
                </div>
                {can('templates.manage') && (
                  <Dropdown
                    trigger={
                      <IconButton title="Opciones">
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    }
                    items={[
                      { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => setEdit(t) },
                      { label: 'Eliminar', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: `Eliminar "${t.name}"`, danger: true, confirmText: 'Eliminar' })) && attempt(() => call('templates.delete', { id: t.id }).then(q.reload)) },
                    ]}
                  />
                )}
              </div>
              <p className="mt-3 line-clamp-5 flex-1 whitespace-pre-wrap rounded-xl bg-elevated/40 p-3 text-sm">{t.body}</p>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar plantilla' : 'Nueva plantilla'} footer={<Button variant="primary" onClick={save} disabled={!edit?.name?.trim() || !edit?.body?.trim()}>Guardar</Button>}>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre">
                <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Categoría">
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {q.data?.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <VariableTextarea value={edit.body ?? ''} onChange={(body) => setEdit({ ...edit, body })} fields={q.data?.fields} rows={8} />
          </div>
        )}
      </Modal>
    </>
  );
}

function QuickReplies() {
  const { can } = useStore();
  const q = useQuery<QuickReply[]>('quickReplies.list');
  const fields = useQuery<CustomField[]>('fields.list');
  const [edit, setEdit] = useState<Partial<QuickReply> | null>(null);
  const presets = ['precio', 'horario', 'catalogo', 'pago', 'soporte'];
  const save = async () => {
    const ok = await attempt(() => call('quickReplies.save', edit), 'Respuesta rápida guardada');
    if (ok) (setEdit(null), q.reload());
  };
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          En el inbox, escriba <code className="rounded bg-elevated px-1">/</code> seguido del atajo para insertar la respuesta (con variables ya reemplazadas).
        </p>
        {can('templates.manage') && (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ shortcut: presets.find((p) => !q.data?.some((x) => x.shortcut === p)) ?? '', body: '' })}>
            Nueva respuesta rápida
          </Button>
        )}
      </div>
      <Card padded={false}>
        {!q.data ? (
          <SkeletonRows />
        ) : q.data.length === 0 ? (
          <EmptyState icon={<Zap className="h-6 w-6" />} title="Sin respuestas rápidas" body="Ejemplos: /precio, /horario, /catalogo, /pago, /soporte." />
        ) : (
          <ul className="divide-y divide-line/50">
            {q.data.map((r) => (
              <li key={r.id} className="flex items-start gap-4 px-5 py-3.5">
                <code className="w-32 shrink-0 rounded-lg bg-brand/10 px-2 py-1 text-center text-sm text-brand">/{r.shortcut}</code>
                <p className="flex-1 whitespace-pre-wrap text-sm">{r.body}</p>
                {can('templates.manage') && (
                  <div className="flex">
                    <IconButton title="Editar" onClick={() => setEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton title="Eliminar" onClick={() => attempt(() => call('quickReplies.delete', { id: r.id }).then(q.reload))}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? 'Editar respuesta rápida' : 'Nueva respuesta rápida'} footer={<Button variant="primary" onClick={save} disabled={!edit?.shortcut || !edit?.body?.trim()}>Guardar</Button>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Atajo" hint="Sin espacios. Ej. precio → se usa escribiendo /precio">
              <div className="flex items-center gap-1">
                <span className="text-lg text-muted">/</span>
                <Input value={edit.shortcut ?? ''} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value.replace(/\s/g, '').toLowerCase() })} />
              </div>
            </Field>
            <VariableTextarea value={edit.body ?? ''} onChange={(body) => setEdit({ ...edit, body })} fields={fields.data} rows={6} />
          </div>
        )}
      </Modal>
    </>
  );
}

function Approved() {
  const { can } = useStore();
  const q = useQuery<ProviderTemplate[]>('templates.provider', {});
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    const r = await attempt(() => call<{ count: number }>('accounts.syncTemplates'));
    setBusy(false);
    if (r) {
      toast.success(`${r.count} plantillas sincronizadas`);
      void q.reload();
    }
  };
  const tone = (s: string) => (s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'PENDING' ? 'amber' : 'slate');
  return (
    <>
      <InfoBox tone="info" className="mb-4">
        Las plantillas de WhatsApp se crean y aprueban en el administrador de WhatsApp de Meta (no desde esta aplicación). Son obligatorias para iniciar conversaciones o escribir fuera de la ventana de 24 h. Aquí se sincronizan para usarlas en campañas y en el inbox.
      </InfoBox>
      <div className="mb-4 flex justify-end">
        {can('templates.manage') && (
          <Button icon={<RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />} disabled={busy} onClick={sync}>
            Sincronizar desde WhatsApp
          </Button>
        )}
      </div>
      <Card padded={false}>
        {!q.data ? (
          <SkeletonRows />
        ) : q.data.length === 0 ? (
          <EmptyState title="Sin plantillas sincronizadas" body="Conecte la cuenta y pulse Sincronizar. Requiere el WhatsApp Business Account ID en la configuración de la cuenta." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2.5 pl-5">Nombre</th>
                <th>Idioma</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Contenido</th>
                <th className="pr-5">Sincronizada</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((t) => (
                <tr key={t.id} className="table-row">
                  <td className="py-2.5 pl-5 font-medium">{t.name}</td>
                  <td>{t.language}</td>
                  <td className="text-xs text-muted">{t.category}</td>
                  <td>
                    <Badge tone={tone(t.status)}>{t.status}</Badge>
                  </td>
                  <td className="max-w-md truncate text-xs text-muted">{t.body_text}</td>
                  <td className="pr-5 text-xs text-muted">{fmtDateTime(t.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

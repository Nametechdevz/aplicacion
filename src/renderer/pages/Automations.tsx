import { useNavigate } from 'react-router-dom';
import { Copy, MoreHorizontal, Plus, Trash2, Workflow } from 'lucide-react';
import type { Automation } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { fmtNum, relTime } from '../lib/format';
import { Badge, Button, Card, Dropdown, EmptyState, ErrorState, IconButton, PageHeader, SkeletonRows, Toggle, confirmDialog } from '../components/ui';

export function Automations() {
  const nav = useNavigate();
  const { can } = useStore();
  const q = useQuery<Automation[]>('automations.list', undefined, { refreshOn: ['automation.run', 'automation.failed'], debounceMs: 1000 });
  const cat = useQuery<any>('automations.catalog');
  return (
    <div className="mx-auto max-w-[1300px] p-8">
      <PageHeader
        icon={<Workflow className="h-5 w-5" />}
        title="Automatizaciones"
        subtitle="Trigger → Condición → Acción. Respuestas automáticas, etiquetado, seguimientos y más."
        actions={
          can('automations.manage') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/automations/new')}>
              Nueva automatización
            </Button>
          )
        }
      />
      <Card padded={false}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <SkeletonRows />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={<Workflow className="h-6 w-6" />}
            title="Sin automatizaciones"
            body='Ejemplo: CUANDO se reciba un mensaje, SI contiene "precio", ENTONCES responder con los precios y agregar la etiqueta "Interesado".'
            action={can('automations.manage') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/automations/new?example=precio')}>Crear el ejemplo</Button>}
          />
        ) : (
          <ul className="divide-y divide-line/50">
            {q.data.map((a) => (
              <li key={a.id} onClick={() => nav(`/automations/${a.id}`)} className="flex cursor-pointer items-center gap-5 px-5 py-4 transition hover:bg-elevated/40">
                <div onClick={(e) => e.stopPropagation()}>
                  <Toggle checked={!!a.enabled} disabled={!can('automations.manage')} onChange={(v) => attempt(() => call('automations.setEnabled', { id: a.id, enabled: v }).then(q.reload), v ? 'Automatización activada' : 'Automatización pausada')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted">
                    Cuando: {cat.data?.triggers[a.trigger_type]?.label ?? a.trigger_type} · {a.nodes.length - 1} paso(s)
                    {a.description ? ` · ${a.description}` : ''}
                  </p>
                </div>
                <Badge tone={a.enabled ? 'green' : 'slate'} dot>
                  {a.enabled ? 'Activa' : 'Inactiva'}
                </Badge>
                <div className="w-40 text-right text-xs text-muted">
                  <p>{fmtNum(a.run_count)} ejecuciones</p>
                  <p>{a.last_run_at ? `Última ${relTime(a.last_run_at)}` : 'Nunca ejecutada'}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  {can('automations.manage') && (
                    <Dropdown
                      trigger={
                        <IconButton title="Opciones">
                          <MoreHorizontal className="h-4 w-4" />
                        </IconButton>
                      }
                      items={[
                        { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: () => attempt(() => call('automations.duplicate', { id: a.id }).then(q.reload), 'Duplicada (inactiva)') },
                        { label: 'Eliminar', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: `Eliminar "${a.name}"`, body: 'Las ejecuciones en espera se cancelarán.', danger: true, confirmText: 'Eliminar' })) && attempt(() => call('automations.delete', { id: a.id }).then(q.reload), 'Eliminada') },
                      ]}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

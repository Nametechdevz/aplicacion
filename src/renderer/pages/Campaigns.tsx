import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Megaphone, MoreHorizontal, Play, Plus, Repeat, Trash2, Wifi } from 'lucide-react';
import type { Campaign } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { CAMPAIGN_STATUS, fmtDateTime, fmtNum, fmtPct, PAUSE_REASONS } from '../lib/format';
import { Badge, Button, Card, Dropdown, EmptyState, ErrorState, IconButton, InfoBox, PageHeader, Progress, SkeletonRows, Tabs, confirmDialog } from '../components/ui';

const TABS = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'active', label: 'Activas', match: (c: Campaign) => ['running', 'paused'].includes(c.status) },
  { id: 'scheduled', label: 'Programadas', match: (c: Campaign) => c.status === 'scheduled' },
  { id: 'draft', label: 'Borradores', match: (c: Campaign) => c.status === 'draft' },
  { id: 'done', label: 'Finalizadas', match: (c: Campaign) => ['completed', 'cancelled', 'failed'].includes(c.status) },
] as const;

export function pauseReasonText(r?: string | null) {
  if (!r) return '';
  if (r.startsWith('audience_grew')) return `La audiencia creció a ${r.split(':')[1]} contactos: revise y reanude para confirmar`;
  return PAUSE_REASONS[r] ?? r;
}

export function CampaignStatsBar({ c }: { c: Campaign }) {
  const s = c.stats!;
  return (
    <Progress
      segments={[
        { value: s.read, className: 'bg-sky-400', label: `Leídos ${s.read}` },
        { value: s.delivered - s.read, className: 'bg-emerald-400', label: `Entregados ${s.delivered - s.read}` },
        { value: s.sent - s.delivered, className: 'bg-emerald-700', label: `Enviados ${s.sent - s.delivered}` },
        { value: s.failed, className: 'bg-red-400', label: `Fallidos ${s.failed}` },
        { value: s.cancelled, className: 'bg-slate-500', label: `Cancelados ${s.cancelled}` },
        { value: s.pending, className: 'bg-transparent', label: `Pendientes ${s.pending}` },
      ]}
    />
  );
}

export function Campaigns() {
  const nav = useNavigate();
  const { can, accounts, accountId } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const q = useQuery<Campaign[]>('campaigns.list', {}, { refreshOn: ['campaign.updated', 'campaign.progress', 'campaign.finished'], debounceMs: 500 });
  const paused = useQuery<Campaign[]>('campaigns.pausedByDisconnect', undefined, { refreshOn: ['campaign.updated', 'account.status'] });
  const acc = accounts.find((a) => a.id === accountId);
  const list = (q.data ?? []).filter(TABS.find((t) => t.id === tab)!.match);

  const resumeAll = async () => {
    for (const c of paused.data ?? []) await attempt(() => call('campaigns.resume', { id: c.id }));
    void q.reload();
    void paused.reload();
  };

  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title="Campañas"
        subtitle="Envíos segmentados con cola controlada, programación y estadísticas"
        actions={
          can('campaigns.manage') && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/campaigns/new')}>
              Nueva campaña
            </Button>
          )
        }
      />
      {!!paused.data?.length && (
        <InfoBox tone={acc?.status === 'connected' ? 'ok' : 'danger'} className="mb-5" icon={<Wifi className="h-4 w-4" />}>
          <div className="flex items-center justify-between gap-4">
            <span>
              {acc?.status === 'connected' ? (
                <>
                  <b>Conexión restaurada.</b> {paused.data.length} campaña(s) quedaron en pausa por la desconexión.
                </>
              ) : (
                <>
                  <b>🔴 WhatsApp desconectado.</b> {paused.data.length} campaña(s) en pausa. No se enviará nada hasta reconectar.
                </>
              )}
            </span>
            {acc?.status === 'connected' && can('campaigns.manage') && (
              <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} onClick={resumeAll}>
                Reanudar campañas
              </Button>
            )}
          </div>
        </InfoBox>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: (q.data ?? []).filter(t.match).length }))} />
      <Card padded={false}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !q.data ? (
          <SkeletonRows rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="No hay campañas aquí"
            body="Cree una campaña: elija destinatarios por etiqueta o segmento, escriba el mensaje con variables y prográmelo."
            action={can('campaigns.manage') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/campaigns/new')}>Nueva campaña</Button>}
          />
        ) : (
          <ul className="divide-y divide-line/50">
            {list.map((c) => {
              const s = c.stats!;
              const target = s.total - s.skipped;
              return (
                <li key={c.id} onClick={() => nav(c.status === 'draft' ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}`)} className="grid cursor-pointer grid-cols-[minmax(0,1.4fr)_130px_minmax(0,1.3fr)_150px_40px] items-center gap-6 px-5 py-4 transition hover:bg-elevated/40">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {c.name} {c.recurrence && <Repeat className="h-3.5 w-3.5 text-violet-400" />}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {c.status === 'scheduled' ? `Próximo envío: ${fmtDateTime(c.next_run_at)}` : c.status === 'paused' ? pauseReasonText(c.pause_reason) : c.started_at ? `Iniciada ${fmtDateTime(c.started_at)}` : `Creada ${fmtDateTime(c.created_at)}`}
                    </p>
                  </div>
                  <Badge tone={CAMPAIGN_STATUS[c.status].tone} dot>
                    {CAMPAIGN_STATUS[c.status].label}
                  </Badge>
                  <div>{s.total > 0 ? <CampaignStatsBar c={c} /> : <span className="text-xs text-muted">Sin envíos todavía</span>}</div>
                  <div className="text-right text-xs tabular-nums text-muted">
                    {s.total > 0 && (
                      <>
                        <p>
                          <b className="text-fg">{fmtNum(s.sent)}</b> / {fmtNum(target)} enviados
                        </p>
                        <p>
                          {fmtPct(s.sent ? s.read / s.sent : 0)} leídos · {fmtNum(s.replied)} resp.
                        </p>
                      </>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {can('campaigns.manage') && (
                      <Dropdown
                        trigger={
                          <IconButton title="Opciones">
                            <MoreHorizontal className="h-4 w-4" />
                          </IconButton>
                        }
                        items={[
                          { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: async () => { const r = await attempt(() => call<Campaign>('campaigns.duplicate', { id: c.id }), 'Campaña duplicada'); if (r) nav(`/campaigns/${r.id}/edit`); } },
                          ...(['draft', 'completed', 'cancelled', 'failed'].includes(c.status)
                            ? [{ label: 'Eliminar', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: async () => (await confirmDialog({ title: `Eliminar "${c.name}"`, body: 'Se eliminarán también sus estadísticas.', danger: true, confirmText: 'Eliminar' })) && attempt(() => call('campaigns.delete', { id: c.id }).then(q.reload)) }]
                            : []),
                        ]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

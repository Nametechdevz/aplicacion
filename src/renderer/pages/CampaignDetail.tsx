import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Pause, Pencil, Play, Repeat, Square, Timer } from 'lucide-react';
import type { Campaign } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, useStore } from '../lib/store';
import { CAMPAIGN_STATUS, fmtDateTime, fmtNum, fmtPct, fmtPhone, MESSAGE_STATUS } from '../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, InfoBox, PageHeader, Select, Skeleton, SkeletonRows, confirmDialog, cx } from '../components/ui';
import { CampaignStatsBar, pauseReasonText } from './Campaigns';

const TONE: Record<string, string> = { queued: 'slate', sending: 'amber', sent: 'green', delivered: 'green', read: 'blue', failed: 'red', cancelled: 'slate', skipped: 'amber' };

export function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, accounts, accountId } = useStore();
  const cid = Number(id);
  const q = useQuery<Campaign & { recurrence_text: string | null }>('campaigns.get', { id: cid }, { refreshOn: ['campaign.updated', 'campaign.progress', 'campaign.finished', 'message.status'], debounceMs: 400 });
  const [status, setStatus] = useState('');
  const rec = useQuery<any[]>('campaigns.recipients', { id: cid, status: status || undefined, limit: 200 }, { refreshOn: ['campaign.progress', 'message.status'], debounceMs: 1500 });
  const runs = useQuery<any[]>('campaigns.runs', { id: cid }, { refreshOn: ['campaign.finished'] });
  const queue = useQuery<any>('queue.stats', undefined, { refreshOn: ['campaign.progress'], debounceMs: 2000 });
  const acc = accounts.find((a) => a.id === accountId);

  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} className="mt-20" />;
  if (!q.data) return <div className="p-8"><Skeleton className="h-96" /></div>;
  const c = q.data;
  const s = c.stats!;
  const base = Math.max(1, s.total - s.skipped);
  const act = async (method: string, ok: string) => attempt(() => call(method, { id: c.id }).then(q.reload), ok);
  const counters: [string, number, string, string?][] = [
    ['Contactos', s.total, 'text-fg'],
    ['Enviados', s.sent, 'text-emerald-400', fmtPct(s.sent / base)],
    ['Entregados', s.delivered, 'text-emerald-300', fmtPct(s.sent ? s.delivered / s.sent : 0)],
    ['Leídos', s.read, 'text-sky-400', fmtPct(s.sent ? s.read / s.sent : 0)],
    ['Respondidos', s.replied, 'text-violet-400', fmtPct(s.sent ? s.replied / s.sent : 0)],
    ['Fallidos', s.failed, 'text-red-400', fmtPct(s.failed / base)],
    ['Pendientes', s.pending, 'text-amber-400'],
    ['Excluidos / cancelados', s.skipped + s.cancelled, 'text-muted'],
  ];

  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <button onClick={() => nav('/campaigns')} className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Campañas
      </button>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge tone={CAMPAIGN_STATUS[c.status].tone} dot>
              {CAMPAIGN_STATUS[c.status].label}
            </Badge>
            {c.recurrence_text && (
              <span className="flex items-center gap-1 text-violet-300">
                <Repeat className="h-3.5 w-3.5" /> {c.recurrence_text}
              </span>
            )}
            {c.next_run_at && <span>· Próximo envío {fmtDateTime(c.next_run_at)}</span>}
          </span>
        }
        actions={
          can('campaigns.manage') && (
            <>
              {['draft', 'scheduled'].includes(c.status) && (
                <Button icon={<Pencil className="h-4 w-4" />} onClick={() => nav(`/campaigns/${c.id}/edit`)}>
                  Editar
                </Button>
              )}
              {c.status === 'paused' && (
                <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={() => act('campaigns.resume', '▶ Campaña reanudada')}>
                  {c.started_at ? 'Reanudar' : 'Iniciar'}
                </Button>
              )}
              {['running', 'scheduled'].includes(c.status) && (
                <Button icon={<Pause className="h-4 w-4" />} onClick={() => act('campaigns.pause', '⏸ Campaña en pausa')}>
                  Pausar
                </Button>
              )}
              {['running', 'paused', 'scheduled'].includes(c.status) && (
                <Button
                  variant="danger"
                  icon={<Square className="h-4 w-4" />}
                  onClick={async () => (await confirmDialog({ title: 'Detener campaña', body: `Se cancelarán ${fmtNum(s.pending)} envíos pendientes${c.recurrence ? ' y las próximas ejecuciones' : ''}. Lo ya enviado no se puede deshacer.`, danger: true, confirmText: 'Detener' })) && act('campaigns.cancel', '⏹ Campaña detenida')}
                >
                  Detener
                </Button>
              )}
              <Button variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={async () => { const r = await attempt(() => call<Campaign>('campaigns.duplicate', { id: c.id }), 'Duplicada'); if (r) nav(`/campaigns/${r.id}/edit`); }}>
                Duplicar
              </Button>
            </>
          )
        }
      />
      {c.status === 'paused' && c.pause_reason && (
        <InfoBox tone={c.pause_reason === 'user' ? 'info' : 'warn'} className="mb-5">
          <b>En pausa:</b> {pauseReasonText(c.pause_reason)}. No se enviará ningún mensaje hasta reanudar; al hacerlo continúa desde la cola pendiente.
          {c.pause_reason.startsWith('disconnected') && acc?.status !== 'connected' && ' Primero reconecte WhatsApp.'}
        </InfoBox>
      )}
      {c.status === 'running' && queue.data?.pausedUntil && (
        <InfoBox tone="warn" className="mb-5" icon={<Timer className="h-4 w-4" />}>
          WhatsApp limitó la velocidad de envío (RATE_LIMIT). La cola se reanuda automáticamente a las {new Date(queue.data.pausedUntil).toLocaleTimeString('es-CO')}.
        </InfoBox>
      )}
      {c.status === 'running' && acc?.status !== 'connected' && <InfoBox tone="danger" className="mb-5">🔴 WhatsApp desconectado. No se continuará enviando.</InfoBox>}
      {c.last_error && <InfoBox tone="danger" className="mb-5">{c.last_error}</InfoBox>}

      <div className="grid grid-cols-8 gap-3">
        {counters.map(([l, v, color, pct]) => (
          <div key={l} className="card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">{l}</p>
            <p className={cx('mt-1 text-2xl font-semibold tabular-nums', color)}>{fmtNum(v)}</p>
            {pct && <p className="text-xs text-muted">{pct}</p>}
          </div>
        ))}
      </div>
      <Card className="mt-5">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">Progreso</span>
          <span className="tabular-nums text-muted">
            {fmtNum(s.sent + s.failed + s.cancelled)} / {fmtNum(s.total - s.skipped)} procesados ({fmtPct((s.sent + s.failed + s.cancelled) / base)})
          </span>
        </div>
        <CampaignStatsBar c={c} />
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Leídos</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Entregados</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-700" />Enviados</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Fallidos</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Cancelados</span>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-[1fr_360px] gap-5">
        <Card
          title="Destinatarios"
          padded={false}
          actions={
            <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {['queued', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'skipped'].map((x) => (
                <option key={x} value={x}>
                  {MESSAGE_STATUS[x]}
                </option>
              ))}
            </Select>
          }
        >
          {!rec.data ? (
            <SkeletonRows rows={4} />
          ) : rec.data.length === 0 ? (
            <EmptyState title={c.status === 'scheduled' || c.status === 'draft' ? 'Aún no se generan los destinatarios' : 'Sin destinatarios con este estado'} body={c.status === 'scheduled' ? 'La lista se calcula al momento del envío, excluyendo opt-outs recientes.' : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/60 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2.5 pl-5">Contacto</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th className="pr-5 text-right">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {rec.data.map((r) => (
                  <tr key={r.id} className="table-row cursor-pointer" onClick={() => nav(`/contacts/${r.contact_id}`)}>
                    <td className="py-2 pl-5">
                      <p className="font-medium">{r.name || fmtPhone(r.phone)}</p>
                      <p className="text-xs text-muted">{fmtPhone(r.phone)}</p>
                    </td>
                    <td>
                      <Badge tone={TONE[r.status] ?? 'slate'}>{MESSAGE_STATUS[r.status] ?? r.status}</Badge>
                      {r.replied_at && <Badge tone="violet" className="ml-1">Respondió</Badge>}
                    </td>
                    <td className="max-w-[280px] truncate text-xs text-muted">{r.skip_reason ?? r.error_message ?? ''}</td>
                    <td className="pr-5 text-right text-xs text-muted">{fmtDateTime(r.read_at ?? r.delivered_at ?? r.sent_at ?? r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-5">
          <Card title="Mensaje">
            {c.message_type === 'template' ? <p className="text-sm text-muted">Plantilla aprobada (parámetros: {c.template_params?.join(', ')})</p> : <p className="whitespace-pre-wrap rounded-xl bg-elevated/50 p-3 text-sm">{c.body}</p>}
          </Card>
          <Card title="Detalles">
            <dl className="space-y-2 text-sm">
              {[
                ['Creada', fmtDateTime(c.created_at)],
                ['Confirmada', c.confirmed_at ? `${fmtDateTime(c.confirmed_at)} · ${fmtNum(c.confirmed_count)} destinatarios` : '—'],
                ['Programada', fmtDateTime(c.scheduled_at)],
                ['Iniciada', fmtDateTime(c.started_at)],
                ['Finalizada', fmtDateTime(c.completed_at)],
                ['Zona horaria', c.timezone],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-3">
                  <dt className="text-muted">{l}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {!!runs.data?.length && c.recurrence && (
            <Card title="Ejecuciones" padded={false}>
              <ul className="divide-y divide-line/50 text-sm">
                {runs.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-2.5">
                    <span>
                      #{r.run_number} · {fmtDateTime(r.started_at)}
                    </span>
                    <span className="text-xs text-muted">
                      {fmtNum(r.stats.sent)} env. · {fmtNum(r.stats.failed)} fall.
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

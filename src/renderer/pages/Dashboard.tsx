import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, CalendarClock, CheckCheck, ListChecks, Megaphone, MessageCircle, MessagesSquare, Plus, Send, TrendingUp, Users, Wifi } from 'lucide-react';
import { useQuery } from '../lib/api';
import { useStore } from '../lib/store';
import { CAMPAIGN_STATUS, fmtDateTime, fmtNum, fmtPct, relTime } from '../lib/format';
import type { Campaign, Conversation } from '@shared/types';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Progress, Skeleton, StatCard, StatusDot } from '../components/ui';

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="tabular-nums">{fmtNum(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

export function Dashboard() {
  const nav = useNavigate();
  const { user, can } = useStore();
  const d = useQuery<any>('stats.dashboard', { days: 30 }, { refreshOn: ['message.received', 'message.status', 'campaign.updated', 'account.status', 'contact.created'], debounceMs: 800 });
  const series = useQuery<any>(can('stats.view') ? 'stats.full' : null, { days: 14 }, { refreshOn: ['campaign.finished'], debounceMs: 2000 });
  const campaigns = useQuery<Campaign[]>(can('campaigns.view') ? 'campaigns.list' : null, {}, { refreshOn: ['campaign.updated', 'campaign.progress'], debounceMs: 800 });
  const convs = useQuery<{ rows: Conversation[] }>(can('inbox.view') ? 'inbox.list' : null, { filter: 'unanswered', limit: 6 }, { refreshOn: ['message.received', 'conversation.updated'], debounceMs: 600 });

  if (d.error) return <ErrorState error={d.error} onRetry={d.reload} className="mt-20" />;
  const s = d.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const active = campaigns.data?.filter((c) => ['running', 'paused', 'scheduled'].includes(c.status)).slice(0, 5) ?? [];

  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader
        title={`${greeting}, ${user?.display_name?.split(' ')[0] ?? ''}`}
        subtitle="Resumen de los últimos 30 días"
        actions={
          <>
            {can('campaigns.manage') && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/campaigns/new')}>
                Nueva campaña
              </Button>
            )}
            <Button icon={<MessageCircle className="h-4 w-4" />} onClick={() => nav('/inbox')}>
              Abrir inbox
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        {!s ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <StatCard icon={<Users className="h-5 w-5" />} label="Contactos" value={fmtNum(s.contacts)} hint={`+${fmtNum(s.newContacts)} nuevos`} onClick={() => nav('/contacts')} />
            <StatCard icon={<MessagesSquare className="h-5 w-5" />} label="Conversaciones" value={fmtNum(s.conversations)} hint={`${fmtNum(s.openConversations)} sin responder · ${fmtNum(s.unread)} no leídos`} tone="sky" onClick={() => nav('/inbox')} />
            <StatCard icon={<Send className="h-5 w-5" />} label="Mensajes enviados" value={fmtNum(s.sent)} hint={`${fmtPct(s.deliveryRate)} entregados · ${fmtPct(s.readRate)} leídos`} tone="violet" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Tasa de respuesta" value={fmtPct(s.responseRate)} hint={`${fmtNum(s.repliedContacts)} de ${fmtNum(s.messagedContacts)} contactos`} tone="amber" />
            <StatCard icon={<CalendarClock className="h-5 w-5" />} label="Campañas programadas" value={fmtNum(s.campaignsScheduled)} hint={`${fmtNum(s.campaignsRunning)} en curso o en pausa`} tone="sky" onClick={() => nav('/calendar')} />
            <StatCard icon={<Bot className="h-5 w-5" />} label="Automatizaciones activas" value={fmtNum(s.automationsActive)} hint={`${fmtNum(s.automationRuns)} ejecuciones`} tone="violet" onClick={() => nav('/automations')} />
            <StatCard icon={<ListChecks className="h-5 w-5" />} label="Seguimientos" value={fmtNum(s.tasksPending)} hint={s.tasksOverdue ? `${s.tasksOverdue} vencidos` : 'Al día'} tone={s.tasksOverdue ? 'rose' : 'emerald'} onClick={() => nav('/tasks')} />
            <StatCard
              icon={<Wifi className="h-5 w-5" />}
              label="WhatsApp"
              value={
                <span className="flex items-center gap-2 text-lg">
                  <StatusDot status={s.account.status} /> {s.account.status === 'connected' ? 'Conectado' : s.account.status === 'connecting' ? 'Conectando' : 'Desconectado'}
                </span>
              }
              hint={s.account.phone_number ? `+${s.account.phone_number} · ${fmtNum(s.queue.sentToday)} envíos hoy` : s.account.name}
              tone={s.account.status === 'connected' ? 'emerald' : 'rose'}
              onClick={() => nav('/settings/whatsapp')}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2" title="Actividad de mensajes" subtitle="Últimos 14 días">
          <div className="h-[260px]">
            {series.data ? (
              <ResponsiveContainer>
                <AreaChart data={series.data.series} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sent" name="Enviados" stroke="#10b981" strokeWidth={2} fill="url(#gSent)" />
                  <Area type="monotone" dataKey="received" name="Recibidos" stroke="#8b5cf6" strokeWidth={2} fill="url(#gRecv)" />
                  <Area type="monotone" dataKey="read" name="Leídos" stroke="#38bdf8" strokeWidth={1.5} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : can('stats.view') ? (
              <Skeleton className="h-full" />
            ) : (
              <EmptyState title="Sin permiso para estadísticas" />
            )}
          </div>
        </Card>
        <Card title="Esperando respuesta" subtitle="Conversaciones pendientes" padded={false} actions={<Button size="sm" variant="ghost" onClick={() => nav('/inbox')}>Ver todo</Button>}>
          {!convs.data ? (
            <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : convs.data.rows.length === 0 ? (
            <EmptyState icon={<CheckCheck className="h-6 w-6" />} title="¡Todo al día!" body="No hay conversaciones esperando respuesta." />
          ) : (
            <ul className="divide-y divide-line/50">
              {convs.data.rows.map((c) => (
                <li key={c.id} onClick={() => nav(`/inbox/${c.id}`)} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-elevated/50">
                  <Avatar name={c.contact_name} phone={c.contact_phone} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.contact_name || '+' + c.contact_phone}</p>
                    <p className="truncate text-xs text-muted">{c.last_message_preview}</p>
                  </div>
                  <span className="text-[11px] text-muted">{relTime(c.last_message_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6" title="Campañas activas" subtitle="En curso, en pausa y programadas" padded={false} actions={can('campaigns.view') && <Button size="sm" variant="ghost" onClick={() => nav('/campaigns')}>Ver campañas</Button>}>
        {!campaigns.data ? (
          <div className="p-5"><Skeleton className="h-16" /></div>
        ) : active.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-6 w-6" />} title="Sin campañas activas" body="Cree una campaña para enviar mensajes a un segmento de contactos." action={can('campaigns.manage') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav('/campaigns/new')}>Nueva campaña</Button>} />
        ) : (
          <ul className="divide-y divide-line/50">
            {active.map((c) => {
              const st = c.stats!;
              return (
                <li key={c.id} onClick={() => nav(`/campaigns/${c.id}`)} className="grid cursor-pointer grid-cols-[1fr_140px_1.2fr_120px] items-center gap-6 px-5 py-3.5 hover:bg-elevated/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">{c.status === 'scheduled' ? `Programada: ${fmtDateTime(c.next_run_at)}` : `${fmtNum(st.total)} contactos`}</p>
                  </div>
                  <Badge tone={CAMPAIGN_STATUS[c.status].tone} dot>
                    {CAMPAIGN_STATUS[c.status].label}
                  </Badge>
                  <Progress segments={[{ value: st.read, className: 'bg-sky-400' }, { value: st.delivered - st.read, className: 'bg-emerald-400' }, { value: st.sent - st.delivered, className: 'bg-emerald-600' }, { value: st.failed, className: 'bg-red-400' }, { value: st.pending, className: 'bg-transparent' }]} />
                  <span className="text-right text-sm tabular-nums text-muted">
                    {fmtNum(st.sent)} / {fmtNum(st.total - st.skipped)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn } from 'lucide-react';
import { useQuery } from '../lib/api';
import { CAMPAIGN_STATUS, fmtNum, fmtPct } from '../lib/format';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '../components/ui';
import { ChartTooltip } from './Dashboard';

export function Stats() {
  const nav = useNavigate();
  const [days, setDays] = useState('30');
  const q = useQuery<any>('stats.full', { days: Number(days) }, { refreshOn: ['campaign.finished'] });
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} className="mt-20" />;
  const d = q.data;
  const pct = (a: number, b: number) => (b ? fmtPct(a / b) : '—');
  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader icon={<ChartColumn className="h-5 w-5" />} title="Estadísticas" subtitle="Rendimiento de mensajes, campañas y automatizaciones" actions={<Tabs value={days} onChange={setDays} tabs={[{ id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }]} />} />
      {!d ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-6 gap-3">
            {[
              ['Enviados', fmtNum(d.summary.sent)],
              ['Entregados', `${fmtNum(d.summary.delivered)} · ${pct(d.summary.delivered, d.summary.sent)}`],
              ['Leídos', `${fmtNum(d.summary.read)} · ${pct(d.summary.read, d.summary.sent)}`],
              ['Tasa de respuesta', fmtPct(d.summary.responseRate)],
              ['Nuevos contactos', fmtNum(d.summary.newContacts)],
              ['Automatizaciones ejecutadas', fmtNum(d.summary.automationRuns)],
            ].map(([l, v]) => (
              <div key={l} className="card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted">{l}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-5">
            <Card className="col-span-2" title="Mensajes por día">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={d.series} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--elevated))' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sent" name="Enviados" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="received" name="Recibidos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Fallidos" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Contactos por etiqueta">
              <div className="h-72">
                {d.tags.some((t: any) => t.n > 0) ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={d.tags.filter((t: any) => t.n > 0)} dataKey="n" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} stroke="none">
                        {d.tags.filter((t: any) => t.n > 0).map((t: any) => (
                          <Cell key={t.name} fill={t.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="Sin contactos etiquetados" />
                )}
              </div>
            </Card>
          </div>
          <Card className="mt-5" title="Nuevos contactos y lecturas">
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={d.series} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="newContacts" name="Nuevos contactos" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="read" name="Leídos" stroke="#38bdf8" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="mt-5" title="Estadísticas por campaña" padded={false}>
            {d.campaigns.length === 0 ? (
              <EmptyState title="Sin campañas enviadas" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line/60 text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-2.5 pl-5">Campaña</th>
                    <th>Estado</th>
                    <th className="text-right">Contactos</th>
                    <th className="text-right">Enviados</th>
                    <th className="text-right">Entregados</th>
                    <th className="text-right">Leídos</th>
                    <th className="text-right">Respondidos</th>
                    <th className="text-right">Fallidos</th>
                    <th className="pr-5 text-right">Cancelados</th>
                  </tr>
                </thead>
                <tbody>
                  {d.campaigns.map((c: any) => (
                    <tr key={c.id} className="table-row cursor-pointer" onClick={() => nav(`/campaigns/${c.id}`)}>
                      <td className="py-2.5 pl-5 font-medium">{c.name}</td>
                      <td>
                        <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                      </td>
                      <td className="text-right tabular-nums">{fmtNum(c.total)}</td>
                      <td className="text-right tabular-nums">{fmtNum(c.sent)}</td>
                      <td className="text-right tabular-nums">
                        {fmtNum(c.delivered)} <span className="text-xs text-muted">{pct(c.delivered, c.sent)}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtNum(c.read)} <span className="text-xs text-muted">{pct(c.read, c.sent)}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {fmtNum(c.replied)} <span className="text-xs text-muted">{pct(c.replied, c.sent)}</span>
                      </td>
                      <td className="text-right tabular-nums text-red-400">{fmtNum(c.failed)}</td>
                      <td className="pr-5 text-right tabular-nums text-muted">{fmtNum(c.cancelled)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card className="mt-5" title="Automatizaciones" padded={false}>
            {d.automations.length === 0 ? (
              <EmptyState title="Sin automatizaciones" />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {d.automations.map((a: any) => (
                    <tr key={a.id} className="table-row cursor-pointer" onClick={() => nav(`/automations/${a.id}`)}>
                      <td className="py-2.5 pl-5 font-medium">{a.name}</td>
                      <td>
                        <Badge tone={a.enabled ? 'green' : 'slate'}>{a.enabled ? 'Activa' : 'Inactiva'}</Badge>
                      </td>
                      <td className="text-right tabular-nums">{fmtNum(a.run_count)} ejecuciones</td>
                      <td className="text-right tabular-nums text-sky-400">{fmtNum(a.waiting)} en espera</td>
                      <td className="pr-5 text-right tabular-nums text-red-400">{fmtNum(a.failed)} con error</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

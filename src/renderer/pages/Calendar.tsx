import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks, Megaphone, MessageSquare } from 'lucide-react';
import { call, useQuery } from '../lib/api';
import { attempt } from '../lib/store';
import { Button, IconButton, PageHeader, Tabs, cx } from '../components/ui';

type View = 'month' | 'week' | 'day';
interface Ev {
  id: string;
  kind: 'campaign' | 'scheduled_message' | 'task';
  refId: number;
  title: string;
  start: string;
  status: string;
  draggable: boolean;
  recurring?: boolean;
}

const KIND = {
  campaign: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', icon: Megaphone, label: 'Campañas' },
  scheduled_message: { cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40', icon: MessageSquare, label: 'Mensajes programados' },
  task: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: ListChecks, label: 'Seguimientos' },
};
const WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function CalendarPage() {
  const nav = useNavigate();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [kinds, setKinds] = useState<Set<string>>(new Set(['campaign', 'scheduled_message', 'task']));
  const range = useMemo(() => {
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const from = startOfWeek(first);
      return { from, to: addDays(from, 42) };
    }
    if (view === 'week') {
      const from = startOfWeek(cursor);
      return { from, to: addDays(from, 7) };
    }
    const from = startOfDay(cursor);
    return { from, to: addDays(from, 1) };
  }, [view, cursor]);
  const q = useQuery<Ev[]>('calendar.events', { from: range.from.toISOString(), to: range.to.toISOString() }, { refreshOn: ['campaign.updated', 'task.created'] });
  const events = (q.data ?? []).filter((e) => kinds.has(e.kind));

  const move = (step: number) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + step);
    else d.setDate(d.getDate() + (view === 'week' ? 7 : 1) * step);
    setCursor(d);
  };

  const drop = async (e: React.DragEvent, day: Date, hour?: number) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    const ev: Ev = JSON.parse(raw);
    const old = new Date(ev.start);
    const target = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? old.getHours(), hour !== undefined ? 0 : old.getMinutes());
    if (target.getTime() === old.getTime()) return;
    if (target < new Date()) return attempt(() => Promise.reject(new Error('No se puede mover un evento al pasado.')));
    await attempt(() => call('calendar.move', { kind: ev.kind, refId: ev.refId, start: target.toISOString() }), 'Evento reprogramado');
    void q.reload();
  };

  const open = (ev: Ev) => nav(ev.kind === 'campaign' ? `/campaigns/${ev.refId}` : ev.kind === 'task' ? '/tasks' : '/calendar');

  const Chip = ({ ev }: { ev: Ev }) => {
    const k = KIND[ev.kind];
    const Icon = k.icon;
    return (
      <div
        draggable={ev.draggable}
        onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify(ev))}
        onClick={(e) => (e.stopPropagation(), open(ev))}
        title={`${ev.title} — ${new Date(ev.start).toLocaleString('es-CO')}${ev.draggable ? ' (arrastre para mover)' : ''}`}
        className={cx('mb-1 flex cursor-pointer items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[11px]', k.cls, ev.draggable && 'cursor-grab active:cursor-grabbing', ['completed', 'done', 'cancelled'].includes(ev.status) && 'opacity-50')}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="shrink-0 tabular-nums opacity-80">{new Date(ev.start).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="truncate">{ev.title}</span>
      </div>
    );
  };

  const title = view === 'month' ? cursor.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) : view === 'week' ? `Semana del ${range.from.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : cursor.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto flex h-full max-w-[1500px] flex-col p-8">
      <PageHeader
        icon={<CalendarDays className="h-5 w-5" />}
        title="Calendario"
        subtitle="Campañas, mensajes programados y seguimientos. Arrastre para reprogramar."
        actions={<Tabs value={view} onChange={setView} tabs={[{ id: 'month', label: 'Mes' }, { id: 'week', label: 'Semana' }, { id: 'day', label: 'Día' }]} />}
      />
      <div className="mb-4 flex items-center gap-3">
        <IconButton title="Anterior" onClick={() => move(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <IconButton title="Siguiente" onClick={() => move(1)}>
          <ChevronRight className="h-5 w-5" />
        </IconButton>
        <Button size="sm" onClick={() => setCursor(new Date())}>
          Hoy
        </Button>
        <h2 className="text-lg font-semibold">{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
        <div className="flex-1" />
        {Object.entries(KIND).map(([k, v]) => (
          <button key={k} onClick={() => { const n = new Set(kinds); n.has(k) ? n.delete(k) : n.add(k); setKinds(n); }} className={cx('chip border', v.cls, !kinds.has(k) && 'opacity-40')}>
            <v.icon className="h-3 w-3" /> {v.label}
          </button>
        ))}
      </div>

      {view === 'month' ? (
        <div className="card grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] overflow-hidden">
          {WEEK.map((d) => (
            <div key={d} className="border-b border-line/60 px-3 py-2 text-xs font-medium text-muted">
              {d}
            </div>
          ))}
          {Array.from({ length: 42 }, (_, i) => addDays(range.from, i)).map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const today = sameDay(day, new Date());
            const evs = events.filter((e) => sameDay(new Date(e.start), day));
            return (
              <div key={day.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, day)} onDoubleClick={() => (setCursor(day), setView('day'))} className={cx('min-h-0 overflow-hidden border-b border-r border-line/40 p-1.5', !inMonth && 'bg-elevated/20 opacity-60')}>
                <div className={cx('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs', today ? 'bg-brand font-semibold text-white' : 'text-muted')}>{day.getDate()}</div>
                <div className="max-h-[calc(100%-28px)] overflow-y-auto">
                  {evs.map((e) => (
                    <Chip key={e.id} ev={e} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 grid border-b border-line/60 bg-surface/95" style={{ gridTemplateColumns: `60px repeat(${view === 'week' ? 7 : 1}, minmax(0,1fr))` }}>
            <div />
            {Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(range.from, i)).map((d) => (
              <div key={d.toISOString()} className={cx('px-3 py-2 text-xs font-medium', sameDay(d, new Date()) ? 'text-brand' : 'text-muted')}>
                {d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}
              </div>
            ))}
          </div>
          {HOURS.map((h) => (
            <div key={h} className="grid min-h-[52px] border-b border-line/30" style={{ gridTemplateColumns: `60px repeat(${view === 'week' ? 7 : 1}, minmax(0,1fr))` }}>
              <div className="px-2 pt-1 text-right text-[11px] text-muted">{String(h).padStart(2, '0')}:00</div>
              {Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(range.from, i)).map((d) => (
                <div key={d.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d, h)} className="border-l border-line/30 p-1">
                  {events
                    .filter((e) => {
                      const s = new Date(e.start);
                      return sameDay(s, d) && s.getHours() === h;
                    })
                    .map((e) => (
                      <Chip key={e.id} ev={e} />
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

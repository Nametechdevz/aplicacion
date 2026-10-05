import { DateTime } from 'luxon';
import type { Recurrence } from '../../shared/types';

/**
 * Calcula la siguiente ocurrencia estrictamente posterior a `after` (y no anterior a `start`) en la
 * zona horaria indicada. Devuelve null si la recurrencia terminó.
 */
export function nextOccurrence(rec: Recurrence, tz: string, start: Date, after: Date, runsSoFar = 0): Date | null {
  if (rec.maxRuns && runsSoFar >= rec.maxRuns) return null;
  const [hh, mm] = rec.time.split(':').map(Number);
  const startDt = DateTime.fromJSDate(start, { zone: tz });
  if (!startDt.isValid) throw new Error('Zona horaria inválida');
  const until = rec.until ? DateTime.fromISO(rec.until, { zone: tz }).endOf('day') : null;
  const interval = Math.max(1, Math.floor(rec.interval || 1));
  const afterDt = DateTime.fromJSDate(after, { zone: tz });
  let day = DateTime.max(startDt, afterDt.minus({ days: 1 })).startOf('day');
  const startDay = startDt.startOf('day');
  for (let i = 0; i < 3700; i++, day = day.plus({ days: 1 })) {
    const cand = day.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
    if (cand < startDt || cand <= afterDt) continue;
    if (until && cand > until) return null;
    if (matches(rec, cand, startDay, interval)) return cand.toJSDate();
  }
  return null;
}

function matches(rec: Recurrence, cand: DateTime, startDay: DateTime, interval: number): boolean {
  if (rec.freq === 'daily') {
    const diff = Math.round(cand.startOf('day').diff(startDay, 'days').days);
    return diff % interval === 0;
  }
  if (rec.freq === 'weekly') {
    const days = rec.byWeekday?.length ? rec.byWeekday : [startDay.weekday];
    if (!days.includes(cand.weekday)) return false;
    const weeks = Math.round(cand.startOf('week').diff(startDay.startOf('week'), 'weeks').weeks);
    return weeks % interval === 0;
  }
  // monthly
  const target = rec.byMonthDay ?? startDay.day;
  const dim = cand.daysInMonth ?? 31;
  const effective = Math.min(target, dim); // día 31 → último día en meses cortos
  if (cand.day !== effective) return false;
  const months = (cand.year - startDay.year) * 12 + (cand.month - startDay.month);
  return months % interval === 0;
}

export function describeRecurrence(rec: Recurrence): string {
  const names = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const every = rec.interval > 1 ? `cada ${rec.interval} ` : '';
  if (rec.freq === 'daily') return rec.interval > 1 ? `Cada ${rec.interval} días a las ${rec.time}` : `Todos los días a las ${rec.time}`;
  if (rec.freq === 'weekly') {
    const d = (rec.byWeekday ?? []).map((n) => names[n]).join(', ');
    return rec.interval > 1 ? `${every}semanas (${d}) a las ${rec.time}` : `Todos los ${d || 'semanas'} a las ${rec.time}`;
  }
  return rec.interval > 1 ? `Cada ${rec.interval} meses, día ${rec.byMonthDay ?? '—'} a las ${rec.time}` : `Cada mes, día ${rec.byMonthDay ?? '—'} a las ${rec.time}`;
}

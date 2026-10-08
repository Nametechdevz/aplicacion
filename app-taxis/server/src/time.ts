// Fechas en la zona horaria de la central (por defecto Colombia), independientemente de la del servidor.

function parts(tz: string, date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: 0 };
}

/** Instante (UTC) en que empieza el día local `addDays` días después del de `date`. */
export function zonedDayStart(tz: string, date = new Date(), addDays = 0): Date {
  const p = parts(tz, date);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + addDays) - offset);
}

/** Lunes de la semana local actual. */
export function zonedWeekStart(tz: string, date = new Date()): Date {
  const p = parts(tz, date);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = domingo
  return zonedDayStart(tz, date, -((weekday + 6) % 7));
}

/** Fecha local "AAAA-MM-DD". */
export function zonedDateKey(tz: string, date: Date): string {
  const p = parts(tz, date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

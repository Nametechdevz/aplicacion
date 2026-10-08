import { describe, expect, it } from 'vitest';
import { zonedDateKey, zonedDayStart, zonedWeekStart } from '../server/src/time';

describe('fechas en la zona horaria de la central', () => {
  const tz = 'America/Bogota'; // UTC-5, sin horario de verano

  it('el día local empieza a las 05:00 UTC en Bogotá', () => {
    // 8 oct 2026, 02:00 UTC = 7 oct 2026, 21:00 en Bogotá
    const d = new Date('2026-10-08T02:00:00Z');
    expect(zonedDateKey(tz, d)).toBe('2026-10-07');
    expect(zonedDayStart(tz, d).toISOString()).toBe('2026-10-07T05:00:00.000Z');
    expect(zonedDayStart(tz, d, 1).toISOString()).toBe('2026-10-08T05:00:00.000Z');
    expect(zonedDayStart(tz, d, -1).toISOString()).toBe('2026-10-06T05:00:00.000Z');
  });

  it('la semana empieza el lunes', () => {
    // jueves 8 oct 2026 a mediodía en Bogotá → lunes 5 oct
    expect(zonedWeekStart(tz, new Date('2026-10-08T17:00:00Z')).toISOString()).toBe('2026-10-05T05:00:00.000Z');
  });
});

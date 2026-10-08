import { describe, expect, it } from 'vitest';
import { DEFAULT_TARIFF, approximateRoute, calculateFare, formatMoney, haversineM } from '../shared/fare';
import { nextStatus } from '../shared/rideState';

describe('tarifa', () => {
  const t = { currency: 'USD', baseFare: 2, perKm: 1, perMinute: 0.5, minimumFare: 5, surge: 1, roundTo: 0.01 };

  it('suma base + distancia + tiempo', () => {
    expect(calculateFare(10_000, 1200, t)).toBe(22); // 2 + 10 + 10
  });

  it('aplica la tarifa mínima', () => {
    expect(calculateFare(500, 60, t)).toBe(5);
  });

  it('aplica el multiplicador de demanda', () => {
    expect(calculateFare(10_000, 1200, { ...t, surge: 1.5 })).toBe(33);
  });

  it('nunca aplica un multiplicador menor que 1', () => {
    expect(calculateFare(10_000, 1200, { ...t, surge: 0.5 })).toBe(22);
  });

  it('redondea a céntimos', () => {
    expect(calculateFare(1234, 321, t)).toBe(Math.round((2 + 1.234 + 5.35 * 0.5) * 100) / 100);
  });

  it('por defecto cobra en pesos colombianos redondeando a $100', () => {
    expect(DEFAULT_TARIFF.currency).toBe('COP');
    // 5.000 + 8 km × 1.200 + 20 min × 250 = 19.600
    expect(calculateFare(8000, 1200, DEFAULT_TARIFF)).toBe(19600);
    // 5.000 + 3,47 km × 1.200 + 9,5 min × 250 = 11.539 → 11.500
    expect(calculateFare(3470, 570, DEFAULT_TARIFF)).toBe(11500);
    // Trayecto muy corto: tarifa mínima
    expect(calculateFare(300, 60, DEFAULT_TARIFF)).toBe(8000);
  });

  it('muestra los pesos sin decimales', () => {
    expect(formatMoney(19600, 'COP').replace(/\s/g, ' ')).toBe('$ 19.600');
    expect(formatMoney(4.5, 'USD')).toContain('4,50');
  });
});

describe('geometría', () => {
  it('calcula distancias reales con haversine', () => {
    // Puerta del Sol → Plaza de Cibeles (Madrid): ~1,1 km
    const d = haversineM({ lat: 40.4169, lng: -3.7035 }, { lat: 40.4193, lng: -3.6931 });
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(1000);
  });

  it('estima una ruta aproximada más larga que la línea recta', () => {
    const a = { lat: 19.4326, lng: -99.1332 };
    const b = { lat: 19.4204, lng: -99.1622 };
    const r = approximateRoute(a, b);
    expect(r.distanceM).toBeGreaterThan(haversineM(a, b));
    expect(r.durationS).toBeGreaterThan(0);
  });
});

describe('máquina de estados del viaje', () => {
  it('sigue el flujo completo', () => {
    expect(nextStatus('requested', 'accept', 'driver')).toBe('accepted');
    expect(nextStatus('accepted', 'arrive', 'driver')).toBe('arrived');
    expect(nextStatus('arrived', 'start', 'driver')).toBe('in_progress');
    expect(nextStatus('in_progress', 'complete', 'driver')).toBe('completed');
  });

  it('rechaza transiciones inválidas', () => {
    expect(nextStatus('requested', 'complete', 'driver')).toBeNull();
    expect(nextStatus('requested', 'accept', 'passenger')).toBeNull();
    expect(nextStatus('completed', 'cancel', 'passenger')).toBeNull();
    expect(nextStatus('in_progress', 'cancel', 'passenger')).toBeNull();
    expect(nextStatus('requested', 'cancel', 'driver')).toBeNull();
  });

  it('permite cancelar antes de iniciar y a la central en cualquier momento activo', () => {
    expect(nextStatus('requested', 'cancel', 'passenger')).toBe('cancelled');
    expect(nextStatus('arrived', 'cancel', 'driver')).toBe('cancelled');
    expect(nextStatus('in_progress', 'cancel', 'admin')).toBe('cancelled');
    expect(nextStatus('requested', 'expire', 'system')).toBe('expired');
  });
});

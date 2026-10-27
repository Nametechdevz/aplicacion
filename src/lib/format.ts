// Utilidades de formato: pesos colombianos y fechas locales (YYYY-MM-DD)

export function pesos(valor: number): string {
  const n = Math.round(valor || 0);
  const signo = n < 0 ? '-' : '';
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$ ${s}`;
}

/** Convierte texto del usuario ("1.250.000", "$ 80000") a número */
export function parsePesos(texto: string): number {
  const limpio = texto.replace(/[^\d]/g, '');
  return limpio ? parseInt(limpio, 10) : 0;
}

export function parseDecimal(texto: string): number | null {
  const t = texto.replace(',', '.').replace(/[^\d.]/g, '');
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function hoy(): string {
  return toISO(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + dias);
  return toISO(d);
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaLarga(iso: string): string {
  const d = fromISO(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export function fechaCorta(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** DD/MM/AAAA -> YYYY-MM-DD (o null si no es válida) */
export function parseFechaTexto(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) return null;
  return toISO(d);
}

export function fechaTexto(iso: string): string {
  const d = fromISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Semana de lunes a domingo que contiene la fecha dada */
export function semanaDe(iso: string): { inicio: string; fin: string } {
  const d = fromISO(iso);
  const dia = d.getDay(); // 0 = domingo
  const desdeLunes = dia === 0 ? 6 : dia - 1;
  const inicio = sumarDias(iso, -desdeLunes);
  return { inicio, fin: sumarDias(inicio, 6) };
}

export function rango(inicio: string, fin: string): string {
  return `${fechaCorta(inicio)} – ${fechaCorta(fin)} ${fromISO(fin).getFullYear()}`;
}

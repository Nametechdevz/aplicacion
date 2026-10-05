const dtf = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const df = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });
const tf = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' });
const nf = new Intl.NumberFormat('es-CO');

export const fmtDateTime = (s?: string | null) => (s ? dtf.format(new Date(s)) : '—');
export const fmtDate = (s?: string | null) => (s ? df.format(new Date(s)) : '—');
export const fmtTime = (s?: string | null) => (s ? tf.format(new Date(s)) : '');
export const fmtNum = (n?: number | null) => nf.format(n ?? 0);
export const fmtPct = (n: number) => `${(n * 100).toFixed(n < 0.1 && n > 0 ? 1 : 0)}%`;
export const fmtPhone = (p?: string | null) => (p ? '+' + p : '');
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function relTime(s?: string | null): string {
  if (!s) return '';
  const d = new Date(s);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24 && d.getDate() === new Date().getDate()) return tf.format(d);
  if (h < 48) return 'ayer';
  if (h < 24 * 7) return new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(d);
  return df.format(d);
}

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Borrador', tone: 'slate' },
  scheduled: { label: 'Programada', tone: 'blue' },
  running: { label: 'Enviando', tone: 'green' },
  paused: { label: 'En pausa', tone: 'amber' },
  completed: { label: 'Completada', tone: 'emerald' },
  cancelled: { label: 'Detenida', tone: 'slate' },
  failed: { label: 'Fallida', tone: 'red' },
};

export const PAUSE_REASONS: Record<string, string> = {
  user: 'Pausada por un usuario',
  disconnected: 'WhatsApp se desconectó durante el envío',
  disconnected_at_schedule: 'WhatsApp estaba desconectado a la hora programada',
  missed_schedule: 'La aplicación estaba cerrada a la hora programada',
  too_many_recipients: 'Supera el máximo de destinatarios por envío',
};

export const MESSAGE_STATUS: Record<string, string> = {
  queued: 'En cola',
  sending: 'Enviando',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Fallido',
  cancelled: 'Cancelado',
  received: 'Recibido',
  skipped: 'Excluido',
};

export const CONSENT: Record<string, string> = { unknown: 'Sin registrar', opted_in: 'Aceptó (opt-in)', opted_out: 'No contactar (opt-out)' };

export function initials(name?: string | null, phone?: string | null) {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return phone ? phone.slice(-2) : '?';
}

export function hashColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

/** Convierte un valor "YYYY-MM-DDTHH:mm" de un input datetime-local a ISO UTC. */
export const localInputToIso = (v: string) => (v ? new Date(v).toISOString() : null);
export function isoToLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Normalización de teléfonos a formato E.164 sin '+' (solo dígitos), que es el formato
 * que usa la WhatsApp Cloud API (`wa_id`).
 */
export interface PhoneResult {
  ok: boolean;
  e164?: string; // solo dígitos, con código de país
  reason?: string;
}

export function normalizePhone(raw: string | number | null | undefined, defaultCountryCode = ''): PhoneResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'Número vacío' };
  let s = String(raw).trim();
  if (!s) return { ok: false, reason: 'Número vacío' };
  if (/[a-z]/i.test(s.replace(/^(tel:|whatsapp:)/i, ''))) return { ok: false, reason: 'Contiene letras' };
  s = s.replace(/^(tel:|whatsapp:)/i, '');
  const hasPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!hasPlus && defaultCountryCode) {
    const cc = defaultCountryCode.replace(/\D/g, '');
    // Número nacional: agregar código de país por defecto si no lo trae.
    if (cc && !digits.startsWith(cc)) digits = cc + digits.replace(/^0+/, '');
    else if (cc && digits.startsWith(cc) && digits.length <= 10) digits = cc + digits; // ej. número local que empieza igual que el código
  }
  if (digits.length < 8) return { ok: false, reason: 'Número demasiado corto' };
  if (digits.length > 15) return { ok: false, reason: 'Número demasiado largo' };
  if (digits.startsWith('0')) return { ok: false, reason: 'Falta el código de país' };
  return { ok: true, e164: digits };
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  return '+' + e164;
}

export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = String(e164);
  return d.length <= 4 ? '****' : '+' + d.slice(0, 2) + '*'.repeat(Math.max(0, d.length - 6)) + d.slice(-4);
}

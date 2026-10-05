/**
 * Motor de variables para mensajes: {{nombre}}, {{empresa}}, {{campo_personalizado}}…
 * Se usa tanto en el main (envío real) como en el renderer (vista previa) para garantizar que la
 * vista previa sea exactamente lo que se enviará.
 */
export interface VariableContact {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  custom?: Record<string, string | null | undefined>;
}

export const BUILTIN_VARIABLES: { key: string; label: string }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellido', label: 'Apellido' },
  { key: 'nombre_completo', label: 'Nombre completo' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'fecha', label: 'Fecha de hoy' },
  { key: 'hora', label: 'Hora actual' },
];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ.-]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

export interface RenderResult {
  text: string;
  missing: string[];
}

/**
 * Reemplaza variables. Soporta valor por defecto: {{nombre|cliente}}.
 * Las variables sin valor y sin defecto se reemplazan por cadena vacía y se reportan en `missing`.
 */
export function renderTemplate(text: string, contact: VariableContact, now: Date = new Date(), locale = 'es-CO', timeZone?: string): RenderResult {
  const missing: string[] = [];
  const first = contact.first_name || (contact.name ? contact.name.trim().split(/\s+/)[0] : '');
  const last = contact.last_name || (contact.name && !contact.first_name ? contact.name.trim().split(/\s+/).slice(1).join(' ') : '');
  const base: Record<string, string> = {
    nombre: first || '',
    apellido: last || '',
    nombre_completo: contact.name || [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    telefono: contact.phone ? '+' + contact.phone : '',
    email: contact.email || '',
    empresa: contact.company || '',
    fecha: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(now),
    hora: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(now),
  };
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(contact.custom ?? {})) if (v !== null && v !== undefined) custom[k.toLowerCase()] = String(v);
  const result = text.replace(VAR_RE, (_all, rawKey: string, def?: string) => {
    const key = rawKey.toLowerCase();
    const val = (custom[key] !== undefined && custom[key] !== '' ? custom[key] : base[key]) ?? '';
    if (val !== '') return val;
    if (def !== undefined) return def;
    missing.push(key);
    return '';
  });
  return { text: result.replace(/[ \t]{2,}/g, ' '), missing: [...new Set(missing)] };
}

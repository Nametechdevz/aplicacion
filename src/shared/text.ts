/** Normaliza texto para comparaciones: minúsculas, sin acentos, espacios colapsados. */
export function normalizeText(input: string | null | undefined): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '…';
}

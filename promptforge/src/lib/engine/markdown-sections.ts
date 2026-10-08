export interface MdSection {
  /** Línea de encabezado completa ("## SEGURIDAD") o "" para el preámbulo. */
  heading: string;
  title: string;
  body: string;
}

/** Divide un documento Markdown en secciones de nivel 2 (##). */
export function splitSections(text: string): MdSection[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: MdSection[] = [];
  let current: MdSection = { heading: '', title: '', body: '' };
  const buf: string[] = [];
  const flush = () => {
    current.body = buf.join('\n').replace(/\n+-{3,}\s*$/g, '').replace(/^\s*-{3,}\s*\n/, '').trim();
    if (current.heading || current.body) sections.push(current);
    buf.length = 0;
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('###')) {
      flush();
      current = { heading: line.trim(), title: m[1].trim(), body: '' };
    } else {
      buf.push(line);
    }
  }
  flush();
  // Quitar separadores sueltos al final de cada cuerpo
  return sections.map((s) => ({ ...s, body: s.body.replace(/(\n\s*-{3,}\s*)+$/g, '').trim() }));
}

export function joinSections(sections: MdSection[]): string {
  return (
    sections
      .map((s) => (s.heading ? `${s.heading}\n${s.body ? `${s.body}` : ''}` : s.body).trim())
      .filter(Boolean)
      .join('\n\n---\n\n')
      .replace(/\n{3,}/g, '\n\n') + '\n'
  );
}

export function findSection(sections: MdSection[], pattern: RegExp): MdSection | undefined {
  return sections.find((s) => pattern.test(s.title));
}

export function countBullets(text: string): number {
  return (text.match(/^\s*(?:[-*]|\d+\.)\s+\S/gm) ?? []).length;
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function countKeywords(text: string, keywords: string[]): number {
  const t = stripAccents(text);
  return keywords.filter((k) => t.includes(stripAccents(k))).length;
}

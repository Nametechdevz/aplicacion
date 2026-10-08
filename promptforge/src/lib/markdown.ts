/**
 * Renderizador de Markdown mínimo y seguro para la vista previa de prompts.
 * Todo el texto se escapa antes de aplicar formato, por lo que no se puede inyectar HTML.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  let table: string[][] | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(
      `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`,
    );
    table = null;
  };
  const flushAll = () => {
    flushPara();
    closeList();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      closeList();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // separador de cabecera
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      table = table ?? [];
      table.push(cells);
      continue;
    }
    flushTable();
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushAll();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if (/^\s*-{3,}\s*$/.test(line)) {
      flushAll();
      out.push('<hr/>');
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushAll();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
      flushPara();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // continuación de un elemento de lista
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, `<br/>${inline(line.trim())}</li>`);
    } else {
      closeList();
      para.push(line);
    }
  }
  flushAll();
  return out.join('\n');
}

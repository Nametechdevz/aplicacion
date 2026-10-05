import { useRef } from 'react';
import { Braces } from 'lucide-react';
import { BUILTIN_VARIABLES } from '@shared/variables';
import type { CustomField } from '@shared/types';
import { EmojiPicker } from './EmojiPicker';
import { Dropdown, IconButton, Textarea } from './ui';

/** Editor de mensaje con inserción de variables {{...}} y emojis. */
export function VariableTextarea({ value, onChange, fields = [], placeholder, rows = 6, maxLength = 4096 }: { value: string; onChange: (v: string) => void; fields?: CustomField[]; placeholder?: string; rows?: number; maxLength?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return onChange(value + text);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + text.length;
    });
  };
  const vars = [...BUILTIN_VARIABLES, ...fields.map((f) => ({ key: f.key, label: f.label }))];
  return (
    <div className="rounded-xl border border-line bg-elevated/40 focus-within:border-brand/60">
      <Textarea ref={ref as any} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="border-0 bg-transparent focus:ring-0" />
      <div className="flex items-center justify-between border-t border-line/60 px-2 py-1">
        <div className="flex items-center gap-1">
          <EmojiPicker onPick={insert} />
          <Dropdown
            align="left"
            trigger={
              <IconButton type="button" title="Insertar variable">
                <Braces className="h-4 w-4" />
              </IconButton>
            }
            items={vars.map((v) => ({ label: <span className="flex w-full justify-between gap-4"><span>{v.label}</span><code className="text-xs text-muted">{`{{${v.key}}}`}</code></span>, onClick: () => insert(`{{${v.key}}}`) }))}
          />
          <span className="ml-1 text-[11px] text-muted">Variables: {'{{nombre}}'}, valor por defecto: {'{{nombre|cliente}}'}</span>
        </div>
        <span className="text-[11px] tabular-nums text-muted">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}

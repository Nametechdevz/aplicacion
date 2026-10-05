import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { Contact } from '@shared/types';
import { useQuery } from '../lib/api';
import { fmtPhone } from '../lib/format';
import { Avatar, Button, Checkbox, Input, Modal, SkeletonRows, TagChip } from './ui';

/** Selección manual de contactos (múltiple o única). */
export function ContactPicker({ open, onClose, onDone, initial = [], single }: { open: boolean; onClose: () => void; onDone: (ids: number[], contacts: Contact[]) => void; initial?: number[]; single?: boolean }) {
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Map<number, Contact>>(new Map());
  useEffect(() => {
    if (open) setSel(new Map(initial.map((i) => [i, { id: i } as Contact])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const q = useQuery<{ rows: Contact[]; total: number }>(open ? 'contacts.list' : null, { search, limit: 100, sort: 'name', sortDir: 'asc' });
  const toggle = (c: Contact) => {
    if (single) return onDone([c.id], [c]);
    const n = new Map(sel);
    n.has(c.id) ? n.delete(c.id) : n.set(c.id, c);
    setSel(n);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={single ? 'Seleccionar contacto' : 'Seleccionar contactos'}
      footer={
        !single && (
          <>
            <span className="mr-auto text-sm text-muted">{sel.size} seleccionados</span>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => onDone([...sel.keys()], [...sel.values()])}>
              Usar selección
            </Button>
          </>
        )
      }
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input autoFocus className="pl-9" placeholder="Buscar por nombre, número o empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.loading && !q.data ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="divide-y divide-line/50 rounded-xl border border-line/60">
          {q.data?.rows.map((c) => (
            <div key={c.id} onClick={() => toggle(c)} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-elevated/60">
              {!single && <Checkbox checked={sel.has(c.id)} onChange={() => toggle(c)} />}
              <Avatar name={c.name} phone={c.phone} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name || fmtPhone(c.phone)}</p>
                <p className="text-xs text-muted">{fmtPhone(c.phone)}</p>
              </div>
              <div className="flex max-w-[45%] flex-wrap justify-end gap-1">{c.tags?.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} small />)}</div>
            </div>
          ))}
          {q.data && q.data.total > 100 && <p className="px-3 py-2 text-xs text-muted">Mostrando 100 de {q.data.total}. Refine la búsqueda.</p>}
        </div>
      )}
    </Modal>
  );
}

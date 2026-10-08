'use client';

import { History, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Badge, Button, cn, EmptyState, scoreTone, Skeleton } from '@/components/ui/primitives';
import { api, formatDate } from '@/lib/client';
import { VARIANT_LABEL, type Variant } from '@/lib/engine/types';

interface Version {
  id: string;
  variant: Variant;
  content: string;
  qualityScore: number;
  note: string;
  createdAt: string;
}

export function HistoryDrawer({ promptId, open, onClose, onRestore, refreshKey }: { promptId: string; open: boolean; onClose: () => void; onRestore: (v: Version) => void; refreshKey: number }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setError(null);
    api<{ versions: Version[] }>(`/api/prompts/${promptId}/versions`, { signal: ctrl.signal })
      .then((r) => {
        setVersions(r.versions);
        setSelected(r.versions[0]?.id ?? null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => ctrl.abort();
  }, [open, promptId, refreshKey]);

  const current = versions?.find((v) => v.id === selected);

  return (
    <Modal open={open} onClose={onClose} title="Historial de versiones" description="Cada guardado crea una versión. Puedes restaurar cualquiera en el editor." side>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !versions ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="Sin versiones" description="Guarda el prompt para crear la primera versión." />
      ) : (
        <div className="space-y-4">
          <ol className="space-y-1.5">
            {versions.map((v, i) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelected(v.id)}
                  className={cn('w-full rounded-xl border px-3 py-2.5 text-left transition-colors', selected === v.id ? 'border-accent/50 bg-accent-soft' : 'border-border hover:bg-surface-2')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                      <Badge tone="neutral">{VARIANT_LABEL[v.variant]}</Badge>
                      {v.note || 'Edición'}
                    </span>
                    {v.qualityScore > 0 && <Badge tone={scoreTone(v.qualityScore)}>{v.qualityScore}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(v.createdAt, true)} {i === 0 && '· más reciente'} · {v.content.split(/\s+/).length.toLocaleString('es')} palabras
                  </p>
                </button>
              </li>
            ))}
          </ol>
          {current && (
            <div className="rounded-xl border border-border bg-code p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-text-2">Vista previa</p>
                <Button size="sm" variant="primary" icon={<RotateCcw className="size-3.5" />} onClick={() => onRestore(current)}>
                  Restaurar en el editor
                </Button>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-text-2">{current.content.slice(0, 6000)}</pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

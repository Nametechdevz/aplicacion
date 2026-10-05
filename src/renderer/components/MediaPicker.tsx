import { useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast } from '../lib/store';
import { MediaThumb } from './MediaThumb';
import { Button, EmptyState, Modal, SkeletonRows, Tabs, cx } from './ui';

/** Selector de archivos de la biblioteca multimedia (con opción de subir nuevos). */
export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: MediaItem) => void }) {
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'document' | 'audio'>('all');
  const q = useQuery<MediaItem[]>(open ? 'media.list' : null, kind === 'all' ? {} : { kind });
  const upload = async () => {
    const r = await attempt(() => call<{ imported: MediaItem[]; errors: string[] }>('media.pick'));
    if (!r) return;
    r.errors.forEach((e) => toast.error('Archivo no admitido', e));
    if (r.imported.length) {
      await q.reload();
      if (r.imported.length === 1) onPick(r.imported[0]);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Biblioteca multimedia" subtitle="Elija un archivo para adjuntar" footer={<Button icon={<Upload className="h-4 w-4" />} onClick={upload}>Subir archivo</Button>}>
      <Tabs className="mb-4" value={kind} onChange={setKind} tabs={[{ id: 'all', label: 'Todo' }, { id: 'image', label: 'Imágenes' }, { id: 'video', label: 'Videos' }, { id: 'document', label: 'Documentos' }, { id: 'audio', label: 'Audio' }]} />
      {q.loading && !q.data ? (
        <SkeletonRows rows={3} />
      ) : !q.data?.length ? (
        <EmptyState icon={<ImagePlus className="h-6 w-6" />} title="Sin archivos" body="Suba imágenes, videos o documentos para reutilizarlos en campañas y conversaciones." />
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {q.data.map((m) => (
            <button key={m.id} onClick={() => onPick(m)} className={cx('group overflow-hidden rounded-xl border border-line text-left transition hover:border-brand')}>
              <div className="flex h-28 items-center justify-center bg-elevated">{m.kind === 'image' ? <MediaThumb media={m} /> : <MediaThumb media={m} className="m-2 w-full" />}</div>
              <p className="truncate px-2 py-1.5 text-xs">{m.title || m.file_name}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

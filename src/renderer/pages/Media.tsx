import { useState } from 'react';
import { Download, Image, Pencil, Trash2, Upload } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { call, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import { fmtBytes, fmtDate } from '../lib/format';
import { MediaThumb, mediaUrl } from '../components/MediaThumb';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, SkeletonRows, Tabs, confirmDialog } from '../components/ui';

export function MediaPage() {
  const { can } = useStore();
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'document' | 'audio'>('all');
  const q = useQuery<MediaItem[]>('media.list', kind === 'all' ? {} : { kind });
  const limits = useQuery<any>('media.limits');
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [rename, setRename] = useState<MediaItem | null>(null);
  const [title, setTitle] = useState('');
  const upload = async () => {
    const r = await attempt(() => call<{ imported: MediaItem[]; errors: string[] }>('media.pick'));
    if (!r) return;
    r.errors.forEach((e) => toast.error('Archivo no admitido', e));
    if (r.imported.length) toast.success(`${r.imported.length} archivo(s) agregados`);
    void q.reload();
  };
  const mb = (n?: number) => (n ? `${Math.round(n / 1048576)} MB` : '');
  return (
    <div className="mx-auto max-w-[1400px] p-8">
      <PageHeader
        icon={<Image className="h-5 w-5" />}
        title="Media"
        subtitle="Biblioteca reutilizable para campañas, automatizaciones y conversaciones"
        actions={
          can('templates.manage') && (
            <Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={upload}>
              Subir archivos
            </Button>
          )
        }
      />
      <div className="mb-4 flex items-center justify-between">
        <Tabs value={kind} onChange={setKind} tabs={[{ id: 'all', label: 'Todo' }, { id: 'image', label: 'Imágenes' }, { id: 'video', label: 'Videos' }, { id: 'document', label: 'Documentos' }, { id: 'audio', label: 'Audio' }]} />
        {limits.data && (
          <p className="text-xs text-muted">
            Límites de WhatsApp: imágenes JPG/PNG {mb(limits.data.image.maxBytes)} · videos MP4 {mb(limits.data.video.maxBytes)} · audio {mb(limits.data.audio.maxBytes)} · documentos {mb(limits.data.document.maxBytes)}
          </p>
        )}
      </div>
      {!q.data ? (
        <SkeletonRows />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Image className="h-6 w-6" />} title="Biblioteca vacía" body="Suba imágenes, videos, PDF, DOCX, XLSX y más para reutilizarlos." action={can('templates.manage') && <Button onClick={upload} icon={<Upload className="h-4 w-4" />}>Subir archivos</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {q.data.map((m) => (
            <div key={m.id} className="card group overflow-hidden">
              <button onClick={() => setPreview(m)} className="flex h-36 w-full items-center justify-center bg-elevated/60">
                {m.kind === 'image' ? <MediaThumb media={m} /> : <MediaThumb media={m} className="pointer-events-none m-3 w-full" />}
              </button>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{m.title || m.file_name}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    {fmtBytes(m.size)} · {fmtDate(m.created_at)}
                  </span>
                  {!!m.usage_count && <Badge tone="blue">{m.usage_count} usos</Badge>}
                </div>
                <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <a href={mediaUrl(m.id, true)} download={m.file_name} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-fg" title="Descargar">
                    <Download className="h-4 w-4" />
                  </a>
                  {can('templates.manage') && (
                    <>
                      <IconButton title="Renombrar" onClick={() => (setRename(m), setTitle(m.title ?? m.file_name))}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton title="Eliminar" onClick={async () => (await confirmDialog({ title: 'Eliminar archivo', body: 'Si se usó en conversaciones, se conserva en el historial pero sale de la biblioteca.', danger: true, confirmText: 'Eliminar' })) && attempt(() => call('media.delete', { id: m.id }).then(q.reload), 'Archivo eliminado')}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} size="lg" title={preview?.title || preview?.file_name}>
        {preview && (
          <div className="flex justify-center">
            <MediaThumb media={preview} large className="max-h-[60vh]" />
          </div>
        )}
      </Modal>
      <Modal open={!!rename} onClose={() => setRename(null)} size="sm" title="Renombrar" footer={<Button variant="primary" onClick={() => attempt(() => call('media.rename', { id: rename!.id, title }).then(() => (setRename(null), q.reload())))}>Guardar</Button>}>
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

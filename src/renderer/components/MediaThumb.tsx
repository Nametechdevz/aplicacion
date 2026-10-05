import { FileText, Music, Video, File } from 'lucide-react';
import type { MediaRef } from '@shared/types';
import { fmtBytes } from '../lib/format';
import { cx } from './ui';

export const mediaUrl = (id: number, download = false) => `wcrm-media://${id}/${download ? '?download=1' : ''}`;

export function MediaThumb({ media, className, large }: { media: Pick<MediaRef, 'id' | 'kind' | 'file_name' | 'mime_type' | 'size'>; className?: string; large?: boolean }) {
  if (media.kind === 'image' || media.mime_type?.startsWith('image/')) {
    return <img src={mediaUrl(media.id)} alt={media.file_name} loading="lazy" className={cx('rounded-xl object-cover', large ? 'max-h-72 max-w-full' : 'h-full w-full', className)} />;
  }
  if (large && media.kind === 'video') return <video src={mediaUrl(media.id)} controls className={cx('max-h-72 rounded-xl', className)} />;
  if (large && (media.kind === 'audio' || media.mime_type?.startsWith('audio/'))) return <audio src={mediaUrl(media.id)} controls className={cx('w-64', className)} />;
  const Icon = media.kind === 'video' ? Video : media.kind === 'audio' ? Music : media.mime_type === 'application/pdf' ? FileText : File;
  return (
    <a href={mediaUrl(media.id, true)} download={media.file_name} className={cx('flex items-center gap-3 rounded-xl bg-black/10 p-3 hover:bg-black/20', className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{media.file_name}</p>
        <p className="text-xs opacity-70">{fmtBytes(media.size)}</p>
      </div>
    </a>
  );
}

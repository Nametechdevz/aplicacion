import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LibraryView } from '@/components/library/library-view';
import { PageHeader } from '@/components/ui/primitives';
import { listPrompts } from '@/lib/server/repos/prompts';
import { requireUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Biblioteca' };

export default async function LibraryPage() {
  const user = await requireUser();
  const prompts = listPrompts(user.id, { sort: 'updated' });
  return (
    <>
      <PageHeader
        eyebrow="Biblioteca"
        title="Tus prompts"
        description="Busca, filtra, edita, duplica y copia tus prompts maestros."
        actions={
          <Link href="/new" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
            <Plus className="size-4" /> Nuevo prompt
          </Link>
        }
      />
      <LibraryView initial={prompts} />
    </>
  );
}

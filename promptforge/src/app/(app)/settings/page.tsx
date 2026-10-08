import type { Metadata } from 'next';
import { SettingsView } from '@/components/settings/settings-view';
import { PageHeader } from '@/components/ui/primitives';
import { env } from '@/lib/server/env';
import { listAudit } from '@/lib/server/repos/audit';
import { getSettings, listUserTemplates } from '@/lib/server/repos/settings';
import { requireUser } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Configuración' };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Configuración" title="Preferencias" description="Tema, idioma, generación, modelo de IA, plantillas, exportaciones y cuenta." />
      <SettingsView
        initial={getSettings(user.id)}
        aiAvailable={env.anthropicConfigured}
        user={{ name: user.name, email: user.email, role: user.role }}
        templatesCount={listUserTemplates(user.id).length}
        audit={listAudit(user.id, 12)}
      />
    </>
  );
}

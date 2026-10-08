import { AppShell } from '@/components/shell/app-shell';
import { getSettings } from '@/lib/server/repos/settings';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = getSettings(user.id);
  return (
    <AppShell user={{ name: user.name, email: user.email }} theme={settings.theme}>
      {children}
    </AppShell>
  );
}

import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { AppShell } from './layout/AppShell';
import { Toaster } from './components/Toaster';
import { ConfirmHost, Spinner } from './components/ui';
import { Login, Setup } from './pages/Auth';
import { Onboarding } from './pages/settings/WhatsAppSettings';
import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Contacts } from './pages/Contacts';
import { ContactDetail } from './pages/ContactDetail';
import { Campaigns } from './pages/Campaigns';
import { CampaignWizard } from './pages/CampaignWizard';
import { CampaignDetail } from './pages/CampaignDetail';
import { CalendarPage } from './pages/Calendar';
import { Automations } from './pages/Automations';
import { AutomationBuilder } from './pages/AutomationBuilder';
import { AiPage } from './pages/Ai';
import { Templates } from './pages/Templates';
import { MediaPage } from './pages/Media';
import { Pipeline } from './pages/Pipeline';
import { Tasks } from './pages/Tasks';
import { Stats } from './pages/Stats';
import { Settings } from './pages/settings/Settings';

export function App() {
  const { ready, hasUsers, user, accounts, bootstrap, setSession } = useStore();
  useEffect(() => {
    void bootstrap();
    const out = () => setSession(null, null);
    window.addEventListener('wcrm:logout', out);
    return () => window.removeEventListener('wcrm:logout', out);
  }, [bootstrap, setSession]);

  let body;
  if (!ready) body = <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  else if (!hasUsers) body = <Setup />;
  else if (!user) body = <Login />;
  else if (!accounts.length) body = <Onboarding />;
  else
    body = (
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:id" element={<Inbox />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<CampaignWizard />} />
          <Route path="/campaigns/:id/edit" element={<CampaignWizard />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/automations/new" element={<AutomationBuilder />} />
          <Route path="/automations/:id" element={<AutomationBuilder />} />
          <Route path="/ai" element={<AiPage />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/crm" element={<Pipeline />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:tab" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    );
  return (
    <>
      {body}
      <Toaster />
      <ConfirmHost />
    </>
  );
}

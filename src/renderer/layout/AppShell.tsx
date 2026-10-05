import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bot,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  FileText,
  Image,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  Plus,
  Settings,
  SquareKanban,
  Sun,
  Users,
  Workflow,
} from 'lucide-react';
import { call, useAppEvent, useQuery } from '../lib/api';
import { attempt, toast, useStore } from '../lib/store';
import type { Permission } from '@shared/permissions';
import { Avatar, Button, Dropdown, Field, Input, Modal, StatusDot, cx } from '../components/ui';
import { ROLE_LABELS } from '@shared/permissions';

const NAV: { to: string; label: string; icon: ReactNode; perm?: Permission; badge?: 'unread' }[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
  { to: '/inbox', label: 'Inbox', icon: <MessageCircle className="h-[18px] w-[18px]" />, perm: 'inbox.view', badge: 'unread' },
  { to: '/contacts', label: 'Contactos', icon: <Users className="h-[18px] w-[18px]" />, perm: 'contacts.view' },
  { to: '/campaigns', label: 'Campañas', icon: <Megaphone className="h-[18px] w-[18px]" />, perm: 'campaigns.view' },
  { to: '/calendar', label: 'Calendario', icon: <CalendarDays className="h-[18px] w-[18px]" />, perm: 'campaigns.view' },
  { to: '/automations', label: 'Automatizaciones', icon: <Workflow className="h-[18px] w-[18px]" />, perm: 'automations.view' },
  { to: '/ai', label: 'IA y conocimiento', icon: <Bot className="h-[18px] w-[18px]" />, perm: 'automations.view' },
  { to: '/templates', label: 'Plantillas', icon: <FileText className="h-[18px] w-[18px]" />, perm: 'inbox.view' },
  { to: '/media', label: 'Media', icon: <Image className="h-[18px] w-[18px]" />, perm: 'inbox.view' },
  { to: '/crm', label: 'CRM', icon: <SquareKanban className="h-[18px] w-[18px]" />, perm: 'contacts.view' },
  { to: '/tasks', label: 'Tareas', icon: <ListChecks className="h-[18px] w-[18px]" />, perm: 'tasks.manage' },
  { to: '/stats', label: 'Estadísticas', icon: <ChartColumn className="h-[18px] w-[18px]" />, perm: 'stats.view' },
  { to: '/settings', label: 'Configuración', icon: <Settings className="h-[18px] w-[18px]" /> },
];

const STATUS_LABEL: Record<string, string> = { connected: 'Conectado', connecting: 'Conectando', disconnected: 'Desconectado', error: 'Error de credenciales', qr_required: 'Escanear QR' };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, accounts, accountId, switchAccount, refreshAccounts, setSession, can, theme, setTheme } = useStore();
  const nav = useNavigate();
  const acc = accounts.find((a) => a.id === accountId);
  const unread = useQuery<{ unread: number }>('stats.dashboard', { days: 1 }, { refreshOn: ['message.received', 'conversation.updated'], debounceMs: 600 });
  const [pwOpen, setPwOpen] = useState(false);

  useAppEvent(['account.status'], (ev) => {
    void refreshAccounts();
    const name = accounts.find((a) => a.id === ev.data.accountId)?.name ?? 'WhatsApp';
    if (ev.data.status === 'connected' && ev.data.previous !== 'connected') toast.success(`🟢 ${name}: conexión restaurada`);
    if ((ev.data.status === 'disconnected' || ev.data.status === 'error') && ev.data.previous === 'connected') toast.error(`🔴 ${name}: WhatsApp desconectado`, ev.data.detail ?? 'Las campañas en curso se pausaron.');
  });
  useAppEvent(['toast'], (ev) => useStore.getState().toast({ title: ev.data.title, body: ev.data.body, kind: ev.data.kind, route: ev.data.route }));
  useEffect(() => window.api.onNavigate((r) => nav(r)), [nav]);

  const logout = async () => {
    await attempt(() => call('auth.logout'));
    setSession(null, null);
  };
  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await attempt(() => call('settings.set', { key: 'appearance', value: { theme: next } }));
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-[244px] shrink-0 flex-col border-r border-line/60 bg-surface/50 backdrop-blur-xl">
        <div className="drag flex h-14 items-center gap-2.5 px-5 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/30">
            <MessageCircle className="h-[18px] w-[18px] text-white" fill="white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">WhatsApp CRM</p>
            <p className="text-[10px] uppercase tracking-widest text-muted">Business Suite</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition',
                  isActive ? 'bg-gradient-to-r from-emerald-500/15 to-transparent text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
                  <span className={cx(isActive ? 'text-brand' : 'text-muted group-hover:text-fg')}>{n.icon}</span>
                  <span className="flex-1">{n.label}</span>
                  {n.badge === 'unread' && !!unread.data?.unread && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread.data.unread > 99 ? '99+' : unread.data.unread}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line/60 p-3">
          <Dropdown
            align="left"
            trigger={
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-elevated/60">
                <Avatar name={user?.display_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user?.display_name}</p>
                  <p className="text-[11px] text-muted">{user ? ROLE_LABELS[user.role] : ''}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
            }
            items={[
              { label: theme === 'dark' ? 'Tema claro' : 'Tema oscuro', icon: theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, onClick: toggleTheme },
              { label: 'Cambiar contraseña', icon: <KeyRound className="h-4 w-4" />, onClick: () => setPwOpen(true) },
              'sep',
              { label: 'Cerrar sesión', icon: <LogOut className="h-4 w-4" />, onClick: logout, danger: true },
            ]}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="drag flex h-14 shrink-0 items-center gap-3 border-b border-line/60 bg-surface/30 px-6 pr-[160px] backdrop-blur-xl">
          <div className="no-drag">
            <Dropdown
              align="left"
              trigger={
                <button className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-elevated/50 px-3 py-1.5 text-sm transition hover:bg-elevated">
                  <StatusDot status={acc?.status ?? 'disconnected'} />
                  <span className="font-medium">{acc?.name ?? 'Sin cuenta'}</span>
                  <span className="text-xs text-muted">
                    {STATUS_LABEL[acc?.status ?? 'disconnected']}
                    {acc?.phone_number ? ` · +${acc.phone_number}` : ''}
                  </span>
                  {acc?.provider === 'baileys' && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">QR</span>}
                  {acc?.provider === 'simulator' && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-300">Simulador</span>}
                  <ChevronDown className="h-4 w-4 text-muted" />
                </button>
              }
              items={[
                ...accounts.map((a) => ({
                  label: (
                    <span className="flex items-center gap-2">
                      <StatusDot status={a.status} /> {a.name} <span className="text-xs text-muted">{a.phone_number ? '+' + a.phone_number : a.provider === 'simulator' ? 'simulador' : a.provider === 'baileys' ? 'QR' : ''}</span>
                    </span>
                  ),
                  onClick: async () => {
                    await switchAccount(a.id);
                    nav('/');
                  },
                })),
                'sep' as const,
                ...(can('accounts.manage') ? [{ label: 'Agregar cuenta de WhatsApp', icon: <Plus className="h-4 w-4" />, onClick: () => nav('/settings/whatsapp?new=1') }] : []),
                { label: 'Gestionar conexión', icon: <Settings className="h-4 w-4" />, onClick: () => nav('/settings/whatsapp') },
              ]}
            />
          </div>
          {acc && acc.status !== 'connected' && acc.status !== 'connecting' && (
            <Button size="sm" variant="subtle" className="no-drag" onClick={() => attempt(() => call('accounts.connect', { accountId: acc.id }).then(refreshAccounts), 'Conectado')}>
              Reconectar
            </Button>
          )}
          <div className="flex-1" />
        </header>
        {acc?.status === 'qr_required' && (
          <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm">
            <span className="font-medium">📱 Vincule su WhatsApp: escanee el código QR para conectar "{acc.name}".</span>
            <Button size="sm" variant="subtle" onClick={() => nav('/settings/whatsapp')}>
              Ver código QR
            </Button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const save = async () => {
    if (next !== rep) return toast.error('Las contraseñas no coinciden');
    const ok = await attempt(() => call('auth.changePassword', { current: cur, next }), 'Contraseña actualizada');
    if (ok !== undefined) {
      setCur('');
      setNext('');
      setRep('');
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Cambiar contraseña" footer={<Button variant="primary" onClick={save} disabled={!cur || next.length < 8}>Guardar</Button>}>
      <div className="space-y-4">
        <Field label="Contraseña actual">
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, con letras y números.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Repetir nueva contraseña">
          <Input type="password" value={rep} onChange={(e) => setRep(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

import { create } from 'zustand';
import type { SessionUser, WhatsAppAccount } from '@shared/types';
import type { Permission } from '@shared/permissions';
import { call } from './api';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: 'success' | 'error' | 'info' | 'warning' | string;
  route?: string;
}

interface State {
  ready: boolean;
  hasUsers: boolean;
  user: SessionUser | null;
  accountId: number | null;
  accounts: WhatsAppAccount[];
  toasts: Toast[];
  theme: 'dark' | 'light';
  bootstrap(): Promise<void>;
  setSession(user: SessionUser | null, accountId: number | null): void;
  refreshAccounts(): Promise<void>;
  switchAccount(id: number): Promise<void>;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
  setTheme(t: 'dark' | 'light'): void;
  can(p: Permission): boolean;
}

let tid = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  hasUsers: true,
  user: null,
  accountId: null,
  accounts: [],
  toasts: [],
  theme: 'dark',
  async bootstrap() {
    const s = await call<{ hasUsers: boolean; user: SessionUser | null; accountId: number | null; accounts: WhatsAppAccount[] }>('auth.status');
    set({ ready: true, hasUsers: s.hasUsers, user: s.user, accountId: s.accountId, accounts: s.accounts });
    if (s.user) {
      try {
        const ap = await call<{ theme: 'dark' | 'light' }>('settings.get', { key: 'appearance' });
        get().setTheme(ap.theme);
      } catch {
        /* sin cuenta todavía */
      }
    }
  },
  setSession(user, accountId) {
    set({ user, accountId });
  },
  async refreshAccounts() {
    const accounts = await call<WhatsAppAccount[]>('accounts.list');
    let accountId = get().accountId;
    if ((!accountId || !accounts.some((a) => a.id === accountId)) && accounts.length) {
      accountId = accounts[0].id;
      await call('session.setAccount', { accountId });
    }
    set({ accounts, accountId: accounts.length ? accountId : null });
  },
  async switchAccount(id) {
    await call('session.setAccount', { accountId: id });
    set({ accountId: id });
  },
  toast(t) {
    const id = ++tid;
    set({ toasts: [...get().toasts, { ...t, id }].slice(-5) });
    window.setTimeout(() => get().dismiss(id), t.kind === 'error' ? 8000 : 4500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
  setTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  can(p) {
    return !!get().user?.permissions.includes(p);
  },
}));

export const toast = {
  success: (title: string, body?: string) => useStore.getState().toast({ title, body, kind: 'success' }),
  error: (title: string, body?: string) => useStore.getState().toast({ title, body, kind: 'error' }),
  info: (title: string, body?: string) => useStore.getState().toast({ title, body, kind: 'info' }),
  warning: (title: string, body?: string) => useStore.getState().toast({ title, body, kind: 'warning' }),
};

/** Ejecuta una acción mostrando el error de forma amigable. Devuelve undefined si falló. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) toast.success(success);
    return r;
  } catch (e: any) {
    toast.error('No se pudo completar', e?.message ?? 'Error desconocido');
    return undefined;
  }
}

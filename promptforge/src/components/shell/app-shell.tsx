'use client';

import { LayoutDashboard, LayoutTemplate, Library, LogOut, Menu, Monitor, Moon, Plus, Settings, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button, cn, Kbd } from '@/components/ui/primitives';
import { api } from '@/lib/client';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { href: '/prompts', label: 'Biblioteca', icon: Library, match: (p: string) => p.startsWith('/prompts') },
  { href: '/templates', label: 'Plantillas', icon: LayoutTemplate, match: (p: string) => p.startsWith('/templates') },
  { href: '/settings', label: 'Configuración', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

type Theme = 'system' | 'light' | 'dark';

/** Guarda el tema en las preferencias del usuario (además de la cookie). */
async function persistTheme(theme: Theme) {
  try {
    const { settings } = await api<{ settings: Record<string, unknown> }>('/api/settings');
    await api('/api/settings', { method: 'PUT', body: { ...settings, theme } });
  } catch {
    // La cookie ya refleja el cambio; si falla, se reintenta la próxima vez que se guarde.
  }
}

export function applyTheme(theme: Theme) {
  document.cookie = `pf_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyTheme('system');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [theme]);
  const opts: { v: Theme; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Tema claro' },
    { v: 'dark', icon: Moon, label: 'Tema oscuro' },
    { v: 'system', icon: Monitor, label: 'Tema del sistema' },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label="Tema">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          role="radio"
          aria-checked={theme === v}
          aria-label={label}
          title={label}
          onClick={() => {
            setTheme(v);
            applyTheme(v);
            void persistTheme(v);
          }}
          className={cn('grid h-7 flex-1 place-items-center rounded-md transition-colors', theme === v ? 'bg-surface text-text shadow-[var(--shadow-sm)]' : 'text-muted hover:text-text')}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function SidebarContent({ user, theme, onNavigate }: { user: { name: string; email: string }; theme: Theme; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { body: {} });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5">
        <Link href="/" onClick={onNavigate} className="inline-flex rounded-lg">
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        <Link
          href="/new"
          onClick={onNavigate}
          className="group flex h-10 items-center justify-between rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[0_1px_0_rgba(255,255,255,0.18)_inset] transition-colors hover:bg-accent-hover"
        >
          <span className="flex items-center gap-2">
            <Plus className="size-4" /> Nuevo prompt
          </span>
          <span className="rounded border border-white/25 px-1 font-mono text-[10px] opacity-80">N</span>
        </Link>
      </div>
      <nav className="mt-5 space-y-0.5 px-3" aria-label="Principal">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
                active ? 'bg-surface-2 font-medium text-text' : 'text-text-2 hover:bg-surface-2/60 hover:text-text',
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
              <Icon className={cn('size-4', active ? 'text-accent' : 'text-muted')} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 border-t border-border p-3">
        <ThemeToggle initial={theme} />
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold uppercase text-text">{user.name.slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-text">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} loading={loggingOut} aria-label="Cerrar sesión" title="Cerrar sesión">
            {!loggingOut && <LogOut className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ user, theme, children }: { user: { name: string; email: string }; theme: Theme; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Atajo global: "N" abre un nuevo prompt (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        router.push('/new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface/60 lg:block">
        <SidebarContent user={user} theme={theme} />
      </aside>

      {/* Barra superior móvil */}
      <header className="glass sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border px-4 lg:hidden">
        <Link href="/" aria-label="Inicio">
          <Logo compact />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg">
            <Plus className="size-4" /> Nuevo
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}>
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="animate-fade-up absolute inset-y-0 left-0 w-[86%] max-w-[300px] border-r border-border bg-surface shadow-[var(--shadow-lg)]">
            <Button variant="ghost" size="icon" className="absolute right-2 top-3" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </Button>
            <SidebarContent user={user} theme={theme} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
        <footer className="mx-auto hidden max-w-[1400px] px-10 pb-8 text-xs text-muted lg:block">
          Pulsa <Kbd>N</Kbd> para crear un prompt nuevo.
        </footer>
      </main>
    </div>
  );
}

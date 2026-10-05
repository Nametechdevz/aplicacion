import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import clsx from 'clsx';
import { AlertTriangle, ChevronDown, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import type { Tag } from '@shared/types';
import { hashColor, initials } from '../lib/format';

export const cx = clsx;

// ---------------- Botones ----------------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        variant === 'primary' && 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_8px_20px_-8px_rgba(16,185,129,.7)] hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-elevated/70 text-fg hover:bg-elevated',
        variant === 'ghost' && 'text-muted hover:bg-elevated/70 hover:text-fg',
        variant === 'subtle' && 'bg-brand/10 text-brand hover:bg-brand/20',
        variant === 'danger' && 'bg-danger/90 text-white hover:bg-danger',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ className, title, children, active, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      title={title}
      aria-label={title}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-elevated hover:text-fg disabled:opacity-40', active && 'bg-elevated text-fg', className)}
    >
      {children}
    </button>
  );
}

// ---------------- Formularios ----------------
export function Field({ label, hint, error, children, className }: { label?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = ({ className, ...p }: React.ComponentProps<'input'>) => <input {...p} className={cx('input', className)} />;
export const Textarea = ({ className, ...p }: React.ComponentProps<'textarea'>) => <textarea {...p} className={cx('input min-h-[90px] resize-y leading-relaxed', className)} />;

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('relative', className)}>
      <select {...p} className="input appearance-none pr-9">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {(label || hint) && (
        <span>
          {label && <span className="block text-sm">{label}</span>}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, onChange, indeterminate, className }: { checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()} className={cx('h-4 w-4 cursor-pointer rounded accent-emerald-500', className)} />;
}

// ---------------- Presentación ----------------
const TONES: Record<string, string> = {
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 ring-slate-500/20',
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25',
  blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 ring-sky-500/25',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/25',
  red: 'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/25',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 ring-violet-500/25',
};
export function Badge({ tone = 'slate', children, className, dot }: { tone?: string; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('chip ring-1 ring-inset', TONES[tone] ?? TONES.slate, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function TagChip({ tag, onRemove, small }: { tag: Pick<Tag, 'name' | 'color' | 'emoji'>; onRemove?: () => void; small?: boolean }) {
  return (
    <span className={cx('chip max-w-[180px] border', small && 'px-1.5 text-[10px]')} style={{ background: tag.color + '22', borderColor: tag.color + '55', color: tag.color }}>
      {tag.emoji ? <span>{tag.emoji}</span> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />}
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button onClick={onRemove} className="-mr-0.5 rounded-full p-0.5 hover:bg-black/20" aria-label={`Quitar ${tag.name}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function Avatar({ name, phone, size = 36, className }: { name?: string | null; phone?: string | null; size?: number; className?: string }) {
  const seed = name || phone || '?';
  return (
    <div className={cx('flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)} style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${hashColor(seed)}, ${hashColor(seed + 'x')})` }}>
      {initials(name, phone)}
    </div>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const c = status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : status === 'qr_required' ? 'bg-sky-400' : 'bg-red-400';
  return <span className={cx('inline-block h-2 w-2 rounded-full', c, status === 'connected' && 'shadow-[0_0_0_3px_rgba(52,211,153,.2)]', className)} />;
}

export function Card({ title, subtitle, actions, children, className, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('card animate-fade-in', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold">{title}</h3>}
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={cx(padded && 'p-5')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 text-brand ring-1 ring-inset ring-white/5">{icon}</div>}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function StatCard({ icon, label, value, hint, tone = 'emerald', onClick }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: 'emerald' | 'violet' | 'sky' | 'amber' | 'rose'; onClick?: () => void }) {
  const ring: Record<string, string> = {
    emerald: 'from-emerald-500/25 to-emerald-500/5 text-emerald-400',
    violet: 'from-violet-500/25 to-violet-500/5 text-violet-400',
    sky: 'from-sky-500/25 to-sky-500/5 text-sky-400',
    amber: 'from-amber-500/25 to-amber-500/5 text-amber-400',
    rose: 'from-rose-500/25 to-rose-500/5 text-rose-400',
  };
  return (
    <button onClick={onClick} disabled={!onClick} className="card group flex items-start gap-4 p-5 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-brand/40 disabled:cursor-default">
      <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', ring[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
      </div>
    </button>
  );
}

export function Progress({ segments, className }: { segments: { value: number; className: string; label?: string }[]; className?: string }) {
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
  return (
    <div className={cx('flex h-2.5 w-full overflow-hidden rounded-full bg-elevated', className)}>
      {segments.map((s, i) => (
        <div key={i} title={s.label} className={cx('h-full transition-all duration-500', s.className)} style={{ width: `${(s.value / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-violet-500/15 text-brand ring-1 ring-inset ring-white/5">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: { message: string } | null; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/15 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="font-semibold">No se pudo cargar</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{error?.message ?? 'Error desconocido'}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-xl border border-line/70 bg-elevated/50 p-1', className)}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition', value === t.id ? 'bg-surface text-fg shadow' : 'text-muted hover:text-fg')}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-elevated px-1.5 text-[10px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------- Modales ----------------
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', closeOnBackdrop = true }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; closeOnBackdrop?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}>
      <div className={cx('card flex max-h-full w-full flex-col bg-surface/95', size === 'sm' && 'max-w-md', size === 'md' && 'max-w-xl', size === 'lg' && 'max-w-3xl', size === 'xl' && 'max-w-5xl')} role="dialog" aria-modal>
        {title && (
          <div className="flex items-start justify-between gap-4 border-b border-line/60 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
            </div>
            <IconButton title="Cerrar" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full flex-col border-l border-line bg-surface shadow-2xl animate-fade-in" style={{ width }}>
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3.5 pt-12">
          <div className="min-w-0 font-semibold">{title}</div>
          <IconButton title="Cerrar" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

interface ConfirmReq {
  title: string;
  body?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  requireText?: string;
  resolve: (v: boolean) => void;
}
const useConfirm = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Diálogo de confirmación. Con `requireText`, el usuario debe escribir el texto para confirmar (acciones críticas). */
export function confirmDialog(o: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...o, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirm();
  const [text, setText] = useState('');
  useEffect(() => setText(''), [req]);
  if (!req) return null;
  const close = (v: boolean) => {
    req.resolve(v);
    set(null);
  };
  const blocked = !!req.requireText && text.trim() !== req.requireText;
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(false)}
      title={req.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={req.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus={!req.requireText}>
            {req.confirmText ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-muted">
        {req.body}
        {req.requireText && (
          <Field label={`Escriba "${req.requireText}" para confirmar`}>
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !blocked && close(true)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------------- Menú desplegable ----------------
export function Dropdown({ trigger, items, align = 'right' }: { trigger: ReactNode; items: ({ label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'sep')[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={(e) => (e.stopPropagation(), setOpen(!open))}>{trigger}</div>
      {open && (
        <div className={cx('absolute z-30 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-2xl animate-fade-in', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={i} className="my-1 h-px bg-line/60" />
            ) : (
              <button
                key={i}
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-elevated disabled:opacity-40', it.danger && 'text-danger')}
              >
                {it.icon && <span className="h-4 w-4 shrink-0 opacity-80">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function InfoBox({ tone = 'info', children, className, icon }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; className?: string; icon?: ReactNode }) {
  const t = { info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200', warn: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200', danger: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200', ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' }[tone];
  return <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', t, className)}>{icon && <span className="mt-0.5 shrink-0">{icon}</span>}<div className="min-w-0 flex-1">{children}</div></div>;
}

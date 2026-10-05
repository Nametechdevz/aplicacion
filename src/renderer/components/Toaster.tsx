import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { cx } from './ui';

export function Toaster() {
  const { toasts, dismiss } = useStore();
  const nav = useNavigate();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'warning' ? TriangleAlert : Info;
        return (
          <div
            key={t.id}
            onClick={() => t.route && (nav(t.route), dismiss(t.id))}
            className={cx('card pointer-events-auto flex items-start gap-3 bg-surface/95 p-4 animate-fade-in', t.route && 'cursor-pointer')}
          >
            <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', t.kind === 'success' && 'text-emerald-400', t.kind === 'error' && 'text-red-400', t.kind === 'warning' && 'text-amber-400', (t.kind === 'info' || t.kind === 'message' || t.kind === 'task') && 'text-sky-400')} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-3 text-xs text-muted">{t.body}</p>}
            </div>
            <button onClick={(e) => (e.stopPropagation(), dismiss(t.id))} className="text-muted hover:text-fg" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

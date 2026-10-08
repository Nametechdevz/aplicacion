import { useState, type ReactNode } from 'react';
import { formatMoney } from '../../../shared/fare';

export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="stars" role={onChange ? 'radiogroup' : undefined} aria-label="Valoración">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= shown ? 'star on' : 'star'}
          style={{ fontSize: size }}
          disabled={!onChange}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange?.(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Rating({ value }: { value: number | null }) {
  return <span className="rating">★ {value === null ? 'Nuevo' : value.toFixed(1).replace('.', ',')}</span>;
}

export function Money({ amount, currency }: { amount: number; currency: string }) {
  return <>{formatMoney(amount, currency)}</>;
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Alert({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'info' | 'success' }) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return <div className="avatar">{initials}</div>;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

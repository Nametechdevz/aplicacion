'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/primitives';

/** Barras verticales de una sola serie (prompts creados por día) con tooltip al pasar el cursor. */
export function ActivityChart({ data }: { data: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return (
    <figure>
      <div className="relative">
        {/* líneas guía */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 border-t border-dashed border-border" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-[72px] border-t border-dashed border-border" aria-hidden />
        <span className="absolute -top-2 right-0 bg-surface pl-1 font-mono text-[10px] text-muted">{max}</span>
        <div className="flex h-36 items-end gap-[2px] border-b border-border-strong" role="list" aria-label="Prompts creados por día">
          {data.map((d, i) => (
            <div
              key={d.day}
              role="listitem"
              aria-label={`${fmt(d.day)}: ${d.count} prompts`}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={cn('w-full max-w-7 rounded-t-[4px] transition-colors', d.count ? (hover === i ? 'bg-accent-hover' : 'bg-accent') : 'bg-surface-3')}
                style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : '3px' }}
              />
              {hover === i && (
                <div className="absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs shadow-[var(--shadow)]">
                  <p className="text-muted">{fmt(d.day)}</p>
                  <p className="font-medium text-text">
                    {d.count} prompt{d.count === 1 ? '' : 's'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted">
          <span>{fmt(data[0].day)}</span>
          <span>{fmt(data[data.length - 1].day)}</span>
        </div>
      </div>
      <figcaption className="sr-only">{total} prompts creados en los últimos 14 días.</figcaption>
    </figure>
  );
}

/** Barras horizontales de magnitud (prompts por categoría). */
export function CategoryBars({ data }: { data: { category: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.category} title={`${d.category}: ${d.count} (${Math.round((d.count / total) * 100)} %)`}>
          <div className="mb-1 flex items-baseline justify-between text-[13px]">
            <span className="text-text">{d.category}</span>
            <span className="font-mono text-xs text-text-2">
              {d.count} <span className="text-muted">· {Math.round((d.count / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

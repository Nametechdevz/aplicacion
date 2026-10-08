import { cn } from '@/lib/cn';

/** Marca de PROMPTFORGE AI: yunque + chispa. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative grid size-8 place-items-center rounded-[10px] bg-text text-bg shadow-[var(--shadow-sm)]', className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-[22px]">
        <path d="M8 19h16l-2 4H10z" fill="var(--accent)" />
        <path d="M6 12h20v3c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4z" fill="currentColor" />
        <path d="M17 4l-2.2 4.6h3L16 12.4l4.2-5.6h-3.1L18.6 4z" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-tight text-text">PromptForge</span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">AI · Claude Code</span>
        </span>
      )}
    </span>
  );
}

'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Campo rápido del dashboard: envía la idea directamente al asistente. */
export function QuickStart() {
  const router = useRouter();
  const [idea, setIdea] = useState('');
  const go = () => {
    const v = idea.trim();
    router.push(v.length >= 8 ? `/new?idea=${encodeURIComponent(v.slice(0, 4000))}` : '/new');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="flex flex-col gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-[var(--shadow)] focus-within:border-accent/60 sm:flex-row sm:items-center"
    >
      <Sparkles className="ml-2 hidden size-5 shrink-0 text-accent sm:block" aria-hidden />
      <input
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        maxLength={4000}
        placeholder="Describe tu proyecto: “Quiero un SaaS de facturación con planes y API…”"
        aria-label="Describe tu proyecto"
        className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-text outline-none placeholder:text-muted"
      />
      <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover">
        Forjar prompt <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

'use client';

import { CircleCheck, CircleDashed, CircleMinus, CircleX } from 'lucide-react';
import { cn } from '@/components/ui/primitives';
import type { QualityReport } from '@/lib/engine/types';

const levelColor: Record<QualityReport['level'], string> = {
  ready: 'var(--success)',
  good: 'var(--steel)',
  incomplete: 'var(--warning)',
  weak: 'var(--danger)',
};

export function ScoreRing({ score, level, size = 64 }: { score: number; level: QualityReport['level']; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Puntuación ${score} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={levelColor[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[15px] font-semibold text-text">{score}</span>
    </div>
  );
}

const statusIcon = {
  pass: <CircleCheck className="size-4 text-success" aria-label="Cumple" />,
  partial: <CircleDashed className="size-4 text-warning" aria-label="Parcial" />,
  fail: <CircleX className="size-4 text-danger" aria-label="No cumple" />,
  na: <CircleMinus className="size-4 text-muted" aria-label="No aplica" />,
};

export function QualityPanel({ report, compact = false }: { report: QualityReport; compact?: boolean }) {
  return (
    <section aria-labelledby="quality-title">
      <div className="flex items-center gap-4">
        <ScoreRing score={report.score} level={report.level} />
        <div className="min-w-0">
          <p id="quality-title" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Prompt Quality Score
          </p>
          <p className="mt-1 text-[15px] font-semibold text-text">
            {report.score}/100 <span className="font-normal text-text-2">— {report.label}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {report.stats.words.toLocaleString('es')} palabras · ~{report.stats.approxTokens.toLocaleString('es')} tokens · {report.stats.sections} secciones
          </p>
        </div>
      </div>
      {!compact && (
        <>
          <ul className="mt-5 space-y-1">
            {report.checks.map((c) => (
              <li key={c.id} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2" title={c.hint || undefined}>
                <span className="mt-px">{statusIcon[c.status]}</span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[13px]', c.status === 'na' ? 'text-muted' : 'text-text')}>{c.label}</p>
                  {c.hint && c.status !== 'pass' && <p className="mt-0.5 text-xs text-muted">{c.hint}</p>}
                </div>
                <span className="font-mono text-[11px] text-muted">{c.status === 'na' ? 'n/a' : `${c.points}/${c.weight}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

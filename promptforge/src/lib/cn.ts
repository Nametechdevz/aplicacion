import { clsx, type ClassValue } from 'clsx';

export const cn = (...v: ClassValue[]) => clsx(v);

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'steel';

/** Color semántico de una puntuación de calidad. */
export function scoreTone(score: number): Tone {
  return score >= 90 ? 'success' : score >= 75 ? 'steel' : score >= 50 ? 'warning' : 'danger';
}

'use client';

import { Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Textarea } from '@/components/ui/primitives';
import type { ProjectSpec } from '@/lib/engine/types';

type Phase = 'idle' | 'streaming' | 'done' | 'error';

export function AiImproveModal({
  open,
  onClose,
  text,
  spec,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  spec: ProjectSpec | null;
  onApply: (improved: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [output, setOutput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!open) {
      ctrl.current?.abort();
      setOutput('');
      setPhase('idle');
      setMessage(null);
    }
  }, [open]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output]);

  async function run() {
    setOutput('');
    setMessage(null);
    setPhase('streaming');
    const c = new AbortController();
    ctrl.current = c;
    try {
      const res = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, spec, instructions: instructions.trim() || undefined }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; text?: string; message?: string; stopReason?: string; outputTokens?: number; model?: string };
          if (ev.t === 'delta' && ev.text) setOutput((o) => o + ev.text);
          else if (ev.t === 'error') throw new Error(ev.message ?? 'Error de la IA');
          else if (ev.t === 'done') {
            finished = true;
            setPhase('done');
            setMessage(
              ev.stopReason === 'max_tokens'
                ? 'La respuesta se cortó por longitud: revisa el final antes de aplicarla.'
                : `Completado con ${ev.model} · ${ev.outputTokens?.toLocaleString('es')} tokens generados.`,
            );
          }
        }
      }
      if (!finished) throw new Error('La conexión se cerró antes de terminar.');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase('idle');
        setMessage('Generación detenida.');
      } else {
        setPhase('error');
        setMessage((e as Error).message);
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Mejorar con IA (Claude)"
      description="Claude revisa el prompt completo y devuelve una versión mejorada. Podrás revisarla antes de aplicarla."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {phase === 'streaming' ? (
            <Button variant="outline" icon={<Square className="size-3.5" />} onClick={() => ctrl.current?.abort()}>
              Detener
            </Button>
          ) : (
            <Button variant={phase === 'done' ? 'outline' : 'primary'} icon={<Sparkles className="size-4" />} onClick={run}>
              {phase === 'idle' ? 'Mejorar ahora' : 'Volver a generar'}
            </Button>
          )}
          {phase === 'done' && output.trim() && (
            <Button
              variant="primary"
              onClick={() => {
                onApply(output.trim() + '\n');
                onClose();
              }}
            >
              Aplicar al editor
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Indicaciones adicionales" optional hint="Ej.: prioriza la seguridad de pagos y añade criterios de aceptación por módulo.">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} maxLength={1000} disabled={phase === 'streaming'} />
        </Field>
        {(output || phase === 'streaming') && (
          <pre ref={outRef} className="max-h-[45dvh] min-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-code p-3 font-mono text-[12px] leading-relaxed text-text-2" aria-live="polite">
            {output || 'Esperando respuesta de Claude…'}
          </pre>
        )}
        {message && <p className={phase === 'error' ? 'text-sm text-danger' : 'text-sm text-text-2'}>{message}</p>}
      </div>
    </Modal>
  );
}

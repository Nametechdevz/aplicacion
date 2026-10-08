import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { Settings } from '@/lib/settings';

const SYSTEM = `Eres un ingeniero de prompts experto en Claude Code y en desarrollo de software profesional.
Recibirás un PROMPT MAESTRO en Markdown que otra persona pegará en Claude Code para construir un proyecto real.

Tu tarea: devolver una versión MEJORADA del mismo prompt.
- Conserva la estructura de secciones "## TÍTULO" y todos los requisitos existentes; no elimines nada salvo duplicados.
- Añade lo que falte para que un agente de código entregue un sistema funcional y listo para producción: funcionalidades necesarias para completar los flujos, requisitos técnicos verificables, casos límite, mejoras de UX, seguridad, escalabilidad, SEO (si aplica), rendimiento y testing.
- Sé concreto y verificable; evita frases vagas.
- No inventes APIs, endpoints ni librerías inexistentes; si mencionas un servicio externo, indica que sus credenciales van en variables de entorno.
- Mantén el idioma del prompt original.
- Responde ÚNICAMENTE con el prompt mejorado en Markdown, sin introducciones ni comentarios.`;

export type AiEvent =
  | { t: 'delta'; text: string }
  | { t: 'done'; stopReason: string | null; model: string; inputTokens: number; outputTokens: number }
  | { t: 'error'; message: string };

const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'La clave ANTHROPIC_API_KEY no es válida.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'La clave de API no tiene permiso para usar este modelo.';
  if (err instanceof Anthropic.NotFoundError) return 'El modelo configurado no está disponible para esta clave.';
  if (err instanceof Anthropic.RateLimitError) return 'Límite de uso de la API alcanzado. Inténtalo de nuevo en unos minutos.';
  if (err instanceof Anthropic.BadRequestError) return `La API rechazó la petición: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con la API de Claude.';
  if (err instanceof Anthropic.APIError) return `Error de la API de Claude (${err.status ?? 'desconocido'}).`;
  if (err instanceof Error && err.name === 'AbortError') return 'Solicitud cancelada.';
  return 'Error inesperado al llamar a la API de Claude.';
}

/** Mejora un prompt con Claude y emite los eventos en streaming. */
export async function* improveWithClaude(
  text: string,
  opts: { settings: Settings; instructions?: string; signal?: AbortSignal },
): AsyncGenerator<AiEvent> {
  const client = new Anthropic();
  const model = opts.settings.aiModel;
  const userContent = [
    opts.instructions?.trim() ? `Indicaciones adicionales del usuario: ${opts.instructions.trim()}\n\n` : '',
    'PROMPT A MEJORAR:\n\n',
    text,
  ].join('');

  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        output_config: { effort: opts.settings.aiEffort },
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: opts.signal },
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { t: 'delta', text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      yield { t: 'error', message: 'Claude declinó procesar este prompt. Revisa el contenido e inténtalo de nuevo.' };
      return;
    }
    yield {
      t: 'done',
      stopReason: final.stop_reason ?? null,
      model: final.model,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    };
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'ai_improve_failed', err: err instanceof Error ? err.message : String(err) }));
    yield { t: 'error', message: aiErrorMessage(err) };
  }
}

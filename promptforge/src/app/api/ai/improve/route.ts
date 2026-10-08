import { clientIp, enforceRateLimit, HttpError, readJson, requireApiUser, route } from '@/lib/server/http';
import { improveWithClaude } from '@/lib/server/ai';
import { env } from '@/lib/server/env';
import { audit } from '@/lib/server/repos/audit';
import { getSettings } from '@/lib/server/repos/settings';
import { aiImproveSchema } from '@/lib/validation';

export const maxDuration = 300;

/** Mejora asistida por Claude. Responde con NDJSON en streaming: {t:"delta"|"done"|"error"}. */
export const POST = route(async (req) => {
  const user = requireApiUser(req);
  if (!env.anthropicConfigured) {
    throw new HttpError(503, 'La mejora con IA no está configurada: define ANTHROPIC_API_KEY en el servidor.');
  }
  enforceRateLimit(`ai:${user.id}`, 10, 60 * 60 * 1000);
  const body = await readJson(req, aiImproveSchema, 2_000_000);
  const settings = getSettings(user.id);
  audit('ai.improve', { userId: user.id, ip: clientIp(req), detail: `model=${settings.aiModel} chars=${body.text.length}` });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const ev of improveWithClaude(body.text, { settings, instructions: body.instructions, signal: req.signal })) {
        controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
});

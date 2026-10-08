import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { improveWithClaude, type AiEvent } from '@/lib/server/ai';
import { DEFAULT_SETTINGS } from '@/lib/settings';

// Servidor local que imita el streaming SSE de la Messages API para verificar la integración sin red.
let server: http.Server;
let lastBody: Record<string, unknown> = {};
let lastHeaders: http.IncomingHttpHeaders = {};
let mode: 'ok' | 'refusal' | 'auth' = 'ok';

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastBody = JSON.parse(raw);
      lastHeaders = req.headers;
      if (mode === 'auth') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const msg = { id: 'msg_1', type: 'message', role: 'assistant', model: lastBody.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } };
      res.write(sse('message_start', { type: 'message_start', message: msg }));
      res.write(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
      for (const t of ['# PROMPT ', 'MEJORADO\n', '## ROL']) {
        res.write(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }));
      }
      res.write(sse('content_block_stop', { type: 'content_block_stop', index: 0 }));
      res.write(sse('message_delta', { type: 'message_delta', delta: { stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } }));
      res.write(sse('message_stop', { type: 'message_stop' }));
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

async function collect(gen: AsyncGenerator<AiEvent>) {
  const out: AiEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('Mejorar con IA (Claude API)', () => {
  it('transmite el texto en streaming y envía los parámetros correctos', async () => {
    mode = 'ok';
    const events = await collect(improveWithClaude('# Prompt original con suficiente texto', { settings: DEFAULT_SETTINGS, instructions: 'prioriza seguridad' }));
    const text = events.filter((e) => e.t === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(text).toBe('# PROMPT MEJORADO\n## ROL');
    expect(events.at(-1)).toMatchObject({ t: 'done', stopReason: 'end_turn', outputTokens: 7 });
    expect(lastBody.model).toBe('claude-opus-5-5');
    expect(lastBody.fallbacks).toBe('default');
    expect(lastBody.output_config).toEqual({ effort: 'medium' });
    expect(lastBody.thinking).toBeUndefined();
    expect(String(lastHeaders['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
    expect(JSON.stringify(lastBody.messages)).toContain('prioriza seguridad');
  });

  it('Haiku no usa fallbacks del servidor', async () => {
    mode = 'ok';
    await collect(improveWithClaude('# Prompt', { settings: { ...DEFAULT_SETTINGS, aiModel: 'claude-haiku-5-5' } }));
    expect(lastBody.fallbacks).toBeUndefined();
  });

  it('informa de una negativa (refusal) en lugar de devolver texto parcial como válido', async () => {
    mode = 'refusal';
    const events = await collect(improveWithClaude('# Prompt', { settings: DEFAULT_SETTINGS }));
    expect(events.at(-1)?.t).toBe('error');
  });

  it('traduce errores de autenticación a un mensaje claro', async () => {
    mode = 'auth';
    const events = await collect(improveWithClaude('# Prompt', { settings: DEFAULT_SETTINGS }));
    expect(events).toEqual([{ t: 'error', message: 'La clave ANTHROPIC_API_KEY no es válida.' }]);
  });
});

import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { env } from './env';
import { rateLimit } from './rate-limit';
import { getUserBySessionToken, type User } from './repos/users';

export const SESSION_COOKIE = 'pf_session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] || req.headers.get('x-real-ip') || 'local').trim().slice(0, 64);
}

/** Protección CSRF: las peticiones que modifican datos deben venir del mismo origen. */
export function assertSameOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) throw new HttpError(403, 'Origen no permitido');
  if (!origin) {
    // Navegadores modernos siempre envían Origin en POST/PUT/PATCH/DELETE.
    throw new HttpError(403, 'Falta la cabecera Origin');
  }
  const allowed = new Set<string>();
  if (env.appUrl) allowed.add(new URL(env.appUrl).origin);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
    allowed.add(`${proto}://${host}`);
  }
  allowed.add(new URL(req.url).origin);
  if (!allowed.has(origin)) throw new HttpError(403, 'Origen no permitido');
}

export function sessionTokenFrom(req: NextRequest | Request): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return m ? decodeURIComponent(m.slice(SESSION_COOKIE.length + 1)) : null;
}

export function requireApiUser(req: Request): User {
  const user = getUserBySessionToken(sessionTokenFrom(req));
  if (!user) throw new HttpError(401, 'Sesión no válida o expirada');
  return user;
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) {
    const err = new HttpError(429, `Demasiadas solicitudes. Inténtalo de nuevo en ${r.retryAfterSeconds} s.`);
    (err as HttpError & { retryAfter?: number }).retryAfter = r.retryAfterSeconds;
    throw err;
  }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 1_000_000): Promise<z.infer<S>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'La petición es demasiado grande');
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Se esperaba JSON');
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new HttpError(400, 'Cuerpo de la petición no válido');
  }
  if (raw.length > maxBytes) throw new HttpError(413, 'La petición es demasiado grande');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON mal formado');
  }
  return schema.parse(data);
}

export function setSessionCookie(res: NextResponse, token: string, expires: Date): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/', maxAge: 0 });
}

function zodDetails(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

type Ctx<P> = { params: Promise<P> };

/** Envoltorio común de los route handlers: CSRF, errores tipados y logs estructurados. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        const headers: Record<string, string> = {};
        const retry = (err as HttpError & { retryAfter?: number }).retryAfter;
        if (retry) headers['Retry-After'] = String(retry);
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status, headers });
      }
      if (err instanceof ZodError) {
        const details = zodDetails(err);
        return NextResponse.json({ error: Object.values(details)[0] ?? 'Datos no válidos', details }, { status: 422 });
      }
      const requestId = randomUUID();
      console.error(
        JSON.stringify({ level: 'error', msg: 'unhandled_api_error', requestId, method: req.method, path: new URL(req.url).pathname, err: err instanceof Error ? err.stack : String(err) }),
      );
      return NextResponse.json({ error: 'Error interno del servidor', requestId }, { status: 500 });
    }
  };
}

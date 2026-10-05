import { useCallback, useEffect, useRef, useState } from 'react';
import type { IpcResult } from '@shared/types';

interface DesktopApi {
  invoke(method: string, payload?: unknown): Promise<IpcResult<unknown>>;
  onEvent(cb: (ev: { type: string; data: any }) => void): () => void;
  onNavigate(cb: (route: string) => void): () => void;
  platform: string;
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const listeners = new Set<(ev: { type: string; data: any }) => void>();
let unsubscribed: (() => void) | null = null;
function ensureSubscription() {
  if (unsubscribed || !window.api) return;
  unsubscribed = window.api.onEvent((ev) => listeners.forEach((l) => l(ev)));
}

export async function call<T = any>(method: string, payload?: unknown): Promise<T> {
  const r = await window.api.invoke(method, payload);
  if (!r.ok) {
    if (r.error.code === 'UNAUTHENTICATED') window.dispatchEvent(new CustomEvent('wcrm:logout'));
    throw new ApiError(r.error.code, r.error.message);
  }
  return r.data as T;
}

export function onAppEvent(cb: (ev: { type: string; data: any }) => void) {
  ensureSubscription();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Suscripción a eventos del backend (con callback siempre actualizado). */
export function useAppEvent(types: string[], cb: (ev: { type: string; data: any }) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = types.join('|');
  useEffect(
    () =>
      onAppEvent((ev) => {
        if (key.split('|').includes(ev.type)) ref.current(ev);
      }),
    [key],
  );
}

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (d: T | ((p: T | undefined) => T)) => void;
}

/** Carga datos del backend, con recarga automática ante eventos indicados. */
export function useQuery<T = any>(method: string | null, payload?: unknown, opts: { refreshOn?: string[]; debounceMs?: number } = {}): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!method);
  const key = JSON.stringify(payload ?? null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!method) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await call<T>(method, payload);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e as ApiError);
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, key]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const timer = useRef<number | null>(null);
  useAppEvent(opts.refreshOn ?? [], () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void reload(), opts.debounceMs ?? 250);
  });
  return { data, error, loading, reload, setData: setData as any };
}

export function uuid() {
  return crypto.randomUUID();
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PublicUser } from '../../shared/types';
import { api, getToken, setToken } from './api';
import { serverUrl } from './server';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  socket: Socket | null;
  connected: boolean;
  login(email: string, password: string): Promise<void>;
  register(data: unknown): Promise<void>;
  logout(): void;
  refresh(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const { user } = await api<{ user: PublicUser }>('/me');
      setUser(user);
    } catch (e) {
      if ((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403) logout();
    }
  }, [logout]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const onExpired = () => logout();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refresh, logout]);

  // Un socket por sesión iniciada.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const opts = { auth: { token: getToken() }, transports: ['websocket', 'polling'] };
    const base = serverUrl();
    const s = base ? io(base, opts) : io(opts);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      if (/bloqueada|Sesión no válida/.test(err.message)) logout();
    });
    s.on('me:changed', () => void refresh());
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId, refresh, logout]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      socket,
      connected,
      async login(email, password) {
        const r = await api<{ token: string; user: PublicUser }>('/auth/login', { body: { email, password } });
        setToken(r.token);
        setUser(r.user);
      },
      async register(data) {
        const r = await api<{ token: string; user: PublicUser }>('/auth/register', { body: data });
        setToken(r.token);
        setUser(r.user);
      },
      logout,
      refresh,
    }),
    [user, loading, socket, connected, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}

/** Suscribe un manejador a un evento del socket mientras el componente esté montado. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useAuth();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [socket, event, handler]);
}

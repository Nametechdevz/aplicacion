// Dirección del servidor de TaxiYa.
// - En la web se usa el mismo dominio que sirve la página (cadena vacía).
// - En la app Android (APK) la página va dentro de la app, así que hay que saber a qué servidor llamar:
//   se toma de VITE_SERVER_URL al compilar o la configura el usuario en la pantalla de inicio.
const KEY = 'taxiya.server';

const BUILT_IN = normalize((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '');

export function isNative(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export function normalize(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function serverUrl(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
  } catch {
    /* sin almacenamiento */
  }
  return BUILT_IN;
}

export function setServerUrl(url: string): void {
  try {
    if (url) localStorage.setItem(KEY, normalize(url));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

/** La app nativa necesita una dirección de servidor; la web no. */
export function needsServer(): boolean {
  return isNative() && !serverUrl();
}

export async function checkServer(url: string): Promise<void> {
  const base = normalize(url);
  let res: Response;
  try {
    res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error('No se pudo conectar. Revisa la dirección y que el servidor esté encendido y accesible desde el móvil.');
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  if (!res.ok || !data?.ok) throw new Error('Esa dirección responde, pero no es un servidor de TaxiYa.');
}

import { contextBridge, ipcRenderer } from 'electron';

/** Puente mínimo y seguro: la interfaz solo puede invocar métodos del router y recibir eventos. */
const api = {
  invoke: (method: string, payload?: unknown) => ipcRenderer.invoke('ipc:invoke', { method, payload }),
  onEvent: (cb: (ev: { type: string; data: unknown }) => void) => {
    const l = (_e: unknown, ev: { type: string; data: unknown }) => cb(ev);
    ipcRenderer.on('app:event', l);
    return () => ipcRenderer.removeListener('app:event', l);
  },
  onNavigate: (cb: (route: string) => void) => {
    const l = (_e: unknown, route: string) => cb(route);
    ipcRenderer.on('app:navigate', l);
    return () => ipcRenderer.removeListener('app:navigate', l);
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);
export type DesktopApi = typeof api;

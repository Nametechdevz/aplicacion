import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, safeStorage, session as electronSession, shell, Tray } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { autoUpdater } from 'electron-updater';
import { createApp, makePaths, type App } from './app-context';
import { applyPendingRestore } from './services/backup';
import { buildRouter, dispatch, type DesktopBridge, type Session } from './ipc/router';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const startHidden = process.argv.includes('--hidden');
const APP_ID = 'com.nametech.whatsappcrm';

// Carpeta de datos alternativa (instalaciones portables o pruebas automatizadas).
if (process.env.WCRM_USER_DATA) app.setPath('userData', process.env.WCRM_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: 'wcrm-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let core: App | null = null;
let quitting = false;
const session: Session = { user: null, accountId: null, fileTokens: new Map() };

function resource(...p: string[]) {
  return app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, '..', '..', 'build', ...p);
}

function iconPath() {
  const ico = resource(process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  return fs.existsSync(ico) ? ico : resource('icon.png');
}

function showWindow(route?: string) {
  if (!win) createWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (route) win.webContents.send('app:navigate', route);
}

function notify(n: { title: string; body: string; kind: string; route?: string; silent?: boolean }) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({ title: n.title, body: n.body, icon: iconPath(), silent: n.silent });
  notif.on('click', () => showWindow(n.route));
  notif.show();
  win?.webContents.send('app:event', { type: 'toast', data: { title: n.title, body: n.body, kind: n.kind, route: n.route } });
}

const desktop: DesktopBridge = {
  async openFile(o) {
    const r = await dialog.showOpenDialog(win!, { title: o.title, filters: o.filters, properties: o.multi ? ['openFile', 'multiSelections'] : ['openFile'] });
    return r.canceled ? null : r.filePaths;
  },
  async saveFile(o) {
    const r = await dialog.showSaveDialog(win!, { title: o.title, defaultPath: path.join(app.getPath('documents'), o.defaultPath), filters: o.filters });
    return r.canceled || !r.filePath ? null : r.filePath;
  },
  async openPath(p) {
    fs.mkdirSync(p, { recursive: true });
    await shell.openPath(p);
  },
  async openExternal(url) {
    await shell.openExternal(url);
  },
  relaunch() {
    quitting = true;
    app.relaunch();
    app.quit();
  },
  quit() {
    quitting = true;
    app.quit();
  },
  appInfo() {
    return { version: app.getVersion(), userData: app.getPath('userData'), platform: `${process.platform} ${process.arch}`, electron: process.versions.electron };
  },
  async checkForUpdates() {
    if (!app.isPackaged) return { available: false, message: 'Las actualizaciones automáticas solo funcionan en la versión instalada.' };
    try {
      const r = await autoUpdater.checkForUpdates();
      const v = r?.updateInfo?.version;
      if (v && v !== app.getVersion()) return { available: true, version: v, message: `Versión ${v} disponible. Se descargará e instalará al cerrar la aplicación.` };
      return { available: false, message: 'Ya tiene la última versión.' };
    } catch (e: any) {
      core?.log.warn('application', 'Error buscando actualizaciones', e);
      return { available: false, message: 'No se pudo consultar el servidor de actualizaciones.' };
    }
  },
  setLoginItem(open) {
    app.setLoginItemSettings({ openAtLogin: open, args: ['--hidden'] });
  },
};

function createWindow() {
  const dark = core?.settings.get('appearance').theme !== 'light';
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'WhatsApp CRM',
    backgroundColor: dark ? '#0b1120' : '#f6f7fb',
    icon: iconPath(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: dark ? '#0b1120' : '#f6f7fb', symbolColor: dark ? '#cbd5e1' : '#334155', height: 40 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      devTools: isDev || !app.isPackaged,
    },
  });
  win.once('ready-to-show', () => {
    const minimized = startHidden || core?.settings.get('general').startMinimized;
    if (!minimized) win?.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? url.startsWith(process.env.VITE_DEV_SERVER_URL!) : url.startsWith('file://');
    if (!allowed) e.preventDefault();
  });
  win.on('close', (e) => {
    if (quitting) return;
    const behavior = core?.settings.get('general').closeBehavior ?? 'ask';
    if (behavior === 'quit') {
      quitting = true;
      return;
    }
    e.preventDefault();
    if (behavior === 'tray') return hideToTray();
    void dialog
      .showMessageBox(win!, {
        type: 'question',
        title: 'WhatsApp CRM',
        message: '¿Cerrar aplicación o minimizar a la bandeja?',
        detail: 'Si minimiza, las campañas programadas, la cola de envío y las automatizaciones seguirán funcionando en segundo plano.',
        buttons: ['Minimizar a la bandeja', 'Cerrar aplicación', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        checkboxLabel: 'Recordar mi elección',
      })
      .then(({ response, checkboxChecked }) => {
        if (response === 2) return;
        if (checkboxChecked) core?.settings.set('general', { closeBehavior: response === 0 ? 'tray' : 'quit' });
        if (response === 0) hideToTray();
        else {
          quitting = true;
          app.quit();
        }
      });
  });
  win.on('closed', () => {
    win = null;
  });
  if (isDev) void win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

let trayHintShown = false;
function hideToTray() {
  win?.hide();
  if (!trayHintShown && Notification.isSupported()) {
    trayHintShown = true;
    new Notification({ title: 'WhatsApp CRM sigue activo', body: 'La aplicación continúa en la bandeja del sistema. Haga clic en el icono para abrirla.', icon: iconPath(), silent: true }).show();
  }
}

function refreshTray() {
  if (!tray || !core) return;
  const accounts = core.accounts.list();
  const label = (s: string) => (s === 'connected' ? '🟢 Conectado' : s === 'connecting' ? '🟡 Conectando' : '🔴 Desconectado');
  const running = (core.db.prepare("SELECT COUNT(*) n FROM campaigns WHERE status = 'running'").get() as { n: number }).n;
  tray.setToolTip(`WhatsApp CRM — ${accounts.map((a) => `${a.name}: ${label(a.status)}`).join(' · ') || 'sin cuentas'}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir WhatsApp CRM', click: () => showWindow() },
      { type: 'separator' },
      ...accounts.map((a) => ({ label: `${a.name}: ${label(a.status)}`, enabled: false })),
      { label: `Campañas en curso: ${running}`, enabled: false },
      { type: 'separator' },
      { label: 'Bandeja de entrada', click: () => showWindow('/inbox') },
      { label: 'Campañas', click: () => showWindow('/campaigns') },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  const img = nativeImage.createFromPath(resource('tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }) : img);
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
  refreshTray();
}

// Eventos del bus que se reenvían a la interfaz (filtrados por cuenta activa).
const FORWARD = new Set([
  'message.received',
  'message.status',
  'conversation.updated',
  'campaign.updated',
  'campaign.progress',
  'campaign.finished',
  'account.status',
  'contact.created',
  'contact.updated',
  'task.created',
  'automation.run',
  'automation.failed',
]);

function wireEvents(c: App) {
  const pending = new Map<string, unknown>();
  let timer: NodeJS.Timeout | null = null;
  c.bus.onAny((type, data: any) => {
    if (!FORWARD.has(type) || !win) return;
    if (data?.accountId && type !== 'account.status' && data.accountId !== session.accountId) return;
    // Agrupa ráfagas (ej. progreso de campañas) para no saturar la interfaz.
    pending.set(type === 'campaign.progress' || type === 'message.status' || type === 'conversation.updated' ? `${type}:${data?.campaignId ?? data?.conversationId ?? ''}` : `${type}:${Math.random()}`, { type, data });
    if (!timer)
      timer = setTimeout(() => {
        timer = null;
        const batch = [...pending.values()];
        pending.clear();
        for (const ev of batch) win?.webContents.send('app:event', ev);
      }, 150);
    if (type === 'account.status' || type === 'campaign.updated') refreshTray();
  });
}

function setupUpdater(c: App) {
  if (!app.isPackaged) return;
  autoUpdater.logger = { info: (m: any) => c.log.info('application', `updater: ${m}`), warn: (m: any) => c.log.warn('application', `updater: ${m}`), error: (m: any) => c.log.error('application', `updater: ${m}`), debug: () => {} } as any;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => notify({ title: 'Actualización lista', body: `La versión ${info.version} se instalará al cerrar la aplicación. Sus datos se conservan.`, kind: 'info' }));
  autoUpdater.on('error', (e) => c.log.warn('application', 'Error del actualizador', e));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 30000);
  setInterval(check, 6 * 3600000).unref();
}

async function bootstrap() {
  app.setAppUserModelId(APP_ID);
  const userData = app.getPath('userData');
  const paths = makePaths(userData);
  const dbFile = path.join(userData, 'data', 'whatsapp-crm.db');
  if (applyPendingRestore(userData, dbFile, paths.media, paths.backups)) console.log('Backup restaurado');

  core = createApp({
    userDataDir: userData,
    dbFile,
    safeStorage,
    notify,
    isFocused: () => !!win?.isFocused() && win.isVisible(),
    appVersion: app.getVersion(),
    logToConsole: isDev,
  });
  core.log.info('application', `Inicio v${app.getVersion()} (${process.platform}) — cifrado: ${core.ctx.secrets.backend}`);

  // CSP estricta para la interfaz (en desarrollo, Vite necesita su servidor y HMR).
  electronSession.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' http://localhost:5173 ws://localhost:5173; img-src 'self' data: blob: wcrm-media:; media-src 'self' blob: wcrm-media:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: wcrm-media:; media-src 'self' blob: wcrm-media:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'notifications' || permission === 'clipboard-sanitized-write'));

  // Archivos multimedia: solo para la sesión iniciada y la cuenta activa.
  protocol.handle('wcrm-media', async (req) => {
    const u = new URL(req.url);
    const mediaId = Number(u.hostname || u.pathname.replace(/\//g, ''));
    const m = core!.media.getAny(mediaId);
    if (!session.user || !m || m.account_id !== session.accountId || !fs.existsSync(m.file_path)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(m.file_path).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Type', m.mime_type);
    if (u.searchParams.get('download')) headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(m.file_name)}"`);
    return new Response(res.body, { status: 200, headers });
  });

  const handlers = buildRouter(core, desktop);
  ipcMain.handle('ipc:invoke', async (event, req: { method: string; payload: unknown }) => {
    const url = event.senderFrame?.url ?? '';
    const trusted = isDev ? url.startsWith(process.env.VITE_DEV_SERVER_URL!) : url.startsWith('file://');
    if (!trusted || typeof req?.method !== 'string') return { ok: false, error: { code: 'FORBIDDEN', message: 'Origen no autorizado.' } };
    return dispatch(core!, handlers, session, req.method, req.payload);
  });

  wireEvents(core);
  createWindow();
  createTray();
  await core.start();
  refreshTray();
  setupUpdater(core);
}

app.on('second-instance', () => showWindow());
app.on('window-all-closed', () => {
  /* se mantiene en la bandeja */
});
app.on('activate', () => showWindow());

let shuttingDown = false;
app.on('before-quit', (e) => {
  quitting = true;
  if (shuttingDown || !core) return;
  e.preventDefault();
  shuttingDown = true;
  core
    .shutdown()
    .catch(() => {})
    // app.quit() (no app.exit) para que electron-updater pueda instalar una actualización pendiente.
    .finally(() => app.quit());
});

app.whenReady().then(bootstrap).catch((e) => {
  console.error(e);
  dialog.showErrorBox('WhatsApp CRM no pudo iniciar', String(e?.message ?? e));
  app.exit(1);
});

// Smoke test del binario EMPAQUETADO (valida rutas de producción: asar, preload, recursos, SQLite nativo).
// Uso: npm run dist:dir && xvfb-run -a node tests/e2e/packaged-smoke.mjs [ruta-al-ejecutable]
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const exe = path.resolve(process.argv[2] ?? (process.platform === 'win32' ? 'release/win-unpacked/WhatsApp CRM.exe' : 'release/linux-unpacked/whatsapp-crm'));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wcrm-pkg-'));
const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'], env: { ...process.env, WCRM_USER_DATA: userData } });
try {
  const page = await app.firstWindow();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.getByText('Configuración inicial').waitFor({ timeout: 30000 });
  await page.getByPlaceholder('Ej. Laura Gómez').fill('Admin');
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('Secreta123');
  await pw.nth(1).fill('Secreta123');
  await page.getByRole('button', { name: 'Crear administrador' }).click();
  await page.getByText('Simulador (pruebas)').click();
  await page.getByRole('button', { name: 'Conectar WhatsApp' }).click();
  await page.getByText('Resumen de los últimos 30 días').waitFor({ timeout: 20000 });
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }));
  if (!info.packaged) throw new Error('No es el binario empaquetado');
  if (!fs.existsSync(path.join(userData, 'data', 'whatsapp-crm.db'))) throw new Error('No se creó la base de datos');
  if (errs.length) throw new Error('Errores en la interfaz: ' + errs.join('; '));
  console.log('✅ Binario empaquetado OK', info);
} catch (e) {
  console.error('❌', e);
  process.exitCode = 1;
} finally {
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
}

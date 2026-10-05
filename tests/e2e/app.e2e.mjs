// Prueba de extremo a extremo: lanza la app Electron real y recorre los flujos principales.
// Uso: xvfb-run -a node tests/e2e/app.e2e.mjs
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shots = path.resolve('test-results/screens');
fs.mkdirSync(shots, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wcrm-e2e-'));
const app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, WCRM_USER_DATA: userData } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`) });
const step = (s) => console.log('▶', s);
const go = async (h) => {
  await page.evaluate((x) => (location.hash = x), h.replace(/^#/, ''));
  await page.waitForTimeout(300);
};
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

try {
  step('Configuración inicial (administrador)');
  await page.getByText('Configuración inicial').waitFor();
  await shot('01-setup');
  await page.getByPlaceholder('Ej. Laura Gómez').fill('Laura Gómez');
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('Secreta123');
  await pw.nth(1).fill('Secreta123');
  await page.getByRole('button', { name: 'Crear administrador' }).click();

  step('Onboarding: conectar cuenta (simulador)');
  await page.getByText('Conectar WhatsApp').first().waitFor();
  await shot('02-onboarding');
  // Opción QR (Baileys): exige aceptar el riesgo antes de generar el código
  await page.getByText('WhatsApp con código QR (no oficial)').click();
  const qrBtn = page.getByRole('button', { name: 'Generar código QR' });
  await qrBtn.waitFor();
  if (await qrBtn.isEnabled()) throw new Error('El botón de QR debería estar deshabilitado sin aceptar el riesgo');
  await page.getByText('Entiendo y acepto el riesgo').click();
  if (!(await qrBtn.isEnabled())) throw new Error('El botón de QR debería habilitarse tras aceptar el riesgo');
  await shot('02b-onboarding-qr');
  await page.getByRole('button', { name: 'Atrás' }).click();
  await page.getByText('Simulador (pruebas)').click();
  await page.getByRole('button', { name: 'Conectar WhatsApp' }).click();

  step('Dashboard');
  await page.getByText('Resumen de los últimos 30 días').waitFor({ timeout: 15000 });
  await page.getByText('Conectado').first().waitFor({ timeout: 15000 });
  await shot('03-dashboard');

  step('Simular mensaje entrante');
  await go('#/settings/whatsapp');
  await page.getByRole('button', { name: 'Simular mensaje entrante' }).click();
  await page.getByText('Mensaje entrante simulado').waitFor();
  await shot('04-settings-whatsapp');

  step('Inbox: abrir conversación y responder');
  await go('#/inbox');
  await page.getByText('Cliente de prueba').first().click();
  await page.getByText('cuál es el precio del plan premium').waitFor();
  const box = page.getByPlaceholder(/Escriba un mensaje/);
  await box.fill('Hola, con gusto te ayudo 😊');
  await box.press('Enter');
  await page.getByText('Hola, con gusto te ayudo 😊').waitFor();
  await page.waitForTimeout(2500);
  await shot('05-inbox');

  step('Contactos: crear contacto y etiqueta');
  await go('#/contacts');
  await page.getByRole('button', { name: 'Nuevo contacto' }).first().click();
  const modal = page.getByRole('dialog');
  await modal.locator('input').nth(0).fill('Juan Pérez');
  await modal.locator('input').nth(1).fill('+57 300 555 1234');
  await modal.getByText('Cliente VIP').click();
  await modal.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Contacto creado').waitFor();
  await page.getByText('Juan Pérez').first().waitFor();
  await shot('06-contacts');
  await page.getByText('Juan Pérez').first().click();
  await page.getByText('JUAN PÉREZ').waitFor();
  await shot('07-contact-detail');

  step('Automatización de ejemplo "Consulta de precios"');
  await go('#/automations/new?example=precio');
  await page.locator('.react-flow__node').nth(3).waitFor();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Automatización guardada').waitFor();
  await page.getByRole('switch').click();
  await page.waitForTimeout(800);
  await shot('08-automation-builder');

  step('Campaña: asistente completo');
  await go('#/campaigns/new');
  await page.getByText('Nombre de la campaña').waitFor();
  await page.locator('input').first().fill('Promoción octubre');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.waitForTimeout(600);
  await shot('09-campaign-audience');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.waitForTimeout(500);
  }
  await page.getByText('Vista previa real por contacto').waitFor();
  await shot('10-campaign-review');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: /Enviar a/ }).click();
  await page.getByText('Progreso').waitFor({ timeout: 15000 });
  await page.waitForTimeout(6000);
  await shot('11-campaign-detail');

  for (const [route, name] of [
    ['#/calendar', '12-calendar'],
    ['#/ai', '13-ai'],
    ['#/templates', '14-templates'],
    ['#/media', '15-media'],
    ['#/crm', '16-crm'],
    ['#/tasks', '17-tasks'],
    ['#/stats', '18-stats'],
    ['#/settings/sending', '19-settings-sending'],
    ['#/settings/users', '20-settings-users'],
    ['#/campaigns', '21-campaigns'],
    ['#/', '22-dashboard-after'],
  ]) {
    step(`Página ${route}`);
    await go(route);
    await page.waitForTimeout(1200);
    await shot(name);
  }
  step('Tema claro');
  await go('#/settings/appearance');
  await page.getByText('Claro', { exact: true }).click();
  await page.waitForTimeout(500);
  for (const [route, name] of [['#/', '30-light-dashboard'], ['#/inbox', '31-light-inbox'], ['#/campaigns', '32-light-campaigns']]) {
    await go(route);
    await page.waitForTimeout(1000);
    await shot(name);
  }
  console.log('✅ E2E completado');
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.error('❌ E2E falló:', e);
  process.exitCode = 1;
} finally {
  if (errors.length) console.log('Errores de consola:\n' + [...new Set(errors)].join('\n'));
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await app.close().catch(() => {});
}

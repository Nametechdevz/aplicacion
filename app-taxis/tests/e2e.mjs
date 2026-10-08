import { chromium } from 'playwright';
// Uso: npm i -D playwright && node tests/e2e.mjs <carpeta-capturas>  (con el servidor en marcha y una base de datos vacía)
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.argv[2] ?? 'test-results';
const PICKUP = { latitude: 40.4169, longitude: -3.7035 };
const DRIVER_POS = { latitude: 40.4215, longitude: -3.7105 };
const browser = await chromium.launch();
const errors = [];
async function ctx(geo, mobile = true) {
  const c = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 860 },
    deviceScaleFactor: 2,
    geolocation: geo,
    permissions: ['geolocation'],
    locale: 'es-ES',
  });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/tile|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const step = (s) => console.log('·', s);

step('pasajero se registra');
const pas = await ctx(PICKUP);
await pas.goto(BASE);
await shot(pas, '01-login');
await pas.getByRole('link', { name: 'Regístrate' }).click();
await pas.getByLabel('Nombre completo').fill('Ana Pasajera');
await pas.getByLabel('Correo electrónico').fill('ana@test.local');
await pas.getByLabel('Teléfono').fill('600111222');
await pas.getByLabel(/Contraseña/).fill('secreta123');
await pas.getByRole('button', { name: 'Crear cuenta' }).click();
await pas.getByText('Hola, Ana').waitFor();

step('conductor se registra');
const drv = await ctx(DRIVER_POS);
await drv.goto(BASE + '/registro');
await drv.getByRole('tab', { name: /Conductor/ }).click();
await drv.getByLabel('Nombre completo').fill('Carlos Conductor');
await drv.getByLabel('Correo electrónico').fill('carlos@test.local');
await drv.getByLabel('Teléfono').fill('600333444');
await drv.getByLabel(/Contraseña/).fill('secreta123');
await drv.getByLabel('Marca').fill('Toyota');
await drv.getByLabel('Modelo').fill('Prius');
await drv.getByLabel(/Matrícula/).fill('1234 KLM');
await drv.getByLabel('Color').fill('Blanco');
await shot(drv, '02-registro-conductor');
await drv.getByRole('button', { name: 'Crear cuenta' }).click();
await drv.getByText('Cuenta en revisión').waitFor();
await shot(drv, '03-conductor-pendiente');

step('central aprueba');
const adm = await ctx(PICKUP, false);
await adm.goto(BASE);
await adm.getByLabel('Correo electrónico').fill('admin@taxiya.local');
await adm.getByLabel('Contraseña').fill('admin12345');
await adm.getByRole('button', { name: 'Entrar' }).click();
await adm.getByText('Conductores por aprobar').waitFor();
await adm.getByRole('link', { name: 'Conductores' }).first().click();
await adm.getByRole('button', { name: 'Aprobar' }).click();
await adm.getByText('Activo', { exact: true }).waitFor();
await shot(adm, '04-admin-conductores');

step('conductor se conecta (aprobación en vivo)');
await drv.getByText('Estás desconectado').waitFor({ timeout: 5000 });
await drv.getByRole('button', { name: 'Conectarme' }).click();
await drv.getByText('Esperando solicitudes').waitFor();

step('pasajero elige destino y pide');
await pas.waitForTimeout(500);
const box = await pas.locator('.map').boundingBox();
await pas.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.15);
await pas.getByRole('button', { name: 'Pedir taxi' }).waitFor();
await shot(pas, '05-pasajero-cotizacion');
await pas.getByRole('button', { name: /Tarjeta/ }).click();
await pas.getByRole('button', { name: 'Pedir taxi' }).click();
await pas.getByText('Avisando a los conductores').waitFor();
await shot(pas, '06-pasajero-buscando');

step('conductor recibe y acepta');
await drv.getByRole('button', { name: 'Aceptar' }).waitFor();
await shot(drv, '07-conductor-oferta');
await drv.getByRole('button', { name: 'Aceptar' }).click();
await drv.getByRole('button', { name: 'He llegado a la recogida' }).waitFor();
await pas.getByText('Carlos Conductor').waitFor();
await pas.getByText('1234 KLM').waitFor();
await shot(pas, '08-pasajero-conductor-asignado');
await shot(drv, '09-conductor-en-camino');

step('central ve el viaje en curso');
await adm.getByRole('link', { name: 'Resumen' }).click();
await adm.getByText('Viajes en curso (1)').waitFor();
await shot(adm, '10-admin-resumen');

step('simulación y fin del viaje');
await drv.getByRole('button', { name: /Simular/ }).click();
await pas.waitForTimeout(3500);
await drv.getByRole('button', { name: /Parar/ }).click({ timeout: 2000 }).catch(() => {});
await drv.getByRole('button', { name: 'He llegado a la recogida' }).click();
await pas.getByText('¡Tu taxi te está esperando!').waitFor();
await drv.getByRole('button', { name: 'Iniciar viaje' }).click();
await pas.getByText('Rumbo a').waitFor();
await shot(pas, '11-pasajero-en-viaje');
await drv.getByRole('button', { name: 'Finalizar viaje' }).click();
await drv.getByText('Viaje finalizado').waitFor();
await shot(drv, '12-conductor-finalizado');
await pas.getByText('¡Has llegado!').waitFor();
await shot(pas, '13-pasajero-valorar');
await pas.getByRole('button', { name: '5 estrellas' }).click();
await pas.getByText('Gracias por tu valoración').waitFor();
await drv.getByRole('button', { name: '4 estrellas' }).click();
await drv.getByText('Gracias por valorar').waitFor();
await drv.getByRole('button', { name: 'Seguir trabajando' }).click();
await pas.getByRole('button', { name: 'Listo' }).click();

step('historial y ganancias');
await pas.locator('.bottomnav').getByRole('link', { name: /Viajes/ }).click();
await pas.getByText('Finalizado').waitFor();
await shot(pas, '14-pasajero-historial');
await drv.locator('.bottomnav').getByRole('link', { name: /Ganancias/ }).click();
await drv.getByText('Esta semana').waitFor();
await shot(drv, '15-conductor-ganancias');

step('tarifas y resumen');
await adm.getByRole('link', { name: 'Tarifas' }).click();
await adm.getByText('Vista previa').waitFor();
await shot(adm, '16-admin-tarifas');
await adm.getByRole('link', { name: 'Resumen' }).click();
await adm.getByText('Completados hoy').waitFor();
await adm.waitForTimeout(500);
await shot(adm, '17-admin-resumen-final');

step('pasajero en escritorio');
const pasDesk = await ctx(PICKUP, false);
await pasDesk.goto(BASE);
await pasDesk.getByLabel('Correo electrónico').fill('ana@test.local');
await pasDesk.getByLabel('Contraseña').fill('secreta123');
await pasDesk.getByRole('button', { name: 'Entrar' }).click();
await pasDesk.getByText('Hola, Ana').waitFor();
await shot(pasDesk, '18-pasajero-escritorio');

await browser.close();
console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'E2E OK sin errores de consola');

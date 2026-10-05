// Genera build/icon.png (512), build/icon.ico (16–256) y build/tray.png (32) a partir de build/icon.svg
// usando el Chromium de Playwright para rasterizar. Uso: npm run icons
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const svg = fs.readFileSync('build/icon.svg', 'utf8');
// En entornos con Chromium preinstalado se puede indicar la ruta con CHROMIUM_PATH.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
async function render(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
fs.writeFileSync('build/icon.png', await render(512));
fs.writeFileSync('build/tray.png', await render(32));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = [];
for (const s of sizes) pngs.push(await render(s));
await browser.close();
// ICO con imágenes PNG embebidas (soportado desde Windows Vista)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
  const b = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, b);
  dir.writeUInt8(s >= 256 ? 0 : s, b + 1);
  dir.writeUInt8(0, b + 2);
  dir.writeUInt8(0, b + 3);
  dir.writeUInt16LE(1, b + 4);
  dir.writeUInt16LE(32, b + 6);
  dir.writeUInt32LE(pngs[i].length, b + 8);
  dir.writeUInt32LE(offset, b + 12);
  offset += pngs[i].length;
});
fs.writeFileSync('build/icon.ico', Buffer.concat([header, dir, ...pngs]));
console.log('Iconos generados en build/');

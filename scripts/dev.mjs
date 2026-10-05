import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electronPath from 'electron';

// 1) Servidor de desarrollo de la interfaz
const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

// 2) Compilar main y preload en modo watch
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true, logLevel: 'warning' };
const ctxMain = await context({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', packages: 'external' });
const ctxPre = await context({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js', external: ['electron'] });
await ctxMain.rebuild();
await ctxPre.rebuild();

// 3) Lanzar Electron
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
child.on('close', async (code) => {
  await server.close();
  await ctxMain.dispose();
  await ctxPre.dispose();
  process.exit(code ?? 0);
});

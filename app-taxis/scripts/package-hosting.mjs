// Genera release/taxiya-servidor-<versión>.zip: servidor compilado + app web + dependencias de producción.
// Uso: npm run package:hosting
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'release');
const stage = join(out, 'taxiya-servidor');
const zip = join(out, `taxiya-servidor-${pkg.version}.zip`);
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

if (!existsSync(join(root, 'dist/server.js')) || !existsSync(join(root, 'client/dist/index.html'))) {
  run('npm', ['run', 'build']);
}

rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(stage, { recursive: true });

cpSync(join(root, 'dist/server.js'), join(stage, 'dist/server.js'));
cpSync(join(root, 'client/dist'), join(stage, 'client/dist'), { recursive: true });
cpSync(join(root, 'scripts/hosting/app.cjs'), join(stage, 'app.cjs'));
cpSync(join(root, 'scripts/hosting/LEEME.md'), join(stage, 'LEEME.md'));
cpSync(join(root, '.env.example'), join(stage, '.env.example'));

writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      private: true,
      type: 'module',
      main: 'app.cjs',
      engines: pkg.engines,
      scripts: { start: 'node app.cjs' },
      dependencies: pkg.dependencies,
    },
    null,
    2,
  ) + '\n',
);

// Dependencias de producción incluidas (todas son JavaScript puro: no hay nada que compilar en el hosting).
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], stage);

run('zip', ['-qr', zip, '.'], stage);
console.log(`\n✓ Paquete listo: ${zip}`);

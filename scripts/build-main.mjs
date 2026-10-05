import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Las dependencias se instalan con la app (electron-builder las empaqueta en node_modules).
  packages: 'external',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

const configs = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js' },
  { ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js', packages: undefined, external: ['electron'] },
];

if (watch) {
  for (const c of configs) await (await context(c)).watch();
} else {
  for (const c of configs) await build(c);
}

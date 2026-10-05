import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  root: path.resolve(root, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(root, 'src/shared') } },
  css: { postcss: path.resolve(root, 'postcss.config.cjs') },
  build: { outDir: path.resolve(root, 'dist/renderer'), emptyOutDir: true, chunkSizeWarningLimit: 3000 },
  server: { port: 5173, strictPort: true },
});

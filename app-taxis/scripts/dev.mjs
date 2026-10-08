// Arranca el backend (con recarga) y el cliente Vite a la vez.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'watch', 'server/src/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, CLIENT_DIR: '', JWT_SECRET: process.env.JWT_SECRET ?? 'solo-desarrollo', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'admin12345' },
  }),
  spawn('npx', ['vite', '--config', 'client/vite.config.ts'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && (stop(), process.exit(code))));

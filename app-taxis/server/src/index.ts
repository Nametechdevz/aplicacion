import { loadConfig } from './config';
import { createApp } from './app';

const config = loadConfig();
const server = createApp(config);

server.http.listen(config.port, () => {
  console.log(`🚕 App de Taxis escuchando en http://localhost:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    console.log('Cerrando…');
    await server.close();
    process.exit(0);
  });
}

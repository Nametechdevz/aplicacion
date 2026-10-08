// Archivo de arranque de TaxiYa.
// Sirve para paneles tipo cPanel / Plesk ("Setup Node.js App", Phusion Passenger), PM2 o `node app.cjs`.
process.chdir(__dirname);

// Oculta el aviso "SQLite is an experimental feature" de Node 22 (la base de datos integrada funciona igual).
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const type = typeof args[0] === 'string' ? args[0] : args[0]?.type;
  if (type === 'ExperimentalWarning' && /SQLite/i.test(String(warning?.message ?? warning))) return;
  return emitWarning.call(process, warning, ...args);
};

import('./dist/server.js').catch((err) => {
  console.error('No se pudo iniciar TaxiYa:', err);
  process.exit(1);
});

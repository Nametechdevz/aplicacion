<?php

declare(strict_types=1);

/**
 * Instalación por línea de comandos (alternativa al instalador web).
 * Uso: php bin/install.php [--demo]
 *  - Importa database/schema.sql (idempotente).
 *  - Con --demo importa database/seed.sql (datos de demostración).
 *  - Crea storage/installed.lock para bloquear el instalador web.
 * Después cree el administrador con: php bin/create-admin.php "Nombre" correo@dominio.com
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Services\InstallService;

$status = InstallService::databaseStatus();
if (!$status['connected']) {
    fwrite(STDERR, $status['error'] . "\n");
    exit(1);
}
InstallService::importFile(BASE_PATH . '/database/schema.sql');
fwrite(STDOUT, "Esquema importado.\n");
if (in_array('--demo', $argv, true)) {
    InstallService::importFile(BASE_PATH . '/database/seed.sql');
    fwrite(STDOUT, "Datos de demostración importados.\n");
}
InstallService::writeLock();
fwrite(STDOUT, "Instalador web bloqueado (storage/installed.lock).\n");
fwrite(STDOUT, "Siguiente paso: php bin/create-admin.php \"Nombre\" correo@dominio.com\n");

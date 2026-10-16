<?php
declare(strict_types=1);

/**
 * Carga datos de DEMOSTRACIÓN (opcional). Bloqueado en producción.
 *   JSP_DEMO_PASSWORD='ClaveDemo2026' php bin/seed-demo.php
 * Si no se define JSP_DEMO_PASSWORD se genera una clave aleatoria y se muestra.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';
require dirname(__DIR__) . '/database/seeders/DemoSeeder.php';

use App\Core\Config;
use App\Core\Database;

if (Config::get('app.env') === 'production' && !in_array('--force', $argv, true)) {
    fwrite(STDERR, "Los datos de demostración están bloqueados en producción.\n");
    exit(1);
}
if ((int) Database::connection()->value('SELECT COUNT(*) FROM products') > 0) {
    fwrite(STDERR, "La base de datos ya contiene productos. Ejecute sobre una instalación limpia (php bin/migrate.php --fresh).\n");
    exit(1);
}
$password = getenv('JSP_DEMO_PASSWORD') ?: ('Demo' . bin2hex(random_bytes(4)) . '26');
(new \Database\Seeders\DemoSeeder($password))->run(static fn ($m) => print($m . "\n"));
echo "\nUsuarios de demostración: admin.centro, admin.norte, cajero.centro, cajero.norte, cajero.occidente\n";
echo "Contraseña de demostración: $password\n";

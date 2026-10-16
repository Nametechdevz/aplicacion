<?php
declare(strict_types=1);

/**
 * Migraciones de base de datos.
 *   php bin/migrate.php                 aplica migraciones pendientes
 *   php bin/migrate.php --fresh         borra TODAS las tablas y reinstala (bloqueado en producción)
 *   php bin/migrate.php --fresh --force permite --fresh en producción (¡destruye datos!)
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Config;
use App\Support\Migrator;

$args = array_slice($argv, 1);
$cfg = Config::get('database');
$pdo = new PDO(
    sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $cfg['host'], $cfg['port']),
    $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$db = str_replace('`', '', $cfg['database']);
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$db`");
$pdo->exec("SET time_zone = '+00:00'");

$migrator = new Migrator($pdo, dirname(__DIR__) . '/database/migrations');
if (in_array('--fresh', $args, true)) {
    if (Config::get('app.env') === 'production' && !in_array('--force', $args, true)) {
        fwrite(STDERR, "--fresh está bloqueado en producción. Use --force si realmente desea borrar todos los datos.\n");
        exit(1);
    }
    echo "Eliminando tablas de `$db`…\n";
    $migrator->dropAll();
}
$n = $migrator->run(static fn ($m) => print($m . "\n"));
echo $n ? "Listo: $n migraciones aplicadas.\n" : "La base de datos ya está al día.\n";

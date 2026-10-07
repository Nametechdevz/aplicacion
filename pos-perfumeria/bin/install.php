<?php
/**
 * Instalador por consola:  php bin/install.php
 * Crea la base de datos (si no existe), las tablas y los datos iniciales.
 */
declare(strict_types=1);

$base = dirname(__DIR__);
if (!is_file("$base/config/config.php")) {
    copy("$base/config/config.example.php", "$base/config/config.php");
    $cfg = file_get_contents("$base/config/config.php");
    file_put_contents("$base/config/config.php", str_replace('CAMBIA-ESTA-LLAVE-POR-UNA-ALEATORIA-DE-32+', bin2hex(random_bytes(24)), $cfg));
    exit("Se creó config/config.php. Revisa los datos de conexión y vuelve a ejecutar.\n");
}
$c = (require "$base/config/config.php")['db'];
$pdo = new PDO("mysql:host={$c['host']};port={$c['port']};charset=utf8mb4", $c['user'], $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE DATABASE IF NOT EXISTS `{$c['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `{$c['name']}`");

if ((int) $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'")->fetchColumn() > 0) {
    if (!in_array('--force', $argv, true)) {
        exit("La base de datos ya está instalada. Usa --force para borrar TODO y reinstalar.\n");
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
        $pdo->exec("DROP TABLE `$t`");
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
}
foreach (['schema.sql', 'seed.sql'] as $f) {
    $pdo->exec(file_get_contents("$base/database/$f"));
    echo "✔ $f\n";
}
echo "\nListo. Ingresa con admin@perfumeria.com / admin123 (¡cámbiala!).\n";

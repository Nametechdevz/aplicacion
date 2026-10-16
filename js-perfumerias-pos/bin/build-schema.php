<?php
declare(strict_types=1);

/** Genera database/schema.sql concatenando las migraciones (instalación manual vía phpMyAdmin). */
if (PHP_SAPI !== 'cli') {
    exit(1);
}
$dir = dirname(__DIR__) . '/database';
$files = glob($dir . '/migrations/*.sql');
sort($files);
$out = "-- JS Perfumerías POS — esquema completo generado desde database/migrations.\n"
    . "-- Importe este archivo en una base de datos vacía (utf8mb4) o use: php bin/migrate.php\n\n";
foreach ($files as $f) {
    $out .= "-- >>> " . basename($f) . "\n" . file_get_contents($f) . "\n";
}
$out .= "\nCREATE TABLE IF NOT EXISTS migrations (migration VARCHAR(190) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n";
foreach ($files as $f) {
    $out .= "INSERT INTO migrations (migration) VALUES ('" . basename($f) . "');\n";
}
file_put_contents($dir . '/schema.sql', $out);
echo "database/schema.sql generado.\n";

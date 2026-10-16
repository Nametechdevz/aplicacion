<?php
declare(strict_types=1);

/**
 * JS Perfumerías POS — punto de entrada único.
 * Solo la carpeta public/ debe ser accesible desde la web.
 */

// Servidor embebido de PHP (desarrollo): servir archivos estáticos directamente.
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (is_file($file) && !str_ends_with($file, '.php')) {
        return false;
    }
}

require dirname(__DIR__) . '/app/bootstrap.php';

$app = new App\Core\App();
$app->handle(App\Core\Request::capture())->send();

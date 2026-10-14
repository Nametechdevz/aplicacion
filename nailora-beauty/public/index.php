<?php

declare(strict_types=1);

// Servidor embebido de PHP (php -S): servir archivos estáticos directamente
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if ($file !== __DIR__ . '/' && is_file($file) && !str_ends_with($file, '.php')) {
        return false;
    }
}

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Request;
use App\Core\Router;
use App\Core\Session;

Session::start();

$router = new Router();
require BASE_PATH . '/routes/web.php';
require BASE_PATH . '/routes/admin.php';

$router->dispatch(Request::capture());

<?php
declare(strict_types=1);

// Servidor embebido de PHP: servir archivos estáticos directamente
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (is_file($file)) {
        return false;
    }
}

require dirname(__DIR__) . '/app/bootstrap.php';

session_name('posperfumeria');
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
]);
session_start();

// Cierre de sesión por inactividad (8 horas)
if (!empty($_SESSION['user_id']) && time() - ($_SESSION['last_activity'] ?? 0) > 8 * 3600) {
    App\Core\Auth::logout();
    session_start();
}
$_SESSION['last_activity'] = time();

header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$router = new App\Core\Router();
require BASE_PATH . '/app/routes.php';

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
} catch (Throwable $e) {
    error_log($e->__toString());
    http_response_code(500);
    if (is_ajax()) {
        json_response(['ok' => false, 'error' => 'Error interno: ' . $e->getMessage()], 500);
    }
    $msg = App\Core\Config::get('app.env') === 'development' ? $e->getMessage() . "\n" . $e->getTraceAsString() : 'Ocurrió un error inesperado. Revisa storage/logs/php-error.log';
    echo '<pre style="padding:20px;font-family:monospace">' . e($msg) . '</pre>';
}

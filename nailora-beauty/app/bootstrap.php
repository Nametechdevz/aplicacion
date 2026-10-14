<?php

declare(strict_types=1);

use App\Core\Env;
use App\Core\ErrorHandler;

define('BASE_PATH', dirname(__DIR__));
define('PUBLIC_PATH', BASE_PATH . '/public');

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('Nailora Beauty requiere PHP 8.1 o superior (recomendado 8.2+).');
}

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require BASE_PATH . '/app/Helpers/functions.php';
require BASE_PATH . '/app/Helpers/format.php';
require BASE_PATH . '/app/Helpers/validation.php';
require BASE_PATH . '/app/Helpers/icons.php';

Env::load(BASE_PATH . '/.env');

date_default_timezone_set((string) config('app.timezone'));
mb_internal_encoding('UTF-8');

ErrorHandler::register((bool) config('app.debug'), (string) config('app.log_path'));

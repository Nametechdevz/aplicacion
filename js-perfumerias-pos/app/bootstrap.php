<?php
declare(strict_types=1);

/**
 * Arranque común para la web, la consola y las pruebas.
 * Usa el autoloader de Composer si existe; si no, uno PSR-4 equivalente
 * (la aplicación no tiene dependencias externas obligatorias).
 */

$root = dirname(__DIR__);

if (is_file($root . '/vendor/autoload.php')) {
    require $root . '/vendor/autoload.php';
} else {
    spl_autoload_register(static function (string $class) use ($root): void {
        if (str_starts_with($class, 'App\\')) {
            $file = $root . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
            if (is_file($file)) {
                require $file;
            }
        }
    });
    require_once $root . '/app/Helpers/functions.php';
}

App\Core\Env::load($root . '/.env');
App\Core\Config::load($root . '/config');

date_default_timezone_set('UTC'); // Se almacena en UTC; se muestra en APP_TIMEZONE.
mb_internal_encoding('UTF-8');

ini_set('display_errors', App\Core\Config::get('app.debug') ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', $root . '/storage/logs/php-error.log');
error_reporting(E_ALL);

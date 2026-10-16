<?php
declare(strict_types=1);

use App\Core\Env;

return [
    'name' => Env::get('APP_NAME', 'JS Perfumerías POS'),
    'env' => Env::get('APP_ENV', 'production'),
    'debug' => (bool) Env::get('APP_DEBUG', false),
    'url' => rtrim((string) Env::get('APP_URL', ''), '/'),
    // Subdirectorio cuando la app no está en la raíz del dominio (se detecta automáticamente).
    'base_path' => '',
    'timezone' => Env::get('APP_TIMEZONE', 'America/Bogota'),
    'locale' => Env::get('APP_LOCALE', 'es_CO'),
    'currency' => Env::get('APP_CURRENCY', 'COP'),
    'session_name' => Env::get('SESSION_NAME', 'jsp_session'),
    'session_lifetime' => (int) Env::get('SESSION_LIFETIME', 480),
    'session_secure' => Env::get('SESSION_SECURE', 'auto'),
    'login_max_attempts' => (int) Env::get('LOGIN_MAX_ATTEMPTS', 5),
    'login_lock_minutes' => (int) Env::get('LOGIN_LOCK_MINUTES', 15),
    'upload_max_mb' => (int) Env::get('UPLOAD_MAX_MB', 5),
];

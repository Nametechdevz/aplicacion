<?php

declare(strict_types=1);

namespace App\Core;

final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $cfg = config('app.session');
        $secureSetting = strtolower((string) $cfg['secure']);
        $secure = $secureSetting === 'auto' ? Request::isHttps() : filter_var($secureSetting, FILTER_VALIDATE_BOOLEAN);

        if (is_dir($cfg['path']) && is_writable($cfg['path'])) {
            session_save_path($cfg['path']);
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', '86400');
        session_name($cfg['name']);
        $basePath = (string) parse_url((string) config('app.url'), PHP_URL_PATH);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => $basePath !== '' ? rtrim($basePath, '/') . '/' : '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        $_SESSION[$key] = $value;
    }

    public static function forget(string $key): void
    {
        unset($_SESSION[$key]);
    }

    public static function regenerate(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
    }

    public static function destroy(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'secure' => $params['secure'],
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            session_destroy();
        }
    }

    public static function flash(string $type, string $message): void
    {
        $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
    }

    public static function pullFlash(): array
    {
        $messages = $_SESSION['_flash'] ?? [];
        unset($_SESSION['_flash']);
        return $messages;
    }

    public static function flashInput(array $input, array $errors = []): void
    {
        unset($input['_token'], $input['password'], $input['password_confirmation'], $input['current_password']);
        $_SESSION['_old'] = $input;
        $_SESSION['_errors'] = $errors;
    }

    /** Mueve old/errors a una variable de petición para que se lean una sola vez. */
    public static function consumeInput(): void
    {
        $GLOBALS['__old_input'] = $_SESSION['_old'] ?? [];
        $GLOBALS['__errors'] = $_SESSION['_errors'] ?? [];
        unset($_SESSION['_old'], $_SESSION['_errors']);
    }
}

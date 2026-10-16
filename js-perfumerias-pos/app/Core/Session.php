<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Sesión PHP endurecida: cookie HttpOnly, SameSite=Lax, Secure en HTTPS,
 * modo estricto y expiración por inactividad.
 * En pruebas (CLI) se usa un almacén en memoria.
 */
final class Session
{
    private static bool $started = false;
    private static array $memory = [];
    private static bool $useMemory = false;

    public static function start(bool $secure): void
    {
        if (PHP_SAPI === 'cli') {
            self::$useMemory = true;
            self::$started = true;
            return;
        }
        if (self::$started) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        $lifetime = (int) Config::get('app.session_lifetime', 480) * 60;
        ini_set('session.gc_maxlifetime', (string) $lifetime);
        session_name((string) Config::get('app.session_name', 'jsp_session'));
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        self::$started = true;

        $now = time();
        $last = $_SESSION['_last_activity'] ?? $now;
        if (($now - $last) > $lifetime) {
            self::invalidate();
            session_start();
        }
        $_SESSION['_last_activity'] = $now;
    }

    public static function useMemory(): void
    {
        self::$useMemory = true;
        self::$started = true;
        self::$memory = [];
    }

    private static function &store(): array
    {
        if (self::$useMemory) {
            return self::$memory;
        }
        return $_SESSION;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $s = &self::store();
        return $s[$key] ?? $default;
    }

    public static function put(string $key, mixed $value): void
    {
        $s = &self::store();
        $s[$key] = $value;
    }

    public static function forget(string $key): void
    {
        $s = &self::store();
        unset($s[$key]);
    }

    public static function pull(string $key, mixed $default = null): mixed
    {
        $value = self::get($key, $default);
        self::forget($key);
        return $value;
    }

    public static function regenerate(): void
    {
        if (!self::$useMemory && session_status() === PHP_SESSION_ACTIVE) {
            session_regenerate_id(true);
        }
    }

    public static function invalidate(): void
    {
        if (self::$useMemory) {
            self::$memory = [];
            return;
        }
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
                'httponly' => true, 'samesite' => $p['samesite'] ?? 'Lax',
            ]);
            session_destroy();
        }
    }

    public static function flash(string $type, string $message): void
    {
        $flashes = self::get('_flash', []);
        $flashes[] = ['type' => $type, 'message' => $message];
        self::put('_flash', $flashes);
    }

    public static function flashes(): array
    {
        return self::pull('_flash', []);
    }

    /** Conserva valores del formulario y errores para volver a mostrarlos. */
    public static function withInput(array $input, array $errors = []): void
    {
        unset($input['_token'], $input['password'], $input['password_confirmation']);
        self::put('_old', $input);
        self::put('_errors', $errors);
    }
}

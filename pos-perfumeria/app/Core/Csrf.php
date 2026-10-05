<?php
namespace App\Core;

class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['_csrf'])) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf'];
    }

    public static function verify(): void
    {
        $sent = $_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($sent) || !hash_equals(self::token(), $sent)) {
            if (is_ajax()) {
                json_response(['ok' => false, 'error' => 'Token de seguridad inválido. Recarga la página.'], 419);
            }
            http_response_code(419);
            exit('Token de seguridad inválido o la sesión expiró. Vuelve atrás y recarga la página.');
        }
    }
}

<?php
declare(strict_types=1);

namespace App\Core;

final class Csrf
{
    public static function token(): string
    {
        $token = Session::get('_csrf');
        if (!is_string($token) || strlen($token) !== 64) {
            $token = bin2hex(random_bytes(32));
            Session::put('_csrf', $token);
        }
        return $token;
    }

    public static function rotate(): void
    {
        Session::put('_csrf', bin2hex(random_bytes(32)));
    }

    public static function verify(Request $request): void
    {
        $sent = $request->header('X-CSRF-Token') ?: (string) ($request->post['_token'] ?? ($request->json()['_token'] ?? ''));
        $expected = Session::get('_csrf');
        if (!is_string($expected) || $sent === '' || !hash_equals($expected, $sent)) {
            throw new HttpException(419, 'La sesión del formulario expiró. Recargue la página e intente de nuevo.');
        }
    }
}

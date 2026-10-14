<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Core\HttpException;
use App\Core\Request;

final class CsrfMiddleware
{
    public static function handle(Request $request): void
    {
        $sent = (string) ($request->input('_token') ?? $request->header('X-CSRF-Token') ?? '');
        $expected = (string) ($_SESSION['_csrf'] ?? '');
        if ($expected === '' || $sent === '' || !hash_equals($expected, $sent)) {
            throw new HttpException(419);
        }
    }
}

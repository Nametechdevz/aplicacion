<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Core\Request;
use App\Core\Session;
use App\Models\User;

final class AuthMiddleware
{
    public static function handle(Request $request): void
    {
        $user = $_SESSION['admin_user'] ?? null;
        $lifetime = max(5, (int) config('app.session.admin_lifetime_minutes')) * 60;
        $last = (int) ($_SESSION['admin_last_activity'] ?? 0);

        $valid = is_array($user) && isset($user['id']) && (time() - $last) <= $lifetime;
        if ($valid) {
            // Revalida contra la BD: un usuario desactivado pierde el acceso de inmediato
            $fresh = User::find((int) $user['id']);
            $valid = $fresh !== null && (int) $fresh['is_active'] === 1;
        }

        if (!$valid) {
            unset($_SESSION['admin_user'], $_SESSION['admin_last_activity']);
            if ($request->wantsJson()) {
                json_response(['ok' => false, 'message' => 'Sesión expirada. Inicie sesión de nuevo.'], 401);
            }
            if ($request->method === 'GET') {
                $_SESSION['admin_intended'] = $request->path;
            }
            Session::flash('info', 'Inicie sesión para continuar.');
            redirect('admin/login');
        }

        $_SESSION['admin_last_activity'] = time();
        header('Cache-Control: no-store, private');
        header('X-Robots-Tag: noindex, nofollow');
    }

    public static function guest(Request $request): void
    {
        if (!empty($_SESSION['admin_user'])) {
            redirect('admin');
        }
    }
}

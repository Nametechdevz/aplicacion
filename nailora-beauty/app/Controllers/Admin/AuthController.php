<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Services\AuthService;
use App\Core\Session;

final class AuthController extends AdminController
{
    public function showLogin(): void
    {
        header('X-Robots-Tag: noindex, nofollow');
        $this->view('admin/auth/login', ['pageTitle' => 'Iniciar sesión | Administración'], 'layouts/minimal');
    }

    public function login(): void
    {
        $email = mb_substr((string) $this->request->input('email', ''), 0, 190);
        $password = (string) $this->request->input('password', '');
        $ip = $this->request->ip();

        if ($email === '' || $password === '') {
            Session::flashInput(['email' => $email]);
            $this->done('Ingrese su correo y contraseña.', 'admin/login', 'error');
        }
        if (AuthService::isLocked($email, $ip)) {
            Session::flashInput(['email' => $email]);
            $this->done('Demasiados intentos fallidos. Espere ' . config('app.admin.login_window_minutes') . ' minutos e inténtelo de nuevo.', 'admin/login', 'error');
        }
        if (!AuthService::attempt($email, $password, $ip)) {
            Session::flashInput(['email' => $email]);
            // Mensaje genérico: no revela si el correo existe
            $this->done('Correo o contraseña incorrectos.', 'admin/login', 'error');
        }

        $intended = (string) ($_SESSION['admin_intended'] ?? '');
        unset($_SESSION['admin_intended']);
        $target = str_starts_with($intended, '/admin') && !str_contains($intended, '//') ? ltrim($intended, '/') : 'admin';
        $this->done('Bienvenida, ' . explode(' ', auth_user()['name'])[0] . '.', $target);
    }

    public function logout(): void
    {
        AuthService::logout();
        $this->done('Cerró sesión correctamente.', 'admin/login');
    }
}

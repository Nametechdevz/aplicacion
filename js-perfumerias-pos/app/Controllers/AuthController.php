<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\Session;
use App\Services\Audit;
use App\Services\AuthService;

final class AuthController extends Controller
{
    public function showLogin(): Response
    {
        return $this->view('auth/login', ['title' => 'Iniciar sesión'], 'layouts/guest');
    }

    public function login(): Response
    {
        $username = $this->request->str('username');
        $password = (string) $this->request->input('password', '');
        Session::withInput(['username' => $username]);
        (new AuthService())->attempt($username, $password, $this->request->ip());
        Session::forget('_old');
        $intended = Session::pull('intended', '/');
        if (!is_string($intended) || !str_starts_with($intended, '/') || str_starts_with($intended, '//') || str_starts_with($intended, '/api/')) {
            $intended = '/';
        }
        if ($intended === '/' && !Auth::can('dashboard.view') && Auth::can('pos.sell')) {
            $intended = '/pos';
        }
        return $this->redirect($intended);
    }

    public function logout(): Response
    {
        if (Auth::check()) {
            Audit::log('auth.logout', 'user', Auth::id(), 'Cierre de sesión', null, null, Auth::activeBranchId());
        }
        Auth::logout();
        return $this->redirect('/login');
    }
}

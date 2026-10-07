<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;

class AuthController extends Controller
{
    public function loginForm(): void
    {
        if (Auth::check()) {
            redirect('/');
        }
        $this->view('auth/login', ['title' => 'Iniciar sesión'], null);
    }

    public function login(): void
    {
        $email = (string) input('email', '');
        $key = 'login_attempts_' . md5(mb_strtolower($email) . ($_SERVER['REMOTE_ADDR'] ?? ''));
        $attempts = $_SESSION[$key] ?? ['n' => 0, 't' => time()];
        if ($attempts['n'] >= 5 && time() - $attempts['t'] < 300) {
            flash('danger', 'Demasiados intentos fallidos. Espera 5 minutos.');
            redirect('/login');
        }
        if (Auth::attempt($email, (string) ($_POST['password'] ?? ''))) {
            unset($_SESSION[$key]);
            redirect(Auth::isAdmin() ? '/' : '/pos');
        }
        $_SESSION[$key] = ['n' => $attempts['n'] + 1, 't' => time()];
        $_SESSION['_old'] = ['email' => $email];
        flash('danger', 'Correo o contraseña incorrectos.');
        redirect('/login');
    }

    public function logout(): void
    {
        Auth::logout();
        redirect('/login');
    }

    public function profile(): void
    {
        $this->view('auth/profile', ['title' => 'Mi perfil', 'u' => Auth::user()]);
    }

    public function updateProfile(): void
    {
        $u = DB::one('SELECT * FROM users WHERE id = ?', [Auth::id()]);
        $name = (string) input('name');
        if ($name === '') {
            flash('danger', 'El nombre es obligatorio.');
            redirect('/profile');
        }
        $data = ['name' => $name];
        $new = (string) ($_POST['new_password'] ?? '');
        if ($new !== '') {
            if (!password_verify((string) ($_POST['current_password'] ?? ''), $u['password_hash'])) {
                flash('danger', 'La contraseña actual no es correcta.');
                redirect('/profile');
            }
            if (strlen($new) < 8 || $new !== ($_POST['new_password_confirmation'] ?? '')) {
                flash('danger', 'La nueva contraseña debe tener mínimo 8 caracteres y coincidir con la confirmación.');
                redirect('/profile');
            }
            $data['password_hash'] = password_hash($new, PASSWORD_DEFAULT);
        }
        DB::update('users', $data, 'id = ?', [$u['id']]);
        flash('success', 'Perfil actualizado.');
        redirect('/profile');
    }
}

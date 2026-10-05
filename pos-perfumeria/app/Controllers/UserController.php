<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;

class UserController extends Controller
{
    public function index(): void
    {
        $this->view('users/index', ['title' => 'Usuarios', 'users' => DB::all('SELECT * FROM users ORDER BY active DESC, name')]);
    }

    public function create(): void
    {
        $this->view('users/form', ['title' => 'Nuevo usuario', 'u' => ['role' => 'cajero', 'active' => 1]]);
    }

    public function edit(int $id): void
    {
        $this->view('users/form', ['title' => 'Editar usuario', 'u' => DB::one('SELECT * FROM users WHERE id = ?', [$id]) ?? redirect('/users')]);
    }

    public function store(): void
    {
        $data = $this->validate(null);
        if ($data === null) {
            redirect('/users/create');
        }
        DB::insert('users', $data);
        flash('success', 'Usuario creado.');
        redirect('/users');
    }

    public function update(int $id): void
    {
        $data = $this->validate($id);
        if ($data === null) {
            redirect('/users/' . $id . '/edit');
        }
        if ($id === Auth::id() && ($data['role'] !== 'admin' || !$data['active'])) {
            flash('danger', 'No puedes quitarte el rol de administrador ni desactivarte a ti mismo.');
            redirect('/users/' . $id . '/edit');
        }
        DB::update('users', $data, 'id = ?', [$id]);
        flash('success', 'Usuario actualizado.');
        redirect('/users');
    }

    private function validate(?int $id): ?array
    {
        $name = (string) input('name', '');
        $email = mb_strtolower((string) input('email', ''));
        $pass = (string) ($_POST['password'] ?? '');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('danger', 'Nombre y correo válido son obligatorios.');
            return null;
        }
        if (DB::value('SELECT id FROM users WHERE email = ?' . ($id ? ' AND id <> ' . $id : ''), [$email])) {
            flash('danger', 'Ese correo ya está registrado.');
            return null;
        }
        if ((!$id || $pass !== '') && strlen($pass) < 8) {
            flash('danger', 'La contraseña debe tener mínimo 8 caracteres.');
            return null;
        }
        $data = [
            'name'   => mb_substr($name, 0, 120),
            'email'  => $email,
            'role'   => input('role') === 'admin' ? 'admin' : 'cajero',
            'active' => input('active') ? 1 : 0,
        ];
        if ($pass !== '') {
            $data['password_hash'] = password_hash($pass, PASSWORD_DEFAULT);
        }
        return $data;
    }
}

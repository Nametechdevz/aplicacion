<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Session;
use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\User;

final class UserController extends AdminController
{
    public function index(): void
    {
        $this->render('users/index', ['title' => 'Usuarios', 'users' => User::all()], ['Usuarios' => null]);
    }

    public function store(): void
    {
        $r = $this->request;
        $v = Validator::make($r->all(), ['name' => 'required|string|min:2|max:120', 'email' => 'required|email|max:190', 'password' => 'required|string'], ['name' => 'nombre', 'email' => 'correo', 'password' => 'contraseña']);
        if ($policy = User::passwordPolicyError((string) $r->input('password', ''))) {
            $v->addError('password', $policy);
        }
        if (!$v->fails() && User::findByEmail((string) $r->input('email'))) {
            $v->addError('email', 'Ya existe un usuario con ese correo.');
        }
        if ($v->fails()) {
            $this->failValidation($v->errors(), 'admin/usuarios');
        }
        $id = User::create(clean_text($r->input('name'), 120), (string) $r->input('email'), (string) $r->input('password'));
        AuditLog::record('user.create', 'user', $id, ['email' => mb_strtolower((string) $r->input('email'))]);
        $this->done('Administrador creado. Comparta la contraseña por un canal seguro.', 'admin/usuarios');
    }

    public function toggle(string $id): void
    {
        $user = User::find((int) $id) ?? abort(404);
        if ((int) $id === auth_id()) {
            $this->done('No puede desactivar su propia cuenta.', 'admin/usuarios', 'error');
        }
        $active = (int) $user['is_active'] ? 0 : 1;
        User::update((int) $id, ['is_active' => $active]);
        AuditLog::record($active ? 'user.activate' : 'user.deactivate', 'user', (int) $id);
        $this->done($active ? 'Usuario activado.' : 'Usuario desactivado: ya no puede iniciar sesión.', 'admin/usuarios');
    }

    public function profile(): void
    {
        $this->render('users/profile', ['title' => 'Mi perfil', 'user' => User::find((int) auth_id())], ['Mi perfil' => null]);
    }

    public function updateProfile(): void
    {
        $r = $this->request;
        $user = User::findWithHash((int) auth_id()) ?? abort(404);
        $errors = [];
        $name = clean_text((string) $r->input('name', ''), 120);
        if (mb_strlen($name) < 2) {
            $errors['name'] = 'Ingrese su nombre.';
        }
        $newPassword = (string) $r->input('password', '');
        if ($newPassword !== '') {
            if (!password_verify((string) $r->input('current_password', ''), $user['password_hash'])) {
                $errors['current_password'] = 'La contraseña actual no es correcta.';
            }
            if ($policy = User::passwordPolicyError($newPassword)) {
                $errors['password'] = $policy;
            } elseif ($newPassword !== (string) $r->input('password_confirmation', '')) {
                $errors['password_confirmation'] = 'Las contraseñas no coinciden.';
            }
        }
        if ($errors) {
            $this->failValidation($errors, 'admin/perfil');
        }
        User::update((int) $user['id'], ['name' => $name]);
        $_SESSION['admin_user']['name'] = $name;
        if ($newPassword !== '') {
            User::updatePassword((int) $user['id'], $newPassword);
            Session::regenerate();
            AuditLog::record('user.password', 'user', (int) $user['id']);
        }
        $this->done($newPassword !== '' ? 'Perfil y contraseña actualizados.' : 'Perfil actualizado.', 'admin/perfil');
    }
}

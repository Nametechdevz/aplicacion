<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Database;
use App\Core\Env;
use App\Core\HttpException;
use App\Core\Response;
use App\Core\Session;
use App\Core\ValidationException;
use App\Services\Audit;
use App\Support\Migrator;
use App\Validators\Validator;

/**
 * Instalador web de un solo uso para hosting sin acceso SSH.
 *
 * Solo responde si:
 *  - INSTALL_TOKEN está definido en .env con al menos 32 caracteres, y
 *  - todavía no existe ningún superadministrador.
 * Después de crear el primer superadministrador la ruta devuelve 404 para
 * siempre; aun así, borre INSTALL_TOKEN del .env.
 */
final class InstallController extends Controller
{
    public function show(): Response
    {
        $this->guard();
        return $this->view('auth/install', ['title' => 'Instalación'], 'layouts/guest');
    }

    public function install(): Response
    {
        $this->guard();
        $token = (string) $this->request->input('install_token', '');
        if (!hash_equals((string) Env::get('INSTALL_TOKEN'), $token)) {
            sleep(2); // frena intentos de adivinar el token
            throw ValidationException::field('install_token', 'El código de instalación no coincide con INSTALL_TOKEN del archivo .env.');
        }
        $data = Validator::make($this->request->post, [
            'name' => 'required|string|max:120',
            'username' => 'required|regex:/^[a-z0-9._-]{3,60}$/',
            'email' => 'nullable|email|max:160',
            'password' => 'required|password',
        ], ['name' => 'el nombre', 'username' => 'el usuario (minúsculas, números, punto o guion)', 'password' => 'la contraseña']);
        if ($data['password'] !== ($this->request->post['password_confirmation'] ?? null)) {
            throw ValidationException::field('password_confirmation', 'La confirmación de la contraseña no coincide.');
        }

        (new Migrator($this->db->pdo(), base_path('database/migrations')))->run(static fn () => null);
        if ($this->superadminExists()) {
            throw HttpException::notFound();
        }
        $this->db->transaction(function () use ($data) {
            $id = $this->db->insert('users', [
                'name' => $data['name'], 'username' => $data['username'], 'email' => $data['email'],
                'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT), 'password_changed_at' => gmdate('Y-m-d H:i:s'),
            ]);
            $this->db->query("INSERT INTO user_roles (user_id, role_id) SELECT :u, id FROM roles WHERE code = 'superadmin'", ['u' => $id]);
            $this->db->query("INSERT INTO branch_user_assignments (branch_id, user_id, is_default) SELECT id, :u, 1 FROM branches WHERE code = 'ALM'", ['u' => $id]);
            Audit::log('user.create', 'user', $id, 'Superadministrador inicial creado con el instalador web', null, null, null, $id);
        });
        Session::flash('success', 'Instalación completada. Inicie sesión y elimine INSTALL_TOKEN del archivo .env.');
        return $this->redirect('/login');
    }

    private function guard(): void
    {
        $token = (string) Env::get('INSTALL_TOKEN', '');
        if (strlen($token) < 32 || $this->superadminExists()) {
            throw HttpException::notFound('La página que busca no existe.');
        }
    }

    private function superadminExists(): bool
    {
        try {
            return (int) Database::connection()->value(
                "SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'superadmin'"
            ) > 0;
        } catch (\PDOException) {
            return false; // tablas aún no creadas
        }
    }
}

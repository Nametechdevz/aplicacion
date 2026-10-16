<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\ValidationException;
use App\Services\Audit;
use App\Validators\Validator;

final class ProfileController extends Controller
{
    public function show(): Response
    {
        $user = $this->db->one('SELECT * FROM users WHERE id = :id', ['id' => Auth::id()]);
        $branches = $this->db->all(
            'SELECT b.name, b.type, a.is_default FROM branch_user_assignments a JOIN branches b ON b.id = a.branch_id WHERE a.user_id = :id ORDER BY b.name',
            ['id' => Auth::id()]
        );
        return $this->view('users/profile', [
            'title' => 'Mi cuenta', 'crumbs' => [['Mi cuenta', null]],
            'user' => $user, 'branches' => $branches, 'roles' => Auth::roles(), 'permissions' => Auth::permissions(),
        ]);
    }

    public function password(): Response
    {
        $user = $this->db->one('SELECT * FROM users WHERE id = :id', ['id' => Auth::id()]);
        if (!password_verify((string) $this->request->input('current_password', ''), $user['password_hash'])) {
            throw ValidationException::field('current_password', 'La contraseña actual no es correcta.');
        }
        $data = Validator::make($this->request->post, ['password' => 'required|password'], ['password' => 'la nueva contraseña']);
        if ($data['password'] !== ($this->request->post['password_confirmation'] ?? null)) {
            throw ValidationException::field('password_confirmation', 'La confirmación no coincide.');
        }
        $this->db->update('users', ['password_hash' => password_hash($data['password'], PASSWORD_DEFAULT), 'password_changed_at' => gmdate('Y-m-d H:i:s')], 'id = :id', ['id' => Auth::id()]);
        Audit::log('user.password_change', 'user', Auth::id(), 'Cambio de contraseña propio');
        return $this->success('Contraseña actualizada.', '/profile');
    }
}

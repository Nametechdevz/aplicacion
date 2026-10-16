<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Validators\Validator;

/**
 * Gestión de usuarios, roles, sucursales asignadas y permisos individuales.
 * Un administrador de sucursal solo gestiona cajeros de sus sucursales y no
 * puede otorgar roles ni permisos que él mismo no tenga.
 */
final class UserService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function create(array $input): int
    {
        $this->authorizeManage();
        $data = $this->validate($input, null);
        return $this->db->transaction(function () use ($data) {
            $id = $this->db->insert('users', [
                'name' => $data['name'], 'username' => $data['username'], 'email' => $data['email'], 'phone' => $data['phone'],
                'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT), 'is_active' => 1,
                'password_changed_at' => gmdate('Y-m-d H:i:s'), 'created_by' => Auth::id(),
            ]);
            $this->syncAccess($id, $data);
            Audit::log('user.create', 'user', $id, "Usuario creado: {$data['username']}", null, [
                'roles' => $data['roles'], 'branches' => $data['branches'], 'grants' => $data['grants'], 'denies' => $data['denies'],
            ]);
            return $id;
        });
    }

    public function update(int $id, array $input): void
    {
        $this->authorizeManage();
        $this->assertCanManageUser($id);
        $before = $this->accessSnapshot($id);
        $data = $this->validate($input, $id);
        if ($id === Auth::id() && !in_array('superadmin', $data['roles'], true) && in_array('superadmin', $before['roles'], true)) {
            throw new ValidationException('No puede quitarse a sí mismo el rol de superadministrador.');
        }
        $this->db->transaction(function () use ($id, $data, $before) {
            $update = ['name' => $data['name'], 'username' => $data['username'], 'email' => $data['email'], 'phone' => $data['phone']];
            if ($data['password']) {
                $update['password_hash'] = password_hash($data['password'], PASSWORD_DEFAULT);
                $update['password_changed_at'] = gmdate('Y-m-d H:i:s');
            }
            $this->db->update('users', $update, 'id = :id', ['id' => $id]);
            $this->syncAccess($id, $data);
            $after = $this->accessSnapshot($id);
            Audit::log($before['roles'] != $after['roles'] || $before['grants'] != $after['grants'] || $before['denies'] != $after['denies']
                ? 'user.permissions' : 'user.update', 'user', $id, "Usuario modificado: {$data['username']}", $before, $after);
            if ($data['password']) {
                Audit::log('user.password_reset', 'user', $id, "Contraseña restablecida para {$data['username']}");
            }
        });
    }

    public function toggle(int $id): bool
    {
        $this->authorizeManage();
        $this->assertCanManageUser($id);
        if ($id === Auth::id()) {
            throw new ValidationException('No puede desactivar su propio usuario.');
        }
        $u = $this->db->one('SELECT id, username, is_active FROM users WHERE id = :id', ['id' => $id]);
        $new = (int) $u['is_active'] ? 0 : 1;
        $this->db->update('users', ['is_active' => $new], 'id = :id', ['id' => $id]);
        Audit::log($new ? 'user.activate' : 'user.deactivate', 'user', $id, $u['username'], ['is_active' => $u['is_active']], ['is_active' => $new]);
        return (bool) $new;
    }

    /** Roles que el usuario actual puede asignar. */
    public function assignableRoles(): array
    {
        $roles = $this->db->all('SELECT * FROM roles ORDER BY id');
        if (Auth::can('users.manage')) {
            return $roles;
        }
        return array_values(array_filter($roles, static fn ($r) => $r['code'] === 'cashier'));
    }

    public function accessSnapshot(int $id): array
    {
        return [
            'roles' => $this->db->column('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id ORDER BY r.code', ['id' => $id]),
            'branches' => array_map('intval', $this->db->column('SELECT branch_id FROM branch_user_assignments WHERE user_id = :id ORDER BY branch_id', ['id' => $id])),
            'grants' => $this->db->column("SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = :id AND up.effect = 'grant' ORDER BY p.code", ['id' => $id]),
            'denies' => $this->db->column("SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = :id AND up.effect = 'deny' ORDER BY p.code", ['id' => $id]),
        ];
    }

    private function validate(array $input, ?int $id): array
    {
        $data = Validator::make($input, [
            'name' => 'required|string|max:120',
            'username' => 'required|regex:/^[a-z0-9._-]{3,60}$/',
            'email' => 'nullable|email|max:160',
            'phone' => 'nullable|string|max:40',
            'password' => ($id ? 'nullable' : 'required') . '|password',
        ], ['name' => 'el nombre', 'username' => 'el usuario (minúsculas, números, punto o guion)', 'email' => 'el correo', 'password' => 'la contraseña']);
        $data['username'] = mb_strtolower($data['username']);
        if (($input['password'] ?? '') !== '' && ($input['password'] ?? '') !== ($input['password_confirmation'] ?? '')) {
            throw ValidationException::field('password_confirmation', 'La confirmación de la contraseña no coincide.');
        }
        if ($this->db->value('SELECT id FROM users WHERE username = :u' . ($id ? ' AND id <> :id' : ''), $id ? ['u' => $data['username'], 'id' => $id] : ['u' => $data['username']])) {
            throw ValidationException::field('username', 'Ese nombre de usuario ya existe.');
        }
        if ($data['email'] && $this->db->value('SELECT id FROM users WHERE email = :e' . ($id ? ' AND id <> :id' : ''), $id ? ['e' => $data['email'], 'id' => $id] : ['e' => $data['email']])) {
            throw ValidationException::field('email', 'Ese correo ya está registrado.');
        }

        $assignable = array_column($this->assignableRoles(), 'code');
        $roles = array_values(array_unique(array_map('strval', (array) ($input['roles'] ?? []))));
        if (!$roles) {
            throw ValidationException::field('roles', 'Asigne al menos un rol.');
        }
        foreach ($roles as $r) {
            if (!in_array($r, $assignable, true)) {
                throw HttpException::forbidden('No puede asignar el rol seleccionado.');
            }
        }
        $branches = array_values(array_unique(array_map('intval', (array) ($input['branches'] ?? []))));
        foreach ($branches as $b) {
            if (!Auth::canAccessBranch($b)) {
                throw HttpException::forbidden('No puede asignar sucursales que no administra.');
            }
        }
        if (!$branches && !in_array('superadmin', $roles, true)) {
            throw ValidationException::field('branches', 'Asigne al menos una sucursal.');
        }
        $default = (int) ($input['default_branch'] ?? ($branches[0] ?? 0));
        $mine = Auth::permissions();
        $grants = array_values(array_unique(array_map('strval', (array) ($input['grants'] ?? []))));
        $denies = array_values(array_unique(array_map('strval', (array) ($input['denies'] ?? []))));
        if (!Auth::can('users.manage')) {
            foreach ($grants as $g) {
                if (!in_array($g, $mine, true)) {
                    throw HttpException::forbidden('No puede conceder permisos que usted no tiene.');
                }
            }
        }
        $data['roles'] = $roles;
        $data['branches'] = $branches;
        $data['default_branch'] = in_array($default, $branches, true) ? $default : ($branches[0] ?? null);
        $data['grants'] = $grants;
        $data['denies'] = array_values(array_diff($denies, $grants));
        return $data;
    }

    private function syncAccess(int $id, array $data): void
    {
        $this->db->execute('DELETE FROM user_roles WHERE user_id = :id', ['id' => $id]);
        foreach ($data['roles'] as $code) {
            $this->db->query('INSERT INTO user_roles (user_id, role_id) SELECT :u, id FROM roles WHERE code = :c', ['u' => $id, 'c' => $code]);
        }
        // Un administrador de sucursal solo modifica asignaciones dentro de su alcance.
        [$in, $params] = Database::in(Auth::branchIds());
        $this->db->execute("DELETE FROM branch_user_assignments WHERE user_id = :id AND branch_id IN ($in)", array_merge($params, ['id' => $id]));
        foreach ($data['branches'] as $b) {
            $this->db->insert('branch_user_assignments', ['branch_id' => $b, 'user_id' => $id, 'is_default' => $b === $data['default_branch'] ? 1 : 0]);
        }
        $this->db->execute('DELETE FROM user_permissions WHERE user_id = :id', ['id' => $id]);
        foreach (['grant' => $data['grants'], 'deny' => $data['denies']] as $effect => $codes) {
            foreach ($codes as $code) {
                $this->db->query(
                    'INSERT INTO user_permissions (user_id, permission_id, effect) SELECT :u, id, :e FROM permissions WHERE code = :c',
                    ['u' => $id, 'e' => $effect, 'c' => $code]
                );
            }
        }
    }

    private function authorizeManage(): void
    {
        Auth::authorize('users.manage', 'users.manage_branch');
    }

    public function assertCanManageUser(int $id): void
    {
        if (!$this->db->value('SELECT id FROM users WHERE id = :id', ['id' => $id])) {
            throw HttpException::notFound('El usuario no existe.');
        }
        if (Auth::can('users.manage')) {
            return;
        }
        $roles = $this->db->column('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id', ['id' => $id]);
        if (array_diff($roles, ['cashier'])) {
            throw HttpException::forbidden('Solo puede gestionar usuarios con rol de cajero.');
        }
        $branches = array_map('intval', $this->db->column('SELECT branch_id FROM branch_user_assignments WHERE user_id = :id', ['id' => $id]));
        if ($branches && !array_intersect($branches, Auth::branchIds())) {
            throw HttpException::forbidden('El usuario pertenece a otra sucursal.');
        }
    }
}

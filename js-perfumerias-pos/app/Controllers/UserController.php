<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\DiscountService;
use App\Services\UserService;

final class UserController extends Controller
{
    public function index(): Response
    {
        $where = ['1 = 1'];
        $params = [];
        if (!Auth::can('users.manage')) {
            // Un administrador de sucursal ve solo el equipo de sus sucursales.
            [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
            $where[] = "EXISTS (SELECT 1 FROM branch_user_assignments a WHERE a.user_id = u.id AND a.branch_id IN ($in))";
            $params += $bp;
        }
        $branch = $this->request->int('branch');
        if ($branch) {
            Auth::authorizeBranch($branch);
            $where[] = 'EXISTS (SELECT 1 FROM branch_user_assignments a2 WHERE a2.user_id = u.id AND a2.branch_id = :fb)';
            $params['fb'] = $branch;
        }
        $role = $this->request->str('role');
        if ($role !== '') {
            $where[] = 'EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.code = :rc)';
            $params['rc'] = $role;
        }
        $q = mb_substr($this->request->str('q'), 0, 60);
        if ($q !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $where[] = '(u.name LIKE :q1 OR u.username LIKE :q2 OR u.email LIKE :q3)';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        $status = $this->request->str('status');
        if (in_array($status, ['active', 'inactive'], true)) {
            $where[] = 'u.is_active = ' . ($status === 'active' ? 1 : 0);
        }
        [$ms] = utc_range(substr(local_today(), 0, 8) . '01', local_today());
        $users = $this->db->all(
            "SELECT u.*,
                    (SELECT GROUP_CONCAT(r.name ORDER BY r.id SEPARATOR ', ') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
                    (SELECT GROUP_CONCAT(r.code ORDER BY r.id) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS role_codes,
                    (SELECT GROUP_CONCAT(b.name ORDER BY a.is_default DESC, b.name SEPARATOR ', ') FROM branch_user_assignments a JOIN branches b ON b.id = a.branch_id WHERE a.user_id = u.id) AS branches,
                    (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS overrides,
                    (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.user_id = u.id AND s.status = 'completed' AND s.created_at >= :ms) AS month_sales,
                    (SELECT max_percent FROM discount_limits dl WHERE dl.scope = 'user' AND dl.scope_id = u.id) AS own_limit
             FROM users u WHERE " . implode(' AND ', $where) . ' ORDER BY u.is_active DESC, u.name',
            array_merge($params, ['ms' => $ms])
        );
        [$in2, $bp2] = Database::in(Auth::branchIds() ?: [0]);
        return $this->view('users/index', [
            'title' => 'Usuarios y roles', 'active' => 'users', 'crumbs' => [['Usuarios y roles', null]],
            'users' => $users, 'roles' => $this->db->all('SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS n FROM roles r ORDER BY r.id'),
            'branches' => $this->db->all("SELECT id, name FROM branches WHERE id IN ($in2) ORDER BY name", $bp2),
            'filters' => ['q' => $q, 'role' => $role, 'branch' => $branch, 'status' => $status],
            'roleLimits' => array_column($this->db->all("SELECT scope_id, max_percent FROM discount_limits WHERE scope = 'role'"), 'max_percent', 'scope_id'),
        ]);
    }

    public function create(): Response
    {
        return $this->form(null);
    }

    public function edit(int $id): Response
    {
        (new UserService())->assertCanManageUser($id);
        return $this->form($id);
    }

    private function form(?int $id): Response
    {
        $svc = new UserService();
        $user = $id ? $this->db->one('SELECT * FROM users WHERE id = :id', ['id' => $id]) : null;
        if ($id && !$user) {
            throw HttpException::notFound();
        }
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $pre = $this->request->int('branch');
        $access = $id ? $svc->accessSnapshot($id) : ['roles' => [], 'branches' => $pre && Auth::canAccessBranch($pre) ? [$pre] : [], 'grants' => [], 'denies' => []];
        $permissions = $this->db->all('SELECT * FROM permissions ORDER BY module, id');
        $rolePerms = [];
        foreach ($this->db->all('SELECT r.code, p.code AS perm FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id') as $r) {
            $rolePerms[$r['code']][] = $r['perm'];
        }
        return $this->view('users/form', [
            'title' => $user ? 'Editar usuario' : 'Nuevo usuario', 'active' => 'users',
            'crumbs' => [['Usuarios y roles', '/users'], [$user ? $user['name'] : 'Nuevo usuario', null]],
            'user' => $user, 'access' => $access,
            'roles' => $svc->assignableRoles(),
            'branches' => $this->db->all("SELECT id, name, type FROM branches WHERE id IN ($in) ORDER BY type = 'warehouse', name", $bp),
            'defaultBranch' => $id ? $this->db->value('SELECT branch_id FROM branch_user_assignments WHERE user_id = :id AND is_default = 1', ['id' => $id]) : ($access['branches'][0] ?? null),
            'permissions' => $permissions, 'rolePerms' => $rolePerms,
            'ownLimit' => $id ? $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'user' AND scope_id = :id", ['id' => $id]) : null,
            'scripts' => ['user-form.js'],
        ]);
    }

    public function store(): Response
    {
        $id = (new UserService())->create($this->request->post);
        $this->saveLimit($id);
        return $this->success('Usuario creado. Comparta la contraseña inicial por un canal seguro.', '/users');
    }

    public function update(int $id): Response
    {
        (new UserService())->update($id, $this->request->post);
        $this->saveLimit($id);
        return $this->success('Usuario actualizado.', '/users');
    }

    public function toggle(int $id): Response
    {
        $active = (new UserService())->toggle($id);
        return $this->success($active ? 'Usuario activado.' : 'Usuario desactivado: ya no podrá iniciar sesión.', '/users');
    }

    private function saveLimit(int $id): void
    {
        if (!Auth::can('discounts.configure') || !array_key_exists('discount_limit', $this->request->post)) {
            return;
        }
        $value = trim((string) $this->request->post['discount_limit']);
        $current = $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'user' AND scope_id = :id", ['id' => $id]);
        if (($current === null && $value === '') || ($current !== null && $value !== '' && (float) $current === (float) str_replace(',', '.', $value))) {
            return;
        }
        (new DiscountService())->saveLimit('user', $id, $value === '' ? null : $value);
    }
}

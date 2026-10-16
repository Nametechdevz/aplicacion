<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Usuario autenticado, permisos efectivos (RBAC) y alcance por sucursal.
 * Toda autorización se resuelve aquí, en el servidor.
 */
final class Auth
{
    private static ?array $user = null;
    private static ?array $permissions = null;
    private static ?array $branchIds = null;
    private static ?array $roles = null;

    public static function reset(): void
    {
        self::$user = null;
        self::$permissions = null;
        self::$branchIds = null;
        self::$roles = null;
    }

    public static function login(array $user): void
    {
        Session::regenerate();
        Csrf::rotate();
        Session::put('user_id', (int) $user['id']);
        Session::forget('branch_id');
        self::reset();
    }

    public static function logout(): void
    {
        Session::invalidate();
        self::reset();
    }

    /** Solo para pruebas y scripts de consola. */
    public static function actingAs(int $userId): void
    {
        Session::put('user_id', $userId);
        Session::forget('branch_id');
        self::reset();
    }

    public static function check(): bool
    {
        return self::user() !== null;
    }

    public static function user(): ?array
    {
        if (self::$user === null) {
            $id = Session::get('user_id');
            if (!$id) {
                return null;
            }
            $user = Database::connection()->one(
                'SELECT id, name, username, email, phone, is_active, last_login_at FROM users WHERE id = :id',
                ['id' => (int) $id]
            );
            if (!$user || !(int) $user['is_active']) {
                Session::forget('user_id');
                return null;
            }
            self::$user = $user;
        }
        return self::$user;
    }

    public static function id(): ?int
    {
        $u = self::user();
        return $u ? (int) $u['id'] : null;
    }

    public static function requireId(): int
    {
        $id = self::id();
        if ($id === null) {
            throw new HttpException(401, 'Debe iniciar sesión.');
        }
        return $id;
    }

    public static function roles(): array
    {
        if (self::$roles === null) {
            $id = self::id();
            self::$roles = $id ? Database::connection()->column(
                'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id',
                ['id' => $id]
            ) : [];
        }
        return self::$roles;
    }

    public static function hasRole(string $code): bool
    {
        return in_array($code, self::roles(), true);
    }

    public static function permissions(): array
    {
        if (self::$permissions === null) {
            $id = self::id();
            self::$permissions = $id ? self::permissionsFor($id) : [];
        }
        return self::$permissions;
    }

    public static function permissionsFor(int $userId): array
    {
        $db = Database::connection();
        $fromRoles = $db->column(
            'SELECT DISTINCT p.code FROM user_roles ur
             JOIN role_permissions rp ON rp.role_id = ur.role_id
             JOIN permissions p ON p.id = rp.permission_id
             WHERE ur.user_id = :id',
            ['id' => $userId]
        );
        $overrides = $db->all(
            'SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = :id',
            ['id' => $userId]
        );
        $set = array_fill_keys($fromRoles, true);
        foreach ($overrides as $o) {
            if ($o['effect'] === 'grant') {
                $set[$o['code']] = true;
            } else {
                unset($set[$o['code']]);
            }
        }
        return array_keys($set);
    }

    public static function can(string $permission): bool
    {
        return in_array($permission, self::permissions(), true);
    }

    public static function authorize(string ...$permissions): void
    {
        foreach ($permissions as $p) {
            if (self::can($p)) {
                return;
            }
        }
        throw HttpException::forbidden();
    }

    public static function isGlobal(): bool
    {
        return self::can('branches.all');
    }

    /** Sucursales a las que el usuario tiene acceso. */
    public static function branchIds(): array
    {
        if (self::$branchIds === null) {
            $id = self::id();
            if (!$id) {
                return self::$branchIds = [];
            }
            $db = Database::connection();
            self::$branchIds = array_map('intval', self::isGlobal()
                ? $db->column('SELECT id FROM branches ORDER BY id')
                : $db->column(
                    'SELECT b.id FROM branch_user_assignments a JOIN branches b ON b.id = a.branch_id
                     WHERE a.user_id = :id ORDER BY a.is_default DESC, b.id',
                    ['id' => $id]
                ));
        }
        return self::$branchIds;
    }

    public static function canAccessBranch(?int $branchId): bool
    {
        return $branchId !== null && in_array($branchId, self::branchIds(), true);
    }

    public static function authorizeBranch(?int $branchId): void
    {
        if (!self::canAccessBranch($branchId)) {
            throw HttpException::forbidden('No tiene acceso a la información de esta sucursal.');
        }
    }

    /**
     * Sucursal de trabajo actual (para el POS y la caja). Siempre una sucursal
     * autorizada y activa de tipo tienda cuando existe.
     */
    public static function activeBranchId(): ?int
    {
        $ids = self::branchIds();
        $current = Session::get('branch_id');
        if ($current !== null && in_array((int) $current, $ids, true)) {
            return (int) $current;
        }
        if ($ids === []) {
            return null;
        }
        $db = Database::connection();
        [$in, $params] = Database::in($ids);
        $default = $db->value(
            "SELECT b.id FROM branches b
             LEFT JOIN branch_user_assignments a ON a.branch_id = b.id AND a.user_id = :uid
             WHERE b.id IN ($in) AND b.is_active = 1
             ORDER BY COALESCE(a.is_default, 0) DESC, (b.type = 'store') DESC, b.id LIMIT 1",
            array_merge($params, ['uid' => self::id()])
        );
        $id = $default !== null ? (int) $default : $ids[0];
        Session::put('branch_id', $id);
        return $id;
    }

    public static function setActiveBranch(int $branchId): void
    {
        self::authorizeBranch($branchId);
        Session::put('branch_id', $branchId);
    }

    /**
     * Resuelve el filtro de sucursal de un listado: si el usuario pide una
     * sucursal concreta se valida; si no, se limita a sus sucursales.
     * @return int[] sucursales efectivas
     */
    public static function scopeBranches(?int $requested): array
    {
        if ($requested !== null && $requested > 0) {
            self::authorizeBranch($requested);
            return [$requested];
        }
        return self::branchIds();
    }
}

<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;

/**
 * Políticas de descuento y flujo de autorizaciones.
 *
 * Límite efectivo de un usuario para un producto en una sucursal:
 *   base     = límite propio del usuario, o el mayor de sus roles
 *   efectivo = min(base, límite de la sucursal, límite del producto)
 * Sin el permiso pos.discount el límite es 0 %.
 */
final class DiscountService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function effectiveLimit(int $userId, int $branchId, ?int $productId = null): string
    {
        if (!in_array('pos.discount', Auth::permissionsFor($userId), true)) {
            return '0.00';
        }
        $userLimit = $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'user' AND scope_id = :id", ['id' => $userId]);
        $base = $userLimit ?? $this->db->value(
            "SELECT MAX(dl.max_percent) FROM user_roles ur JOIN discount_limits dl ON dl.scope = 'role' AND dl.scope_id = ur.role_id WHERE ur.user_id = :id",
            ['id' => $userId]
        ) ?? '0';
        $limit = Dec::norm((string) $base, 2);
        $branch = $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'branch' AND scope_id = :id", ['id' => $branchId]);
        if ($branch !== null) {
            $limit = Dec::min($limit, (string) $branch);
        }
        if ($productId) {
            $prodLimit = $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'product' AND scope_id = :id", ['id' => $productId])
                ?? $this->db->value('SELECT max_discount_pct FROM products WHERE id = :id', ['id' => $productId]);
            if ($prodLimit !== null) {
                $limit = Dec::min($limit, (string) $prodLimit);
            }
        }
        return Dec::norm($limit, 2);
    }

    /** Solicitud de autorización desde el POS. */
    public function request(int $branchId, ?int $productId, string $baseAmount, string $percent, string $reason): array
    {
        Auth::authorize('pos.sell');
        Auth::authorizeBranch($branchId);
        $percent = Dec::norm(str_replace(',', '.', $percent), 4);
        $baseAmount = Dec::norm($baseAmount, 2);
        if (!Dec::isPositive($percent) || Dec::cmp($percent, '100') > 0) {
            throw new ValidationException('Indique un porcentaje de descuento entre 0 y 100.');
        }
        if (!Dec::isPositive($baseAmount)) {
            throw new ValidationException('El importe sobre el que se solicita el descuento no es válido.');
        }
        if ($productId && !$this->db->value('SELECT id FROM products WHERE id = :id', ['id' => $productId])) {
            throw new ValidationException('Producto no válido.');
        }
        $minutes = max(5, (int) Settings::get('approval_expiry_min', '30'));
        $id = $this->db->insert('discount_approvals', [
            'branch_id' => $branchId,
            'requested_by' => Auth::id(),
            'product_id' => $productId,
            'base_amount' => $baseAmount,
            'requested_percent' => $percent,
            'requested_amount' => Dec::pct($baseAmount, $percent, 2),
            'reason' => mb_substr(trim($reason), 0, 255) ?: null,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $minutes * 60),
        ]);
        Audit::log('discount.request', 'discount_approval', $id, "Solicitud de descuento de {$percent} %", null,
            ['percent' => $percent, 'product_id' => $productId, 'base_amount' => $baseAmount], $branchId);
        return $this->find($id);
    }

    public function find(int $id): array
    {
        $row = $this->db->one(
            'SELECT da.*, u.name AS requester, d.name AS decider, p.name AS product_name
             FROM discount_approvals da
             JOIN users u ON u.id = da.requested_by
             LEFT JOIN users d ON d.id = da.decided_by
             LEFT JOIN products p ON p.id = da.product_id
             WHERE da.id = :id',
            ['id' => $id]
        );
        if (!$row) {
            throw HttpException::notFound('La solicitud no existe.');
        }
        if ($row['status'] === 'pending' && strtotime($row['expires_at'] . ' UTC') < time()) {
            $this->db->execute("UPDATE discount_approvals SET status = 'expired' WHERE id = :id AND status = 'pending'", ['id' => $id]);
            $row['status'] = 'expired';
        }
        return $row;
    }

    /** Aprobación o rechazo por un usuario con discounts.approve y límite suficiente. */
    public function decide(int $id, bool $approve, string $notes = '', ?int $deciderId = null): array
    {
        $deciderId ??= Auth::requireId();
        $perms = Auth::permissionsFor($deciderId);
        if (!in_array('discounts.approve', $perms, true)) {
            throw HttpException::forbidden('El usuario no está autorizado para aprobar descuentos.');
        }
        return $this->db->transaction(function () use ($id, $approve, $notes, $deciderId, $perms) {
            $row = $this->db->one('SELECT * FROM discount_approvals WHERE id = :id FOR UPDATE', ['id' => $id]);
            if (!$row) {
                throw HttpException::notFound('La solicitud no existe.');
            }
            if (!in_array('branches.all', $perms, true) && !$this->db->value(
                'SELECT id FROM branch_user_assignments WHERE branch_id = :b AND user_id = :u',
                ['b' => $row['branch_id'], 'u' => $deciderId]
            )) {
                throw HttpException::forbidden('No puede autorizar descuentos de otra sucursal.');
            }
            if ($row['status'] !== 'pending' || strtotime($row['expires_at'] . ' UTC') < time()) {
                throw new ValidationException('La solicitud ya fue atendida o venció.');
            }
            if ((int) $row['requested_by'] === $deciderId && !in_array('branches.all', $perms, true)) {
                throw HttpException::forbidden('Un descuento debe ser autorizado por una persona distinta de quien lo solicita.');
            }
            if ($approve) {
                $limit = $this->effectiveApproverLimit($deciderId, (int) $row['branch_id'], $row['product_id'] ? (int) $row['product_id'] : null);
                if (Dec::cmp($row['requested_percent'], $limit) > 0) {
                    throw new ValidationException("El descuento solicitado supera su límite de autorización ({$limit} %).");
                }
            }
            $this->db->update('discount_approvals', [
                'status' => $approve ? 'approved' : 'rejected',
                'decided_by' => $deciderId,
                'decided_at' => gmdate('Y-m-d H:i:s'),
                'decision_notes' => mb_substr($notes, 0, 255) ?: null,
            ], 'id = :id', ['id' => $id]);
            Audit::log($approve ? 'discount.approve' : 'discount.reject', 'discount_approval', $id,
                ($approve ? 'Descuento autorizado: ' : 'Descuento rechazado: ') . $row['requested_percent'] . ' %',
                ['status' => 'pending'], ['status' => $approve ? 'approved' : 'rejected'], (int) $row['branch_id'], $deciderId);
            return $this->find($id);
        });
    }

    /** Autorización presencial: el supervisor escribe su usuario y contraseña en el POS. */
    public function authorizeWithCredentials(int $id, string $username, string $password, string $ip): array
    {
        $auth = new AuthService($this->db);
        $user = $auth->verifyCredentials($username, $password, $ip);
        if (!$user) {
            throw new ValidationException('Usuario o contraseña del supervisor incorrectos.');
        }
        return $this->decide($id, true, 'Autorización presencial en caja', (int) $user['id']);
    }

    /** Límite de quien aprueba: superadministración sin límite; otros, su límite de rol/usuario. */
    private function effectiveApproverLimit(int $userId, int $branchId, ?int $productId): string
    {
        $perms = Auth::permissionsFor($userId);
        if (in_array('branches.all', $perms, true)) {
            return '100.00';
        }
        $userLimit = $this->db->value("SELECT max_percent FROM discount_limits WHERE scope = 'user' AND scope_id = :id", ['id' => $userId]);
        return Dec::norm((string) ($userLimit ?? $this->db->value(
            "SELECT MAX(dl.max_percent) FROM user_roles ur JOIN discount_limits dl ON dl.scope = 'role' AND dl.scope_id = ur.role_id WHERE ur.user_id = :id",
            ['id' => $userId]
        ) ?? '0'), 2);
    }

    /**
     * Comprueba, dentro de la transacción de la venta, que una autorización
     * aprobada cubre el descuento aplicado y la bloquea para su uso.
     */
    public function lockApprovalFor(int $approvalId, int $userId, int $branchId, int $productId, string $percent): array
    {
        $row = $this->db->one('SELECT * FROM discount_approvals WHERE id = :id FOR UPDATE', ['id' => $approvalId]);
        if (!$row || (int) $row['requested_by'] !== $userId || (int) $row['branch_id'] !== $branchId) {
            throw new ValidationException('La autorización de descuento no es válida para esta venta.');
        }
        if ($row['status'] !== 'approved') {
            throw new ValidationException('La autorización de descuento no está aprobada o ya fue utilizada.');
        }
        if (strtotime($row['expires_at'] . ' UTC') < time()) {
            throw new ValidationException('La autorización de descuento venció. Solicite una nueva.');
        }
        if ($row['product_id'] !== null && (int) $row['product_id'] !== $productId) {
            throw new ValidationException('La autorización corresponde a otro producto.');
        }
        // Tolerancia de 0,01 puntos por redondeo de importes.
        if (Dec::cmp($percent, Dec::add($row['requested_percent'], '0.01', 4)) > 0) {
            throw new ValidationException('El descuento aplicado supera el porcentaje autorizado.');
        }
        return $row;
    }

    public function markUsed(array $approvalIds, int $saleId): void
    {
        foreach (array_unique($approvalIds) as $id) {
            $this->db->execute(
                "UPDATE discount_approvals SET status = 'used', used_sale_id = :s WHERE id = :id AND status = 'approved'",
                ['s' => $saleId, 'id' => $id]
            );
        }
    }

    public function saveLimit(string $scope, int $scopeId, ?string $percent): void
    {
        Auth::authorize('discounts.configure');
        if (!in_array($scope, ['role', 'user', 'branch', 'product'], true)) {
            throw new ValidationException('Ámbito no válido.');
        }
        $old = $this->db->value('SELECT max_percent FROM discount_limits WHERE scope = :s AND scope_id = :id', ['s' => $scope, 'id' => $scopeId]);
        if ($percent === null || $percent === '') {
            $this->db->execute('DELETE FROM discount_limits WHERE scope = :s AND scope_id = :id', ['s' => $scope, 'id' => $scopeId]);
        } else {
            $percent = Dec::norm(str_replace(',', '.', $percent), 2);
            if (Dec::isNegative($percent) || Dec::cmp($percent, '100') > 0) {
                throw new ValidationException('El límite debe estar entre 0 y 100 %.');
            }
            $this->db->query(
                'INSERT INTO discount_limits (scope, scope_id, max_percent, updated_by) VALUES (:s, :id, :p, :u)
                 ON DUPLICATE KEY UPDATE max_percent = VALUES(max_percent), updated_by = VALUES(updated_by)',
                ['s' => $scope, 'id' => $scopeId, 'p' => $percent, 'u' => Auth::id()]
            );
        }
        Audit::log('discount.limit', 'discount_limit', $scopeId, "Límite de descuento ($scope)", ['max_percent' => $old], ['max_percent' => $percent]);
    }
}

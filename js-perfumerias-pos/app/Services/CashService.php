<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;
use App\Validators\Validator;

/**
 * Cajas, turnos y cierres.
 * El efectivo esperado se calcula a partir de cash_movements con medio
 * "efectivo": fondo inicial + ventas en efectivo (neto del cambio) +
 * entradas − salidas − gastos − reembolsos − anulaciones.
 */
final class CashService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function cashMethodId(): int
    {
        return (int) $this->db->value("SELECT id FROM payment_methods WHERE type = 'cash' ORDER BY sort_order LIMIT 1");
    }

    public function openSessionFor(int $userId, int $branchId): ?array
    {
        return $this->db->one(
            "SELECT cs.*, cr.name AS register_name, cr.code AS register_code
             FROM cash_sessions cs JOIN cash_registers cr ON cr.id = cs.register_id
             WHERE cs.user_id = :u AND cs.branch_id = :b AND cs.status = 'open' LIMIT 1",
            ['u' => $userId, 'b' => $branchId]
        );
    }

    public function open(int $registerId, string $openingAmount): int
    {
        Auth::authorize('cash.operate');
        $userId = Auth::requireId();
        $amount = Validator::money($openingAmount, 'el fondo inicial');
        return $this->db->transaction(function () use ($registerId, $amount, $userId) {
            $register = $this->db->one('SELECT * FROM cash_registers WHERE id = :id FOR UPDATE', ['id' => $registerId]);
            if (!$register || !(int) $register['is_active']) {
                throw new ValidationException('La caja seleccionada no existe o está inactiva.');
            }
            Auth::authorizeBranch((int) $register['branch_id']);
            if ($this->db->value("SELECT id FROM cash_sessions WHERE register_id = :r AND status = 'open'", ['r' => $registerId])) {
                throw new ValidationException('Esta caja ya tiene un turno abierto. Ciérrelo antes de abrir uno nuevo.');
            }
            if ($this->db->value("SELECT id FROM cash_sessions WHERE user_id = :u AND status = 'open'", ['u' => $userId])) {
                throw new ValidationException('Usted ya tiene un turno de caja abierto.');
            }
            $id = $this->db->insert('cash_sessions', [
                'register_id' => $registerId, 'branch_id' => $register['branch_id'], 'user_id' => $userId,
                'opening_amount' => $amount, 'opened_at' => gmdate('Y-m-d H:i:s'),
            ]);
            $this->db->insert('cash_movements', [
                'cash_session_id' => $id, 'type' => 'opening', 'payment_method_id' => $this->cashMethodId(),
                'amount' => $amount, 'reason' => 'Fondo inicial', 'user_id' => $userId,
            ]);
            Audit::log('cash.open', 'cash_session', $id, "Apertura de {$register['name']} con fondo " . money($amount), null,
                ['opening_amount' => $amount], (int) $register['branch_id']);
            return $id;
        });
    }

    /** Entrada, salida o gasto de efectivo con motivo obligatorio. */
    public function movement(int $sessionId, string $type, string $amount, string $reason, ?string $category = null): int
    {
        Auth::authorize('cash.movements');
        if (!in_array($type, ['cash_in', 'cash_out', 'expense'], true)) {
            throw new ValidationException('Tipo de movimiento no válido.');
        }
        $amount = Validator::money($amount, 'el valor', false);
        if (mb_strlen(trim($reason)) < 4) {
            throw ValidationException::field('reason', 'Describa el motivo del movimiento.');
        }
        return $this->db->transaction(function () use ($sessionId, $type, $amount, $reason, $category) {
            $session = $this->lockOpenSession($sessionId);
            $signed = $type === 'cash_in' ? $amount : Dec::neg($amount);
            if ($type !== 'cash_in') {
                $summary = $this->summary($sessionId);
                if (Dec::cmp($amount, $summary['expected_cash']) > 0) {
                    throw new ValidationException('El valor supera el efectivo disponible en la caja (' . money($summary['expected_cash']) . ').');
                }
            }
            $id = $this->db->insert('cash_movements', [
                'cash_session_id' => $sessionId, 'type' => $type, 'payment_method_id' => $this->cashMethodId(),
                'amount' => $signed, 'reason' => mb_substr(trim($reason), 0, 255), 'user_id' => Auth::id(),
                'authorized_by' => (int) $session['user_id'] !== Auth::id() ? Auth::id() : null,
            ]);
            if ($type === 'expense') {
                $this->db->insert('expenses', [
                    'branch_id' => $session['branch_id'], 'cash_session_id' => $sessionId,
                    'category' => mb_substr(trim((string) $category) ?: 'General', 0, 60),
                    'description' => mb_substr(trim($reason), 0, 255), 'amount' => $amount,
                    'payment_method_id' => $this->cashMethodId(), 'user_id' => Auth::id(),
                ]);
            }
            $labels = ['cash_in' => 'Entrada de efectivo', 'cash_out' => 'Salida de efectivo', 'expense' => 'Gasto de caja'];
            Audit::log('cash.' . $type, 'cash_session', $sessionId, $labels[$type] . ': ' . money($amount) . " — $reason", null,
                ['amount' => $signed], (int) $session['branch_id']);
            return $id;
        });
    }

    /** Totales del turno por tipo y medio de pago. */
    public function summary(int $sessionId): array
    {
        $session = $this->db->one('SELECT * FROM cash_sessions WHERE id = :id', ['id' => $sessionId]);
        if (!$session) {
            throw HttpException::notFound('El turno de caja no existe.');
        }
        $byMethod = $this->db->all(
            "SELECT pm.id, pm.name, pm.type,
                    COALESCE(SUM(CASE WHEN cm.type = 'sale' THEN cm.amount END), 0) AS sales,
                    COALESCE(SUM(CASE WHEN cm.type = 'refund' THEN cm.amount END), 0) AS refunds,
                    COALESCE(SUM(CASE WHEN cm.type = 'void' THEN cm.amount END), 0) AS voids,
                    COALESCE(SUM(cm.amount), 0) AS net
             FROM payment_methods pm
             LEFT JOIN cash_movements cm ON cm.payment_method_id = pm.id AND cm.cash_session_id = :s
             GROUP BY pm.id, pm.name, pm.type, pm.sort_order
             ORDER BY pm.sort_order",
            ['s' => $sessionId]
        );
        $byType = $this->db->all(
            "SELECT cm.type, COALESCE(SUM(cm.amount), 0) AS total, COUNT(*) AS n
             FROM cash_movements cm JOIN payment_methods pm ON pm.id = cm.payment_method_id
             WHERE cm.cash_session_id = :s AND pm.type = 'cash' GROUP BY cm.type",
            ['s' => $sessionId]
        );
        $types = array_column($byType, 'total', 'type');
        $expected = Dec::sum(array_column($byType, 'total'));
        $salesCount = (int) $this->db->value("SELECT COUNT(*) FROM sales WHERE cash_session_id = :s AND status = 'completed'", ['s' => $sessionId]);
        $salesTotal = (string) $this->db->value("SELECT COALESCE(SUM(total), 0) FROM sales WHERE cash_session_id = :s AND status = 'completed'", ['s' => $sessionId]);
        return [
            'session' => $session,
            'by_method' => $byMethod,
            'opening' => Dec::norm($types['opening'] ?? '0'),
            'cash_sales' => Dec::norm($types['sale'] ?? '0'),
            'cash_in' => Dec::norm($types['cash_in'] ?? '0'),
            'cash_out' => Dec::abs($types['cash_out'] ?? '0'),
            'expenses' => Dec::abs($types['expense'] ?? '0'),
            'refunds' => Dec::abs($types['refund'] ?? '0'),
            'voids' => Dec::abs($types['void'] ?? '0'),
            'expected_cash' => Dec::norm($expected),
            'sales_count' => $salesCount,
            'sales_total' => Dec::norm($salesTotal),
        ];
    }

    public function close(int $sessionId, string $countedCash, array $countDetail, string $notes): array
    {
        Auth::authorize('cash.operate');
        $counted = Validator::money($countedCash, 'el efectivo contado');
        return $this->db->transaction(function () use ($sessionId, $counted, $countDetail, $notes) {
            $session = $this->lockOpenSession($sessionId);
            if ((int) $session['user_id'] !== Auth::id() && !Auth::can('cash.approve')) {
                throw HttpException::forbidden('Solo el cajero del turno o un supervisor pueden cerrarlo.');
            }
            $summary = $this->summary($sessionId);
            $difference = Dec::sub($counted, $summary['expected_cash']);
            $tolerance = Dec::norm(Settings::get('cash_difference_tolerance', '0') ?? '0');
            $requiresApproval = Settings::bool('cash_close_requires_approval') || Dec::cmp(Dec::abs($difference), $tolerance) > 0;
            if (!Dec::isZero($difference) && mb_strlen(trim($notes)) < 4) {
                throw ValidationException::field('notes', 'Hay una diferencia de ' . money($difference) . '. Explique la causa en observaciones.');
            }
            $detail = array_filter(array_map(static fn ($v) => (int) $v, $countDetail), static fn ($v) => $v > 0);
            $snapshot = [
                'by_method' => array_map(static fn ($m) => ['name' => $m['name'], 'sales' => $m['sales'], 'refunds' => $m['refunds'], 'voids' => $m['voids'], 'net' => $m['net']], $summary['by_method']),
                'opening' => $summary['opening'], 'cash_sales' => $summary['cash_sales'], 'cash_in' => $summary['cash_in'],
                'cash_out' => $summary['cash_out'], 'expenses' => $summary['expenses'], 'refunds' => $summary['refunds'],
                'voids' => $summary['voids'], 'sales_count' => $summary['sales_count'], 'sales_total' => $summary['sales_total'],
            ];
            $status = $requiresApproval ? 'closed' : 'approved';
            $this->db->update('cash_sessions', [
                'status' => $status,
                'closed_at' => gmdate('Y-m-d H:i:s'),
                'expected_cash' => $summary['expected_cash'],
                'counted_cash' => $counted,
                'difference' => $difference,
                'totals_snapshot' => json_encode($snapshot, JSON_UNESCAPED_UNICODE),
                'count_detail' => $detail ? json_encode($detail) : null,
                'closing_notes' => mb_substr(trim($notes), 0, 500) ?: null,
            ], 'id = :id', ['id' => $sessionId]);
            Audit::log('cash.close', 'cash_session', $sessionId, 'Cierre de caja. Diferencia: ' . money($difference), null, [
                'expected' => $summary['expected_cash'], 'counted' => $counted, 'difference' => $difference, 'status' => $status,
            ], (int) $session['branch_id']);
            return ['expected' => $summary['expected_cash'], 'counted' => $counted, 'difference' => $difference, 'status' => $status];
        });
    }

    public function approve(int $sessionId, string $notes): void
    {
        Auth::authorize('cash.approve');
        $this->db->transaction(function () use ($sessionId, $notes) {
            $s = $this->db->one('SELECT * FROM cash_sessions WHERE id = :id FOR UPDATE', ['id' => $sessionId]);
            if (!$s) {
                throw HttpException::notFound();
            }
            Auth::authorizeBranch((int) $s['branch_id']);
            if ($s['status'] !== 'closed') {
                throw new ValidationException('Solo se pueden aprobar turnos cerrados pendientes de revisión.');
            }
            if ((int) $s['user_id'] === Auth::id() && !Auth::isGlobal()) {
                throw HttpException::forbidden('Un cierre debe ser aprobado por un supervisor distinto del cajero.');
            }
            $this->db->update('cash_sessions', [
                'status' => 'approved', 'approved_by' => Auth::id(), 'approved_at' => gmdate('Y-m-d H:i:s'),
                'approval_notes' => mb_substr(trim($notes), 0, 500) ?: null,
            ], 'id = :id', ['id' => $sessionId]);
            Audit::log('cash.approve', 'cash_session', $sessionId, 'Cierre de caja aprobado', ['status' => 'closed'], ['status' => 'approved'], (int) $s['branch_id']);
        });
    }

    public function lockOpenSession(int $sessionId): array
    {
        $s = $this->db->one('SELECT * FROM cash_sessions WHERE id = :id FOR UPDATE', ['id' => $sessionId]);
        if (!$s) {
            throw HttpException::notFound('El turno de caja no existe.');
        }
        Auth::authorizeBranch((int) $s['branch_id']);
        if ($s['status'] !== 'open') {
            throw new ValidationException('El turno de caja ya está cerrado; no admite nuevos movimientos.');
        }
        if ((int) $s['user_id'] !== Auth::id() && !Auth::can('cash.approve')) {
            throw HttpException::forbidden('Este turno pertenece a otro cajero.');
        }
        return $s;
    }
}

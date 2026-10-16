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
 * Devoluciones de clientes vinculadas a la venta original.
 * - La cantidad devuelta nunca supera lo vendido menos lo ya devuelto
 *   (se bloquean las líneas de venta y se reserva la cantidad al solicitar).
 * - El valor se calcula proporcional al precio final pagado por la línea.
 * - Solo los artículos revendibles regresan al inventario.
 * - Las devoluciones generan movimientos compensatorios; la venta original
 *   no se modifica.
 */
final class ReturnService
{
    private InventoryService $inventory;
    private CashService $cash;

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
        $this->inventory = new InventoryService($this->db);
        $this->cash = new CashService($this->db);
    }

    public function create(int $saleId, array $input): array
    {
        Auth::authorize('returns.create');
        $reason = trim((string) ($input['reason'] ?? ''));
        if (mb_strlen($reason) < 4) {
            throw ValidationException::field('reason', 'Indique el motivo de la devolución.');
        }
        $methodId = (int) ($input['refund_method_id'] ?? 0);
        $method = $this->db->one('SELECT * FROM payment_methods WHERE id = :id AND is_active = 1', ['id' => $methodId]);
        if (!$method) {
            throw ValidationException::field('refund_method_id', 'Seleccione el medio de reembolso.');
        }
        return $this->db->transaction(function () use ($saleId, $input, $reason, $method) {
            $sale = $this->db->one('SELECT * FROM sales WHERE id = :id FOR UPDATE', ['id' => $saleId]);
            if (!$sale) {
                throw HttpException::notFound('La venta no existe.');
            }
            Auth::authorizeBranch((int) $sale['branch_id']);
            if ($sale['status'] !== 'completed') {
                throw new ValidationException('No se pueden registrar devoluciones sobre una venta anulada.');
            }
            $items = $this->db->all('SELECT * FROM sale_items WHERE sale_id = :s ORDER BY id FOR UPDATE', ['s' => $saleId]);
            $requested = (array) ($input['items'] ?? []);
            $lines = [];
            foreach ($items as $it) {
                $row = $requested[$it['id']] ?? null;
                $raw = is_array($row) ? trim((string) ($row['quantity'] ?? '')) : '';
                if ($raw === '' || $raw === '0') {
                    continue;
                }
                $precision = $it['variant_id'] ? 0 : (int) $this->db->value('SELECT qty_precision FROM products WHERE id = :id', ['id' => $it['product_id']]);
                $qty = Validator::quantity($raw, $precision, "la cantidad a devolver de «{$it['product_name']}»");
                $available = Dec::sub($it['quantity'], $it['returned_qty'], 3);
                if (Dec::cmp($qty, $available) > 0) {
                    throw new ValidationException(sprintf(
                        'No puede devolver %s de «%s»: vendido %s, ya devuelto %s, disponible %s.',
                        qty($qty), $it['product_name'], qty($it['quantity']), qty($it['returned_qty']), qty($available)
                    ));
                }
                $condition = in_array($row['condition'] ?? '', ['resaleable', 'damaged', 'defective'], true) ? $row['condition'] : 'resaleable';
                $restock = $condition === 'resaleable' && !empty($row['restock']) ? 1 : 0;
                // Si es la devolución total pendiente, se usa el saldo exacto para evitar residuos de redondeo.
                $amount = Dec::cmp($qty, $available) === 0
                    ? Dec::sub($it['total'], $this->returnedAmount((int) $it['id']))
                    : Dec::div(Dec::mul($it['total'], $qty, 6), $it['quantity'], 2);
                $qtyBase = Dec::cmp($qty, $it['quantity']) === 0 ? $it['qty_base'] : Dec::div(Dec::mul($it['qty_base'], $qty, 6), $it['quantity'], 3);
                $lines[] = [
                    'item' => $it, 'qty' => $qty, 'qty_base' => $qtyBase, 'amount' => $amount,
                    'cost' => Dec::mul($qtyBase, $it['unit_cost'], 2), 'restock' => $restock, 'condition' => $condition,
                ];
            }
            if (!$lines) {
                throw new ValidationException('Seleccione al menos un artículo y la cantidad a devolver.');
            }
            $total = Dec::sum(array_column($lines, 'amount'));
            $needsApproval = Settings::bool('returns_require_approval') && !Auth::can('returns.approve');
            $number = Sequence::next('return', 'DV-');
            $returnId = $this->db->insert('returns', [
                'number' => $number, 'sale_id' => $saleId, 'branch_id' => $sale['branch_id'], 'user_id' => Auth::id(),
                'status' => 'pending', 'reason' => mb_substr($reason, 0, 255), 'refund_method_id' => $method['id'],
                'total' => $total, 'cost_total' => Dec::sum(array_column($lines, 'cost')),
            ]);
            foreach ($lines as $l) {
                $this->db->insert('return_items', [
                    'return_id' => $returnId, 'sale_item_id' => $l['item']['id'], 'product_id' => $l['item']['product_id'],
                    'quantity' => $l['qty'], 'qty_base' => $l['qty_base'], 'amount' => $l['amount'], 'cost_amount' => $l['cost'],
                    'restock' => $l['restock'], 'item_condition' => $l['condition'],
                ]);
                // Se compromete la cantidad desde la solicitud para impedir devoluciones duplicadas.
                $this->db->execute('UPDATE sale_items SET returned_qty = returned_qty + :q WHERE id = :id', ['q' => $l['qty'], 'id' => $l['item']['id']]);
            }
            Audit::log('return.create', 'return', $returnId, "Devolución $number de la venta {$sale['number']} por " . money($total),
                null, ['total' => $total, 'status' => 'pending'], (int) $sale['branch_id']);
            if (!$needsApproval) {
                $this->complete($returnId);
            }
            return ['id' => $returnId, 'number' => $number, 'status' => $needsApproval ? 'pending' : 'completed', 'total' => $total];
        });
    }

    public function approve(int $returnId): void
    {
        Auth::authorize('returns.approve');
        $this->db->transaction(fn () => $this->complete($returnId));
    }

    public function reject(int $returnId, string $reason): void
    {
        Auth::authorize('returns.approve');
        $this->db->transaction(function () use ($returnId, $reason) {
            $r = $this->lock($returnId);
            foreach ($this->db->all('SELECT * FROM return_items WHERE return_id = :r', ['r' => $returnId]) as $ri) {
                $this->db->execute('UPDATE sale_items SET returned_qty = returned_qty - :q WHERE id = :id', ['q' => $ri['quantity'], 'id' => $ri['sale_item_id']]);
            }
            $this->db->update('returns', ['status' => 'rejected', 'rejection_reason' => mb_substr(trim($reason), 0, 255) ?: null, 'approved_by' => Auth::id(), 'approved_at' => gmdate('Y-m-d H:i:s')], 'id = :id', ['id' => $returnId]);
            Audit::log('return.reject', 'return', $returnId, "Devolución {$r['number']} rechazada", ['status' => 'pending'], ['status' => 'rejected'], (int) $r['branch_id']);
        });
    }

    /** Aplica inventario y reembolso. Debe ejecutarse dentro de una transacción. */
    private function complete(int $returnId): void
    {
        $r = $this->lock($returnId);
        $method = $this->db->one('SELECT * FROM payment_methods WHERE id = :id', ['id' => $r['refund_method_id']]);
        $session = $this->cash->openSessionFor(Auth::requireId(), (int) $r['branch_id']);
        if ($method['type'] === 'cash') {
            if (!$session) {
                throw new ValidationException('Para reembolsar en efectivo debe tener un turno de caja abierto en esta sucursal.');
            }
            $summary = $this->cash->summary((int) $session['id']);
            if (Dec::cmp($r['total'], $summary['expected_cash']) > 0) {
                throw new ValidationException('No hay suficiente efectivo en caja para el reembolso (' . money($summary['expected_cash']) . ' disponibles).');
            }
        }
        $items = $this->db->all('SELECT * FROM return_items WHERE return_id = :r ORDER BY product_id', ['r' => $returnId]);
        foreach ($items as $ri) {
            if ((int) $ri['restock']) {
                $unitCost = $this->db->value('SELECT unit_cost FROM sale_items WHERE id = :id', ['id' => $ri['sale_item_id']]);
                $this->inventory->change((int) $r['branch_id'], (int) $ri['product_id'], $ri['qty_base'], 'customer_return',
                    'return', $returnId, "Devolución {$r['number']}", (string) $unitCost, true);
            }
        }
        if ($session) {
            $this->db->insert('cash_movements', [
                'cash_session_id' => $session['id'], 'type' => 'refund', 'payment_method_id' => $method['id'],
                'amount' => Dec::neg($r['total']), 'reference_type' => 'return', 'reference_id' => $returnId,
                'reason' => "Devolución {$r['number']}", 'user_id' => Auth::id(),
            ]);
        }
        $this->db->update('returns', [
            'status' => 'completed', 'cash_session_id' => $session['id'] ?? null,
            'approved_by' => Auth::id(), 'approved_at' => gmdate('Y-m-d H:i:s'),
        ], 'id = :id', ['id' => $returnId]);
        Audit::log('return.complete', 'return', $returnId, "Devolución {$r['number']} aplicada; reembolso " . money($r['total']) . " por {$method['name']}",
            ['status' => 'pending'], ['status' => 'completed'], (int) $r['branch_id']);
    }

    private function lock(int $returnId): array
    {
        $r = $this->db->one('SELECT * FROM returns WHERE id = :id FOR UPDATE', ['id' => $returnId]);
        if (!$r) {
            throw HttpException::notFound('La devolución no existe.');
        }
        Auth::authorizeBranch((int) $r['branch_id']);
        if ($r['status'] !== 'pending') {
            throw new ValidationException('La devolución ya fue procesada.');
        }
        return $r;
    }

    private function returnedAmount(int $saleItemId): string
    {
        return (string) $this->db->value(
            "SELECT COALESCE(SUM(ri.amount), 0) FROM return_items ri JOIN returns r ON r.id = ri.return_id
             WHERE ri.sale_item_id = :id AND r.status <> 'rejected'",
            ['id' => $saleItemId]
        );
    }
}

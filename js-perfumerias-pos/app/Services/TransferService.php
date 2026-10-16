<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;

/**
 * Transferencias entre sucursales con trazabilidad completa:
 *   requested → approved (reserva en origen) → in_transit (sale del origen,
 *   queda en tránsito en destino) → received | received_with_differences → resolved
 * Cada transición bloquea la transferencia (FOR UPDATE) para que un cambio de
 * estado repetido o simultáneo no altere el inventario dos veces.
 */
final class TransferService
{
    private InventoryService $inventory;

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
        $this->inventory = new InventoryService($this->db);
    }

    public function create(int $fromId, int $toId, array $items, string $notes = ''): int
    {
        Auth::authorize('transfers.request', 'inventory.distribute');
        if ($fromId === $toId) {
            throw new ValidationException('El origen y el destino deben ser diferentes.');
        }
        // Quien solicita debe pertenecer al origen o al destino.
        if (!Auth::canAccessBranch($toId) && !Auth::canAccessBranch($fromId)) {
            throw HttpException::forbidden('No puede crear transferencias entre sucursales que no administra.');
        }
        $branches = $this->db->all('SELECT id, name, is_active FROM branches WHERE id IN (:a, :b)', ['a' => $fromId, 'b' => $toId]);
        if (count($branches) !== 2 || in_array(0, array_map('intval', array_column($branches, 'is_active')), true)) {
            throw new ValidationException('El origen o el destino no existe o está inactivo.');
        }
        $lines = $this->cleanItems($items);
        return $this->db->transaction(function () use ($fromId, $toId, $lines, $notes) {
            $number = Sequence::next('transfer', 'TR-');
            $id = $this->db->insert('stock_transfers', [
                'number' => $number, 'from_branch_id' => $fromId, 'to_branch_id' => $toId,
                'status' => 'requested', 'notes' => mb_substr(trim($notes), 0, 500) ?: null,
                'requested_by' => Auth::id(), 'requested_at' => gmdate('Y-m-d H:i:s'),
            ]);
            foreach ($lines as $pid => $qty) {
                $this->db->insert('stock_transfer_items', ['transfer_id' => $id, 'product_id' => $pid, 'qty_requested' => $qty]);
            }
            Audit::log('transfer.create', 'stock_transfer', $id, "Transferencia $number solicitada", null, ['items' => count($lines)], $toId);
            return $id;
        });
    }

    /** Aprueba (opcionalmente con cantidades ajustadas) y reserva existencias en el origen. */
    public function approve(int $id, array $approvedQty = []): void
    {
        Auth::authorize('transfers.approve');
        $this->db->transaction(function () use ($id, $approvedQty) {
            $t = $this->lockTransfer($id, ['requested']);
            Auth::authorizeBranch((int) $t['from_branch_id']);
            $items = $this->items($id);
            foreach ($items as $it) {
                $qty = $it['qty_requested'];
                if (isset($approvedQty[$it['id']]) && $approvedQty[$it['id']] !== '') {
                    $qty = $this->qty((string) $approvedQty[$it['id']], (int) $it['qty_precision'], true);
                    if (Dec::cmp($qty, $it['qty_requested']) > 0) {
                        throw new ValidationException("No puede aprobar más de lo solicitado para «{$it['name']}».");
                    }
                }
                if (Dec::isPositive($qty)) {
                    $this->inventory->reserve((int) $t['from_branch_id'], (int) $it['product_id'], $qty);
                }
                $this->db->execute('UPDATE stock_transfer_items SET qty_approved = :q WHERE id = :id', ['q' => $qty, 'id' => $it['id']]);
            }
            $this->db->update('stock_transfers', ['status' => 'approved', 'approved_by' => Auth::id(), 'approved_at' => gmdate('Y-m-d H:i:s')], 'id = :id', ['id' => $id]);
            Audit::log('transfer.approve', 'stock_transfer', $id, "Transferencia {$t['number']} aprobada", ['status' => 'requested'], ['status' => 'approved'], (int) $t['from_branch_id']);
        });
    }

    public function reject(int $id, string $reason): void
    {
        Auth::authorize('transfers.approve');
        if (mb_strlen(trim($reason)) < 4) {
            throw ValidationException::field('reason', 'Indique el motivo del rechazo.');
        }
        $this->db->transaction(function () use ($id, $reason) {
            $t = $this->lockTransfer($id, ['requested']);
            Auth::authorizeBranch((int) $t['from_branch_id']);
            $this->db->update('stock_transfers', ['status' => 'rejected', 'rejection_reason' => mb_substr($reason, 0, 255), 'approved_by' => Auth::id(), 'approved_at' => gmdate('Y-m-d H:i:s')], 'id = :id', ['id' => $id]);
            Audit::log('transfer.reject', 'stock_transfer', $id, "Transferencia {$t['number']} rechazada: $reason", ['status' => 'requested'], ['status' => 'rejected'], (int) $t['from_branch_id']);
        });
    }

    public function cancel(int $id, string $reason): void
    {
        $this->db->transaction(function () use ($id, $reason) {
            $t = $this->lockTransfer($id, ['requested', 'approved']);
            if ((int) $t['requested_by'] !== Auth::id() && !Auth::can('transfers.approve')) {
                throw HttpException::forbidden('Solo quien solicitó la transferencia o un aprobador puede cancelarla.');
            }
            Auth::authorize('transfers.request', 'transfers.approve');
            if ($t['status'] === 'approved') {
                foreach ($this->items($id) as $it) {
                    if ($it['qty_approved'] !== null && Dec::isPositive($it['qty_approved'])) {
                        $this->inventory->release((int) $t['from_branch_id'], (int) $it['product_id'], $it['qty_approved']);
                    }
                }
            }
            $this->db->update('stock_transfers', ['status' => 'cancelled', 'rejection_reason' => mb_substr(trim($reason), 0, 255) ?: null], 'id = :id', ['id' => $id]);
            Audit::log('transfer.cancel', 'stock_transfer', $id, "Transferencia {$t['number']} cancelada", ['status' => $t['status']], ['status' => 'cancelled'], (int) $t['from_branch_id']);
        });
    }

    /** Despacho: descuenta del origen, libera la reserva y deja la mercancía en tránsito. */
    public function dispatch(int $id): void
    {
        Auth::authorize('transfers.dispatch');
        $this->db->transaction(function () use ($id) {
            $t = $this->lockTransfer($id, ['approved']);
            Auth::authorizeBranch((int) $t['from_branch_id']);
            $sent = 0;
            foreach ($this->items($id) as $it) {
                $qty = $it['qty_approved'] ?? '0';
                if (!Dec::isPositive($qty)) {
                    $this->db->execute('UPDATE stock_transfer_items SET qty_sent = 0 WHERE id = :id', ['id' => $it['id']]);
                    continue;
                }
                $this->inventory->release((int) $t['from_branch_id'], (int) $it['product_id'], $qty);
                $this->inventory->change((int) $t['from_branch_id'], (int) $it['product_id'], Dec::neg($qty), 'transfer_out',
                    'transfer', $id, "Despacho {$t['number']}");
                $this->inventory->addInTransit((int) $t['to_branch_id'], (int) $it['product_id'], $qty);
                $cost = $this->db->value('SELECT cost FROM products WHERE id = :id', ['id' => $it['product_id']]);
                $this->db->execute('UPDATE stock_transfer_items SET qty_sent = :q, unit_cost = :c WHERE id = :id', ['q' => $qty, 'c' => $cost, 'id' => $it['id']]);
                $sent++;
            }
            if ($sent === 0) {
                throw new ValidationException('La transferencia no tiene cantidades aprobadas para despachar.');
            }
            $this->db->update('stock_transfers', ['status' => 'in_transit', 'dispatched_by' => Auth::id(), 'dispatched_at' => gmdate('Y-m-d H:i:s')], 'id = :id', ['id' => $id]);
            Audit::log('transfer.dispatch', 'stock_transfer', $id, "Transferencia {$t['number']} despachada", ['status' => 'approved'], ['status' => 'in_transit'], (int) $t['from_branch_id']);
        });
    }

    /** Recepción en destino con las cantidades realmente recibidas. */
    public function receive(int $id, array $receivedQty, string $notes = ''): string
    {
        Auth::authorize('transfers.receive');
        return $this->db->transaction(function () use ($id, $receivedQty, $notes) {
            $t = $this->lockTransfer($id, ['in_transit']);
            Auth::authorizeBranch((int) $t['to_branch_id']);
            $differences = false;
            foreach ($this->items($id) as $it) {
                $sent = $it['qty_sent'] ?? '0';
                if (!Dec::isPositive($sent)) {
                    continue;
                }
                $raw = $receivedQty[$it['id']] ?? null;
                if ($raw === null || $raw === '') {
                    throw new ValidationException("Indique la cantidad recibida de «{$it['name']}».");
                }
                $qty = $this->qty((string) $raw, (int) $it['qty_precision'], true);
                if (Dec::cmp($qty, $sent) > 0) {
                    throw new ValidationException("La cantidad recibida de «{$it['name']}» no puede superar la despachada (" . qty($sent) . ').');
                }
                $this->inventory->addInTransit((int) $t['to_branch_id'], (int) $it['product_id'], Dec::neg($sent));
                if (Dec::isPositive($qty)) {
                    $this->inventory->change((int) $t['to_branch_id'], (int) $it['product_id'], $qty, 'transfer_in',
                        'transfer', $id, "Recepción {$t['number']}", $it['unit_cost']);
                }
                if (Dec::cmp($qty, $sent) !== 0) {
                    $differences = true;
                }
                $this->db->execute('UPDATE stock_transfer_items SET qty_received = :q WHERE id = :id', ['q' => $qty, 'id' => $it['id']]);
            }
            $status = $differences ? 'received_with_differences' : 'received';
            $this->db->update('stock_transfers', [
                'status' => $status, 'received_by' => Auth::id(), 'received_at' => gmdate('Y-m-d H:i:s'),
                'notes' => trim(($t['notes'] ?? '') . ($notes !== '' ? "\nRecepción: " . $notes : '')) ?: null,
            ], 'id = :id', ['id' => $id]);
            Audit::log('transfer.receive', 'stock_transfer', $id, "Transferencia {$t['number']} recibida" . ($differences ? ' con diferencias' : ''),
                ['status' => 'in_transit'], ['status' => $status], (int) $t['to_branch_id']);
            return $status;
        });
    }

    /**
     * Resolución de diferencias: cada faltante se documenta como pérdida
     * (write_off, la mercancía ya salió del origen) o se devuelve al origen
     * (return_origin, reingresa a la existencia de origen).
     */
    public function resolve(int $id, array $resolutions, string $notes): void
    {
        Auth::authorize('transfers.resolve');
        if (mb_strlen(trim($notes)) < 4) {
            throw ValidationException::field('resolution_notes', 'Documente la resolución de las diferencias.');
        }
        $this->db->transaction(function () use ($id, $resolutions, $notes) {
            $t = $this->lockTransfer($id, ['received_with_differences']);
            Auth::authorizeBranch((int) $t['from_branch_id']);
            foreach ($this->items($id) as $it) {
                $diff = Dec::sub($it['qty_sent'] ?? '0', $it['qty_received'] ?? '0', 3);
                if (!Dec::isPositive($diff)) {
                    continue;
                }
                $res = $resolutions[$it['id']] ?? '';
                if (!in_array($res, ['write_off', 'return_origin'], true)) {
                    throw new ValidationException("Seleccione cómo resolver la diferencia de «{$it['name']}».");
                }
                if ($res === 'return_origin') {
                    $this->inventory->change((int) $t['from_branch_id'], (int) $it['product_id'], $diff, 'transfer_return',
                        'transfer', $id, "Retorno de diferencia {$t['number']}", $it['unit_cost']);
                }
                $this->db->execute('UPDATE stock_transfer_items SET resolution = :r WHERE id = :id', ['r' => $res, 'id' => $it['id']]);
            }
            $this->db->update('stock_transfers', ['status' => 'resolved', 'resolved_by' => Auth::id(), 'resolved_at' => gmdate('Y-m-d H:i:s'), 'resolution_notes' => mb_substr(trim($notes), 0, 500)], 'id = :id', ['id' => $id]);
            Audit::log('transfer.resolve', 'stock_transfer', $id, "Diferencias de {$t['number']} resueltas: $notes",
                ['status' => 'received_with_differences'], ['status' => 'resolved'], (int) $t['from_branch_id']);
        });
    }

    /**
     * Distribución desde el almacén central: crea, aprueba y despacha una
     * transferencia por sucursal destino en una sola operación.
     * @param array $matrix [branchId => [productId => qty]]
     */
    public function distribute(int $fromId, array $matrix, string $notes): array
    {
        Auth::authorize('inventory.distribute');
        Auth::authorizeBranch($fromId);
        $created = [];
        $this->db->transaction(function () use ($fromId, $matrix, $notes, &$created) {
            foreach ($matrix as $toId => $products) {
                $products = array_filter((array) $products, static fn ($q) => $q !== '' && $q !== null && $q !== '0');
                if (!$products) {
                    continue;
                }
                $items = [];
                foreach ($products as $pid => $q) {
                    $items[] = ['product_id' => (int) $pid, 'quantity' => (string) $q];
                }
                $id = $this->createInternal($fromId, (int) $toId, $items, $notes ?: 'Distribución desde almacén');
                $this->approve($id);
                $this->dispatch($id);
                $created[] = $id;
            }
        });
        if (!$created) {
            throw new ValidationException('Indique al menos una cantidad para distribuir.');
        }
        return $created;
    }

    private function createInternal(int $fromId, int $toId, array $items, string $notes): int
    {
        if ($fromId === $toId) {
            throw new ValidationException('El origen y el destino deben ser diferentes.');
        }
        $active = $this->db->value("SELECT is_active FROM branches WHERE id = :id", ['id' => $toId]);
        if ($active === null || !(int) $active) {
            throw new ValidationException('Una de las sucursales de destino no existe o está inactiva.');
        }
        $lines = $this->cleanItems($items);
        $number = Sequence::next('transfer', 'TR-');
        $id = $this->db->insert('stock_transfers', [
            'number' => $number, 'from_branch_id' => $fromId, 'to_branch_id' => $toId, 'status' => 'requested',
            'notes' => mb_substr($notes, 0, 500), 'requested_by' => Auth::id(), 'requested_at' => gmdate('Y-m-d H:i:s'),
        ]);
        foreach ($lines as $pid => $qty) {
            $this->db->insert('stock_transfer_items', ['transfer_id' => $id, 'product_id' => $pid, 'qty_requested' => $qty]);
        }
        Audit::log('transfer.create', 'stock_transfer', $id, "Transferencia $number creada por distribución", null, ['items' => count($lines)], $toId);
        return $id;
    }

    public function find(int $id): array
    {
        $t = $this->db->one(
            'SELECT t.*, fb.name AS from_name, tb.name AS to_name, ru.name AS requested_name, au.name AS approved_name,
                    du.name AS dispatched_name, rcu.name AS received_name, rsu.name AS resolved_name
             FROM stock_transfers t
             JOIN branches fb ON fb.id = t.from_branch_id JOIN branches tb ON tb.id = t.to_branch_id
             JOIN users ru ON ru.id = t.requested_by
             LEFT JOIN users au ON au.id = t.approved_by LEFT JOIN users du ON du.id = t.dispatched_by
             LEFT JOIN users rcu ON rcu.id = t.received_by LEFT JOIN users rsu ON rsu.id = t.resolved_by
             WHERE t.id = :id',
            ['id' => $id]
        );
        if (!$t) {
            throw HttpException::notFound('La transferencia no existe.');
        }
        if (!Auth::canAccessBranch((int) $t['from_branch_id']) && !Auth::canAccessBranch((int) $t['to_branch_id'])) {
            throw HttpException::forbidden('No tiene acceso a esta transferencia.');
        }
        $t['items'] = $this->items($id);
        return $t;
    }

    private function items(int $transferId): array
    {
        return $this->db->all(
            'SELECT ti.*, p.name, p.code, p.qty_precision, u.code AS unit,
                    (SELECT quantity - reserved FROM inventory i WHERE i.product_id = ti.product_id AND i.branch_id = t.from_branch_id) AS origin_available
             FROM stock_transfer_items ti
             JOIN stock_transfers t ON t.id = ti.transfer_id
             JOIN products p ON p.id = ti.product_id JOIN units_of_measure u ON u.id = p.base_unit_id
             WHERE ti.transfer_id = :t ORDER BY ti.product_id',
            ['t' => $transferId]
        );
    }

    private function lockTransfer(int $id, array $allowed): array
    {
        $t = $this->db->one('SELECT * FROM stock_transfers WHERE id = :id FOR UPDATE', ['id' => $id]);
        if (!$t) {
            throw HttpException::notFound('La transferencia no existe.');
        }
        if (!in_array($t['status'], $allowed, true)) {
            throw new ValidationException('La transferencia cambió de estado y ya no admite esta acción. Recargue la página.');
        }
        return $t;
    }

    private function cleanItems(array $items): array
    {
        $lines = [];
        foreach ($items as $it) {
            $pid = (int) ($it['product_id'] ?? 0);
            $raw = (string) ($it['quantity'] ?? '');
            if (!$pid || $raw === '') {
                continue;
            }
            $p = $this->db->one('SELECT id, name, qty_precision, is_active FROM products WHERE id = :id', ['id' => $pid]);
            if (!$p) {
                throw new ValidationException('Uno de los productos no existe.');
            }
            $q = $this->qty($raw, (int) $p['qty_precision']);
            $lines[$pid] = isset($lines[$pid]) ? Dec::add($lines[$pid], $q, 3) : $q;
        }
        if (!$lines) {
            throw new ValidationException('Agregue al menos un producto con cantidad mayor que cero.');
        }
        ksort($lines);
        return $lines;
    }

    private function qty(string $raw, int $precision, bool $allowZero = false): string
    {
        $raw = str_replace(',', '.', trim($raw));
        if (!Dec::isValid($raw) || Dec::isNegative($raw) || (!$allowZero && Dec::isZero($raw))) {
            throw new ValidationException('Indique cantidades válidas' . ($allowZero ? '.' : ' mayores que cero.'));
        }
        if (Dec::decimals($raw) > $precision) {
            throw new ValidationException($precision === 0 ? 'Use unidades completas (sin decimales).' : "Use como máximo $precision decimales.");
        }
        return Dec::norm($raw, 3);
    }
}

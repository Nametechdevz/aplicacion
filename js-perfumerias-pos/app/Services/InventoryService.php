<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\ValidationException;
use App\Support\Dec;

/**
 * Único punto que modifica existencias. Cada cambio:
 *  - se ejecuta dentro de una transacción,
 *  - bloquea la fila de inventario (SELECT … FOR UPDATE),
 *  - valida existencias disponibles (cantidad − reservado),
 *  - registra un movimiento con saldo anterior y posterior en unidad base.
 */
final class InventoryService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    /** Bloquea (creándola si no existe) la fila de inventario de un producto en una sucursal. */
    public function lock(int $branchId, int $productId): array
    {
        $this->assertTx();
        $row = $this->db->one(
            'SELECT * FROM inventory WHERE branch_id = :b AND product_id = :p FOR UPDATE',
            ['b' => $branchId, 'p' => $productId]
        );
        if ($row) {
            return $row;
        }
        $this->db->query(
            'INSERT IGNORE INTO inventory (branch_id, product_id, quantity) VALUES (:b, :p, 0)',
            ['b' => $branchId, 'p' => $productId]
        );
        return $this->db->one(
            'SELECT * FROM inventory WHERE branch_id = :b AND product_id = :p FOR UPDATE',
            ['b' => $branchId, 'p' => $productId]
        );
    }

    /**
     * Aplica una variación (con signo) a la existencia física.
     * @return array{before:string, after:string, movement_id:int}
     */
    public function change(
        int $branchId,
        int $productId,
        string $delta,
        string $type,
        ?string $refType = null,
        ?int $refId = null,
        ?string $notes = null,
        ?string $unitCost = null,
        ?bool $allowNegative = null,
    ): array {
        $this->assertTx();
        $delta = Dec::norm($delta, 3);
        $row = $this->lock($branchId, $productId);
        $before = Dec::norm($row['quantity'], 3);
        $after = Dec::add($before, $delta, 3);

        if (Dec::isNegative($delta)) {
            $available = Dec::sub($after, $row['reserved'], 3);
            if (Dec::isNegative($available) && !($allowNegative ?? $this->negativeAllowed($productId))) {
                $p = $this->db->one(
                    'SELECT p.name, u.code AS unit FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id WHERE p.id = :id',
                    ['id' => $productId]
                );
                $disp = Dec::sub($before, $row['reserved'], 3);
                throw new ValidationException(sprintf(
                    'Existencias insuficientes de «%s»: disponible %s, requerido %s.',
                    $p['name'] ?? '#' . $productId,
                    qty(Dec::max($disp, '0'), $p['unit'] ?? null),
                    qty(Dec::abs($delta), $p['unit'] ?? null)
                ), ['stock' => $productId]);
            }
        }

        $this->db->execute(
            'UPDATE inventory SET quantity = :q WHERE id = :id',
            ['q' => $after, 'id' => $row['id']]
        );
        $movementId = $this->db->insert('inventory_movements', [
            'branch_id' => $branchId,
            'product_id' => $productId,
            'type' => $type,
            'quantity' => $delta,
            'balance_before' => $before,
            'balance_after' => $after,
            'unit_cost' => $unitCost ?? $this->db->value('SELECT cost FROM products WHERE id = :id', ['id' => $productId]),
            'reference_type' => $refType,
            'reference_id' => $refId,
            'notes' => $notes !== null ? mb_substr($notes, 0, 255) : null,
            'user_id' => Auth::id(),
        ]);
        return ['before' => $before, 'after' => $after, 'movement_id' => $movementId];
    }

    public function reserve(int $branchId, int $productId, string $qty): void
    {
        $row = $this->lock($branchId, $productId);
        $available = Dec::sub(Dec::sub($row['quantity'], $row['reserved'], 3), $qty, 3);
        if (Dec::isNegative($available)) {
            $name = $this->db->value('SELECT name FROM products WHERE id = :id', ['id' => $productId]);
            throw new ValidationException(sprintf(
                'No hay existencias disponibles suficientes de «%s» para reservar %s.',
                $name,
                qty($qty)
            ));
        }
        $this->db->execute('UPDATE inventory SET reserved = reserved + :q WHERE id = :id', ['q' => $qty, 'id' => $row['id']]);
    }

    public function release(int $branchId, int $productId, string $qty): void
    {
        $row = $this->lock($branchId, $productId);
        $new = Dec::max(Dec::sub($row['reserved'], $qty, 3), '0');
        $this->db->execute('UPDATE inventory SET reserved = :r WHERE id = :id', ['r' => $new, 'id' => $row['id']]);
    }

    public function addInTransit(int $branchId, int $productId, string $qty): void
    {
        $row = $this->lock($branchId, $productId);
        $new = Dec::max(Dec::add($row['in_transit'], $qty, 3), '0');
        $this->db->execute('UPDATE inventory SET in_transit = :t WHERE id = :id', ['t' => $new, 'id' => $row['id']]);
    }

    /**
     * Ajuste manual o merma con motivo obligatorio. $mode:
     *  'set' fija la existencia a $value (conteo),
     *  'in'  suma $value,
     *  'out' resta $value (las mermas siempre restan).
     */
    public function adjust(int $branchId, int $productId, string $mode, string $value, string $type, string $reason): array
    {
        Auth::authorize('inventory.adjust');
        Auth::authorizeBranch($branchId);
        if (!in_array($type, ['adjustment', 'waste', 'count'], true)) {
            throw new ValidationException('Tipo de ajuste no válido.');
        }
        if (mb_strlen(trim($reason)) < 4) {
            throw ValidationException::field('reason', 'Explique el motivo del ajuste (mínimo 4 caracteres).');
        }
        if (!in_array($mode, ['set', 'in', 'out'], true)) {
            throw new ValidationException('Modo de ajuste no válido.');
        }
        $product = $this->product($productId);
        $value = $this->validQty($value, (int) $product['qty_precision'], $mode === 'set');

        return $this->db->transaction(function () use ($branchId, $productId, $mode, $value, $type, $reason) {
            $row = $this->lock($branchId, $productId);
            $delta = match ($mode) {
                'set' => Dec::sub($value, $row['quantity'], 3),
                'in' => $value,
                'out' => Dec::neg($value),
            };
            if ($type === 'waste' && Dec::isPositive($delta)) {
                $delta = Dec::neg($delta);
            }
            if (Dec::isZero($delta)) {
                throw new ValidationException('La existencia ya coincide con el valor indicado; no se registró ningún ajuste.');
            }
            // Las salidas por ajuste o merma no pueden dejar existencias negativas.
            $result = $this->change($branchId, $productId, $delta, $type, 'adjustment', null, $reason, null, $mode === 'set');
            Audit::log('inventory.' . $type, 'product', $productId, $reason,
                ['quantity' => $result['before']], ['quantity' => $result['after']], $branchId);
            return $result;
        });
    }

    /** Conteo físico de varios productos: genera un documento y los ajustes necesarios. */
    public function physicalCount(int $branchId, array $counts, string $notes): array
    {
        Auth::authorize('inventory.adjust');
        Auth::authorizeBranch($branchId);
        $clean = [];
        foreach ($counts as $productId => $value) {
            if ($value === '' || $value === null) {
                continue;
            }
            $product = $this->product((int) $productId);
            $clean[(int) $productId] = $this->validQty((string) $value, (int) $product['qty_precision'], true);
        }
        if (!$clean) {
            throw new ValidationException('Registre al menos una cantidad contada.');
        }
        ksort($clean);
        return $this->db->transaction(function () use ($branchId, $clean, $notes) {
            $number = Sequence::next('count', 'CF-');
            $countId = $this->db->insert('inventory_counts', [
                'number' => $number, 'branch_id' => $branchId, 'notes' => $notes ?: null, 'created_by' => Auth::id(),
            ]);
            $adjusted = 0;
            foreach ($clean as $productId => $counted) {
                $row = $this->lock($branchId, $productId);
                $diff = Dec::sub($counted, $row['quantity'], 3);
                $this->db->insert('inventory_count_items', [
                    'count_id' => $countId, 'product_id' => $productId,
                    'system_qty' => $row['quantity'], 'counted_qty' => $counted, 'difference' => $diff,
                ]);
                if (!Dec::isZero($diff)) {
                    $this->change($branchId, $productId, $diff, 'count', 'count', $countId, 'Conteo ' . $number, null, true);
                    $adjusted++;
                }
            }
            Audit::log('inventory.count', 'inventory_count', $countId, "Conteo físico $number: $adjusted ajustes", null, null, $branchId);
            return ['id' => $countId, 'number' => $number, 'adjusted' => $adjusted];
        });
    }

    /** Entrada directa de mercancía (p. ej. inventario inicial) sin orden de compra. */
    public function entry(int $branchId, array $items, string $type, string $notes): int
    {
        Auth::authorize('inventory.entry');
        Auth::authorizeBranch($branchId);
        if (!in_array($type, ['initial', 'entry'], true)) {
            throw new ValidationException('Tipo de entrada no válido.');
        }
        if (mb_strlen(trim($notes)) < 4) {
            throw ValidationException::field('notes', 'Indique el origen o soporte de la entrada.');
        }
        $lines = [];
        foreach ($items as $item) {
            $pid = (int) ($item['product_id'] ?? 0);
            if (!$pid || ($item['quantity'] ?? '') === '') {
                continue;
            }
            $product = $this->product($pid);
            $lines[$pid] = [
                'qty' => $this->validQty((string) $item['quantity'], (int) $product['qty_precision']),
                'cost' => isset($item['unit_cost']) && $item['unit_cost'] !== '' ? Dec::norm(str_replace(',', '.', (string) $item['unit_cost']), 4) : null,
            ];
        }
        if (!$lines) {
            throw new ValidationException('Agregue al menos un producto con cantidad.');
        }
        ksort($lines);
        return $this->db->transaction(function () use ($branchId, $lines, $type, $notes) {
            $count = 0;
            foreach ($lines as $pid => $line) {
                if ($line['cost'] !== null) {
                    (new ProductService($this->db))->applyIncomingCost($pid, $line['qty'], $line['cost'], 'entry');
                }
                $this->change($branchId, $pid, $line['qty'], $type, 'entry', null, $notes, $line['cost']);
                $count++;
            }
            Audit::log('inventory.entry', 'branch', $branchId, "Entrada de mercancía ($count productos): $notes", null, null, $branchId);
            return $count;
        });
    }

    public function setMinStock(int $branchId, int $productId, string $min): void
    {
        Auth::authorize('inventory.adjust', 'inventory.distribute');
        Auth::authorizeBranch($branchId);
        $min = Dec::norm(str_replace(',', '.', $min), 3);
        if (Dec::isNegative($min)) {
            throw new ValidationException('El stock mínimo no puede ser negativo.');
        }
        $this->db->transaction(function () use ($branchId, $productId, $min) {
            $row = $this->lock($branchId, $productId);
            $this->db->execute('UPDATE inventory SET min_stock = :m WHERE id = :id', ['m' => $min, 'id' => $row['id']]);
            Audit::log('inventory.min_stock', 'product', $productId, 'Stock mínimo actualizado', ['min_stock' => $row['min_stock']], ['min_stock' => $min], $branchId);
        });
    }

    public function negativeAllowed(int $productId): bool
    {
        return Settings::bool('allow_negative_stock')
            && (int) $this->db->value('SELECT allow_negative_stock FROM products WHERE id = :id', ['id' => $productId]) === 1;
    }

    private function product(int $id): array
    {
        $p = $this->db->one('SELECT id, name, qty_precision FROM products WHERE id = :id', ['id' => $id]);
        if (!$p) {
            throw new ValidationException('El producto indicado no existe.');
        }
        return $p;
    }

    private function validQty(string $value, int $precision, bool $allowZero = false): string
    {
        $value = str_replace(',', '.', trim($value));
        if (!Dec::isValid($value) || Dec::isNegative($value) || (!$allowZero && Dec::isZero($value))) {
            throw new ValidationException('Indique una cantidad válida' . ($allowZero ? ' (cero o mayor).' : ' mayor que cero.'));
        }
        if (Dec::decimals($value) > $precision) {
            throw new ValidationException($precision === 0
                ? 'Este producto se maneja en unidades completas; no use decimales.'
                : "Este producto admite como máximo $precision decimales.");
        }
        return Dec::norm($value, 3);
    }

    private function assertTx(): void
    {
        if (!$this->db->inTransaction()) {
            throw new \LogicException('Las operaciones de inventario requieren una transacción activa');
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\InventoryMovement;
use DomainException;

/**
 * Política de inventario:
 *  - El stock se DESCUENTA al registrar el pedido (estado Pendiente), dentro de la misma
 *    transacción que crea el pedido, con bloqueo de filas (SELECT ... FOR UPDATE).
 *  - Si el pedido se CANCELA, el stock se devuelve una sola vez: orders.stock_status pasa
 *    de 'reserved' a 'released' y la restricción única de inventory_movements impide
 *    registrar dos devoluciones para la misma línea.
 *  - Nunca se permiten existencias negativas.
 */
final class InventoryService
{
    /** Bloquea y devuelve la fila de stock (producto o variante). */
    public static function lockRow(int $productId, ?int $variantId): array
    {
        $product = Database::fetch('SELECT * FROM products WHERE id = :id FOR UPDATE', ['id' => $productId]);
        if (!$product) {
            throw new DomainException('El producto no existe.');
        }
        $variant = null;
        if ($variantId !== null) {
            $variant = Database::fetch('SELECT * FROM product_variants WHERE id = :id AND product_id = :pid FOR UPDATE', ['id' => $variantId, 'pid' => $productId]);
            if (!$variant) {
                throw new DomainException('La variante no pertenece a este producto.');
            }
        } elseif ((int) $product['has_variants'] === 1) {
            throw new DomainException('Este producto maneja el inventario por variantes: seleccione una variante.');
        }
        $current = (int) ($variant !== null ? $variant['stock'] : $product['stock']);
        return ['product' => $product, 'variant' => $variant, 'stock' => $current];
    }

    private static function writeStock(int $productId, ?int $variantId, int $newStock): void
    {
        if ($newStock < 0) {
            throw new DomainException('Las existencias no pueden quedar en negativo.');
        }
        if ($variantId !== null) {
            Database::query('UPDATE product_variants SET stock = :s WHERE id = :id', ['s' => $newStock, 'id' => $variantId]);
        } else {
            Database::query('UPDATE products SET stock = :s WHERE id = :id', ['s' => $newStock, 'id' => $productId]);
        }
    }

    /**
     * Movimiento manual desde administración.
     * Para 'adjustment' $quantity es la cantidad final contada; para el resto, unidades a sumar o restar.
     */
    public static function adjust(int $productId, ?int $variantId, string $type, int $quantity, string $reason, ?string $reference, ?int $userId): array
    {
        if (!isset(InventoryMovement::MANUAL_TYPES[$type])) {
            throw new DomainException('Tipo de movimiento no válido.');
        }
        if (trim($reason) === '') {
            throw new DomainException('El motivo es obligatorio.');
        }
        $direction = InventoryMovement::MANUAL_TYPES[$type];
        if ($direction !== 'set' && $quantity <= 0) {
            throw new DomainException('La cantidad debe ser mayor que cero.');
        }
        if ($direction === 'set' && $quantity < 0) {
            throw new DomainException('La cantidad contada no puede ser negativa.');
        }

        return Database::transaction(static function () use ($productId, $variantId, $type, $quantity, $reason, $reference, $userId, $direction): array {
            $row = self::lockRow($productId, $variantId);
            $before = $row['stock'];
            $after = match ($direction) {
                'in' => $before + $quantity,
                'out' => $before - $quantity,
                'set' => $quantity,
            };
            if ($after < 0) {
                throw new DomainException("No hay suficientes existencias: hay $before y se intentan retirar $quantity.");
            }
            if ($after === $before) {
                throw new DomainException('La cantidad final es igual a la actual; no se registró ningún movimiento.');
            }
            self::writeStock($productId, $variantId, $after);
            $id = InventoryMovement::record([
                'product_id' => $productId,
                'variant_id' => $variantId,
                'movement_type' => $type,
                'quantity_before' => $before,
                'quantity_change' => $after - $before,
                'quantity_after' => $after,
                'reason' => mb_substr($reason, 0, 255),
                'reference' => $reference !== null && $reference !== '' ? mb_substr($reference, 0, 120) : null,
                'user_id' => $userId,
            ]);
            return ['id' => $id, 'before' => $before, 'after' => $after];
        });
    }

    /** Registra existencias iniciales al crear un producto o variante. */
    public static function initial(int $productId, ?int $variantId, int $quantity, ?int $userId): void
    {
        if ($quantity <= 0) {
            return;
        }
        InventoryMovement::record([
            'product_id' => $productId,
            'variant_id' => $variantId,
            'movement_type' => 'initial',
            'quantity_before' => 0,
            'quantity_change' => $quantity,
            'quantity_after' => $quantity,
            'reason' => 'Existencias iniciales al crear el ' . ($variantId ? 'variante' : 'producto'),
            'user_id' => $userId,
        ]);
    }

    /**
     * Descuenta el stock de un pedido. Debe ejecutarse dentro de la transacción del checkout,
     * después de bloquear las filas con lockRow().
     */
    public static function reserveLine(int $orderId, string $orderCode, int $productId, ?int $variantId, int $before, int $quantity): void
    {
        $after = $before - $quantity;
        if ($after < 0) {
            throw new DomainException('Stock insuficiente.');
        }
        self::writeStock($productId, $variantId, $after);
        InventoryMovement::record([
            'product_id' => $productId,
            'variant_id' => $variantId,
            'movement_type' => 'order_reserve',
            'quantity_before' => $before,
            'quantity_change' => -$quantity,
            'quantity_after' => $after,
            'reason' => 'Pedido registrado en la tienda',
            'reference' => $orderCode,
            'order_id' => $orderId,
        ]);
    }

    /**
     * Devuelve al inventario las unidades de un pedido cancelado. Ejecutar dentro de una
     * transacción que ya bloqueó la fila del pedido. Es idempotente.
     */
    public static function releaseOrder(array $order, array $items, ?int $userId): int
    {
        if ($order['stock_status'] !== 'reserved') {
            return 0;
        }
        // Orden estable de bloqueo para evitar interbloqueos
        usort($items, static fn ($a, $b) => [(int) $a['product_id'], (int) $a['variant_id']] <=> [(int) $b['product_id'], (int) $b['variant_id']]);
        $restored = 0;
        foreach ($items as $item) {
            if ($item['product_id'] === null) {
                continue; // producto eliminado: no hay fila de stock que devolver
            }
            $productId = (int) $item['product_id'];
            $variantId = $item['variant_id'] !== null ? (int) $item['variant_id'] : null;
            $alreadyReturned = Database::value(
                "SELECT 1 FROM inventory_movements WHERE order_id = :o AND movement_type = 'order_cancel_return' AND product_id = :p AND variant_key = :v",
                ['o' => (int) $order['id'], 'p' => $productId, 'v' => $variantId ?? 0]
            );
            if ($alreadyReturned) {
                continue;
            }
            $product = Database::fetch('SELECT id, stock FROM products WHERE id = :id FOR UPDATE', ['id' => $productId]);
            if (!$product) {
                continue;
            }
            if ($variantId !== null) {
                $variant = Database::fetch('SELECT id, stock FROM product_variants WHERE id = :id FOR UPDATE', ['id' => $variantId]);
                if (!$variant) {
                    continue;
                }
                $before = (int) $variant['stock'];
            } else {
                $before = (int) $product['stock'];
            }
            $qty = (int) $item['quantity'];
            self::writeStock($productId, $variantId, $before + $qty);
            InventoryMovement::record([
                'product_id' => $productId,
                'variant_id' => $variantId,
                'movement_type' => 'order_cancel_return',
                'quantity_before' => $before,
                'quantity_change' => $qty,
                'quantity_after' => $before + $qty,
                'reason' => 'Pedido cancelado: devolución al inventario',
                'reference' => $order['code'],
                'order_id' => (int) $order['id'],
                'user_id' => $userId,
            ]);
            $restored += $qty;
        }
        Database::query("UPDATE orders SET stock_status = 'released' WHERE id = :id", ['id' => (int) $order['id']]);
        return $restored;
    }
}

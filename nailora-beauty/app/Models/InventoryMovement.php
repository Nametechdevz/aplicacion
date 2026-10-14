<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\Paginator;

/**
 * Libro de movimientos de inventario. Solo inserción: la aplicación no ofrece
 * ninguna ruta para editar o eliminar movimientos.
 */
final class InventoryMovement
{
    public const TYPES = [
        'initial' => 'Inventario inicial',
        'purchase' => 'Entrada por compra o reposición',
        'return_in' => 'Entrada por devolución de cliente',
        'damage' => 'Salida por daño',
        'loss' => 'Salida por pérdida',
        'adjustment' => 'Ajuste manual (conteo)',
        'order_reserve' => 'Descuento por pedido',
        'order_cancel_return' => 'Reversión por cancelación',
    ];

    /** Tipos que el administrador puede registrar manualmente y su dirección. */
    public const MANUAL_TYPES = [
        'purchase' => 'in',
        'return_in' => 'in',
        'damage' => 'out',
        'loss' => 'out',
        'adjustment' => 'set',
    ];

    public static function record(array $data): int
    {
        return Database::insert('inventory_movements', $data);
    }

    public static function paginate(array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $params = [];
        if (!empty($f['product_id'])) {
            $where[] = 'm.product_id = :pid';
            $params['pid'] = (int) $f['product_id'];
        }
        if (!empty($f['type']) && isset(self::TYPES[$f['type']])) {
            $where[] = 'm.movement_type = :type';
            $params['type'] = $f['type'];
        }
        if (!empty($f['from'])) {
            $where[] = 'm.created_at >= :from_date';
            $params['from_date'] = $f['from'] . ' 00:00:00';
        }
        if (!empty($f['to'])) {
            $where[] = 'm.created_at <= :to_date';
            $params['to_date'] = $f['to'] . ' 23:59:59';
        }
        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM inventory_movements m WHERE $whereSql", $params);
        $pager = new Paginator($total, $perPage, $page);
        $rows = Database::fetchAll(
            "SELECT m.*, p.name AS product_name, p.sku AS product_sku, v.name AS variant_name, v.sku AS variant_sku,
                    u.name AS user_name, o.code AS order_code
             FROM inventory_movements m
             JOIN products p ON p.id = m.product_id
             LEFT JOIN product_variants v ON v.id = m.variant_id
             LEFT JOIN users u ON u.id = m.user_id
             LEFT JOIN orders o ON o.id = m.order_id
             WHERE $whereSql ORDER BY m.id DESC LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$rows, $pager];
    }
}

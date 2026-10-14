<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\Paginator;

final class Customer
{
    /**
     * Busca al cliente por teléfono normalizado (evita duplicados) y actualiza sus datos
     * de contacto con los del último pedido. Debe llamarse dentro de una transacción.
     */
    public static function upsertByPhone(array $data): int
    {
        $existing = Database::fetch('SELECT id FROM customers WHERE phone = :phone FOR UPDATE', ['phone' => $data['phone']]);
        if ($existing) {
            $update = $data;
            unset($update['phone']);
            if (($update['email'] ?? null) === null) {
                unset($update['email']);
            }
            Database::update('customers', $update, 'id = :id', ['id' => (int) $existing['id']]);
            return (int) $existing['id'];
        }
        return Database::insert('customers', $data);
    }

    public static function find(int $id): ?array
    {
        return Database::fetch(
            "SELECT c.*,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
                (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status IN ('confirmed','preparing','shipped','delivered')) AS confirmed_total,
                (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
             FROM customers c WHERE c.id = :id",
            ['id' => $id]
        );
    }

    public static function paginate(string $q, int $page, int $perPage): array
    {
        $where = '1=1';
        $params = [];
        if ($q !== '') {
            $digits = preg_replace('/\D+/', '', $q);
            $where = '(c.full_name LIKE :q1 OR c.email LIKE :q2' . ($digits !== '' ? ' OR c.phone LIKE :q3' : '') . ')';
            $params = ['q1' => "%$q%", 'q2' => "%$q%"];
            if ($digits !== '') {
                $params['q3'] = "%$digits%";
            }
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM customers c WHERE $where", $params);
        $pager = new Paginator($total, $perPage, $page);
        $rows = Database::fetchAll(
            "SELECT c.*,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
                (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
             FROM customers c WHERE $where ORDER BY last_order_at DESC, c.id DESC
             LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$rows, $pager];
    }

    public static function orders(int $customerId): array
    {
        return Database::fetchAll(
            'SELECT o.*, (SELECT SUM(quantity) FROM order_items oi WHERE oi.order_id = o.id) AS units
             FROM orders o WHERE o.customer_id = :id ORDER BY o.created_at DESC',
            ['id' => $customerId]
        );
    }
}

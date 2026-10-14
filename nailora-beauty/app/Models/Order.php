<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\Paginator;

final class Order
{
    public const STATUSES = [
        'pending' => 'Pendiente de confirmación',
        'confirmed' => 'Confirmado',
        'preparing' => 'En preparación',
        'shipped' => 'Enviado',
        'delivered' => 'Entregado',
        'cancelled' => 'Cancelado',
    ];

    /** Transiciones permitidas. Entregado y Cancelado son estados finales. */
    public const TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['preparing', 'cancelled'],
        'preparing' => ['shipped', 'cancelled'],
        'shipped' => ['delivered'],
        'delivered' => [],
        'cancelled' => [],
    ];

    /** Estados que cuentan como venta confirmada en informes. */
    public const SALE_STATUSES = ['confirmed', 'preparing', 'shipped', 'delivered'];

    public const PAYMENT_STATUSES = [
        'pending' => 'Pago pendiente',
        'paid' => 'Pagado (verificado manualmente)',
        'refunded' => 'Reembolsado',
    ];

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM orders WHERE id = :id', ['id' => $id]);
    }

    public static function findByCode(string $code): ?array
    {
        return Database::fetch('SELECT * FROM orders WHERE code = :code', ['code' => $code]);
    }

    public static function findByCheckoutToken(string $token): ?array
    {
        return Database::fetch('SELECT * FROM orders WHERE checkout_token = :t', ['t' => $token]);
    }

    public static function items(int $orderId): array
    {
        return OrderItem::forOrder($orderId);
    }

    public static function history(int $orderId): array
    {
        return Database::fetchAll(
            'SELECT h.*, u.name AS user_name FROM order_status_history h LEFT JOIN users u ON u.id = h.user_id
             WHERE h.order_id = :id ORDER BY h.created_at, h.id',
            ['id' => $orderId]
        );
    }

    public static function notes(int $orderId): array
    {
        return Database::fetchAll(
            'SELECT n.*, u.name AS user_name FROM order_notes n LEFT JOIN users u ON u.id = n.user_id
             WHERE n.order_id = :id ORDER BY n.created_at DESC, n.id DESC',
            ['id' => $orderId]
        );
    }

    public static function addNote(int $orderId, ?int $userId, string $note): void
    {
        Database::insert('order_notes', ['order_id' => $orderId, 'user_id' => $userId, 'note' => $note]);
    }

    public static function logStatus(int $orderId, ?string $from, string $to, ?int $userId, ?string $note = null): void
    {
        Database::insert('order_status_history', [
            'order_id' => $orderId,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $userId,
            'note' => $note,
        ]);
    }

    public static function generateCode(int $id, string $createdAt): string
    {
        return sprintf('NB-%s-%06d', date('Y', strtotime($createdAt) ?: time()), $id);
    }

    public static function paginate(array $f, int $page, int $perPage): array
    {
        [$whereSql, $params] = self::filterSql($f);
        $total = (int) Database::value("SELECT COUNT(*) FROM orders o WHERE $whereSql", $params);
        $pager = new Paginator($total, $perPage, $page);
        $rows = Database::fetchAll(
            "SELECT o.*, (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) AS units
             FROM orders o WHERE $whereSql ORDER BY o.created_at DESC, o.id DESC
             LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$rows, $pager];
    }

    public static function filterSql(array $f): array
    {
        $where = ['1=1'];
        $params = [];
        if (!empty($f['q'])) {
            $digits = preg_replace('/\D+/', '', (string) $f['q']);
            $where[] = '(o.code LIKE :q1 OR o.customer_name LIKE :q2' . ($digits !== '' ? ' OR o.customer_phone LIKE :q3' : '') . ')';
            $params['q1'] = '%' . $f['q'] . '%';
            $params['q2'] = '%' . $f['q'] . '%';
            if ($digits !== '') {
                $params['q3'] = '%' . $digits . '%';
            }
        }
        if (!empty($f['status']) && isset(self::STATUSES[$f['status']])) {
            $where[] = 'o.status = :status';
            $params['status'] = $f['status'];
        }
        if (!empty($f['from'])) {
            $where[] = 'o.created_at >= :from_date';
            $params['from_date'] = $f['from'] . ' 00:00:00';
        }
        if (!empty($f['to'])) {
            $where[] = 'o.created_at <= :to_date';
            $params['to_date'] = $f['to'] . ' 23:59:59';
        }
        return [implode(' AND ', $where), $params];
    }

    public static function statusCounts(): array
    {
        $rows = Database::fetchAll('SELECT status, COUNT(*) AS total FROM orders GROUP BY status');
        $counts = array_fill_keys(array_keys(self::STATUSES), 0);
        foreach ($rows as $row) {
            $counts[$row['status']] = (int) $row['total'];
        }
        return $counts;
    }

    public static function latest(int $limit = 8): array
    {
        return Database::fetchAll("SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT $limit");
    }

    public static function forExport(array $f): array
    {
        [$whereSql, $params] = self::filterSql($f);
        return Database::fetchAll("SELECT * FROM orders o WHERE $whereSql ORDER BY o.created_at DESC LIMIT 5000", $params);
    }
}

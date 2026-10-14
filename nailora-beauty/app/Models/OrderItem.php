<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class OrderItem
{
    public static function forOrder(int $orderId): array
    {
        return Database::fetchAll(
            'SELECT oi.*, p.slug AS product_slug FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = :id ORDER BY oi.id',
            ['id' => $orderId]
        );
    }

    public static function create(array $data): int
    {
        return Database::insert('order_items', $data);
    }
}

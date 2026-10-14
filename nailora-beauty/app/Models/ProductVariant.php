<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class ProductVariant
{
    public static function forProduct(int $productId, bool $onlyActive = false): array
    {
        return Database::fetchAll(
            'SELECT * FROM product_variants WHERE product_id = :id' . ($onlyActive ? ' AND is_active = 1' : '') . ' ORDER BY sort_order, id',
            ['id' => $productId]
        );
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM product_variants WHERE id = :id', ['id' => $id]);
    }

    public static function findMany(array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $params = [];
        $in = Database::inClause(array_map('intval', $ids), $params, 'vid');
        $map = [];
        foreach (Database::fetchAll('SELECT * FROM product_variants WHERE id IN ' . $in, $params) as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }

    public static function create(array $data): int
    {
        return Database::insert('product_variants', $data);
    }

    public static function update(int $id, array $data): void
    {
        Database::update('product_variants', $data, 'id = :id', ['id' => $id]);
    }

    public static function countForProduct(int $productId): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM product_variants WHERE product_id = :id', ['id' => $productId]);
    }
}

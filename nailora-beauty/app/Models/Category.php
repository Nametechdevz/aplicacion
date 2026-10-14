<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Category
{
    public static function active(): array
    {
        return Database::fetchAll(
            'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
             FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name'
        );
    }

    public static function all(): array
    {
        return Database::fetchAll(
            'SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
             FROM categories c ORDER BY c.sort_order, c.name'
        );
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM categories WHERE id = :id', ['id' => $id]);
    }

    public static function findActiveBySlug(string $slug): ?array
    {
        return Database::fetch('SELECT * FROM categories WHERE slug = :slug AND is_active = 1', ['slug' => $slug]);
    }

    public static function slugExists(string $slug, ?int $ignoreId = null): bool
    {
        return (bool) Database::value(
            'SELECT 1 FROM categories WHERE slug = :slug AND id <> :id',
            ['slug' => $slug, 'id' => $ignoreId ?? 0]
        );
    }

    public static function create(array $data): int
    {
        return Database::insert('categories', $data);
    }

    public static function update(int $id, array $data): void
    {
        Database::update('categories', $data, 'id = :id', ['id' => $id]);
    }

    public static function productCount(int $id): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM products WHERE category_id = :id', ['id' => $id]);
    }

    public static function delete(int $id): void
    {
        Database::query('DELETE FROM categories WHERE id = :id', ['id' => $id]);
    }
}

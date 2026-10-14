<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Brand
{
    public static function active(): array
    {
        return Database::fetchAll(
            'SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.is_active = 1) AS product_count
             FROM brands b WHERE b.is_active = 1 ORDER BY b.name'
        );
    }

    /** Marcas activas con al menos un producto activo (para la tienda). */
    public static function withProducts(): array
    {
        return array_values(array_filter(self::active(), static fn ($b) => (int) $b['product_count'] > 0));
    }

    public static function all(): array
    {
        return Database::fetchAll(
            'SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count FROM brands b ORDER BY b.name'
        );
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM brands WHERE id = :id', ['id' => $id]);
    }

    public static function findActiveBySlug(string $slug): ?array
    {
        return Database::fetch('SELECT * FROM brands WHERE slug = :slug AND is_active = 1', ['slug' => $slug]);
    }

    public static function slugExists(string $slug, ?int $ignoreId = null): bool
    {
        return (bool) Database::value('SELECT 1 FROM brands WHERE slug = :slug AND id <> :id', ['slug' => $slug, 'id' => $ignoreId ?? 0]);
    }

    public static function create(array $data): int
    {
        return Database::insert('brands', $data);
    }

    public static function update(int $id, array $data): void
    {
        Database::update('brands', $data, 'id = :id', ['id' => $id]);
    }

    public static function delete(int $id): void
    {
        // Los productos asociados quedan sin marca (ON DELETE SET NULL)
        Database::query('DELETE FROM brands WHERE id = :id', ['id' => $id]);
    }
}

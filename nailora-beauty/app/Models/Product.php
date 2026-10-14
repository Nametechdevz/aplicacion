<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\Paginator;

final class Product
{
    /** Existencias disponibles: suma de variantes activas o stock propio. */
    public const AVAILABLE_SQL = '(CASE WHEN p.has_variants = 1
        THEN COALESCE((SELECT SUM(v.stock) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1), 0)
        ELSE p.stock END)';

    /** Precio "desde" para productos con variantes. */
    public const FROM_PRICE_SQL = '(CASE WHEN p.has_variants = 1
        THEN COALESCE((SELECT MIN(COALESCE(v.price, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1), p.price)
        ELSE p.price END)';

    public const IMAGE_SQL = '(SELECT pi.path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1)';

    public const SORTS = [
        'relevancia' => 'Destacados',
        'novedades' => 'Novedades',
        'precio-asc' => 'Precio: menor a mayor',
        'precio-desc' => 'Precio: mayor a menor',
        'nombre' => 'Nombre (A–Z)',
    ];

    private static function listSelect(): string
    {
        return 'SELECT p.id, p.category_id, p.brand_id, p.name, p.slug, p.sku, p.product_type, p.short_description,
                       p.price, p.compare_at_price, p.has_variants, p.is_featured, p.is_new, p.created_at,
                       ' . self::FROM_PRICE_SQL . ' AS from_price,
                       ' . self::AVAILABLE_SQL . ' AS available_stock,
                       ' . self::IMAGE_SQL . ' AS image_path,
                       c.name AS category_name, c.slug AS category_slug, b.name AS brand_name
                FROM products p
                JOIN categories c ON c.id = p.category_id AND c.is_active = 1
                LEFT JOIN brands b ON b.id = p.brand_id AND b.is_active = 1';
    }

    /**
     * Búsqueda del catálogo con filtros, orden y paginación hechos en SQL.
     * $filters: q, category_id, brand_id, type, min, max, in_stock, sort
     */
    public static function search(array $filters, int $page, int $perPage): array
    {
        $where = ['p.is_active = 1'];
        $params = [];

        if (!empty($filters['q'])) {
            $term = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $filters['q']) . '%';
            $where[] = '(p.name LIKE :q1 OR p.sku LIKE :q2 OR p.short_description LIKE :q3
                         OR EXISTS (SELECT 1 FROM product_variants vs WHERE vs.product_id = p.id AND vs.is_active = 1 AND (vs.sku LIKE :q4 OR vs.name LIKE :q5)))';
            foreach (['q1', 'q2', 'q3', 'q4', 'q5'] as $k) {
                $params[$k] = $term;
            }
        }
        if (!empty($filters['category_id'])) {
            $where[] = 'p.category_id = :category_id';
            $params['category_id'] = (int) $filters['category_id'];
        }
        if (!empty($filters['brand_id'])) {
            $where[] = 'p.brand_id = :brand_id';
            $params['brand_id'] = (int) $filters['brand_id'];
        }
        if (!empty($filters['type'])) {
            $where[] = 'p.product_type = :ptype';
            $params['ptype'] = $filters['type'];
        }
        if (isset($filters['min']) && $filters['min'] !== null) {
            $where[] = self::FROM_PRICE_SQL . ' >= :min_price';
            $params['min_price'] = (float) $filters['min'];
        }
        if (isset($filters['max']) && $filters['max'] !== null) {
            $where[] = self::FROM_PRICE_SQL . ' <= :max_price';
            $params['max_price'] = (float) $filters['max'];
        }
        if (!empty($filters['in_stock'])) {
            $where[] = self::AVAILABLE_SQL . ' > 0';
        }

        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value(
            "SELECT COUNT(*) FROM products p JOIN categories c ON c.id = p.category_id AND c.is_active = 1 WHERE $whereSql",
            $params
        );
        $pager = new Paginator($total, $perPage, $page);

        $order = match ($filters['sort'] ?? 'relevancia') {
            'novedades' => 'p.created_at DESC, p.id DESC',
            'precio-asc' => 'from_price ASC, p.id',
            'precio-desc' => 'from_price DESC, p.id',
            'nombre' => 'p.name ASC',
            default => '(available_stock > 0) DESC, p.is_featured DESC, p.is_new DESC, p.created_at DESC, p.id DESC',
        };

        $items = Database::fetchAll(
            self::listSelect() . " WHERE $whereSql ORDER BY $order LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$items, $pager];
    }

    public static function featured(int $limit = 8): array
    {
        return Database::fetchAll(self::listSelect() . " WHERE p.is_active = 1 AND p.is_featured = 1
            ORDER BY (" . self::AVAILABLE_SQL . " > 0) DESC, p.updated_at DESC LIMIT $limit");
    }

    public static function newest(int $limit = 8): array
    {
        return Database::fetchAll(self::listSelect() . " WHERE p.is_active = 1 AND p.is_new = 1
            ORDER BY p.created_at DESC, p.id DESC LIMIT $limit");
    }

    /** Más vendidos según pedidos no cancelados. Vacío si no hay ventas registradas. */
    public static function bestSellers(int $limit = 8, int $minOrders = 1): array
    {
        return Database::fetchAll(
            self::listSelect() . "
            JOIN (SELECT oi.product_id, SUM(oi.quantity) AS sold, COUNT(DISTINCT oi.order_id) AS orders_count
                  FROM order_items oi JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
                  WHERE oi.product_id IS NOT NULL GROUP BY oi.product_id) s ON s.product_id = p.id
            WHERE p.is_active = 1 AND s.orders_count >= :min_orders
            ORDER BY s.sold DESC LIMIT $limit",
            ['min_orders' => $minOrders]
        );
    }

    /** Productos con promoción vigente o precio anterior definido. */
    public static function onSale(array $promotedIds, int $limit = 8): array
    {
        $params = [];
        $in = Database::inClause($promotedIds ?: [0], $params, 'promo');
        return Database::fetchAll(
            self::listSelect() . " WHERE p.is_active = 1 AND (p.id IN $in OR (p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price))
            ORDER BY (" . self::AVAILABLE_SQL . " > 0) DESC, p.updated_at DESC LIMIT $limit",
            $params
        );
    }

    public static function related(array $product, int $limit = 4): array
    {
        return Database::fetchAll(
            self::listSelect() . " WHERE p.is_active = 1 AND p.category_id = :cat AND p.id <> :id
            ORDER BY (" . self::AVAILABLE_SQL . " > 0) DESC, p.is_featured DESC, RAND() LIMIT $limit",
            ['cat' => $product['category_id'], 'id' => $product['id']]
        );
    }

    public static function findActiveBySlug(string $slug): ?array
    {
        return Database::fetch(
            'SELECT p.*, ' . self::AVAILABLE_SQL . ' AS available_stock, ' . self::FROM_PRICE_SQL . ' AS from_price,
                    c.name AS category_name, c.slug AS category_slug, b.name AS brand_name, b.slug AS brand_slug
             FROM products p
             JOIN categories c ON c.id = p.category_id AND c.is_active = 1
             LEFT JOIN brands b ON b.id = p.brand_id AND b.is_active = 1
             WHERE p.slug = :slug AND p.is_active = 1',
            ['slug' => $slug]
        );
    }

    public static function find(int $id): ?array
    {
        return Database::fetch(
            'SELECT p.*, ' . self::AVAILABLE_SQL . ' AS available_stock, c.name AS category_name, b.name AS brand_name
             FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
             WHERE p.id = :id',
            ['id' => $id]
        );
    }

    /** Varios productos activos por id (para el carrito). */
    public static function findManyActive(array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $params = [];
        $in = Database::inClause(array_map('intval', $ids), $params, 'pid');
        $rows = Database::fetchAll(
            'SELECT p.*, ' . self::IMAGE_SQL . ' AS image_path, c.is_active AS category_active
             FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id IN ' . $in,
            $params
        );
        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }

    public static function images(int $productId): array
    {
        return Database::fetchAll(
            'SELECT * FROM product_images WHERE product_id = :id ORDER BY is_primary DESC, sort_order, id',
            ['id' => $productId]
        );
    }

    public static function types(): array
    {
        return Database::fetchAll(
            "SELECT p.product_type AS name, COUNT(*) AS total FROM products p
             JOIN categories c ON c.id = p.category_id AND c.is_active = 1
             WHERE p.is_active = 1 AND p.product_type IS NOT NULL AND p.product_type <> ''
             GROUP BY p.product_type ORDER BY p.product_type"
        );
    }

    public static function allTypes(): array
    {
        return Database::query(
            "SELECT DISTINCT product_type FROM products WHERE product_type IS NOT NULL AND product_type <> '' ORDER BY product_type"
        )->fetchAll(\PDO::FETCH_COLUMN);
    }

    public static function priceBounds(): array
    {
        $row = Database::fetch('SELECT MIN(p.price) AS min_price, MAX(p.price) AS max_price FROM products p WHERE p.is_active = 1');
        return [(float) ($row['min_price'] ?? 0), (float) ($row['max_price'] ?? 0)];
    }

    // ------------------------------------------------------------------
    // Administración
    // ------------------------------------------------------------------

    public static function adminSearch(array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(p.name LIKE :q1 OR p.sku LIKE :q2 OR EXISTS (SELECT 1 FROM product_variants vs WHERE vs.product_id = p.id AND vs.sku LIKE :q3))';
            $params['q1'] = $params['q2'] = $params['q3'] = '%' . $f['q'] . '%';
        }
        if (!empty($f['category_id'])) {
            $where[] = 'p.category_id = :cat';
            $params['cat'] = (int) $f['category_id'];
        }
        if (($f['status'] ?? '') === 'activos') {
            $where[] = 'p.is_active = 1';
        } elseif (($f['status'] ?? '') === 'inactivos') {
            $where[] = 'p.is_active = 0';
        }
        $available = self::AVAILABLE_SQL;
        match ($f['stock'] ?? '') {
            'agotados' => $where[] = "$available = 0",
            'bajo' => $where[] = "($available > 0 AND $available <= p.low_stock_threshold)",
            'disponibles' => $where[] = "$available > 0",
            default => null,
        };

        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM products p WHERE $whereSql", $params);
        $pager = new Paginator($total, $perPage, $page);
        $rows = Database::fetchAll(
            "SELECT p.*, $available AS available_stock, " . self::IMAGE_SQL . " AS image_path, c.name AS category_name, b.name AS brand_name,
                    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
             FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
             WHERE $whereSql ORDER BY p.updated_at DESC, p.id DESC LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$rows, $pager];
    }

    public static function slugExists(string $slug, int $ignoreId = 0): bool
    {
        return (bool) Database::value('SELECT 1 FROM products WHERE slug = :slug AND id <> :id', ['slug' => $slug, 'id' => $ignoreId]);
    }

    /** El SKU debe ser único entre productos y variantes. */
    public static function skuExists(string $sku, int $ignoreProductId = 0, int $ignoreVariantId = 0): bool
    {
        return (bool) Database::value(
            'SELECT 1 FROM products WHERE sku = :s1 AND id <> :pid
             UNION SELECT 1 FROM product_variants WHERE sku = :s2 AND id <> :vid LIMIT 1',
            ['s1' => $sku, 'pid' => $ignoreProductId, 's2' => $sku, 'vid' => $ignoreVariantId]
        );
    }

    public static function uniqueSlug(string $base, int $ignoreId = 0): string
    {
        $slug = slugify($base);
        $candidate = $slug;
        $i = 2;
        while (self::slugExists($candidate, $ignoreId)) {
            $candidate = $slug . '-' . $i++;
        }
        return $candidate;
    }

    public static function uniqueSku(string $base): string
    {
        $candidate = $base;
        $i = 2;
        while (self::skuExists($candidate)) {
            $candidate = $base . '-' . $i++;
        }
        return $candidate;
    }

    public static function create(array $data): int
    {
        return Database::insert('products', $data);
    }

    public static function update(int $id, array $data): void
    {
        Database::update('products', $data, 'id = :id', ['id' => $id]);
    }

    public static function hasHistory(int $id): bool
    {
        return (bool) Database::value(
            'SELECT 1 FROM order_items WHERE product_id = :p1 UNION SELECT 1 FROM inventory_movements WHERE product_id = :p2 LIMIT 1',
            ['p1' => $id, 'p2' => $id]
        );
    }

    /** Borrado físico: solo para productos sin pedidos ni movimientos de inventario. */
    public static function delete(int $id): void
    {
        Database::transaction(static function () use ($id): void {
            Database::query('DELETE FROM product_variants WHERE product_id = :id', ['id' => $id]);
            Database::query('DELETE FROM products WHERE id = :id', ['id' => $id]);
        });
    }

    public static function addImage(int $productId, string $path, string $alt): int
    {
        $hasPrimary = (bool) Database::value('SELECT 1 FROM product_images WHERE product_id = :id AND is_primary = 1', ['id' => $productId]);
        $sort = (int) Database::value('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = :id', ['id' => $productId]);
        return Database::insert('product_images', [
            'product_id' => $productId,
            'path' => $path,
            'alt' => mb_substr($alt, 0, 200),
            'sort_order' => $sort,
            'is_primary' => $hasPrimary ? 0 : 1,
        ]);
    }

    public static function findImage(int $productId, int $imageId): ?array
    {
        return Database::fetch('SELECT * FROM product_images WHERE id = :id AND product_id = :pid', ['id' => $imageId, 'pid' => $productId]);
    }

    public static function setPrimaryImage(int $productId, int $imageId): void
    {
        Database::transaction(static function () use ($productId, $imageId): void {
            Database::query('UPDATE product_images SET is_primary = 0 WHERE product_id = :pid', ['pid' => $productId]);
            Database::query('UPDATE product_images SET is_primary = 1 WHERE id = :id AND product_id = :pid', ['id' => $imageId, 'pid' => $productId]);
        });
    }

    public static function deleteImage(int $productId, int $imageId): void
    {
        Database::transaction(static function () use ($productId, $imageId): void {
            $image = self::findImage($productId, $imageId);
            if (!$image) {
                return;
            }
            Database::query('DELETE FROM product_images WHERE id = :id', ['id' => $imageId]);
            if ((int) $image['is_primary'] === 1) {
                $next = Database::value('SELECT id FROM product_images WHERE product_id = :pid ORDER BY sort_order, id LIMIT 1', ['pid' => $productId]);
                if ($next) {
                    Database::query('UPDATE product_images SET is_primary = 1 WHERE id = :id', ['id' => (int) $next]);
                }
            }
        });
    }

    public static function imagePathInUse(string $path): bool
    {
        return (bool) Database::value('SELECT 1 FROM product_images WHERE path = :path LIMIT 1', ['path' => $path]);
    }

    public static function countByStock(): array
    {
        $available = self::AVAILABLE_SQL;
        $row = Database::fetch(
            "SELECT COUNT(*) AS active_total,
                    SUM(CASE WHEN $available = 0 THEN 1 ELSE 0 END) AS out_of_stock,
                    SUM(CASE WHEN $available > 0 AND $available <= p.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock
             FROM products p WHERE p.is_active = 1"
        );
        return array_map('intval', $row ?? ['active_total' => 0, 'out_of_stock' => 0, 'low_stock' => 0]);
    }

    /** Listado completo para selects administrativos. */
    public static function options(): array
    {
        return Database::fetchAll('SELECT id, name, sku, has_variants, is_active FROM products ORDER BY name');
    }

    /** Para el sitemap. */
    public static function sitemapEntries(): array
    {
        return Database::fetchAll(
            'SELECT p.slug, p.updated_at FROM products p JOIN categories c ON c.id = p.category_id AND c.is_active = 1 WHERE p.is_active = 1 ORDER BY p.id'
        );
    }
}

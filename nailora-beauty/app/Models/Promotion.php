<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;

final class Promotion
{
    public const TYPES = ['percent' => 'Porcentaje (%)', 'fixed' => 'Valor fijo ($)'];
    public const SCOPES = ['all' => 'Toda la tienda', 'products' => 'Productos seleccionados', 'categories' => 'Categorías seleccionadas'];

    private static ?array $activeCache = null;

    /**
     * Promociones vigentes ahora mismo, con sus productos y categorías.
     * La vigencia se evalúa siempre en el servidor con la hora de MySQL.
     */
    public static function active(): array
    {
        if (self::$activeCache !== null) {
            return self::$activeCache;
        }
        $promos = Database::fetchAll(
            'SELECT * FROM promotions WHERE is_active = 1 AND starts_at <= NOW() AND ends_at > NOW() ORDER BY id'
        );
        if (!$promos) {
            return self::$activeCache = [];
        }
        $params = [];
        $in = Database::inClause(array_column($promos, 'id'), $params, 'pr');
        $products = Database::fetchAll("SELECT promotion_id, product_id FROM promotion_products WHERE promotion_id IN $in", $params);
        $categories = Database::fetchAll("SELECT promotion_id, category_id FROM promotion_categories WHERE promotion_id IN $in", $params);

        $byId = [];
        foreach ($promos as $promo) {
            $promo['product_ids'] = [];
            $promo['category_ids'] = [];
            $byId[(int) $promo['id']] = $promo;
        }
        foreach ($products as $row) {
            $byId[(int) $row['promotion_id']]['product_ids'][(int) $row['product_id']] = true;
        }
        foreach ($categories as $row) {
            $byId[(int) $row['promotion_id']]['category_ids'][(int) $row['category_id']] = true;
        }
        return self::$activeCache = array_values($byId);
    }

    public static function flushCache(): void
    {
        self::$activeCache = null;
    }

    /** Ids de productos activos alcanzados por alguna promoción vigente. */
    public static function promotedProductIds(): array
    {
        $ids = [];
        foreach (self::active() as $promo) {
            if ($promo['scope'] === 'all') {
                return array_map('intval', Database::query('SELECT id FROM products WHERE is_active = 1')->fetchAll(\PDO::FETCH_COLUMN));
            }
            if ($promo['scope'] === 'products') {
                $ids += $promo['product_ids'];
            }
            if ($promo['scope'] === 'categories' && $promo['category_ids']) {
                $params = [];
                $in = Database::inClause(array_keys($promo['category_ids']), $params, 'cat');
                foreach (Database::query("SELECT id FROM products WHERE is_active = 1 AND category_id IN $in", $params)->fetchAll(\PDO::FETCH_COLUMN) as $id) {
                    $ids[(int) $id] = true;
                }
            }
        }
        return array_keys($ids);
    }

    public static function all(): array
    {
        return Database::fetchAll(
            'SELECT pr.*,
                (SELECT COUNT(*) FROM promotion_products pp WHERE pp.promotion_id = pr.id) AS product_count,
                (SELECT COUNT(*) FROM promotion_categories pc WHERE pc.promotion_id = pr.id) AS category_count,
                (pr.is_active = 1 AND pr.starts_at <= NOW() AND pr.ends_at > NOW()) AS is_current
             FROM promotions pr ORDER BY pr.ends_at DESC, pr.id DESC'
        );
    }

    public static function find(int $id): ?array
    {
        $promo = Database::fetch('SELECT * FROM promotions WHERE id = :id', ['id' => $id]);
        if ($promo) {
            $promo['product_ids'] = array_map('intval', Database::query('SELECT product_id FROM promotion_products WHERE promotion_id = :id', ['id' => $id])->fetchAll(\PDO::FETCH_COLUMN));
            $promo['category_ids'] = array_map('intval', Database::query('SELECT category_id FROM promotion_categories WHERE promotion_id = :id', ['id' => $id])->fetchAll(\PDO::FETCH_COLUMN));
        }
        return $promo;
    }

    public static function save(?int $id, array $data, array $productIds, array $categoryIds): int
    {
        return Database::transaction(static function () use ($id, $data, $productIds, $categoryIds): int {
            if ($id === null) {
                $id = Database::insert('promotions', $data);
            } else {
                Database::update('promotions', $data, 'id = :id', ['id' => $id]);
            }
            Database::query('DELETE FROM promotion_products WHERE promotion_id = :id', ['id' => $id]);
            Database::query('DELETE FROM promotion_categories WHERE promotion_id = :id', ['id' => $id]);
            if ($data['scope'] === 'products') {
                foreach (array_unique($productIds) as $pid) {
                    Database::query('INSERT IGNORE INTO promotion_products (promotion_id, product_id) VALUES (:pr, :p)', ['pr' => $id, 'p' => $pid]);
                }
            }
            if ($data['scope'] === 'categories') {
                foreach (array_unique($categoryIds) as $cid) {
                    Database::query('INSERT IGNORE INTO promotion_categories (promotion_id, category_id) VALUES (:pr, :c)', ['pr' => $id, 'c' => $cid]);
                }
            }
            self::flushCache();
            return $id;
        });
    }

    public static function setActive(int $id, bool $active): void
    {
        Database::update('promotions', ['is_active' => $active ? 1 : 0], 'id = :id', ['id' => $id]);
        self::flushCache();
    }

    public static function delete(int $id): void
    {
        // Los pedidos guardan el nombre y el descuento aplicado, así que borrar una promoción no altera el historial.
        Database::query('DELETE FROM promotions WHERE id = :id', ['id' => $id]);
        self::flushCache();
    }
}

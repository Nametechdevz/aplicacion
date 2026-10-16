<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

/** Consultas de lectura del catálogo con existencias por sucursal. */
final class ProductRepository
{
    public const SORTS = [
        'name' => 'p.name ASC',
        'price_asc' => 'p.price ASC',
        'price_desc' => 'p.price DESC',
        'stock' => 'stock ASC',
        'recent' => 'p.updated_at DESC',
        'code' => 'p.code ASC',
    ];

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    /**
     * @param array $f q, category, brand, status (active|inactive|all), sort, stock (low|out)
     * @param int[] $branchIds sucursales para sumar existencias
     */
    public function search(array $f, array $branchIds, int $limit, int $offset): array
    {
        [$where, $params] = $this->where($f);
        [$in, $bp] = Database::in($branchIds ?: [0], 'sb');
        $params = array_merge($params, $bp);
        $having = '';
        if (($f['stock'] ?? '') === 'out') {
            $having = 'HAVING available <= 0';
        } elseif (($f['stock'] ?? '') === 'low') {
            $having = 'HAVING available > 0 AND min_stock > 0 AND available <= min_stock';
        }
        $order = self::SORTS[$f['sort'] ?? 'name'] ?? self::SORTS['name'];
        $order = str_replace('stock', 'available', $order);
        $sql = "SELECT p.*, b.name AS brand_name, c.name AS category_name, sc.name AS subcategory_name, u.code AS unit_code, u.name AS unit_name,
                       COALESCE(SUM(i.quantity), 0) AS stock, COALESCE(SUM(i.quantity - i.reserved), 0) AS available,
                       COALESCE(SUM(i.min_stock), 0) AS min_stock, COALESCE(SUM(i.in_transit), 0) AS in_transit,
                       (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb,
                       (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) AS variants_count
                FROM products p
                JOIN units_of_measure u ON u.id = p.base_unit_id
                LEFT JOIN brands b ON b.id = p.brand_id
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN categories sc ON sc.id = p.subcategory_id
                LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id IN ($in)
                WHERE $where
                GROUP BY p.id
                $having
                ORDER BY $order, p.id
                LIMIT $limit OFFSET $offset";
        $rows = $this->db->all($sql, $params);
        $countSql = "SELECT COUNT(*) FROM (SELECT p.id, COALESCE(SUM(i.quantity - i.reserved), 0) AS available, COALESCE(SUM(i.min_stock), 0) AS min_stock
                     FROM products p LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id IN ($in)
                     WHERE $where GROUP BY p.id $having) t";
        $total = (int) $this->db->value($countSql, $params);
        return [$rows, $total];
    }

    private function where(array $f): array
    {
        $w = ['1 = 1'];
        $p = [];
        $status = $f['status'] ?? 'active';
        if ($status === 'active') {
            $w[] = 'p.is_active = 1';
        } elseif ($status === 'inactive') {
            $w[] = 'p.is_active = 0';
        }
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $f['q']) . '%';
            $w[] = '(p.name LIKE :q1 OR p.code LIKE :q2 OR p.sku LIKE :q3 OR p.barcode = :q4
                     OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND (v.barcode = :q5 OR v.sku = :q6)))';
            $p += ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $f['q'], 'q5' => $f['q'], 'q6' => $f['q']];
        }
        if (!empty($f['category'])) {
            $w[] = '(p.category_id = :cat OR p.subcategory_id = :cat2)';
            $p['cat'] = (int) $f['category'];
            $p['cat2'] = (int) $f['category'];
        }
        if (!empty($f['brand'])) {
            $w[] = 'p.brand_id = :brand';
            $p['brand'] = (int) $f['brand'];
        }
        return [implode(' AND ', $w), $p];
    }

    public function categories(): array
    {
        return $this->db->all(
            'SELECT c.*, p.name AS parent_name,
                    (SELECT COUNT(*) FROM products x WHERE x.category_id = c.id OR x.subcategory_id = c.id) AS products
             FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
             ORDER BY COALESCE(p.name, c.name), c.parent_id IS NOT NULL, c.name'
        );
    }

    public function brands(): array
    {
        return $this->db->all('SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS products FROM brands b ORDER BY b.name');
    }

    public function units(): array
    {
        return $this->db->all('SELECT * FROM units_of_measure ORDER BY id');
    }
}

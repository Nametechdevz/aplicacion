<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\Order;
use App\Models\Product;

/**
 * Indicadores para el dashboard e informes.
 * - "Pedidos registrados": todos los pedidos creados en el periodo, excepto cancelados.
 * - "Ventas confirmadas": pedidos en estado Confirmado, En preparación, Enviado o Entregado.
 * Las fechas se agrupan por la fecha de creación del pedido.
 */
final class ReportService
{
    public const PERIODS = [
        'hoy' => 'Hoy',
        '7d' => 'Últimos 7 días',
        '30d' => 'Últimos 30 días',
        'mes' => 'Mes actual',
        'rango' => 'Rango personalizado',
    ];

    /** @return array{key: string, from: string, to: string, label: string} fechas Y-m-d */
    public static function resolvePeriod(?string $key, ?string $from = null, ?string $to = null): array
    {
        $today = date('Y-m-d');
        $key = isset(self::PERIODS[$key ?? '']) ? $key : '30d';
        [$start, $end] = match ($key) {
            'hoy' => [$today, $today],
            '7d' => [date('Y-m-d', strtotime('-6 days')), $today],
            'mes' => [date('Y-m-01'), $today],
            'rango' => [self::validDate($from) ?? date('Y-m-d', strtotime('-29 days')), self::validDate($to) ?? $today],
            default => [date('Y-m-d', strtotime('-29 days')), $today],
        };
        if ($start > $end) {
            [$start, $end] = [$end, $start];
        }
        // Límite de un año para mantener las consultas ligeras
        if ((strtotime($end) - strtotime($start)) > 366 * 86400) {
            $start = date('Y-m-d', strtotime($end . ' -366 days'));
        }
        $label = $key === 'rango' ? date_es($start) . ' – ' . date_es($end) : self::PERIODS[$key];
        return ['key' => $key, 'from' => $start, 'to' => $end, 'label' => $label];
    }

    private static function validDate(?string $value): ?string
    {
        if (!$value) {
            return null;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $value);
        return $d && $d->format('Y-m-d') === $value ? $value : null;
    }

    public static function summary(array $period): array
    {
        $params = ['f' => $period['from'] . ' 00:00:00', 't' => $period['to'] . ' 23:59:59'];
        $sale = "'" . implode("','", Order::SALE_STATUSES) . "'";
        $row = Database::fetch(
            "SELECT
                COUNT(*) AS orders_all,
                SUM(status <> 'cancelled') AS orders_registered,
                COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total END), 0) AS registered_total,
                SUM(status IN ($sale)) AS sales_count,
                COALESCE(SUM(CASE WHEN status IN ($sale) THEN total END), 0) AS sales_total,
                COALESCE(SUM(CASE WHEN status IN ($sale) THEN discount_total END), 0) AS sales_discount,
                SUM(status = 'pending') AS pending,
                SUM(status = 'confirmed') AS confirmed,
                SUM(status = 'preparing') AS preparing,
                SUM(status = 'shipped') AS shipped,
                SUM(status = 'delivered') AS delivered,
                SUM(status = 'cancelled') AS cancelled
             FROM orders WHERE created_at BETWEEN :f AND :t",
            $params
        ) ?? [];
        $out = array_map(static fn ($v) => (float) ($v ?? 0), $row);
        $out['avg_ticket'] = $out['sales_count'] > 0 ? $out['sales_total'] / $out['sales_count'] : 0;
        $out['new_today'] = (int) Database::value('SELECT COUNT(*) FROM orders WHERE created_at >= CURDATE()');
        return $out;
    }

    /** Serie diaria (o mensual si el rango supera 62 días) de ventas confirmadas y pedidos registrados. */
    public static function series(array $period): array
    {
        $days = (int) ((strtotime($period['to']) - strtotime($period['from'])) / 86400) + 1;
        $monthly = $days > 62;
        $format = $monthly ? '%Y-%m' : '%Y-%m-%d';
        $sale = "'" . implode("','", Order::SALE_STATUSES) . "'";
        $rows = Database::fetchAll(
            "SELECT DATE_FORMAT(created_at, '$format') AS bucket,
                    COALESCE(SUM(CASE WHEN status IN ($sale) THEN total END), 0) AS sales_total,
                    SUM(status <> 'cancelled') AS registered
             FROM orders WHERE created_at BETWEEN :f AND :t GROUP BY bucket ORDER BY bucket",
            ['f' => $period['from'] . ' 00:00:00', 't' => $period['to'] . ' 23:59:59']
        );
        $map = array_column($rows, null, 'bucket');

        $series = [];
        $cursor = strtotime($monthly ? date('Y-m-01', strtotime($period['from'])) : $period['from']);
        $end = strtotime($period['to']);
        while ($cursor <= $end) {
            $bucket = date($monthly ? 'Y-m' : 'Y-m-d', $cursor);
            $series[] = [
                'bucket' => $bucket,
                'label' => $monthly ? self::monthLabel($cursor) : date('j', $cursor) . ' ' . self::monthLabel($cursor, true),
                'sales_total' => (float) ($map[$bucket]['sales_total'] ?? 0),
                'registered' => (int) ($map[$bucket]['registered'] ?? 0),
            ];
            $cursor = strtotime($monthly ? '+1 month' : '+1 day', $cursor);
        }
        return ['monthly' => $monthly, 'points' => $series];
    }

    private static function monthLabel(int $ts, bool $short = false): string
    {
        $months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        $m = $months[(int) date('n', $ts) - 1];
        return $short ? mb_substr($m, 0, 3) : $m . ' ' . date('Y', $ts);
    }

    public static function topProducts(array $period, int $limit = 10): array
    {
        $sale = "'" . implode("','", Order::SALE_STATUSES) . "'";
        return Database::fetchAll(
            "SELECT oi.product_id, oi.product_name, oi.sku, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue,
                    COUNT(DISTINCT oi.order_id) AS orders_count
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.status IN ($sale) AND o.created_at BETWEEN :f AND :t
             GROUP BY oi.product_id, oi.product_name, oi.sku ORDER BY units DESC, revenue DESC LIMIT $limit",
            ['f' => $period['from'] . ' 00:00:00', 't' => $period['to'] . ' 23:59:59']
        );
    }

    public static function salesByCategory(array $period): array
    {
        $sale = "'" . implode("','", Order::SALE_STATUSES) . "'";
        return Database::fetchAll(
            "SELECT COALESCE(c.name, 'Sin categoría') AS category, SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
             WHERE o.status IN ($sale) AND o.created_at BETWEEN :f AND :t
             GROUP BY category ORDER BY revenue DESC",
            ['f' => $period['from'] . ' 00:00:00', 't' => $period['to'] . ' 23:59:59']
        );
    }

    /** Productos activos con stock bajo o agotados (incluye variantes). */
    public static function stockAlerts(int $limit = 10): array
    {
        return Database::fetchAll(
            "SELECT * FROM (
                SELECT p.id AS product_id, NULL AS variant_id, p.name, NULL AS variant_name, p.sku, p.stock AS stock, p.low_stock_threshold
                FROM products p WHERE p.is_active = 1 AND p.has_variants = 0 AND p.stock <= p.low_stock_threshold
                UNION ALL
                SELECT p.id, v.id, p.name, v.name, v.sku, v.stock, p.low_stock_threshold
                FROM product_variants v JOIN products p ON p.id = v.product_id
                WHERE p.is_active = 1 AND v.is_active = 1 AND v.stock <= p.low_stock_threshold
             ) s ORDER BY s.stock ASC, s.name LIMIT $limit"
        );
    }

    public static function inventoryValue(): array
    {
        $row = Database::fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN p.has_variants = 0 THEN p.stock * COALESCE(p.cost_price, 0) END), 0)
                  + COALESCE((SELECT SUM(v.stock * COALESCE(p2.cost_price, 0)) FROM product_variants v JOIN products p2 ON p2.id = v.product_id WHERE p2.is_active = 1 AND v.is_active = 1), 0) AS cost_value,
                COALESCE(SUM(CASE WHEN p.has_variants = 0 THEN p.stock * p.price END), 0)
                  + COALESCE((SELECT SUM(v.stock * COALESCE(v.price, p3.price)) FROM product_variants v JOIN products p3 ON p3.id = v.product_id WHERE p3.is_active = 1 AND v.is_active = 1), 0) AS retail_value,
                COALESCE(SUM(CASE WHEN p.has_variants = 0 THEN p.stock END), 0)
                  + COALESCE((SELECT SUM(v.stock) FROM product_variants v JOIN products p4 ON p4.id = v.product_id WHERE p4.is_active = 1 AND v.is_active = 1), 0) AS units
             FROM products p WHERE p.is_active = 1"
        );
        return array_map('floatval', $row ?? ['cost_value' => 0, 'retail_value' => 0, 'units' => 0]);
    }

    public static function stockCounts(): array
    {
        return Product::countByStock();
    }
}

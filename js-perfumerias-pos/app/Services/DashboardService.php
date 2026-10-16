<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Support\Dec;

/**
 * Indicadores calculados exclusivamente desde la base de datos.
 * Todos respetan el rango de fechas, las sucursales permitidas y el vendedor.
 *
 * Definiciones:
 *  - Ventas: total facturado de ventas completadas (no anuladas).
 *  - Devoluciones: reembolsos de devoluciones aplicadas en el periodo.
 *  - Ventas netas = ventas − devoluciones.
 *  - Utilidad bruta estimada = ventas netas − costo de lo vendido neto
 *    (se descuenta el costo de lo devuelto que regresó al inventario).
 *    No incluye gastos operativos: no es utilidad neta.
 */
final class DashboardService
{
    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    /**
     * @param int[] $branchIds
     */
    public function build(string $from, string $to, array $branchIds, ?int $userId): array
    {
        [$start, $end] = utc_range($from, $to);
        [$in, $bp] = Database::in($branchIds ?: [0], 'b');
        $userSql = $userId ? ' AND s.user_id = :uid' : '';
        $base = array_merge($bp, ['start' => $start, 'end' => $end], $userId ? ['uid' => $userId] : []);
        $where = "s.status = 'completed' AND s.branch_id IN ($in) AND s.created_at >= :start AND s.created_at < :end$userSql";

        $totals = $this->db->one(
            "SELECT COUNT(*) AS tx, COALESCE(SUM(s.total), 0) AS total, COALESCE(SUM(s.cost_total), 0) AS cost,
                    COALESCE(SUM(s.discount_total), 0) AS discounts, COALESCE(SUM(s.subtotal), 0) AS gross
             FROM sales s WHERE $where",
            $base
        );
        $units = (string) $this->db->value(
            "SELECT COALESCE(SUM(CASE WHEN si.unit_code = 'und' THEN si.quantity ELSE 1 END), 0)
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $where",
            $base
        );
        $discountCount = (int) $this->db->value(
            "SELECT COUNT(*) FROM discounts d JOIN sales s ON s.id = d.sale_id WHERE $where",
            $base
        );
        $returnUserSql = $userId ? ' AND r.user_id = :uid' : '';
        $returns = $this->db->one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(r.total), 0) AS total,
                    COALESCE(SUM((SELECT COALESCE(SUM(ri.cost_amount), 0) FROM return_items ri WHERE ri.return_id = r.id AND ri.restock = 1)), 0) AS cost
             FROM returns r WHERE r.status = 'completed' AND r.branch_id IN ($in) AND r.approved_at >= :start AND r.approved_at < :end$returnUserSql",
            $base
        );
        $voids = (int) $this->db->value(
            "SELECT COUNT(*) FROM sales s WHERE s.status = 'voided' AND s.branch_id IN ($in) AND s.created_at >= :start AND s.created_at < :end$userSql",
            $base
        );
        $net = Dec::sub($totals['total'], $returns['total']);
        $netCost = Dec::sub($totals['cost'], $returns['cost']);
        $profit = Dec::sub($net, $netCost);

        // Ventas de hoy y del mes (independientes del rango, mismo alcance).
        $today = local_today();
        [$tStart, $tEnd] = utc_range($today, $today);
        [$mStart, $mEnd] = utc_range(substr($today, 0, 8) . '01', $today);
        $scopeOnly = array_merge($bp, $userId ? ['uid' => $userId] : []);
        $todayTotal = (string) $this->db->value(
            "SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.status = 'completed' AND s.branch_id IN ($in) AND s.created_at >= :s1 AND s.created_at < :e1$userSql",
            array_merge($scopeOnly, ['s1' => $tStart, 'e1' => $tEnd])
        );
        $monthTotal = (string) $this->db->value(
            "SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.status = 'completed' AND s.branch_id IN ($in) AND s.created_at >= :s1 AND s.created_at < :e1$userSql",
            array_merge($scopeOnly, ['s1' => $mStart, 'e1' => $mEnd])
        );

        $tz = tz_offset();
        $series = $this->db->all(
            "SELECT DATE(CONVERT_TZ(s.created_at, '+00:00', :tz)) AS day, SUM(s.total) AS total, SUM(s.cost_total) AS cost, COUNT(*) AS tx
             FROM sales s WHERE $where GROUP BY day ORDER BY day",
            array_merge($base, ['tz' => $tz])
        );
        $seriesMap = array_column($series, null, 'day');
        $days = [];
        $cursor = new \DateTimeImmutable($from);
        $last = new \DateTimeImmutable($to);
        $guard = 0;
        while ($cursor <= $last && $guard++ < 400) {
            $d = $cursor->format('Y-m-d');
            $row = $seriesMap[$d] ?? ['total' => '0', 'cost' => '0', 'tx' => 0];
            $days[] = ['date' => $d, 'total' => Dec::norm($row['total']), 'cost' => Dec::norm($row['cost']), 'profit' => Dec::sub($row['total'], $row['cost']), 'tx' => (int) $row['tx']];
            $cursor = $cursor->modify('+1 day');
        }

        $branches = $this->db->all(
            "SELECT b.id, b.name, COALESCE(SUM(s.total), 0) AS total, COUNT(s.id) AS tx
             FROM branches b LEFT JOIN sales s ON s.branch_id = b.id AND s.status = 'completed' AND s.created_at >= :start AND s.created_at < :end$userSql
             WHERE b.id IN ($in) AND b.type = 'store'
             GROUP BY b.id, b.name ORDER BY total DESC",
            $base
        );
        $topProducts = $this->db->all(
            "SELECT si.product_id, MAX(si.product_name) AS name, MAX(si.brand_name) AS brand, MAX(si.unit_code) AS unit,
                    SUM(si.quantity) AS qty, SUM(si.total) AS total, COUNT(*) AS line_count,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = si.product_id AND pi.is_primary = 1 LIMIT 1) AS thumb
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $where
             GROUP BY si.product_id ORDER BY total DESC LIMIT 6",
            $base
        );
        $categories = $this->db->all(
            "SELECT COALESCE(si.category_name, 'Sin categoría') AS name, SUM(si.total) AS total
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $where
             GROUP BY name ORDER BY total DESC",
            $base
        );
        $methods = $this->db->all(
            "SELECT sp.method_name AS name, SUM(sp.amount) AS total, COUNT(DISTINCT sp.sale_id) AS tx
             FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE $where
             GROUP BY sp.method_name ORDER BY total DESC",
            $base
        );
        $sellers = $this->db->all(
            "SELECT u.id, u.name, COUNT(s.id) AS tx, SUM(s.total) AS total, SUM(s.discount_total) AS discounts
             FROM sales s JOIN users u ON u.id = s.user_id WHERE $where
             GROUP BY u.id, u.name ORDER BY total DESC LIMIT 8",
            $base
        );

        // Existencias (no dependen de fechas)
        [$inStores, $sp] = Database::in($branchIds ?: [0], 'sb');
        $stock = $this->db->one(
            "SELECT
                SUM(CASE WHEN i.min_stock > 0 AND (i.quantity - i.reserved) > 0 AND (i.quantity - i.reserved) <= i.min_stock THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN (i.quantity - i.reserved) <= 0 THEN 1 ELSE 0 END) AS out_of_stock
             FROM inventory i JOIN products p ON p.id = i.product_id AND p.is_active = 1
             WHERE i.branch_id IN ($inStores)",
            $sp
        );
        [$in2, $bp2] = Database::in($branchIds ?: [0], 'b2');
        $transfers = (int) $this->db->value(
            "SELECT COUNT(*) FROM stock_transfers t WHERE t.status IN ('requested','approved','in_transit','received_with_differences')
             AND (t.from_branch_id IN ($in) OR t.to_branch_id IN ($in2))",
            array_merge($bp, $bp2)
        );
        $purchases = (int) $this->db->value(
            "SELECT COUNT(*) FROM purchase_orders po WHERE po.status IN ('ordered','partial') AND po.branch_id IN ($in)",
            $bp
        );
        $approvals = (int) $this->db->value(
            "SELECT COUNT(*) FROM discount_approvals da WHERE da.status = 'pending' AND da.expires_at > UTC_TIMESTAMP() AND da.branch_id IN ($in)",
            $bp
        );
        $activity = $this->db->all(
            "SELECT a.action, a.description, a.created_at, u.name AS user_name, b.name AS branch_name
             FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN branches b ON b.id = a.branch_id
             WHERE " . (Auth::isGlobal() ? '1 = 1' : "a.branch_id IN ($in)") . "
             AND a.action NOT LIKE 'auth.%'
             ORDER BY a.id DESC LIMIT 8",
            Auth::isGlobal() ? [] : $bp
        );

        $tx = (int) $totals['tx'];
        return [
            'range' => ['from' => $from, 'to' => $to],
            'kpi' => [
                'sales' => Dec::norm($totals['total']),
                'gross' => Dec::norm($totals['gross']),
                'transactions' => $tx,
                'avg_ticket' => $tx ? Dec::div($totals['total'], (string) $tx, 0) : '0',
                'cost' => Dec::norm($netCost),
                'net_sales' => $net,
                'profit' => $profit,
                'margin_pct' => Dec::isPositive($net) ? Dec::percentOf($profit, $net, 1) : '0',
                'units' => Dec::norm($units, 3),
                'discounts' => Dec::norm($totals['discounts']),
                'discount_count' => $discountCount,
                'returns' => Dec::norm($returns['total']),
                'return_count' => (int) $returns['n'],
                'voids' => $voids,
                'today' => Dec::norm($todayTotal),
                'month' => Dec::norm($monthTotal),
                'low_stock' => (int) ($stock['low'] ?? 0),
                'out_of_stock' => (int) ($stock['out_of_stock'] ?? 0),
                'pending_transfers' => $transfers,
                'pending_purchases' => $purchases,
                'pending_approvals' => $approvals,
            ],
            'series' => $days,
            'branches' => $branches,
            'top_products' => array_map(static fn ($p) => $p + ['thumb_url' => upload_url($p['thumb'])], $topProducts),
            'categories' => $categories,
            'methods' => $methods,
            'sellers' => $sellers,
            'activity' => array_map(static fn ($a) => $a + ['ago' => time_ago($a['created_at'])], $activity),
        ];
    }
}

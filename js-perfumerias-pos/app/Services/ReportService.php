<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;

/**
 * Reportes filtrables. La misma consulta alimenta la vista, la versión
 * imprimible y la exportación CSV, de modo que todas respetan filtros y
 * permisos por igual.
 *
 * Cada columna: [clave, título, tipo] con tipo money|qty|pct|int|text|date.
 */
final class ReportService
{
    public const REPORTS = [
        'sales_period' => ['Ventas por periodo', 'Ventas', false],
        'sales_branch' => ['Ventas por sucursal', 'Ventas', false],
        'sales_seller' => ['Ventas por vendedor', 'Ventas', false],
        'sales_product' => ['Ventas por producto', 'Ventas', false],
        'least_sold' => ['Productos menos vendidos', 'Ventas', false],
        'payments' => ['Cobros por medio de pago', 'Ventas', false],
        'discounts_user' => ['Descuentos por usuario', 'Ventas', false],
        'returns' => ['Devoluciones', 'Ventas', false],
        'margins' => ['Costos, utilidad y márgenes por producto', 'Finanzas', true],
        'branch_compare' => ['Comparativo entre sucursales', 'Finanzas', true],
        'inventory' => ['Inventario actual', 'Inventario', false],
        'valuation' => ['Valorización del inventario', 'Inventario', true],
        'out_of_stock' => ['Productos agotados y bajo mínimo', 'Inventario', false],
        'movements' => ['Movimientos de inventario', 'Inventario', false],
        'purchases_supplier' => ['Compras por proveedor', 'Compras', true],
        'cash_closings' => ['Cierres de caja', 'Caja', false],
    ];

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function available(): array
    {
        $out = [];
        foreach (self::REPORTS as $key => [$title, $group, $financial]) {
            if ($financial && !Auth::can('reports.financial')) {
                continue;
            }
            if ($key === 'purchases_supplier' && !Auth::can('purchases.manage') && !Auth::isGlobal()) {
                continue;
            }
            $out[$group][$key] = $title;
        }
        return $out;
    }

    /**
     * @param array $f from,to,branch_ids,product_id,category_id,user_id,method_id,group
     */
    public function run(string $type, array $f): array
    {
        if (!isset(self::REPORTS[$type])) {
            throw HttpException::notFound('Reporte no encontrado.');
        }
        if (self::REPORTS[$type][2] && !Auth::can('reports.financial')) {
            throw HttpException::forbidden('No tiene permiso para ver información de costos y utilidad.');
        }
        [$start, $end] = utc_range($f['from'], $f['to']);
        [$in, $bp] = Database::in($f['branch_ids'] ?: [0], 'b');
        $p = array_merge($bp, ['start' => $start, 'end' => $end]);
        $saleFilter = "s.status = 'completed' AND s.branch_id IN ($in) AND s.created_at >= :start AND s.created_at < :end";
        if (!empty($f['user_id'])) {
            $saleFilter .= ' AND s.user_id = :uid';
            $p['uid'] = (int) $f['user_id'];
        }
        $itemFilter = '';
        if (!empty($f['product_id'])) {
            $itemFilter .= ' AND si.product_id = :pid';
            $p['pid'] = (int) $f['product_id'];
        }
        if (!empty($f['category_id'])) {
            $itemFilter .= ' AND (pr.category_id = :cid OR pr.subcategory_id = :cid2)';
            $p['cid'] = (int) $f['category_id'];
            $p['cid2'] = (int) $f['category_id'];
        }
        if (!empty($f['method_id'])) {
            $saleFilter .= ' AND EXISTS (SELECT 1 FROM sale_payments spf WHERE spf.sale_id = s.id AND spf.payment_method_id = :mid)';
            $p['mid'] = (int) $f['method_id'];
        }
        $tz = tz_offset();

        switch ($type) {
            case 'sales_period':
                $fmt = match ($f['group'] ?? 'day') {
                    'week' => "DATE_FORMAT(CONVERT_TZ(s.created_at, '+00:00', :tz), '%x-S%v')",
                    'month' => "DATE_FORMAT(CONVERT_TZ(s.created_at, '+00:00', :tz), '%Y-%m')",
                    default => "DATE(CONVERT_TZ(s.created_at, '+00:00', :tz))",
                };
                $p['tz'] = $tz;
                $rows = $this->db->all(
                    "SELECT $fmt AS period, COUNT(*) AS tx, SUM(s.subtotal) AS gross, SUM(s.discount_total) AS discounts,
                            SUM(s.total) AS total, ROUND(SUM(s.total) / COUNT(*), 0) AS avg_ticket
                     FROM sales s WHERE $saleFilter GROUP BY period ORDER BY period",
                    $p
                );
                return $this->result($rows, [
                    ['period', 'Periodo', 'text'], ['tx', 'Transacciones', 'int'], ['gross', 'Venta bruta', 'money'],
                    ['discounts', 'Descuentos', 'money'], ['total', 'Facturado', 'money'], ['avg_ticket', 'Ticket promedio', 'money'],
                ], ['tx', 'gross', 'discounts', 'total']);

            case 'sales_branch':
                $rows = $this->db->all(
                    "SELECT b.name AS branch, COUNT(*) AS tx, SUM(s.discount_total) AS discounts, SUM(s.total) AS total,
                            ROUND(SUM(s.total) / COUNT(*), 0) AS avg_ticket
                     FROM sales s JOIN branches b ON b.id = s.branch_id WHERE $saleFilter GROUP BY b.id, b.name ORDER BY total DESC",
                    $p
                );
                return $this->result($rows, [
                    ['branch', 'Sucursal', 'text'], ['tx', 'Transacciones', 'int'], ['discounts', 'Descuentos', 'money'],
                    ['total', 'Facturado', 'money'], ['avg_ticket', 'Ticket promedio', 'money'],
                ], ['tx', 'discounts', 'total']);

            case 'sales_seller':
                $rows = $this->db->all(
                    "SELECT u.name AS seller, b.name AS branch, COUNT(*) AS tx, SUM(s.discount_total) AS discounts, SUM(s.total) AS total,
                            ROUND(SUM(s.total) / COUNT(*), 0) AS avg_ticket
                     FROM sales s JOIN users u ON u.id = s.user_id JOIN branches b ON b.id = s.branch_id
                     WHERE $saleFilter GROUP BY u.id, u.name, b.id, b.name ORDER BY total DESC",
                    $p
                );
                return $this->result($rows, [
                    ['seller', 'Vendedor', 'text'], ['branch', 'Sucursal', 'text'], ['tx', 'Transacciones', 'int'],
                    ['discounts', 'Descuentos', 'money'], ['total', 'Facturado', 'money'], ['avg_ticket', 'Ticket promedio', 'money'],
                ], ['tx', 'discounts', 'total']);

            case 'sales_product':
            case 'least_sold':
                $order = $type === 'least_sold' ? 'ASC' : 'DESC';
                $rows = $this->db->all(
                    "SELECT si.product_code AS code, MAX(si.product_name) AS product, MAX(si.brand_name) AS brand, MAX(si.unit_code) AS unit,
                            SUM(si.quantity) AS qty, SUM(si.discount_amount) AS discounts, SUM(si.total) AS total
                     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products pr ON pr.id = si.product_id
                     WHERE $saleFilter $itemFilter GROUP BY si.product_code ORDER BY total $order LIMIT 500",
                    $p
                );
                return $this->result($rows, [
                    ['code', 'Código', 'text'], ['product', 'Producto', 'text'], ['brand', 'Marca', 'text'], ['unit', 'Unidad', 'text'],
                    ['qty', 'Cantidad', 'qty'], ['discounts', 'Descuentos', 'money'], ['total', 'Facturado', 'money'],
                ], ['discounts', 'total']);

            case 'payments':
                $rows = $this->db->all(
                    "SELECT sp.method_name AS method, COUNT(DISTINCT sp.sale_id) AS tx, SUM(sp.amount) AS total,
                            SUM(CASE WHEN sp.verification = 'pending_manual' THEN sp.amount ELSE 0 END) AS pending_verification
                     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE $saleFilter GROUP BY sp.method_name ORDER BY total DESC",
                    $p
                );
                return $this->result($rows, [
                    ['method', 'Medio de pago', 'text'], ['tx', 'Ventas', 'int'], ['total', 'Cobrado', 'money'],
                    ['pending_verification', 'Pendiente de verificación manual', 'money'],
                ], ['tx', 'total', 'pending_verification']);

            case 'discounts_user':
                $rows = $this->db->all(
                    "SELECT u.name AS user, COUNT(*) AS n, SUM(d.amount) AS amount, ROUND(AVG(d.percent), 2) AS avg_pct, MAX(d.percent) AS max_pct,
                            SUM(CASE WHEN d.approval_id IS NOT NULL THEN 1 ELSE 0 END) AS authorized,
                            SUM(d.below_margin) AS below_margin
                     FROM discounts d JOIN sales s ON s.id = d.sale_id JOIN users u ON u.id = d.applied_by
                     WHERE $saleFilter GROUP BY u.id, u.name ORDER BY amount DESC",
                    $p
                );
                return $this->result($rows, [
                    ['user', 'Usuario', 'text'], ['n', 'Descuentos', 'int'], ['amount', 'Valor descontado', 'money'],
                    ['avg_pct', '% promedio', 'pct'], ['max_pct', '% máximo', 'pct'], ['authorized', 'Con autorización', 'int'],
                    ['below_margin', 'Bajo margen mínimo', 'int'],
                ], ['n', 'amount', 'authorized', 'below_margin']);

            case 'returns':
                $rows = $this->db->all(
                    "SELECT r.number, s.number AS sale, b.name AS branch, u.name AS user, r.reason, r.status, r.total, r.created_at
                     FROM returns r JOIN sales s ON s.id = r.sale_id JOIN branches b ON b.id = r.branch_id JOIN users u ON u.id = r.user_id
                     WHERE r.branch_id IN ($in) AND r.created_at >= :start AND r.created_at < :end ORDER BY r.created_at DESC",
                    array_merge($bp, ['start' => $start, 'end' => $end])
                );
                return $this->result($rows, [
                    ['number', 'Devolución', 'text'], ['sale', 'Venta', 'text'], ['branch', 'Sucursal', 'text'], ['user', 'Registró', 'text'],
                    ['reason', 'Motivo', 'text'], ['status', 'Estado', 'status'], ['total', 'Valor', 'money'], ['created_at', 'Fecha', 'date'],
                ], ['total']);

            case 'margins':
                $rows = $this->db->all(
                    "SELECT si.product_code AS code, MAX(si.product_name) AS product, SUM(si.quantity) AS qty, SUM(si.total) AS revenue,
                            SUM(si.cost_total) AS cost, SUM(si.total) - SUM(si.cost_total) AS profit,
                            CASE WHEN SUM(si.total) > 0 THEN ROUND((SUM(si.total) - SUM(si.cost_total)) * 100 / SUM(si.total), 2) ELSE 0 END AS margin
                     FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products pr ON pr.id = si.product_id
                     WHERE $saleFilter $itemFilter GROUP BY si.product_code ORDER BY profit DESC LIMIT 500",
                    $p
                );
                return $this->result($rows, [
                    ['code', 'Código', 'text'], ['product', 'Producto', 'text'], ['qty', 'Cantidad', 'qty'], ['revenue', 'Facturado', 'money'],
                    ['cost', 'Costo de venta', 'money'], ['profit', 'Utilidad bruta est.', 'money'], ['margin', 'Margen', 'pct'],
                ], ['revenue', 'cost', 'profit']);

            case 'branch_compare':
                $rows = $this->db->all(
                    "SELECT b.name AS branch, COUNT(s.id) AS tx, COALESCE(SUM(s.total), 0) AS revenue, COALESCE(SUM(s.cost_total), 0) AS cost,
                            COALESCE(SUM(s.total) - SUM(s.cost_total), 0) AS profit,
                            (SELECT COALESCE(SUM(r.total), 0) FROM returns r WHERE r.branch_id = b.id AND r.status = 'completed' AND r.approved_at >= :rs AND r.approved_at < :re) AS returns
                     FROM branches b LEFT JOIN sales s ON s.branch_id = b.id AND s.status = 'completed' AND s.created_at >= :start AND s.created_at < :end
                     WHERE b.id IN ($in) AND b.type = 'store' GROUP BY b.id, b.name ORDER BY revenue DESC",
                    array_merge($bp, ['start' => $start, 'end' => $end, 'rs' => $start, 're' => $end])
                );
                return $this->result($rows, [
                    ['branch', 'Sucursal', 'text'], ['tx', 'Transacciones', 'int'], ['revenue', 'Facturado', 'money'],
                    ['returns', 'Devoluciones', 'money'], ['cost', 'Costo de venta', 'money'], ['profit', 'Utilidad bruta est.', 'money'],
                ], ['tx', 'revenue', 'returns', 'cost', 'profit']);

            case 'inventory':
            case 'valuation':
            case 'out_of_stock':
                $extra = $type === 'out_of_stock' ? ' AND ((i.quantity - i.reserved) <= 0 OR (i.min_stock > 0 AND (i.quantity - i.reserved) <= i.min_stock))' : '';
                $pp = $bp;
                if (!empty($f['product_id'])) {
                    $extra .= ' AND i.product_id = :pid';
                    $pp['pid'] = (int) $f['product_id'];
                }
                if (!empty($f['category_id'])) {
                    $extra .= ' AND (pr.category_id = :cid OR pr.subcategory_id = :cid2)';
                    $pp['cid'] = (int) $f['category_id'];
                    $pp['cid2'] = (int) $f['category_id'];
                }
                $rows = $this->db->all(
                    "SELECT b.name AS branch, pr.code, pr.name AS product, u.code AS unit, i.quantity, i.reserved,
                            (i.quantity - i.reserved) AS available, i.in_transit, i.min_stock, pr.cost,
                            ROUND(GREATEST(i.quantity, 0) * pr.cost, 2) AS value, ROUND(GREATEST(i.quantity, 0) * pr.price, 2) AS retail
                     FROM inventory i JOIN products pr ON pr.id = i.product_id JOIN branches b ON b.id = i.branch_id
                     JOIN units_of_measure u ON u.id = pr.base_unit_id
                     WHERE i.branch_id IN ($in) AND pr.is_active = 1 $extra ORDER BY b.name, pr.name LIMIT 2000",
                    $pp
                );
                $cols = [
                    ['branch', 'Sucursal', 'text'], ['code', 'Código', 'text'], ['product', 'Producto', 'text'], ['unit', 'Unidad', 'text'],
                    ['quantity', 'Existencia', 'qty'], ['reserved', 'Reservado', 'qty'], ['available', 'Disponible', 'qty'],
                    ['in_transit', 'En tránsito', 'qty'], ['min_stock', 'Mínimo', 'qty'],
                ];
                if ($type === 'valuation') {
                    $cols[] = ['cost', 'Costo unitario', 'money'];
                    $cols[] = ['value', 'Valor al costo', 'money'];
                    $cols[] = ['retail', 'Valor a precio de venta', 'money'];
                    return $this->result($rows, $cols, ['value', 'retail']);
                }
                return $this->result($rows, $cols, []);

            case 'movements':
                $pp = array_merge($bp, ['start' => $start, 'end' => $end]);
                $extra = '';
                if (!empty($f['product_id'])) {
                    $extra .= ' AND m.product_id = :pid';
                    $pp['pid'] = (int) $f['product_id'];
                }
                if (!empty($f['user_id'])) {
                    $extra .= ' AND m.user_id = :uid';
                    $pp['uid'] = (int) $f['user_id'];
                }
                $rows = $this->db->all(
                    "SELECT m.created_at, b.name AS branch, pr.name AS product, u.code AS unit, m.type, m.quantity, m.balance_before,
                            m.balance_after, m.notes, us.name AS user
                     FROM inventory_movements m JOIN branches b ON b.id = m.branch_id JOIN products pr ON pr.id = m.product_id
                     JOIN units_of_measure u ON u.id = pr.base_unit_id LEFT JOIN users us ON us.id = m.user_id
                     WHERE m.branch_id IN ($in) AND m.created_at >= :start AND m.created_at < :end $extra
                     ORDER BY m.id DESC LIMIT 3000",
                    $pp
                );
                foreach ($rows as &$r) {
                    $r['type'] = movement_label($r['type']);
                }
                unset($r);
                return $this->result($rows, [
                    ['created_at', 'Fecha', 'date'], ['branch', 'Sucursal', 'text'], ['product', 'Producto', 'text'], ['type', 'Movimiento', 'text'],
                    ['quantity', 'Cantidad', 'qty'], ['balance_before', 'Saldo anterior', 'qty'], ['balance_after', 'Saldo posterior', 'qty'],
                    ['unit', 'Unidad', 'text'], ['user', 'Usuario', 'text'], ['notes', 'Detalle', 'text'],
                ], []);

            case 'purchases_supplier':
                $rows = $this->db->all(
                    "SELECT sup.name AS supplier, COUNT(DISTINCT po.id) AS orders, COALESCE(SUM(gr.total), 0) AS received,
                            (SELECT COALESCE(SUM(po2.total), 0) FROM purchase_orders po2 WHERE po2.supplier_id = sup.id AND po2.status IN ('ordered','partial')) AS pending
                     FROM suppliers sup
                     JOIN purchase_orders po ON po.supplier_id = sup.id AND po.branch_id IN ($in)
                     LEFT JOIN goods_receipts gr ON gr.purchase_order_id = po.id AND gr.created_at >= :start AND gr.created_at < :end
                     WHERE po.status <> 'cancelled' GROUP BY sup.id, sup.name ORDER BY received DESC",
                    array_merge($bp, ['start' => $start, 'end' => $end])
                );
                return $this->result($rows, [
                    ['supplier', 'Proveedor', 'text'], ['orders', 'Órdenes', 'int'], ['received', 'Recibido en el periodo', 'money'],
                    ['pending', 'Órdenes pendientes', 'money'],
                ], ['orders', 'received', 'pending']);

            case 'cash_closings':
                $rows = $this->db->all(
                    "SELECT cs.closed_at, b.name AS branch, cr.name AS register, u.name AS cashier, cs.opening_amount,
                            cs.expected_cash, cs.counted_cash, cs.difference, cs.status
                     FROM cash_sessions cs JOIN branches b ON b.id = cs.branch_id JOIN cash_registers cr ON cr.id = cs.register_id
                     JOIN users u ON u.id = cs.user_id
                     WHERE cs.branch_id IN ($in) AND cs.status <> 'open' AND cs.closed_at >= :start AND cs.closed_at < :end
                     ORDER BY cs.closed_at DESC",
                    array_merge($bp, ['start' => $start, 'end' => $end])
                );
                return $this->result($rows, [
                    ['closed_at', 'Cierre', 'date'], ['branch', 'Sucursal', 'text'], ['register', 'Caja', 'text'], ['cashier', 'Cajero', 'text'],
                    ['opening_amount', 'Fondo', 'money'], ['expected_cash', 'Esperado', 'money'], ['counted_cash', 'Contado', 'money'],
                    ['difference', 'Diferencia', 'money'], ['status', 'Estado', 'status'],
                ], ['expected_cash', 'counted_cash', 'difference']);
        }
        throw HttpException::notFound();
    }

    private function result(array $rows, array $columns, array $sumKeys): array
    {
        $totals = [];
        foreach ($sumKeys as $k) {
            $sum = '0';
            foreach ($rows as $r) {
                $sum = \App\Support\Dec::add($sum, (string) ($r[$k] ?? '0'), 2);
            }
            $totals[$k] = $sum;
        }
        return ['columns' => $columns, 'rows' => $rows, 'totals' => $totals];
    }

    /** Valor formateado para exportación (sin símbolos, separador decimal punto). */
    public static function exportValue(mixed $value, string $type): string
    {
        return match ($type) {
            'date' => $value ? fmt_dt((string) $value, 'Y-m-d H:i') : '',
            'status' => strip_tags(status_badge((string) $value)),
            default => (string) ($value ?? ''),
        };
    }

    public static function displayValue(mixed $value, string $type): string
    {
        return match ($type) {
            'money' => e(money($value ?? '0')),
            'qty' => e(qty($value ?? '0')),
            'pct' => e(pct($value ?? '0', 2)),
            'int' => e(number_format((int) $value, 0, ',', '.')),
            'date' => e(fmt_dt($value ? (string) $value : null)),
            'status' => status_badge((string) $value),
            default => e($value),
        };
    }
}

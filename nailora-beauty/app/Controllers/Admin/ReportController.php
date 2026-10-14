<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Services\ReportService;

final class ReportController extends AdminController
{
    public function index(): void
    {
        $period = ReportService::resolvePeriod($this->request->query('periodo'), $this->request->query('desde'), $this->request->query('hasta'));
        $this->render('reports/index', [
            'title' => 'Informes',
            'period' => $period,
            'summary' => ReportService::summary($period),
            'series' => ReportService::series($period),
            'topProducts' => ReportService::topProducts($period, 15),
            'byCategory' => ReportService::salesByCategory($period),
            'inventory' => ReportService::inventoryValue(),
        ], ['Informes' => null]);
    }

    /** Exporta pedidos a CSV (compatible con Excel: UTF-8 con BOM y separador ;). */
    public function export(): void
    {
        $date = static function (?string $v): ?string {
            $d = $v ? \DateTime::createFromFormat('Y-m-d', $v) : false;
            return $d && $d->format('Y-m-d') === $v ? $v : null;
        };
        $f = [
            'q' => mb_substr((string) $this->request->query('q', ''), 0, 80),
            'status' => (string) $this->request->query('estado', ''),
            'from' => $date($this->request->query('desde')),
            'to' => $date($this->request->query('hasta')),
        ];
        $rows = Order::forExport($f);
        AuditLog::record('orders.export', 'order', null, ['rows' => count($rows)]);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="pedidos-' . date('Ymd-His') . '.csv"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Código', 'Fecha', 'Estado', 'Pago', 'Cliente', 'Teléfono', 'Departamento', 'Ciudad', 'Subtotal', 'Descuento', 'Envío', 'Total', 'Método de pago'], ';');
        foreach ($rows as $o) {
            $cells = [
                $o['code'], $o['created_at'], order_status_label($o['status']), payment_status_label($o['payment_status']),
                $o['customer_name'], $o['customer_phone'], $o['department'], $o['city'],
                (int) $o['subtotal'], (int) $o['discount_total'], $o['shipping_cost'] === null ? 'Por confirmar' : (int) $o['shipping_cost'],
                (int) $o['total'], $o['payment_method'],
            ];
            // Evita inyección de fórmulas en hojas de cálculo
            $cells = array_map(static fn ($c) => is_string($c) && preg_match('/^[=+\-@\t\r]/', $c) ? "'" . $c : $c, $cells);
            fputcsv($out, $cells, ';');
        }
        fclose($out);
    }
}

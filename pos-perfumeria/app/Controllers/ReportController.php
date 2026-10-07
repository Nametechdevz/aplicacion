<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;

class ReportController extends Controller
{
    private function range(): array
    {
        $from = (string) input('from', date('Y-m-01'));
        $to = (string) input('to', date('Y-m-d'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $from = date('Y-m-01');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $to = date('Y-m-d');
        }
        return [$from, $to];
    }

    public function index(): void
    {
        [$from, $to] = $this->range();
        $p = [$from, $to];
        $sw = 'DATE(s.issued_at) BETWEEN ? AND ?';

        $sales = DB::one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(subtotal),0) AS base, COALESCE(SUM(tax_total),0) AS tax, COALESCE(SUM(discount_total),0) AS discounts FROM sales s WHERE $sw", $p);
        $returns = DB::one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(subtotal),0) AS base, COALESCE(SUM(tax_total),0) AS tax FROM credit_notes cn WHERE DATE(cn.issued_at) BETWEEN ? AND ?", $p);
        $cost = (float) DB::value("SELECT COALESCE(SUM(si.unit_cost * si.qty),0) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $sw", $p);
        $returnedCost = (float) DB::value(
            "SELECT COALESCE(SUM(si.unit_cost * cni.qty),0) FROM credit_note_items cni JOIN credit_notes cn ON cn.id = cni.credit_note_id
               JOIN sale_items si ON si.id = cni.sale_item_id WHERE DATE(cn.issued_at) BETWEEN ? AND ?",
            $p
        );
        $netBase = (float) $sales['base'] - (float) $returns['base'];
        $netCost = $cost - $returnedCost;

        $daily = DB::all("SELECT DATE(s.issued_at) AS d, COUNT(*) AS n, SUM(s.total) AS total FROM sales s WHERE $sw GROUP BY DATE(s.issued_at) ORDER BY d", $p);
        $byMethod = DB::all("SELECT sp.method, COUNT(DISTINCT s.id) AS n, SUM(sp.amount) AS total FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE $sw GROUP BY sp.method ORDER BY total DESC", $p);
        $changeTotal = (float) DB::value("SELECT COALESCE(SUM(change_amount),0) FROM sales s WHERE $sw", $p);
        $byUser = DB::all("SELECT u.name, COUNT(*) AS n, SUM(s.total) AS total FROM sales s JOIN users u ON u.id = s.user_id WHERE $sw GROUP BY u.id, u.name ORDER BY total DESC", $p);
        $byHour = DB::all("SELECT HOUR(s.issued_at) AS h, COUNT(*) AS n, SUM(s.total) AS total FROM sales s WHERE $sw GROUP BY HOUR(s.issued_at) ORDER BY h", $p);
        $topProducts = DB::all(
            "SELECT si.description, SUM(si.qty - si.returned_qty) AS qty, SUM(si.total / si.qty * (si.qty - si.returned_qty)) AS total,
                    SUM((si.base / si.qty - si.unit_cost) * (si.qty - si.returned_qty)) AS profit
               FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $sw
              GROUP BY si.product_id, si.description HAVING qty > 0 ORDER BY total DESC LIMIT 20",
            $p
        );
        $byBrand = DB::all(
            "SELECT COALESCE(b.name, 'Sin marca') AS name, SUM(si.qty - si.returned_qty) AS qty, SUM(si.total / si.qty * (si.qty - si.returned_qty)) AS total
               FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id LEFT JOIN brands b ON b.id = p.brand_id
              WHERE $sw GROUP BY b.id, b.name ORDER BY total DESC",
            $p
        );
        $byCategory = DB::all(
            "SELECT COALESCE(c.name, 'Sin categoría') AS name, SUM(si.qty - si.returned_qty) AS qty, SUM(si.total / si.qty * (si.qty - si.returned_qty)) AS total
               FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id
              WHERE $sw GROUP BY c.id, c.name ORDER BY total DESC",
            $p
        );
        $ivaSales = DB::all("SELECT si.tax_rate, SUM(si.base) AS base, SUM(si.tax) AS tax FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE $sw GROUP BY si.tax_rate ORDER BY si.tax_rate DESC", $p);
        $ivaReturns = array_column(DB::all("SELECT cni.tax_rate, SUM(cni.base) AS base, SUM(cni.tax) AS tax FROM credit_note_items cni JOIN credit_notes cn ON cn.id = cni.credit_note_id WHERE DATE(cn.issued_at) BETWEEN ? AND ? GROUP BY cni.tax_rate", $p), null, 'tax_rate');
        $ivaPurchases = DB::one("SELECT COALESCE(SUM(subtotal),0) AS base, COALESCE(SUM(tax_total),0) AS tax FROM purchases WHERE purchase_date BETWEEN ? AND ?", $p);
        $byDocType = DB::all("SELECT s.doc_type, COUNT(*) AS n, SUM(s.total) AS total FROM sales s WHERE $sw GROUP BY s.doc_type", $p);

        $this->view('reports/index', compact(
            'from', 'to', 'sales', 'returns', 'netBase', 'netCost', 'daily', 'byMethod', 'changeTotal', 'byUser', 'byHour',
            'topProducts', 'byBrand', 'byCategory', 'ivaSales', 'ivaReturns', 'ivaPurchases', 'byDocType'
        ) + ['title' => 'Reportes']);
    }

    public function export(): void
    {
        [$from, $to] = $this->range();
        $type = (string) input('type', 'sales');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $type . '_' . $from . '_' . $to . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        $n = fn($v) => number_format((float) $v, 2, ',', '');
        if ($type === 'items') {
            fputcsv($out, ['Documento', 'Fecha', 'Código', 'Producto', 'Cantidad', 'Devueltas', 'Precio unit.', 'Desc. %', 'Base', 'IVA %', 'IVA', 'Total', 'Costo unit.'], ';');
            $rows = DB::all('SELECT s.full_number, s.issued_at, si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE DATE(s.issued_at) BETWEEN ? AND ? ORDER BY s.id, si.id', [$from, $to]);
            foreach ($rows as $r) {
                fputcsv($out, [$r['full_number'], $r['issued_at'], $r['code'], $r['description'], $r['qty'], $r['returned_qty'], $n($r['unit_price']), $n($r['discount_pct']), $n($r['base']), $n($r['tax_rate']), $n($r['tax']), $n($r['total']), $n($r['unit_cost'])], ';');
            }
        } else {
            fputcsv($out, ['Documento', 'Tipo', 'Fecha', 'Cliente', 'Documento cliente', 'Cajero', 'Base', 'IVA', 'Descuentos', 'Total', 'Estado', 'Medios de pago', 'CUFE/CUDE', 'Estado DIAN'], ';');
            $rows = DB::all(
                "SELECT s.*, c.name AS customer, c.doc_number, u.name AS cashier, ed.uuid, ed.status AS edoc_status,
                        (SELECT GROUP_CONCAT(CONCAT(method, ':', amount) SEPARATOR ' | ') FROM sale_payments sp WHERE sp.sale_id = s.id) AS pays
                   FROM sales s JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.user_id
                   LEFT JOIN electronic_documents ed ON ed.sale_id = s.id
                  WHERE DATE(s.issued_at) BETWEEN ? AND ? ORDER BY s.id",
                [$from, $to]
            );
            foreach ($rows as $r) {
                fputcsv($out, [$r['full_number'], $r['doc_type'], $r['issued_at'], $r['customer'], $r['doc_number'], $r['cashier'], $n($r['subtotal']), $n($r['tax_total']), $n($r['discount_total']), $n($r['total']), $r['status'], $r['pays'], $r['uuid'], $r['edoc_status']], ';');
            }
        }
        fclose($out);
        exit;
    }
}

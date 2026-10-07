<?php
namespace App\Controllers;

use App\Core\Auth;
use App\Core\Controller;
use App\Core\DB;

class DashboardController extends Controller
{
    public function index(): void
    {
        $today = date('Y-m-d');
        $monthStart = date('Y-m-01');
        $scope = Auth::isAdmin() ? '' : ' AND s.user_id = ' . Auth::id();

        $todayStats = DB::one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM sales s WHERE DATE(issued_at) = ? AND status <> 'anulada' $scope", [$today]);
        $monthStats = DB::one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM sales s WHERE issued_at >= ? AND status <> 'anulada' $scope", [$monthStart]);
        $returnsMonth = (float) DB::value('SELECT COALESCE(SUM(total),0) FROM credit_notes WHERE issued_at >= ?', [$monthStart]);
        $monthProfit = (float) DB::value(
            "SELECT COALESCE(SUM((si.base / si.qty) * (si.qty - si.returned_qty) - si.unit_cost * (si.qty - si.returned_qty)),0)
               FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE s.issued_at >= ? AND s.status <> 'anulada'",
            [$monthStart]
        );
        $lowStock = DB::all('SELECT p.*, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.active = 1 AND p.stock <= p.min_stock ORDER BY p.stock ASC LIMIT 8');
        $lowStockCount = (int) DB::value('SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= min_stock');
        $edocIssues = (int) DB::value("SELECT COUNT(*) FROM electronic_documents WHERE status IN ('error','rechazado','pendiente')");

        $daily = DB::all(
            "SELECT DATE(issued_at) AS d, SUM(total) AS total, COUNT(*) AS n FROM sales s
              WHERE issued_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND status <> 'anulada' $scope
              GROUP BY DATE(issued_at) ORDER BY d"
        );
        $map = array_column($daily, 'total', 'd');
        $chart = ['labels' => [], 'values' => []];
        for ($i = 29; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i days"));
            $chart['labels'][] = date('d/m', strtotime($d));
            $chart['values'][] = round((float) ($map[$d] ?? 0));
        }

        $top = DB::all(
            "SELECT si.description, SUM(si.qty - si.returned_qty) AS qty, SUM(si.total) AS total
               FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE s.issued_at >= ? AND s.status <> 'anulada'
              GROUP BY si.product_id, si.description ORDER BY qty DESC LIMIT 6",
            [$monthStart]
        );
        $recent = DB::all(
            "SELECT s.*, c.name AS customer, ed.status AS edoc_status FROM sales s
               JOIN customers c ON c.id = s.customer_id
               LEFT JOIN electronic_documents ed ON ed.sale_id = s.id
              WHERE 1=1 $scope ORDER BY s.id DESC LIMIT 8"
        );

        $this->view('dashboard/index', compact('todayStats', 'monthStats', 'returnsMonth', 'monthProfit', 'lowStock', 'lowStockCount', 'edocIssues', 'chart', 'top', 'recent') + ['title' => 'Inicio']);
    }
}

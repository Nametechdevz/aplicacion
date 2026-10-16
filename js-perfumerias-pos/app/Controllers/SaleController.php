<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;
use App\Core\View;
use App\Services\SaleService;
use App\Services\Settings;

final class SaleController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        $today = local_today();
        $from = $this->date('from', date('Y-m-d', strtotime($today . ' -6 days')));
        $to = $this->date('to', $today);
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        [$start, $end] = utc_range($from, $to);
        $branchIds = $this->branchFilter();
        [$in, $bp] = Database::in($branchIds ?: [0]);
        $where = ["s.branch_id IN ($in)", 's.created_at >= :start', 's.created_at < :end'];
        $params = array_merge($bp, ['start' => $start, 'end' => $end]);
        $user = $this->request->int('user');
        if (!Auth::can('sales.view_branch')) {
            $user = Auth::id();
        }
        if ($user) {
            $where[] = 's.user_id = :uid';
            $params['uid'] = $user;
        }
        $status = $this->request->str('status');
        if (in_array($status, ['completed', 'voided'], true)) {
            $where[] = 's.status = :st';
            $params['st'] = $status;
        }
        $method = $this->request->int('method');
        if ($method) {
            $where[] = 'EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.payment_method_id = :mid)';
            $params['mid'] = $method;
        }
        if ($this->request->str('discount') === '1') {
            $where[] = 's.discount_total > 0';
        }
        $q = mb_substr($this->request->str('q'), 0, 60);
        if ($q !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $where[] = '(s.number LIKE :q1 OR c.full_name LIKE :q2 OR c.document_number LIKE :q3)';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        $w = implode(' AND ', $where);
        $rows = $this->db->all(
            "SELECT s.*, b.name AS branch_name, u.name AS seller, c.full_name AS customer,
                    (SELECT GROUP_CONCAT(DISTINCT sp.method_name ORDER BY sp.id SEPARATOR ' + ') FROM sale_payments sp WHERE sp.sale_id = s.id) AS methods,
                    (SELECT COUNT(*) FROM returns r WHERE r.sale_id = s.id AND r.status = 'completed') AS returns_count
             FROM sales s JOIN branches b ON b.id = s.branch_id JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
             WHERE $w ORDER BY s.created_at DESC, s.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $summary = $this->db->one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total END), 0) AS total,
                    COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.discount_total END), 0) AS discounts,
                    SUM(s.status = 'voided') AS voided, COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 END), 0) AS completed
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE $w",
            $params
        );
        [$in2, $bp2] = Database::in(Auth::branchIds() ?: [0]);
        return $this->view('sales/index', [
            'title' => 'Ventas', 'active' => 'sales', 'crumbs' => [['Ventas', null]],
            'rows' => $rows, 'summary' => $summary, 'total' => (int) $summary['n'], 'page' => $page, 'per' => $per,
            'filters' => ['from' => $from, 'to' => $to, 'branch' => $this->request->int('branch'), 'user' => $user, 'status' => $status, 'method' => $method, 'q' => $q, 'discount' => $this->request->str('discount')],
            'branches' => $this->db->all("SELECT id, name FROM branches WHERE id IN ($in2) AND type = 'store' ORDER BY name", $bp2),
            'sellers' => Auth::can('sales.view_branch') ? $this->db->all("SELECT DISTINCT u.id, u.name FROM users u JOIN branch_user_assignments a ON a.user_id = u.id WHERE a.branch_id IN ($in2) ORDER BY u.name", $bp2) : [],
            'methods' => $this->db->all('SELECT id, name FROM payment_methods ORDER BY sort_order'),
            'scripts' => ['sales.js'],
        ]);
    }

    public function show(int $id): Response
    {
        $sale = (new SaleService())->find($id);
        return $this->view('sales/show', [
            'title' => 'Venta ' . $sale['number'], 'active' => 'sales', 'crumbs' => [['Ventas', '/sales'], [$sale['number'], null]],
            'sale' => $sale,
        ]);
    }

    public function detail(int $id): Response
    {
        $sale = (new SaleService())->find($id);
        return $this->json(['ok' => true, 'number' => $sale['number'], 'html' => View::partial('sales/detail', ['sale' => $sale, 'drawer' => true])]);
    }

    public function receipt(int $id): Response
    {
        $sale = (new SaleService())->find($id);
        return $this->view('sales/receipt', [
            'sale' => $sale, 'company' => Settings::all(), 'autoprint' => $this->request->str('print') === '1',
        ], null);
    }

    public function reprint(int $id): Response
    {
        $svc = new SaleService();
        $svc->find($id); // valida alcance
        $svc->registerReprint($id);
        if ($this->request->wantsJson()) {
            return $this->json(['ok' => true, 'receipt_url' => url('/sales/' . $id . '/receipt')]);
        }
        return $this->redirect('/sales/' . $id . '/receipt?print=1');
    }

    public function void(int $id): Response
    {
        (new SaleService())->void($id, $this->request->str('reason'));
        return $this->success('Venta anulada. Se reintegró el inventario y se registró el movimiento compensatorio en caja.', '/sales/' . $id);
    }

    private function date(string $key, string $default): string
    {
        $v = $this->request->str($key);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) ? $v : $default;
    }
}

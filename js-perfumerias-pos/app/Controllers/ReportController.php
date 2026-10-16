<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;
use App\Services\Audit;
use App\Services\ReportService;

final class ReportController extends Controller
{
    public function index(): Response
    {
        $svc = new ReportService();
        $available = $svc->available();
        $type = $this->request->str('type', 'sales_period');
        $flat = array_merge(...array_values(array_map(fn ($g) => $g, $available)));
        if (!isset($flat[$type])) {
            $type = array_key_first($flat);
        }
        $f = $this->filters();
        $result = $svc->run($type, $f);
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        return $this->view('reports/index', [
            'title' => 'Reportes', 'active' => 'reports', 'crumbs' => [['Reportes', null]],
            'available' => $available, 'type' => $type, 'typeTitle' => $flat[$type], 'result' => $result, 'f' => $f,
            'branches' => $this->db->all("SELECT id, name FROM branches WHERE id IN ($in) ORDER BY type = 'warehouse', name", $bp),
            'categories' => $this->db->all('SELECT id, name FROM categories WHERE parent_id IS NULL ORDER BY name'),
            'sellers' => Auth::can('sales.view_branch') ? $this->db->all("SELECT DISTINCT u.id, u.name FROM users u JOIN branch_user_assignments a ON a.user_id = u.id WHERE a.branch_id IN ($in) ORDER BY u.name", $bp) : [],
            'methods' => $this->db->all('SELECT id, name FROM payment_methods ORDER BY sort_order'),
            'print' => $this->request->str('print') === '1',
        ], 'layouts/app');
    }

    public function export(): Response
    {
        $type = $this->request->str('type', 'sales_period');
        $f = $this->filters();
        $result = (new ReportService())->run($type, $f);
        Audit::log('report.export', 'report', null, 'Exportación CSV: ' . (ReportService::REPORTS[$type][0] ?? $type), null, ['from' => $f['from'], 'to' => $f['to'], 'branches' => $f['branch_ids']]);
        $header = array_map(fn ($c) => $c[1], $result['columns']);
        $rows = array_map(fn ($r) => array_map(fn ($c) => ReportService::exportValue($r[$c[0]] ?? null, $c[2]), $result['columns']), $result['rows']);
        return \App\Core\Response::csv("reporte_{$type}_{$f['from']}_{$f['to']}.csv", $header, $rows);
    }

    private function filters(): array
    {
        $today = local_today();
        $valid = static fn ($d) => (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
        $from = $valid($this->request->str('from')) ? $this->request->str('from') : substr($today, 0, 8) . '01';
        $to = $valid($this->request->str('to')) ? $this->request->str('to') : $today;
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        $user = $this->request->int('user');
        if (!Auth::can('sales.view_branch')) {
            $user = Auth::id();
        }
        return [
            'from' => $from, 'to' => $to, 'branch' => $this->request->int('branch'),
            'branch_ids' => Auth::scopeBranches($this->request->int('branch')),
            'product_id' => $this->request->int('product'), 'category_id' => $this->request->int('category'),
            'user_id' => $user, 'method_id' => $this->request->int('method'),
            'group' => in_array($this->request->str('group'), ['day', 'week', 'month'], true) ? $this->request->str('group') : 'day',
        ];
    }
}

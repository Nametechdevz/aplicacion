<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;
use App\Core\Session;
use App\Services\DashboardService;

final class DashboardController extends Controller
{
    public function index(): Response
    {
        if (!Auth::can('dashboard.view')) {
            return $this->redirect(Auth::can('pos.sell') ? '/pos' : (Auth::can('sales.view_own') ? '/sales' : '/profile'));
        }
        $filters = $this->filters();
        $data = $this->build($filters);
        [$in, $params] = Database::in(Auth::branchIds() ?: [0]);
        $branches = $this->db->all("SELECT id, name, type FROM branches WHERE id IN ($in) AND type = 'store' ORDER BY name", $params);
        $sellers = $this->db->all(
            "SELECT DISTINCT u.id, u.name FROM users u JOIN branch_user_assignments a ON a.user_id = u.id
             WHERE a.branch_id IN ($in) ORDER BY u.name",
            $params
        );
        return $this->view('dashboard/index', [
            'title' => 'Panel',
            'active' => 'dashboard',
            'crumbs' => [['Panel', null]],
            'filters' => $filters,
            'data' => $data,
            'branches' => $branches,
            'sellers' => $sellers,
            'scripts' => ['dashboard.js'],
        ]);
    }

    public function data(): Response
    {
        return $this->json(['ok' => true] + $this->build($this->filters()));
    }

    public function switchBranch(): Response
    {
        $id = (int) $this->request->int('branch_id', 0);
        Auth::setActiveBranch($id);
        $name = $this->db->value('SELECT name FROM branches WHERE id = :id', ['id' => $id]);
        Session::flash('success', "Sucursal activa: $name");
        return $this->back('/');
    }

    private function filters(): array
    {
        $today = local_today();
        $preset = $this->request->str('range', 'month');
        $from = $this->request->str('from');
        $to = $this->request->str('to');
        $valid = static fn ($d) => (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d) !== false;
        if ($preset !== 'custom' || !$valid($from) || !$valid($to)) {
            $t = new \DateTimeImmutable($today);
            [$from, $to] = match ($preset) {
                'today' => [$today, $today],
                '7d' => [$t->modify('-6 days')->format('Y-m-d'), $today],
                '30d' => [$t->modify('-29 days')->format('Y-m-d'), $today],
                'year' => [$t->format('Y-01-01'), $today],
                default => [$t->format('Y-m-01'), $today],
            };
            if (!in_array($preset, ['today', '7d', '30d', 'year', 'month', 'custom'], true)) {
                $preset = 'month';
            }
        }
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        // Rango máximo de 366 días para mantener las consultas ágiles.
        if ((strtotime($to) - strtotime($from)) > 366 * 86400) {
            $from = date('Y-m-d', strtotime($to) - 366 * 86400);
        }
        $branch = $this->request->int('branch');
        $user = $this->request->int('user');
        return ['range' => $preset, 'from' => $from, 'to' => $to, 'branch' => $branch, 'user' => $user];
    }

    private function build(array $f): array
    {
        $branchIds = Auth::scopeBranches($f['branch']);
        $userId = $f['user'];
        // Sin permiso de ventas de sucursal solo se ven las propias.
        if (!Auth::can('sales.view_branch')) {
            $userId = Auth::id();
        }
        $data = (new DashboardService())->build($f['from'], $f['to'], $branchIds, $userId);
        $data['can_financial'] = Auth::can('reports.financial');
        if (!$data['can_financial']) {
            foreach (['cost', 'profit', 'margin_pct'] as $k) {
                $data['kpi'][$k] = null;
            }
            foreach ($data['series'] as &$s) {
                $s['cost'] = null;
                $s['profit'] = null;
            }
            unset($s);
        }
        $data['filters'] = $f;
        return $data;
    }
}

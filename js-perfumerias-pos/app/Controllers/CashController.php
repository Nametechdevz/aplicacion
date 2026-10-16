<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\CashService;

final class CashController extends Controller
{
    public function index(): Response
    {
        $cash = new CashService();
        $branchId = Auth::activeBranchId();
        $session = $branchId ? $cash->openSessionFor((int) Auth::id(), $branchId) : null;
        $summary = $session ? $cash->summary((int) $session['id']) : null;
        $movements = $session ? $this->db->all(
            'SELECT cm.*, pm.name AS method, u.name AS user_name FROM cash_movements cm LEFT JOIN payment_methods pm ON pm.id = cm.payment_method_id
             JOIN users u ON u.id = cm.user_id WHERE cm.cash_session_id = :s ORDER BY cm.id DESC LIMIT 60',
            ['s' => $session['id']]
        ) : [];
        $opening = $branchId ? $cash->openingContext($branchId, (int) Auth::id()) : ['registers' => [], 'elsewhere' => null];
        $registers = $opening['registers'];
        $branch = $branchId ? $this->db->one('SELECT * FROM branches WHERE id = :id', ['id' => $branchId]) : null;
        $openSessions = [];
        if (Auth::can('cash.view_branch')) {
            [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
            $openSessions = $this->db->all(
                "SELECT cs.*, u.name AS user_name, cr.name AS register_name, b.name AS branch_name,
                        (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.cash_session_id = cs.id AND s.status = 'completed') AS sales_total
                 FROM cash_sessions cs JOIN users u ON u.id = cs.user_id JOIN cash_registers cr ON cr.id = cs.register_id JOIN branches b ON b.id = cs.branch_id
                 WHERE cs.status IN ('open','closed') AND cs.branch_id IN ($in) ORDER BY cs.status = 'closed' DESC, cs.opened_at DESC",
                $bp
            );
        }
        return $this->view('cash/index', [
            'title' => 'Caja', 'active' => 'cash', 'crumbs' => [['Caja', null]],
            'session' => $session, 'summary' => $summary, 'movements' => $movements, 'registers' => $registers,
            'branch' => $branch, 'openSessions' => $openSessions, 'elsewhere' => $opening['elsewhere'],
        ]);
    }

    public function open(): Response
    {
        (new CashService())->open((int) $this->request->int('register_id', 0), $this->request->str('opening_amount', '0'));
        return $this->success('Caja abierta. ¡Buen turno!', '/cash');
    }

    public function movement(): Response
    {
        (new CashService())->movement(
            (int) $this->request->int('session_id', 0),
            $this->request->str('type'),
            $this->request->str('amount'),
            $this->request->str('reason'),
            $this->request->str('category')
        );
        return $this->success('Movimiento de caja registrado.', '/cash');
    }

    public function close(): Response
    {
        $detail = (array) ($this->request->post['count'] ?? []);
        $result = (new CashService())->close(
            (int) $this->request->int('session_id', 0),
            $this->request->str('counted_cash'),
            $detail,
            $this->request->str('notes')
        );
        $msg = 'Caja cerrada. Diferencia: ' . money($result['difference']) . ($result['status'] === 'closed' ? ' · pendiente de aprobación del supervisor.' : '.');
        return $this->success($msg, '/cash/sessions/' . (int) $this->request->int('session_id', 0));
    }

    public function sessions(): Response
    {
        [$page, $per, $offset] = $this->page();
        $branchIds = $this->branchFilter();
        [$in, $bp] = Database::in($branchIds ?: [0]);
        $where = "cs.branch_id IN ($in)";
        $params = $bp;
        if (!Auth::can('cash.view_branch')) {
            $where .= ' AND cs.user_id = :uid';
            $params['uid'] = Auth::id();
        }
        $status = $this->request->str('status');
        if (in_array($status, ['open', 'closed', 'approved'], true)) {
            $where .= ' AND cs.status = :st';
            $params['st'] = $status;
        }
        $rows = $this->db->all(
            "SELECT cs.*, u.name AS user_name, cr.name AS register_name, b.name AS branch_name, a.name AS approver
             FROM cash_sessions cs JOIN users u ON u.id = cs.user_id JOIN cash_registers cr ON cr.id = cs.register_id
             JOIN branches b ON b.id = cs.branch_id LEFT JOIN users a ON a.id = cs.approved_by
             WHERE $where ORDER BY cs.opened_at DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM cash_sessions cs WHERE $where", $params);
        [$in2, $bp2] = Database::in(Auth::branchIds() ?: [0]);
        return $this->view('cash/sessions', [
            'title' => 'Cierres de caja', 'active' => 'cash', 'crumbs' => [['Caja', '/cash'], ['Cierres', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'status' => $status,
            'branches' => $this->db->all("SELECT id, name FROM branches WHERE id IN ($in2) AND type = 'store' ORDER BY name", $bp2),
            'branch' => $this->request->int('branch'),
        ]);
    }

    public function session(int $id): Response
    {
        $s = $this->db->one(
            'SELECT cs.*, u.name AS user_name, cr.name AS register_name, b.name AS branch_name, a.name AS approver
             FROM cash_sessions cs JOIN users u ON u.id = cs.user_id JOIN cash_registers cr ON cr.id = cs.register_id
             JOIN branches b ON b.id = cs.branch_id LEFT JOIN users a ON a.id = cs.approved_by WHERE cs.id = :id',
            ['id' => $id]
        );
        if (!$s) {
            throw HttpException::notFound('El turno no existe.');
        }
        Auth::authorizeBranch((int) $s['branch_id']);
        if (!Auth::can('cash.view_branch') && (int) $s['user_id'] !== Auth::id()) {
            throw HttpException::forbidden();
        }
        $summary = (new CashService())->summary($id);
        $movements = $this->db->all(
            'SELECT cm.*, pm.name AS method, u.name AS user_name FROM cash_movements cm LEFT JOIN payment_methods pm ON pm.id = cm.payment_method_id
             JOIN users u ON u.id = cm.user_id WHERE cm.cash_session_id = :s ORDER BY cm.id',
            ['s' => $id]
        );
        return $this->view('cash/session', [
            'title' => 'Turno de caja #' . $id, 'active' => 'cash', 'crumbs' => [['Caja', '/cash'], ['Cierres', '/cash/sessions'], ['Turno #' . $id, null]],
            's' => $s, 'summary' => $summary, 'movements' => $movements,
            'snapshot' => $s['totals_snapshot'] ? json_decode($s['totals_snapshot'], true) : null,
            'count' => $s['count_detail'] ? json_decode($s['count_detail'], true) : [],
        ]);
    }

    public function approve(int $id): Response
    {
        (new CashService())->approve($id, $this->request->str('notes') ?: $this->request->str('reason'));
        return $this->success('Cierre aprobado.', '/cash/sessions/' . $id);
    }
}

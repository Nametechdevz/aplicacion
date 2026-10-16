<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\ReturnService;
use App\Services\SaleService;

final class ReturnController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $where = "r.branch_id IN ($in)";
        $params = $bp;
        $status = $this->request->str('status');
        if (in_array($status, ['pending', 'completed', 'rejected'], true)) {
            $where .= ' AND r.status = :st';
            $params['st'] = $status;
        }
        $rows = $this->db->all(
            "SELECT r.*, s.number AS sale_number, b.name AS branch, u.name AS user_name, pm.name AS method,
                    (SELECT COUNT(*) FROM return_items ri WHERE ri.return_id = r.id) AS items
             FROM returns r JOIN sales s ON s.id = r.sale_id JOIN branches b ON b.id = r.branch_id JOIN users u ON u.id = r.user_id
             LEFT JOIN payment_methods pm ON pm.id = r.refund_method_id WHERE $where ORDER BY r.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM returns r WHERE $where", $params);
        return $this->view('returns/index', [
            'title' => 'Devoluciones', 'active' => 'returns', 'crumbs' => [['Devoluciones', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'status' => $status,
        ]);
    }

    public function create(): Response
    {
        $saleId = $this->request->int('sale');
        $number = $this->request->str('number');
        $sale = null;
        if (!$saleId && $number !== '') {
            $saleId = (int) $this->db->value('SELECT id FROM sales WHERE number = :n', ['n' => strtoupper($number)]) ?: null;
            if (!$saleId) {
                \App\Core\Session::flash('error', "No se encontró la venta «{$number}».");
            }
        }
        if ($saleId) {
            $sale = (new SaleService())->find($saleId);
        }
        return $this->view('returns/create', [
            'title' => 'Registrar devolución', 'active' => 'returns', 'crumbs' => [['Devoluciones', '/returns'], ['Nueva', null]],
            'sale' => $sale, 'number' => $number,
            'methods' => $this->db->all('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order'),
            'needsApproval' => \App\Services\Settings::bool('returns_require_approval') && !Auth::can('returns.approve'),
        ]);
    }

    public function store(): Response
    {
        $saleId = (int) $this->request->int('sale_id', 0);
        (new SaleService())->find($saleId); // valida alcance
        $res = (new ReturnService())->create($saleId, $this->request->post);
        return $this->success(
            $res['status'] === 'pending' ? "Devolución {$res['number']} registrada; queda pendiente de aprobación." : "Devolución {$res['number']} aplicada por " . money($res['total']) . '.',
            '/returns/' . $res['id']
        );
    }

    public function show(int $id): Response
    {
        $r = $this->db->one(
            'SELECT r.*, s.number AS sale_number, s.created_at AS sale_date, b.name AS branch, u.name AS user_name, pm.name AS method, a.name AS approver
             FROM returns r JOIN sales s ON s.id = r.sale_id JOIN branches b ON b.id = r.branch_id JOIN users u ON u.id = r.user_id
             LEFT JOIN payment_methods pm ON pm.id = r.refund_method_id LEFT JOIN users a ON a.id = r.approved_by WHERE r.id = :id',
            ['id' => $id]
        );
        if (!$r) {
            throw HttpException::notFound('La devolución no existe.');
        }
        Auth::authorizeBranch((int) $r['branch_id']);
        $items = $this->db->all(
            'SELECT ri.*, si.product_name, si.variant_name, si.unit_code, si.quantity AS sold FROM return_items ri JOIN sale_items si ON si.id = ri.sale_item_id WHERE ri.return_id = :r',
            ['r' => $id]
        );
        return $this->view('returns/show', [
            'title' => 'Devolución ' . $r['number'], 'active' => 'returns', 'crumbs' => [['Devoluciones', '/returns'], [$r['number'], null]],
            'r' => $r, 'items' => $items,
        ]);
    }

    public function approve(int $id): Response
    {
        (new ReturnService())->approve($id);
        return $this->success('Devolución aprobada y aplicada.', '/returns/' . $id);
    }

    public function reject(int $id): Response
    {
        (new ReturnService())->reject($id, $this->request->str('reason'));
        return $this->success('Devolución rechazada; las cantidades vuelven a estar disponibles para devolución.', '/returns/' . $id);
    }
}

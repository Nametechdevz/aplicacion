<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;
use App\Services\DiscountService;

/** Bandeja de autorizaciones de descuento para supervisores. */
final class ApprovalController extends Controller
{
    public function index(): Response
    {
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $this->db->execute("UPDATE discount_approvals SET status = 'expired' WHERE status = 'pending' AND expires_at < UTC_TIMESTAMP()");
        $rows = $this->db->all(
            "SELECT da.*, u.name AS requester, b.name AS branch, p.name AS product, p.cost, p.price, un.code AS unit, d.name AS decider
             FROM discount_approvals da JOIN users u ON u.id = da.requested_by JOIN branches b ON b.id = da.branch_id
             LEFT JOIN products p ON p.id = da.product_id LEFT JOIN units_of_measure un ON un.id = p.base_unit_id
             LEFT JOIN users d ON d.id = da.decided_by
             WHERE da.branch_id IN ($in) ORDER BY da.status = 'pending' DESC, da.id DESC LIMIT 60",
            $bp
        );
        return $this->view('approvals/index', [
            'title' => 'Autorizaciones de descuento', 'active' => 'approvals', 'crumbs' => [['Autorizaciones', null]],
            'rows' => $rows, 'showCost' => Auth::can('products.cost_view'),
        ]);
    }

    public function approve(int $id): Response
    {
        (new DiscountService())->decide($id, true, $this->request->str('notes'));
        return $this->success('Descuento autorizado. La caja lo aplicará automáticamente.', '/approvals');
    }

    public function reject(int $id): Response
    {
        (new DiscountService())->decide($id, false, $this->request->str('reason'));
        return $this->success('Solicitud rechazada.', '/approvals');
    }
}

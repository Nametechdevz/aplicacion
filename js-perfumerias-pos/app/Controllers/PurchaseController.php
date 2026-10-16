<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\PurchaseService;

final class PurchaseController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $where = "po.branch_id IN ($in)";
        $params = $bp;
        $status = $this->request->str('status');
        if ($status === 'pending') {
            $where .= " AND po.status IN ('ordered','partial')";
        } elseif (in_array($status, ['draft', 'ordered', 'partial', 'received', 'cancelled'], true)) {
            $where .= ' AND po.status = :st';
            $params['st'] = $status;
        }
        $rows = $this->db->all(
            "SELECT po.*, s.name AS supplier, b.name AS branch, u.name AS created_name,
                    (SELECT COALESCE(SUM(quantity), 0) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS qty_total,
                    (SELECT COALESCE(SUM(qty_received), 0) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) AS qty_received
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN branches b ON b.id = po.branch_id JOIN users u ON u.id = po.created_by
             WHERE $where ORDER BY po.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM purchase_orders po WHERE $where", $params);
        return $this->view('purchases/index', [
            'title' => 'Compras', 'active' => 'purchases', 'crumbs' => [['Compras', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'status' => $status,
        ]);
    }

    public function create(): Response
    {
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        return $this->view('purchases/create', [
            'title' => 'Nueva orden de compra', 'active' => 'purchases', 'crumbs' => [['Compras', '/purchases'], ['Nueva orden', null]],
            'suppliers' => $this->db->all('SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name'),
            'branches' => $this->db->all("SELECT id, name, type FROM branches WHERE id IN ($in) AND is_active = 1 ORDER BY type = 'store', name", $bp),
            'scripts' => ['line-editor.js', 'purchase.js'],
        ]);
    }

    public function store(): Response
    {
        $input = $this->request->post;
        $input['items'] = array_values((array) ($input['items'] ?? []));
        $id = (new PurchaseService())->create($input);
        return $this->success('Orden de compra creada.', '/purchases/' . $id);
    }

    public function show(int $id): Response
    {
        $po = $this->db->one(
            'SELECT po.*, s.name AS supplier, s.tax_id, s.phone AS supplier_phone, s.email AS supplier_email, b.name AS branch, u.name AS created_name
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id JOIN branches b ON b.id = po.branch_id JOIN users u ON u.id = po.created_by WHERE po.id = :id',
            ['id' => $id]
        );
        if (!$po) {
            throw HttpException::notFound('La orden no existe.');
        }
        Auth::authorizeBranch((int) $po['branch_id']);
        return $this->view('purchases/show', [
            'title' => 'Orden ' . $po['number'], 'active' => 'purchases', 'crumbs' => [['Compras', '/purchases'], [$po['number'], null]],
            'po' => $po,
            'items' => $this->db->all('SELECT i.*, p.name, p.code, u.code AS unit FROM purchase_order_items i JOIN products p ON p.id = i.product_id JOIN units_of_measure u ON u.id = p.base_unit_id WHERE i.purchase_order_id = :id ORDER BY i.id', ['id' => $id]),
            'receipts' => $this->db->all('SELECT gr.*, u.name AS user_name FROM goods_receipts gr JOIN users u ON u.id = gr.received_by WHERE gr.purchase_order_id = :id ORDER BY gr.id', ['id' => $id]),
            'returns' => $this->db->all('SELECT sr.*, u.name AS user_name FROM supplier_returns sr JOIN users u ON u.id = sr.created_by WHERE sr.purchase_order_id = :id ORDER BY sr.id', ['id' => $id]),
        ]);
    }

    public function order(int $id): Response
    {
        (new PurchaseService())->markOrdered($id);
        return $this->success('Orden marcada como enviada al proveedor.', '/purchases/' . $id);
    }

    public function cancel(int $id): Response
    {
        (new PurchaseService())->cancel($id, $this->request->str('reason'));
        return $this->success('Orden cancelada.', '/purchases/' . $id);
    }

    public function receive(int $id): Response
    {
        (new PurchaseService())->receive($id, $this->request->post);
        return $this->success('Mercancía recibida: el inventario y los costos se actualizaron.', '/purchases/' . $id);
    }

    public function supplierReturn(int $id): Response
    {
        (new PurchaseService())->supplierReturn($id, $this->request->post);
        return $this->success('Devolución al proveedor registrada.', '/purchases/' . $id);
    }
}

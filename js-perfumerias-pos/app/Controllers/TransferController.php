<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Response;
use App\Services\TransferService;

final class TransferController extends Controller
{
    public function index(): Response
    {
        [$page, $per, $offset] = $this->page();
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        [$in2, $bp2] = Database::in(Auth::branchIds() ?: [0], 'k');
        $where = ["(t.from_branch_id IN ($in) OR t.to_branch_id IN ($in2))"];
        $params = array_merge($bp, $bp2);
        $status = $this->request->str('status');
        if ($status === 'open') {
            $where[] = "t.status IN ('requested','approved','in_transit','received_with_differences')";
        } elseif (in_array($status, ['requested', 'approved', 'in_transit', 'received', 'received_with_differences', 'resolved', 'rejected', 'cancelled'], true)) {
            $where[] = 't.status = :st';
            $params['st'] = $status;
        }
        $w = implode(' AND ', $where);
        $rows = $this->db->all(
            "SELECT t.*, fb.name AS from_name, fb.type AS from_type, tb.name AS to_name, u.name AS requested_name,
                    (SELECT COUNT(*) FROM stock_transfer_items i WHERE i.transfer_id = t.id) AS items
             FROM stock_transfers t JOIN branches fb ON fb.id = t.from_branch_id JOIN branches tb ON tb.id = t.to_branch_id
             JOIN users u ON u.id = t.requested_by WHERE $w
             ORDER BY FIELD(t.status, 'received_with_differences', 'requested', 'approved', 'in_transit') DESC, t.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM stock_transfers t WHERE $w", $params);
        $counts = array_column($this->db->all(
            "SELECT t.status, COUNT(*) AS n FROM stock_transfers t WHERE (t.from_branch_id IN ($in) OR t.to_branch_id IN ($in2)) GROUP BY t.status",
            array_merge($bp, $bp2)
        ), 'n', 'status');
        return $this->view('transfers/index', [
            'title' => 'Transferencias', 'active' => 'transfers', 'crumbs' => [['Transferencias', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'status' => $status, 'counts' => $counts,
        ]);
    }

    public function create(): Response
    {
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $mine = $this->db->all("SELECT id, name, type FROM branches WHERE id IN ($in) AND is_active = 1 ORDER BY type = 'store', name", $bp);
        $all = $this->db->all("SELECT id, name, type FROM branches WHERE is_active = 1 ORDER BY type = 'store', name");
        return $this->view('transfers/create', [
            'title' => 'Solicitar transferencia', 'active' => 'transfers', 'crumbs' => [['Transferencias', '/transfers'], ['Nueva solicitud', null]],
            'mine' => $mine, 'all' => $all, 'to' => $this->request->int('to') ?: Auth::activeBranchId(),
            'scripts' => ['line-editor.js'],
        ]);
    }

    public function store(): Response
    {
        $items = array_values((array) ($this->request->post['items'] ?? []));
        $id = (new TransferService())->create(
            (int) $this->request->int('from_id', 0),
            (int) $this->request->int('to_id', 0),
            $items,
            $this->request->str('notes')
        );
        return $this->success('Solicitud de transferencia creada. El origen debe aprobarla y despacharla.', '/transfers/' . $id);
    }

    public function show(int $id): Response
    {
        $t = (new TransferService())->find($id);
        return $this->view('transfers/show', [
            'title' => 'Transferencia ' . $t['number'], 'active' => 'transfers', 'crumbs' => [['Transferencias', '/transfers'], [$t['number'], null]],
            't' => $t,
            'canOrigin' => Auth::canAccessBranch((int) $t['from_branch_id']),
            'canDest' => Auth::canAccessBranch((int) $t['to_branch_id']),
        ]);
    }

    public function approve(int $id): Response
    {
        (new TransferService())->approve($id, (array) ($this->request->post['approved'] ?? []));
        return $this->success('Transferencia aprobada: las cantidades quedaron reservadas en el origen.', '/transfers/' . $id);
    }

    public function reject(int $id): Response
    {
        (new TransferService())->reject($id, $this->request->str('reason'));
        return $this->success('Transferencia rechazada.', '/transfers/' . $id);
    }

    public function dispatchTransfer(int $id): Response
    {
        (new TransferService())->dispatch($id);
        return $this->success('Mercancía despachada: quedó en tránsito hacia el destino.', '/transfers/' . $id);
    }

    public function receive(int $id): Response
    {
        $status = (new TransferService())->receive($id, (array) ($this->request->post['received'] ?? []), $this->request->str('notes'));
        return $this->success($status === 'received' ? 'Recepción confirmada; el inventario de destino se actualizó.' : 'Recepción registrada con diferencias: requieren resolución.', '/transfers/' . $id);
    }

    public function resolve(int $id): Response
    {
        (new TransferService())->resolve($id, (array) ($this->request->post['resolution'] ?? []), $this->request->str('resolution_notes'));
        return $this->success('Diferencias resueltas y documentadas.', '/transfers/' . $id);
    }

    public function cancel(int $id): Response
    {
        (new TransferService())->cancel($id, $this->request->str('reason'));
        return $this->success('Transferencia cancelada.', '/transfers/' . $id);
    }
}

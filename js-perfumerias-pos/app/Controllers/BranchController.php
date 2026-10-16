<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Services\BranchService;

final class BranchController extends Controller
{
    public function index(): Response
    {
        [$s, $e] = utc_range(local_today(), local_today());
        [$ms] = utc_range(substr(local_today(), 0, 8) . '01', local_today());
        $branches = $this->db->all(
            "SELECT b.*,
                    (SELECT COUNT(*) FROM branch_user_assignments a JOIN users u ON u.id = a.user_id AND u.is_active = 1 WHERE a.branch_id = b.id) AS users,
                    (SELECT COUNT(*) FROM cash_registers cr WHERE cr.branch_id = b.id AND cr.is_active = 1) AS registers,
                    (SELECT COUNT(*) FROM cash_sessions cs WHERE cs.branch_id = b.id AND cs.status = 'open') AS open_sessions,
                    (SELECT COALESCE(SUM(t.total), 0) FROM sales t WHERE t.branch_id = b.id AND t.status = 'completed' AND t.created_at >= :s1 AND t.created_at < :e1) AS today,
                    (SELECT COALESCE(SUM(t.total), 0) FROM sales t WHERE t.branch_id = b.id AND t.status = 'completed' AND t.created_at >= :s2) AS month,
                    (SELECT COALESCE(SUM(GREATEST(i.quantity, 0) * p.cost), 0) FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.branch_id = b.id) AS stock_value,
                    (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id AND p.is_active = 1 WHERE i.branch_id = b.id AND i.min_stock > 0 AND (i.quantity - i.reserved) <= i.min_stock) AS low
             FROM branches b ORDER BY b.type = 'store', b.is_active DESC, b.name",
            ['s1' => $s, 'e1' => $e, 's2' => $ms]
        );
        $registers = $this->db->all('SELECT * FROM cash_registers ORDER BY branch_id, name');
        $byBranch = [];
        foreach ($registers as $r) {
            $byBranch[(int) $r['branch_id']][] = $r;
        }
        return $this->view('branches/index', [
            'title' => 'Sucursales', 'active' => 'branches', 'crumbs' => [['Sucursales', null]],
            'branches' => $branches, 'registers' => $byBranch,
        ]);
    }

    public function store(): Response
    {
        (new BranchService())->save(null, $this->request->post);
        return $this->success('Sucursal creada con su caja principal.', '/branches');
    }

    public function update(int $id): Response
    {
        (new BranchService())->save($id, $this->request->post);
        return $this->success('Sucursal actualizada.', '/branches');
    }

    public function toggle(int $id): Response
    {
        $active = (new BranchService())->toggle($id);
        return $this->success($active ? 'Sucursal activada.' : 'Sucursal desactivada.', '/branches');
    }

    public function addRegister(int $id): Response
    {
        (new BranchService())->addRegister($id, $this->request->str('name'));
        return $this->success('Caja agregada.', '/branches');
    }
}

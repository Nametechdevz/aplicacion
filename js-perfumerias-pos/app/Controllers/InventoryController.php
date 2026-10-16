<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\InventoryService;
use App\Services\TransferService;

final class InventoryController extends Controller
{
    private function branches(): array
    {
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        return $this->db->all("SELECT id, code, name, type, is_active FROM branches WHERE id IN ($in) ORDER BY type = 'store', name", $bp);
    }

    private function selectedBranch(array $branches): ?array
    {
        $req = $this->request->int('branch');
        if ($req) {
            Auth::authorizeBranch($req);
        }
        $id = $req ?: Auth::activeBranchId();
        foreach ($branches as $b) {
            if ((int) $b['id'] === (int) $id) {
                return $b;
            }
        }
        return $branches[0] ?? null;
    }

    public function index(): Response
    {
        $branches = $this->branches();
        $branch = $this->selectedBranch($branches);
        if (!$branch) {
            throw HttpException::forbidden('No tiene sucursales asignadas.');
        }
        [$page, $per, $offset] = $this->page();
        $where = ['p.is_active = 1'];
        $params = ['b' => $branch['id']];
        $q = mb_substr($this->request->str('q'), 0, 60);
        if ($q !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $where[] = '(p.name LIKE :q1 OR p.code LIKE :q2 OR p.barcode = :q3)';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $q];
        }
        $status = $this->request->str('status');
        $avail = 'COALESCE(i.quantity, 0) - COALESCE(i.reserved, 0)';
        if ($status === 'low') {
            $where[] = "COALESCE(i.min_stock, 0) > 0 AND $avail > 0 AND $avail <= i.min_stock";
        } elseif ($status === 'out') {
            $where[] = "$avail <= 0";
        } elseif ($status === 'transit') {
            $where[] = 'COALESCE(i.in_transit, 0) > 0';
        }
        $cat = $this->request->int('category');
        if ($cat) {
            $where[] = '(p.category_id = :c1 OR p.subcategory_id = :c2)';
            $params += ['c1' => $cat, 'c2' => $cat];
        }
        $w = implode(' AND ', $where);
        $rows = $this->db->all(
            "SELECT p.id, p.code, p.name, p.cost, p.price, p.sale_mode, p.qty_precision, u.code AS unit, b.name AS brand,
                    COALESCE(i.quantity, 0) AS quantity, COALESCE(i.reserved, 0) AS reserved, COALESCE(i.in_transit, 0) AS in_transit,
                    COALESCE(i.min_stock, 0) AS min_stock, i.updated_at,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = :b
             WHERE $w ORDER BY ($avail <= 0) DESC, (COALESCE(i.min_stock,0) > 0 AND $avail <= i.min_stock) DESC, p.name
             LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM products p LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = :b WHERE $w", $params);
        $summary = $this->db->one(
            "SELECT COUNT(*) AS items, COALESCE(SUM(GREATEST(i.quantity, 0) * p.cost), 0) AS value, COALESCE(SUM(GREATEST(i.quantity, 0) * p.price), 0) AS retail,
                    SUM(CASE WHEN i.min_stock > 0 AND (i.quantity - i.reserved) > 0 AND (i.quantity - i.reserved) <= i.min_stock THEN 1 ELSE 0 END) AS low,
                    SUM(CASE WHEN (i.quantity - i.reserved) <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
                    SUM(CASE WHEN i.in_transit > 0 THEN 1 ELSE 0 END) AS transit
             FROM inventory i JOIN products p ON p.id = i.product_id AND p.is_active = 1 WHERE i.branch_id = :b",
            ['b' => $branch['id']]
        );
        return $this->view('inventory/index', [
            'title' => 'Inventario', 'active' => 'inventory', 'crumbs' => [['Inventario', null]],
            'branches' => $branches, 'branch' => $branch, 'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per,
            'summary' => $summary, 'filters' => ['q' => $q, 'status' => $status, 'category' => $cat],
            'categories' => $this->db->all('SELECT id, name FROM categories WHERE parent_id IS NULL ORDER BY name'),
            'showCost' => Auth::can('products.cost_view'),
        ]);
    }

    public function movements(): Response
    {
        [$page, $per, $offset] = $this->page();
        $branchIds = $this->branchFilter();
        [$in, $bp] = Database::in($branchIds ?: [0]);
        $where = ["m.branch_id IN ($in)"];
        $params = $bp;
        $product = $this->request->int('product');
        if ($product) {
            $where[] = 'm.product_id = :p';
            $params['p'] = $product;
        }
        $type = $this->request->str('type');
        if ($type !== '' && preg_match('/^[a-z_]+$/', $type)) {
            $where[] = 'm.type = :t';
            $params['t'] = $type;
        }
        $from = $this->request->str('from');
        $to = $this->request->str('to');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            [$s, $e] = utc_range($from, $to);
            $where[] = 'm.created_at >= :s AND m.created_at < :e';
            $params += ['s' => $s, 'e' => $e];
        }
        $w = implode(' AND ', $where);
        $rows = $this->db->all(
            "SELECT m.*, p.name AS product, p.code, un.code AS unit, b.name AS branch, u.name AS user_name
             FROM inventory_movements m JOIN products p ON p.id = m.product_id JOIN units_of_measure un ON un.id = p.base_unit_id
             JOIN branches b ON b.id = m.branch_id LEFT JOIN users u ON u.id = m.user_id
             WHERE $w ORDER BY m.id DESC LIMIT $per OFFSET $offset",
            $params
        );
        $total = (int) $this->db->value("SELECT COUNT(*) FROM inventory_movements m WHERE $w", $params);
        return $this->view('inventory/movements', [
            'title' => 'Movimientos de inventario', 'active' => 'inventory', 'crumbs' => [['Inventario', '/inventory'], ['Movimientos', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'branches' => $this->branches(),
            'filters' => ['branch' => $this->request->int('branch'), 'product' => $product, 'type' => $type, 'from' => $from, 'to' => $to],
            'productName' => $product ? $this->db->value('SELECT name FROM products WHERE id = :id', ['id' => $product]) : null,
        ]);
    }

    public function distribute(): Response
    {
        $branches = $this->branches();
        $warehouses = array_values(array_filter($branches, fn ($b) => $b['type'] === 'warehouse' && (int) $b['is_active']));
        $fromId = $this->request->int('from') ?: (int) ($warehouses[0]['id'] ?? 0);
        Auth::authorizeBranch($fromId);
        $stores = array_values(array_filter($branches, fn ($b) => $b['type'] === 'store' && (int) $b['is_active'] && (int) $b['id'] !== $fromId));
        [$in, $bp] = Database::in(array_map(fn ($b) => (int) $b['id'], $stores) ?: [0], 's');
        $focus = $this->request->int('product');
        $products = $this->db->all(
            "SELECT p.id, p.code, p.name, p.qty_precision, u.code AS unit, COALESCE(i.quantity - i.reserved, 0) AS available,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id
             LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = :f
             WHERE p.is_active = 1 AND (COALESCE(i.quantity - i.reserved, 0) > 0 OR p.id = :focus)
             ORDER BY p.id = :focus2 DESC, p.name",
            ['f' => $fromId, 'focus' => $focus ?: 0, 'focus2' => $focus ?: 0]
        );
        $stock = [];
        foreach ($this->db->all("SELECT branch_id, product_id, quantity - reserved AS available, min_stock, in_transit FROM inventory WHERE branch_id IN ($in)", $bp) as $r) {
            $stock[(int) $r['product_id']][(int) $r['branch_id']] = $r;
        }
        return $this->view('inventory/distribute', [
            'title' => 'Distribuir existencias', 'active' => 'inventory', 'crumbs' => [['Inventario', '/inventory'], ['Distribuir', null]],
            'warehouses' => $warehouses, 'fromId' => $fromId, 'stores' => $stores, 'products' => $products, 'stock' => $stock,
            'scripts' => ['distribute.js'],
        ]);
    }

    public function storeDistribution(): Response
    {
        $matrix = (array) ($this->request->post['qty'] ?? []);
        $ids = (new TransferService())->distribute((int) $this->request->int('from_id', 0), $matrix, $this->request->str('notes'));
        return $this->success(count($ids) . ' transferencia(s) despachada(s). La mercancía queda en tránsito hasta que cada sucursal confirme la recepción.', '/transfers');
    }

    public function entry(): Response
    {
        $branches = array_values(array_filter($this->branches(), fn ($b) => (int) $b['is_active']));
        return $this->view('inventory/entry', [
            'title' => 'Entrada de mercancía', 'active' => 'inventory', 'crumbs' => [['Inventario', '/inventory'], ['Entrada de mercancía', null]],
            'branches' => $branches, 'scripts' => ['line-editor.js'],
        ]);
    }

    public function storeEntry(): Response
    {
        $branch = (int) $this->request->int('branch_id', 0);
        $n = (new InventoryService())->entry($branch, (array) ($this->request->post['items'] ?? []), $this->request->str('type', 'entry'), $this->request->str('notes'));
        return $this->success("Entrada registrada: $n producto(s).", '/inventory?branch=' . $branch);
    }

    public function adjust(): Response
    {
        $branch = (int) $this->request->int('branch_id', 0);
        (new InventoryService())->adjust(
            $branch,
            (int) $this->request->int('product_id', 0),
            $this->request->str('mode', 'set'),
            $this->request->str('quantity'),
            $this->request->str('type', 'adjustment'),
            $this->request->str('reason')
        );
        return $this->success('Ajuste registrado en el historial de movimientos.', '/inventory?branch=' . $branch);
    }

    public function minStock(): Response
    {
        $branch = (int) $this->request->int('branch_id', 0);
        (new InventoryService())->setMinStock($branch, (int) $this->request->int('product_id', 0), $this->request->str('min_stock', '0'));
        return $this->success('Stock mínimo actualizado.', '/inventory?branch=' . $branch);
    }

    public function count(): Response
    {
        $branches = $this->branches();
        $branch = $this->selectedBranch($branches);
        $rows = $this->db->all(
            'SELECT p.id, p.code, p.name, p.qty_precision, u.code AS unit, COALESCE(i.quantity, 0) AS quantity
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id
             LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = :b
             WHERE p.is_active = 1 ORDER BY p.name',
            ['b' => $branch['id']]
        );
        return $this->view('inventory/count', [
            'title' => 'Conteo físico', 'active' => 'inventory', 'crumbs' => [['Inventario', '/inventory'], ['Conteo físico', null]],
            'branches' => $branches, 'branch' => $branch, 'rows' => $rows,
        ]);
    }

    public function storeCount(): Response
    {
        $branch = (int) $this->request->int('branch_id', 0);
        $res = (new InventoryService())->physicalCount($branch, (array) ($this->request->post['counted'] ?? []), $this->request->str('notes'));
        return $this->success("Conteo {$res['number']} aplicado: {$res['adjusted']} producto(s) ajustado(s).", '/inventory?branch=' . $branch);
    }
}

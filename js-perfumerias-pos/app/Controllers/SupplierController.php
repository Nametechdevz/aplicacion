<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\HttpException;
use App\Core\Response;
use App\Core\ValidationException;
use App\Services\Audit;
use App\Validators\Validator;

final class SupplierController extends Controller
{
    public function index(): Response
    {
        $q = mb_substr($this->request->str('q'), 0, 60);
        $params = [];
        $where = '1 = 1';
        if ($q !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $where = '(s.name LIKE :q1 OR s.tax_id LIKE :q2 OR s.contact_name LIKE :q3)';
            $params = ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        $rows = $this->db->all(
            "SELECT s.*, (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status <> 'cancelled') AS orders,
                    (SELECT COALESCE(SUM(gr.total), 0) FROM goods_receipts gr JOIN purchase_orders po ON po.id = gr.purchase_order_id WHERE po.supplier_id = s.id) AS received,
                    (SELECT MAX(po.order_date) FROM purchase_orders po WHERE po.supplier_id = s.id) AS last_order
             FROM suppliers s WHERE $where ORDER BY s.is_active DESC, s.name",
            $params
        );
        return $this->view('suppliers/index', ['title' => 'Proveedores', 'active' => 'suppliers', 'crumbs' => [['Proveedores', null]], 'rows' => $rows, 'q' => $q]);
    }

    public function store(): Response
    {
        $this->save(null);
        return $this->success('Proveedor registrado.', '/suppliers');
    }

    public function update(int $id): Response
    {
        $this->save($id);
        return $this->success('Proveedor actualizado.', '/suppliers');
    }

    public function toggle(int $id): Response
    {
        $s = $this->db->one('SELECT id, name, is_active FROM suppliers WHERE id = :id', ['id' => $id]);
        if (!$s) {
            throw HttpException::notFound();
        }
        $new = (int) $s['is_active'] ? 0 : 1;
        $this->db->update('suppliers', ['is_active' => $new], 'id = :id', ['id' => $id]);
        Audit::log($new ? 'supplier.activate' : 'supplier.deactivate', 'supplier', $id, $s['name']);
        return $this->success($new ? 'Proveedor activado.' : 'Proveedor desactivado.', '/suppliers');
    }

    private function save(?int $id): int
    {
        $data = Validator::make($this->request->post, [
            'name' => 'required|string|max:160', 'tax_id' => 'nullable|regex:/^[0-9A-Za-z\-.]{3,40}$/',
            'contact_name' => 'nullable|string|max:120', 'phone' => 'nullable|string|max:40', 'email' => 'nullable|email|max:160',
            'address' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:1000',
        ], ['name' => 'el nombre o razón social', 'tax_id' => 'el NIT', 'email' => 'el correo']);
        if ($data['tax_id'] && $this->db->value('SELECT id FROM suppliers WHERE tax_id = :t' . ($id ? ' AND id <> :id' : ''), $id ? ['t' => $data['tax_id'], 'id' => $id] : ['t' => $data['tax_id']])) {
            throw ValidationException::field('tax_id', 'Ya existe un proveedor con ese NIT.');
        }
        if ($id) {
            $before = $this->db->one('SELECT * FROM suppliers WHERE id = :id', ['id' => $id]);
            $this->db->update('suppliers', $data, 'id = :id', ['id' => $id]);
            [$o, $n] = Audit::diff($before, $data);
            Audit::log('supplier.update', 'supplier', $id, 'Proveedor modificado: ' . $data['name'], $o, $n);
            return $id;
        }
        $newId = $this->db->insert('suppliers', $data);
        Audit::log('supplier.create', 'supplier', $newId, 'Proveedor creado: ' . $data['name']);
        return $newId;
    }
}

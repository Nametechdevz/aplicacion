<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;

class SupplierController extends Controller
{
    public function index(): void
    {
        $rows = DB::all('SELECT s.*, (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) AS purchases, (SELECT COALESCE(SUM(total),0) FROM purchases p WHERE p.supplier_id = s.id) AS total FROM suppliers s ORDER BY s.name');
        $this->view('suppliers/index', ['title' => 'Proveedores', 'rows' => $rows]);
    }

    public function create(): void
    {
        $this->view('suppliers/form', ['title' => 'Nuevo proveedor', 's' => []]);
    }

    public function edit(int $id): void
    {
        $this->view('suppliers/form', ['title' => 'Editar proveedor', 's' => DB::one('SELECT * FROM suppliers WHERE id = ?', [$id]) ?? redirect('/suppliers')]);
    }

    public function store(): void
    {
        if ($data = $this->validate()) {
            DB::insert('suppliers', $data);
            flash('success', 'Proveedor creado.');
        }
        redirect('/suppliers');
    }

    public function update(int $id): void
    {
        if ($data = $this->validate()) {
            DB::update('suppliers', $data, 'id = ?', [$id]);
            flash('success', 'Proveedor actualizado.');
        }
        redirect('/suppliers');
    }

    private function validate(): ?array
    {
        $d = [];
        foreach (['nit' => 30, 'name' => 200, 'contact' => 120, 'phone' => 40, 'email' => 160, 'address' => 200] as $k => $max) {
            $d[$k] = mb_substr((string) input($k, ''), 0, $max) ?: null;
        }
        if (!$d['nit'] || !$d['name']) {
            flash('danger', 'NIT y nombre son obligatorios.');
            return null;
        }
        return $d;
    }
}

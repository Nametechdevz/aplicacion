<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;

/** CRUD simple de tablas (id, name) usadas por productos: marcas y categorías. */
abstract class SimpleCatalogController extends Controller
{
    abstract protected function table(): string;
    abstract protected function label(): string;
    abstract protected function path(): string;

    public function index(): void
    {
        $t = $this->table();
        $fk = $t === 'brands' ? 'brand_id' : 'category_id';
        $rows = DB::all("SELECT x.*, (SELECT COUNT(*) FROM products p WHERE p.$fk = x.id) AS products FROM $t x ORDER BY x.name");
        $this->view('brands/index', ['title' => $this->label(), 'rows' => $rows, 'path' => $this->path()]);
    }

    public function store(): void
    {
        $name = mb_substr((string) input('name', ''), 0, 100);
        if ($name !== '' && !DB::value("SELECT id FROM {$this->table()} WHERE name = ?", [$name])) {
            DB::insert($this->table(), ['name' => $name]);
            flash('success', 'Registro creado.');
        } else {
            flash('danger', 'Nombre vacío o ya existe.');
        }
        redirect($this->path());
    }

    public function update(int $id): void
    {
        $name = mb_substr((string) input('name', ''), 0, 100);
        if ($name !== '' && !DB::value("SELECT id FROM {$this->table()} WHERE name = ? AND id <> ?", [$name, $id])) {
            DB::update($this->table(), ['name' => $name], 'id = ?', [$id]);
            flash('success', 'Registro actualizado.');
        } else {
            flash('danger', 'Nombre vacío o ya existe.');
        }
        redirect($this->path());
    }

    public function delete(int $id): void
    {
        DB::run("DELETE FROM {$this->table()} WHERE id = ?", [$id]);
        flash('success', 'Registro eliminado. Los productos asociados quedaron sin ' . mb_strtolower($this->label()) . '.');
        redirect($this->path());
    }
}

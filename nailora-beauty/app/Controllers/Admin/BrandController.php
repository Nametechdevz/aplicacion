<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\Brand;

final class BrandController extends AdminController
{
    public function index(): void
    {
        $this->render('brands/index', ['title' => 'Marcas', 'brands' => Brand::all()], ['Marcas' => null]);
    }

    private function validated(int $id): array
    {
        $v = Validator::make($this->request->all(), ['name' => 'required|string|min:2|max:120', 'is_active' => 'bool'], ['name' => 'nombre']);
        $data = $v->validated();
        $slug = slugify((string) $data['name']);
        if (!$v->fails() && Brand::slugExists($slug, $id)) {
            $v->addError('name', 'Ya existe una marca con ese nombre.');
        }
        if ($v->fails()) {
            $this->done(implode(' ', $v->errors()), 'admin/marcas', 'error');
        }
        return ['name' => clean_text($data['name'], 120), 'slug' => $slug, 'is_active' => $id ? $data['is_active'] : 1];
    }

    public function store(): void
    {
        $data = $this->validated(0);
        $id = Brand::create($data);
        AuditLog::record('brand.create', 'brand', $id, ['name' => $data['name']]);
        $this->done('Marca creada. Asóciela a sus productos desde el formulario de cada producto.', 'admin/marcas');
    }

    public function update(string $id): void
    {
        Brand::find((int) $id) ?? abort(404);
        $data = $this->validated((int) $id);
        Brand::update((int) $id, $data);
        AuditLog::record('brand.update', 'brand', (int) $id, $data);
        $this->done('Marca actualizada.', 'admin/marcas');
    }

    public function toggle(string $id): void
    {
        $brand = Brand::find((int) $id) ?? abort(404);
        $active = (int) $brand['is_active'] ? 0 : 1;
        Brand::update((int) $id, ['is_active' => $active]);
        AuditLog::record($active ? 'brand.activate' : 'brand.deactivate', 'brand', (int) $id);
        $this->done($active ? 'Marca activada.' : 'Marca desactivada.', 'admin/marcas');
    }

    public function destroy(string $id): void
    {
        $brand = Brand::find((int) $id) ?? abort(404);
        Brand::delete((int) $id);
        AuditLog::record('brand.delete', 'brand', (int) $id, ['name' => $brand['name']]);
        $this->done('Marca eliminada. Los productos asociados quedaron sin marca.', 'admin/marcas');
    }
}

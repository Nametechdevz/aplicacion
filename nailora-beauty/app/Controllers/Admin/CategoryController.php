<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\Category;
use App\Services\UploadService;
use DomainException;

final class CategoryController extends AdminController
{
    public function index(): void
    {
        $this->render('categories/index', ['title' => 'Categorías', 'categories' => Category::all()], ['Categorías' => null]);
    }

    public function create(): void
    {
        $this->render('categories/form', ['title' => 'Nueva categoría', 'category' => null], ['Categorías' => 'admin/categorias', 'Nueva' => null]);
    }

    public function edit(string $id): void
    {
        $category = Category::find((int) $id) ?? abort(404);
        $this->render('categories/form', ['title' => 'Editar categoría', 'category' => $category], ['Categorías' => 'admin/categorias', $category['name'] => null]);
    }

    private function validated(?array $category): array
    {
        $id = (int) ($category['id'] ?? 0);
        $back = $category ? 'admin/categorias/' . $id . '/editar' : 'admin/categorias/nueva';
        $v = Validator::make($this->request->all(), [
            'name' => 'required|string|min:2|max:120',
            'slug' => 'string|max:140',
            'description' => 'string|max:2000',
            'sort_order' => 'int|min:0|max:9999',
            'is_active' => 'bool',
        ], ['name' => 'nombre', 'sort_order' => 'orden']);
        $data = $v->validated();
        $slug = slugify((string) ($data['slug'] ?: $data['name']));
        if (Category::slugExists($slug, $id)) {
            $v->addError('slug', 'Ya existe una categoría con esa URL.');
        }
        if ($v->fails()) {
            $this->failValidation($v->errors(), $back);
        }

        $out = [
            'name' => clean_text($data['name'], 120),
            'slug' => $slug,
            'description' => $data['description'] ? trim((string) $data['description']) : null,
            'sort_order' => $data['sort_order'] ?? 0,
            'is_active' => $data['is_active'],
        ];
        $file = $this->request->file('image');
        if ($file) {
            try {
                $out['image_path'] = UploadService::storeImage($file, 'categories');
            } catch (DomainException $e) {
                $this->failValidation(['image' => $e->getMessage()], $back, $e->getMessage());
            }
        }
        return $out;
    }

    public function store(): void
    {
        $data = $this->validated(null);
        $id = Category::create($data);
        AuditLog::record('category.create', 'category', $id, ['name' => $data['name']]);
        $this->done('Categoría creada.', 'admin/categorias');
    }

    public function update(string $id): void
    {
        $category = Category::find((int) $id) ?? abort(404);
        $data = $this->validated($category);
        Category::update((int) $id, $data);
        if (isset($data['image_path'])) {
            UploadService::delete($category['image_path']);
        }
        AuditLog::record('category.update', 'category', (int) $id, ['name' => $data['name'], 'is_active' => $data['is_active']]);
        $this->done('Categoría actualizada.', 'admin/categorias');
    }

    public function toggle(string $id): void
    {
        $category = Category::find((int) $id) ?? abort(404);
        $active = (int) $category['is_active'] ? 0 : 1;
        Category::update((int) $id, ['is_active' => $active]);
        AuditLog::record($active ? 'category.activate' : 'category.deactivate', 'category', (int) $id);
        $this->done($active ? 'Categoría activada.' : 'Categoría desactivada: sus productos dejan de mostrarse en la tienda.', 'admin/categorias');
    }

    public function destroy(string $id): void
    {
        $category = Category::find((int) $id) ?? abort(404);
        $count = Category::productCount((int) $id);
        if ($count > 0) {
            $this->done("No se puede eliminar: tiene $count producto(s) asociados. Reasígnelos a otra categoría o desactívela.", 'admin/categorias', 'error');
        }
        Category::delete((int) $id);
        UploadService::delete($category['image_path']);
        AuditLog::record('category.delete', 'category', (int) $id, ['name' => $category['name']]);
        $this->done('Categoría eliminada.', 'admin/categorias');
    }
}

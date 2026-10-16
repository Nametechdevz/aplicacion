<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Response;
use App\Core\ValidationException;
use App\Repositories\ProductRepository;
use App\Services\Audit;
use App\Validators\Validator;

/** Categorías, subcategorías, marcas y unidades de medida. */
final class CatalogController extends Controller
{
    public function index(): Response
    {
        $repo = new ProductRepository();
        return $this->view('catalog/index', [
            'title' => 'Categorías y marcas', 'active' => 'products', 'crumbs' => [['Productos', '/products'], ['Categorías y marcas', null]],
            'categories' => $repo->categories(), 'brands' => $repo->brands(), 'units' => $repo->units(),
            'conversions' => $this->db->all('SELECT c.factor, f.code AS f, t.code AS t FROM unit_conversions c JOIN units_of_measure f ON f.id = c.from_unit_id JOIN units_of_measure t ON t.id = c.to_unit_id ORDER BY f.id'),
        ]);
    }

    public function saveCategory(): Response
    {
        $data = Validator::make($this->request->post, ['id' => 'nullable|int', 'name' => 'required|string|max:80', 'parent_id' => 'nullable|int', 'is_active' => 'bool'], ['name' => 'el nombre']);
        $id = $data['id'];
        unset($data['id']);
        if ($data['parent_id']) {
            $parent = $this->db->one('SELECT id, parent_id FROM categories WHERE id = :id', ['id' => $data['parent_id']]);
            if (!$parent || $parent['parent_id'] !== null || (int) $data['parent_id'] === $id) {
                throw ValidationException::field('parent_id', 'Seleccione una categoría principal válida (solo se admite un nivel de subcategoría).');
            }
        }
        if ($this->db->value('SELECT id FROM categories WHERE name = :n AND parent_id <=> :p' . ($id ? ' AND id <> :id' : ''), array_merge(['n' => $data['name'], 'p' => $data['parent_id']], $id ? ['id' => $id] : []))) {
            throw ValidationException::field('name', 'Ya existe una categoría con ese nombre en el mismo nivel.');
        }
        if ($id) {
            $this->db->update('categories', $data, 'id = :id', ['id' => $id]);
        } else {
            $data['is_active'] = 1;
            $id = $this->db->insert('categories', $data);
        }
        Audit::log('category.save', 'category', $id, 'Categoría guardada: ' . $data['name'], null, $data);
        return $this->success('Categoría guardada.', '/catalog');
    }

    public function saveBrand(): Response
    {
        $data = Validator::make($this->request->post, ['id' => 'nullable|int', 'name' => 'required|string|max:80', 'is_active' => 'bool'], ['name' => 'el nombre de la marca']);
        $id = $data['id'];
        unset($data['id']);
        if ($this->db->value('SELECT id FROM brands WHERE name = :n' . ($id ? ' AND id <> :id' : ''), $id ? ['n' => $data['name'], 'id' => $id] : ['n' => $data['name']])) {
            throw ValidationException::field('name', 'Esa marca ya existe.');
        }
        if ($id) {
            $this->db->update('brands', $data, 'id = :id', ['id' => $id]);
        } else {
            $data['is_active'] = 1;
            $id = $this->db->insert('brands', $data);
        }
        Audit::log('brand.save', 'brand', $id, 'Marca guardada: ' . $data['name'], null, $data);
        return $this->success('Marca guardada.', '/catalog');
    }
}

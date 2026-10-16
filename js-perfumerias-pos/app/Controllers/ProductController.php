<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Core\Session;
use App\Repositories\ProductRepository;
use App\Services\ImageService;
use App\Services\ProductService;

final class ProductController extends Controller
{
    public function index(): Response
    {
        $repo = new ProductRepository();
        [$page, $per, $offset] = $this->page();
        $view = $this->request->str('view', (string) Session::get('products_view', 'grid')) === 'table' ? 'table' : 'grid';
        Session::put('products_view', $view);
        $per = $view === 'grid' ? 24 : $per;
        $offset = ($page - 1) * $per;
        $filters = [
            'q' => mb_substr($this->request->str('q'), 0, 80),
            'category' => $this->request->int('category'),
            'brand' => $this->request->int('brand'),
            'status' => in_array($this->request->str('status'), ['active', 'inactive', 'all'], true) ? $this->request->str('status') : 'active',
            'sort' => array_key_exists($this->request->str('sort'), ProductRepository::SORTS) ? $this->request->str('sort') : 'name',
            'stock' => in_array($this->request->str('stock'), ['low', 'out'], true) ? $this->request->str('stock') : '',
        ];
        [$rows, $total] = $repo->search($filters, Auth::branchIds(), $per, $offset);
        return $this->view('products/index', [
            'title' => 'Productos', 'active' => 'products', 'crumbs' => [['Productos', null]],
            'rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'filters' => $filters, 'viewMode' => $view,
            'categories' => $repo->categories(), 'brands' => $repo->brands(),
            'showCost' => Auth::can('products.cost_view'),
        ]);
    }

    public function show(int $id): Response
    {
        $p = $this->db->one(
            'SELECT p.*, b.name AS brand_name, c.name AS category_name, sc.name AS subcategory_name, u.code AS unit_code, u.name AS unit_name
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories sc ON sc.id = p.subcategory_id WHERE p.id = :id',
            ['id' => $id]
        );
        if (!$p) {
            throw HttpException::notFound('El producto no existe.');
        }
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $stock = $this->db->all(
            "SELECT b.id, b.name, b.type, COALESCE(i.quantity, 0) AS quantity, COALESCE(i.reserved, 0) AS reserved,
                    COALESCE(i.in_transit, 0) AS in_transit, COALESCE(i.min_stock, 0) AS min_stock
             FROM branches b LEFT JOIN inventory i ON i.branch_id = b.id AND i.product_id = :p
             WHERE b.id IN ($in) ORDER BY b.type = 'store', b.name",
            array_merge($bp, ['p' => $id])
        );
        $movements = $this->db->all(
            "SELECT m.*, b.name AS branch_name, u.name AS user_name FROM inventory_movements m JOIN branches b ON b.id = m.branch_id
             LEFT JOIN users u ON u.id = m.user_id WHERE m.product_id = :p AND m.branch_id IN ($in) ORDER BY m.id DESC LIMIT 15",
            array_merge($bp, ['p' => $id])
        );
        $history = Auth::can('products.cost_view') ? $this->db->all(
            'SELECT h.*, u.name AS user_name, v.name AS variant_name FROM product_price_history h LEFT JOIN users u ON u.id = h.user_id
             LEFT JOIN product_variants v ON v.id = h.variant_id WHERE h.product_id = :p ORDER BY h.id DESC LIMIT 15',
            ['p' => $id]
        ) : [];
        return $this->view('products/show', [
            'title' => $p['name'], 'active' => 'products', 'crumbs' => [['Productos', '/products'], [$p['name'], null]],
            'p' => $p, 'stock' => $stock, 'movements' => $movements, 'history' => $history,
            'images' => $this->db->all('SELECT * FROM product_images WHERE product_id = :p ORDER BY is_primary DESC, sort_order, id', ['p' => $id]),
            'variants' => $this->db->all('SELECT * FROM product_variants WHERE product_id = :p ORDER BY is_active DESC, sort_order', ['p' => $id]),
            'showCost' => Auth::can('products.cost_view'),
        ]);
    }

    public function create(): Response
    {
        return $this->form(null);
    }

    public function edit(int $id): Response
    {
        return $this->form($id);
    }

    private function form(?int $id): Response
    {
        $repo = new ProductRepository();
        $p = $id ? $this->db->one('SELECT * FROM products WHERE id = :id', ['id' => $id]) : null;
        if ($id && !$p) {
            throw HttpException::notFound('El producto no existe.');
        }
        return $this->view('products/form', [
            'title' => $p ? 'Editar producto' : 'Nuevo producto', 'active' => 'products',
            'crumbs' => [['Productos', '/products'], [$p ? $p['name'] : 'Nuevo producto', null]],
            'p' => $p,
            'variants' => $id ? $this->db->all('SELECT * FROM product_variants WHERE product_id = :p AND is_active = 1 ORDER BY sort_order', ['p' => $id]) : [],
            'images' => $id ? $this->db->all('SELECT * FROM product_images WHERE product_id = :p ORDER BY is_primary DESC, sort_order, id', ['p' => $id]) : [],
            'categories' => $repo->categories(), 'brands' => $repo->brands(), 'units' => $repo->units(),
            'canPrice' => Auth::can('products.price') || !$p,
            'scripts' => ['product-form.js'],
        ]);
    }

    public function store(): Response
    {
        $id = (new ProductService())->create($this->request->post);
        $file = $this->request->file('image');
        if ($file && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            (new ImageService())->upload($id, $file);
        }
        return $this->success('Producto creado correctamente.', '/products/' . $id);
    }

    public function update(int $id): Response
    {
        (new ProductService())->update($id, $this->request->post);
        $file = $this->request->file('image');
        if ($file && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            (new ImageService())->upload($id, $file);
        }
        return $this->success('Cambios guardados.', '/products/' . $id);
    }

    public function toggle(int $id): Response
    {
        $active = (new ProductService())->toggle($id);
        return $this->success($active ? 'Producto activado.' : 'Producto desactivado; ya no aparecerá en el punto de venta.', '/products/' . $id);
    }

    public function uploadImage(int $id): Response
    {
        $file = $this->request->file('image');
        if (!$file) {
            throw new \App\Core\ValidationException('Seleccione una imagen.');
        }
        $imageId = (new ImageService())->upload($id, $file);
        $img = $this->db->one('SELECT * FROM product_images WHERE id = :id', ['id' => $imageId]);
        if ($this->request->wantsJson()) {
            return $this->json(['ok' => true, 'message' => 'Imagen cargada.', 'image' => [
                'id' => $imageId, 'url' => upload_url($img['file_name']), 'thumb' => upload_url($img['thumb_name']), 'is_primary' => (int) $img['is_primary'],
            ]]);
        }
        return $this->success('Imagen cargada.', '/products/' . $id . '/edit');
    }

    public function deleteImage(int $id, int $image): Response
    {
        (new ImageService())->delete($id, $image);
        return $this->success('Imagen eliminada.', '/products/' . $id . '/edit');
    }

    public function primaryImage(int $id, int $image): Response
    {
        (new ImageService())->setPrimary($id, $image);
        return $this->success('Imagen principal actualizada.', '/products/' . $id . '/edit');
    }

    /** Búsqueda ligera para formularios (compras, transferencias, conteos). */
    public function lookup(): Response
    {
        $q = mb_substr($this->request->str('q'), 0, 60);
        $branch = $this->request->int('branch');
        if ($branch) {
            Auth::authorizeBranch($branch);
        }
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $rows = $this->db->all(
            'SELECT p.id, p.code, p.name, p.qty_precision, p.cost, p.price, u.code AS unit,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb,
                    ' . ($branch ? '(SELECT quantity - reserved FROM inventory i WHERE i.product_id = p.id AND i.branch_id = :b)' : 'NULL') . ' AS available
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id
             WHERE p.is_active = 1 AND (p.name LIKE :q1 OR p.code LIKE :q2 OR p.barcode = :q3 OR p.sku = :q4)
             ORDER BY p.name LIMIT 15',
            array_merge(['q1' => $like, 'q2' => $like, 'q3' => $q, 'q4' => $q], $branch ? ['b' => $branch] : [])
        );
        $canCost = Auth::can('products.cost_view') || Auth::can('purchases.manage');
        return $this->json(['ok' => true, 'items' => array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'code' => $r['code'], 'name' => $r['name'], 'unit' => $r['unit'],
            'precision' => (int) $r['qty_precision'], 'cost' => $canCost ? $r['cost'] : null, 'price' => $r['price'],
            'available' => $r['available'], 'thumb' => upload_url($r['thumb']),
        ], $rows)]);
    }
}

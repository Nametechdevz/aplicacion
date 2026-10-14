<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Database;
use App\Core\Session;
use App\Core\Validator;
use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\InventoryService;
use App\Services\UploadService;
use DomainException;

final class ProductController extends AdminController
{
    public function index(): void
    {
        $filters = [
            'q' => mb_substr((string) $this->request->query('q', ''), 0, 80),
            'category_id' => (int) $this->request->query('categoria', 0),
            'status' => (string) $this->request->query('estado', ''),
            'stock' => (string) $this->request->query('stock', ''),
        ];
        [$products, $pager] = Product::adminSearch($filters, $this->page(), $this->perPage());
        $this->render('products/index', [
            'title' => 'Productos',
            'products' => $products,
            'pager' => $pager,
            'filters' => $filters,
            'categories' => Category::all(),
            'query' => array_filter([
                'q' => $filters['q'], 'categoria' => $filters['category_id'] ?: null,
                'estado' => $filters['status'], 'stock' => $filters['stock'],
            ]),
        ], ['Productos' => null]);
    }

    public function create(): void
    {
        $categories = Category::all();
        if (!$categories) {
            $this->done('Primero cree al menos una categoría.', 'admin/categorias/nueva', 'info');
        }
        $this->render('products/form', [
            'title' => 'Nuevo producto',
            'product' => null,
            'categories' => $categories,
            'brands' => Brand::all(),
            'types' => Product::allTypes(),
            'lowStockDefault' => (int) setting('low_stock_default', '5'),
        ], ['Productos' => 'admin/productos', 'Nuevo' => null]);
    }

    public function edit(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        $this->render('products/form', [
            'title' => 'Editar producto',
            'product' => $product,
            'categories' => Category::all(),
            'brands' => Brand::all(),
            'types' => Product::allTypes(),
            'images' => Product::images((int) $id),
            'variants' => ProductVariant::forProduct((int) $id),
            'hasHistory' => Product::hasHistory((int) $id),
            'lowStockDefault' => (int) setting('low_stock_default', '5'),
        ], ['Productos' => 'admin/productos', $product['name'] => null]);
    }

    /** Valida y normaliza los datos del formulario. */
    private function validated(?array $product): array
    {
        $r = $this->request;
        $id = (int) ($product['id'] ?? 0);
        $input = $r->all();
        foreach (['price', 'compare_at_price', 'cost_price'] as $money) {
            $parsed = parse_money($input[$money] ?? null);
            $input[$money] = $parsed === null ? '' : (string) $parsed;
        }
        $v = Validator::make($input, [
            'name' => 'required|string|min:3|max:180',
            'slug' => 'string|max:200',
            'sku' => 'required|string|min:2|max:60',
            'category_id' => 'required|int',
            'brand_id' => 'int',
            'product_type' => 'string|max:60',
            'short_description' => 'string|max:500',
            'description' => 'string|max:20000',
            'price' => 'required|numeric|min:0|max:99999999',
            'compare_at_price' => 'numeric|min:0|max:99999999',
            'cost_price' => 'numeric|min:0|max:99999999',
            'stock' => 'int|min:0|max:1000000',
            'low_stock_threshold' => 'int|min:0|max:100000',
            'is_active' => 'bool',
            'is_featured' => 'bool',
            'is_new' => 'bool',
            'has_variants' => 'bool',
            'meta_title' => 'string|max:180',
            'meta_description' => 'string|max:300',
        ], [
            'name' => 'nombre', 'sku' => 'SKU', 'category_id' => 'categoría', 'price' => 'precio de venta',
            'compare_at_price' => 'precio anterior', 'cost_price' => 'costo', 'stock' => 'existencias iniciales',
            'low_stock_threshold' => 'umbral de stock bajo', 'short_description' => 'descripción corta',
        ]);
        $data = $v->validated();

        $sku = strtoupper(preg_replace('/[^A-Za-z0-9\-_.]/', '', (string) ($data['sku'] ?? '')));
        if (!$v->fails() && $sku === '') {
            $v->addError('sku', 'El SKU solo admite letras, números, guiones y puntos.');
        } elseif ($sku !== '' && Product::skuExists($sku, $id)) {
            $v->addError('sku', 'Ya existe un producto o variante con ese SKU.');
        }
        if (!empty($data['category_id']) && !Category::find((int) $data['category_id'])) {
            $v->addError('category_id', 'Seleccione una categoría válida.');
        }
        if (!empty($data['brand_id']) && !Brand::find((int) $data['brand_id'])) {
            $v->addError('brand_id', 'Seleccione una marca válida.');
        }
        if (!empty($data['compare_at_price']) && isset($data['price']) && $data['compare_at_price'] <= $data['price']) {
            $v->addError('compare_at_price', 'El precio anterior debe ser mayor que el precio de venta (o déjelo vacío).');
        }
        $slug = $data['slug'] ? slugify($data['slug']) : slugify((string) $data['name']);
        if (Product::slugExists($slug, $id)) {
            if ($data['slug']) {
                $v->addError('slug', 'Ya existe un producto con esa URL.');
            } else {
                $slug = Product::uniqueSlug($slug, $id);
            }
        }

        // Cambio de modo de inventario: solo si no deja existencias "huérfanas"
        if ($product && (int) $product['has_variants'] !== (int) $data['has_variants']) {
            if ((int) $data['has_variants'] === 1 && (int) $product['stock'] > 0) {
                $v->addError('has_variants', 'Para activar variantes, primero lleve a 0 las existencias del producto desde Inventario.');
            }
            if ((int) $data['has_variants'] === 0 && (int) Database::value('SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = :id', ['id' => $id]) > 0) {
                $v->addError('has_variants', 'Para desactivar variantes, primero lleve a 0 las existencias de las variantes.');
            }
        }

        if ($v->fails()) {
            $this->failValidation($v->errors(), $product ? 'admin/productos/' . $id . '/editar' : 'admin/productos/nuevo');
        }

        return [
            'name' => clean_text($data['name'], 180),
            'slug' => $slug,
            'sku' => $sku,
            'category_id' => (int) $data['category_id'],
            'brand_id' => $data['brand_id'] ?: null,
            'product_type' => $data['product_type'] ? clean_text($data['product_type'], 60) : null,
            'short_description' => $data['short_description'] ? clean_text($data['short_description'], 500) : null,
            'description' => $data['description'] ? trim((string) $data['description']) : null,
            'price' => round((float) $data['price']),
            'compare_at_price' => $data['compare_at_price'] ? round((float) $data['compare_at_price']) : null,
            'cost_price' => $data['cost_price'] !== null ? round((float) $data['cost_price']) : null,
            'low_stock_threshold' => $data['low_stock_threshold'] ?? (int) setting('low_stock_default', '5'),
            'is_active' => $data['is_active'],
            'is_featured' => $data['is_featured'],
            'is_new' => $data['is_new'],
            'has_variants' => $data['has_variants'],
            'meta_title' => $data['meta_title'] ? clean_text($data['meta_title'], 180) : null,
            'meta_description' => $data['meta_description'] ? clean_text($data['meta_description'], 300) : null,
            '_stock' => (int) ($data['stock'] ?? 0),
        ];
    }

    public function store(): void
    {
        $data = $this->validated(null);
        $stock = $data['has_variants'] ? 0 : $data['_stock'];
        unset($data['_stock']);
        $data['stock'] = $stock;

        $id = Database::transaction(static function () use ($data, $stock): int {
            $id = Product::create($data);
            InventoryService::initial($id, null, $stock, auth_id());
            return $id;
        });
        AuditLog::record('product.create', 'product', $id, ['sku' => $data['sku'], 'stock' => $stock]);
        $errors = $this->storeUploadedImages($id, $data['name']);

        flash('success', 'Producto creado.' . ($data['has_variants'] ? ' Ahora agregue sus variantes.' : ''));
        foreach ($errors as $error) {
            flash('error', $error);
        }
        redirect('admin/productos/' . $id . '/editar');
    }

    public function update(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        $data = $this->validated($product);
        unset($data['_stock']); // las existencias solo cambian desde Inventario
        Product::update((int) $id, $data);
        AuditLog::record('product.update', 'product', (int) $id, array_intersect_key($data, array_flip(['sku', 'price', 'compare_at_price', 'is_active'])));
        $errors = $this->storeUploadedImages((int) $id, $data['name']);
        foreach ($errors as $error) {
            flash('error', $error);
        }
        $this->done('Cambios guardados.', 'admin/productos/' . $id . '/editar');
    }

    private function storeUploadedImages(int $productId, string $alt): array
    {
        $errors = [];
        $files = array_slice($this->request->files('images'), 0, 8);
        foreach ($files as $file) {
            try {
                $path = UploadService::storeImage($file, 'products');
                Product::addImage($productId, $path, $alt);
            } catch (DomainException $e) {
                $errors[] = ($file['name'] ?? 'Imagen') . ': ' . $e->getMessage();
            }
        }
        return $errors;
    }

    public function uploadImages(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        if (!$this->request->files('images')) {
            $this->done('Seleccione al menos una imagen.', 'admin/productos/' . $id . '/editar#imagenes', 'error');
        }
        $errors = $this->storeUploadedImages((int) $id, $product['name']);
        foreach ($errors as $error) {
            flash('error', $error);
        }
        if (!$errors) {
            flash('success', 'Imágenes subidas.');
        }
        AuditLog::record('product.images', 'product', (int) $id);
        redirect('admin/productos/' . $id . '/editar#imagenes');
    }

    public function primaryImage(string $id, string $imageId): void
    {
        Product::findImage((int) $id, (int) $imageId) ?? abort(404);
        Product::setPrimaryImage((int) $id, (int) $imageId);
        $this->done('Imagen principal actualizada.', 'admin/productos/' . $id . '/editar#imagenes');
    }

    public function deleteImage(string $id, string $imageId): void
    {
        $image = Product::findImage((int) $id, (int) $imageId) ?? abort(404);
        Product::deleteImage((int) $id, (int) $imageId);
        // Solo se borra el archivo si ninguna otra fila lo usa (p. ej. productos duplicados)
        if (!Product::imagePathInUse($image['path'])) {
            UploadService::delete($image['path']);
        }
        AuditLog::record('product.image_delete', 'product', (int) $id);
        $this->done('Imagen eliminada.', 'admin/productos/' . $id . '/editar#imagenes');
    }

    public function duplicate(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        $newId = Database::transaction(static function () use ($product): int {
            $data = array_intersect_key($product, array_flip([
                'category_id', 'brand_id', 'product_type', 'short_description', 'description', 'price',
                'compare_at_price', 'cost_price', 'low_stock_threshold', 'has_variants', 'meta_title', 'meta_description',
            ]));
            $data['name'] = mb_substr($product['name'] . ' (copia)', 0, 180);
            $data['slug'] = Product::uniqueSlug($data['name']);
            $data['sku'] = Product::uniqueSku($product['sku'] . '-COPIA');
            $data['stock'] = 0;
            $data['is_active'] = 0; // la copia nace inactiva para revisarla antes de publicar
            $data['is_featured'] = 0;
            $data['is_new'] = 0;
            $newId = Product::create($data);
            foreach (Product::images((int) $product['id']) as $img) {
                Database::insert('product_images', ['product_id' => $newId, 'path' => $img['path'], 'alt' => $img['alt'], 'sort_order' => $img['sort_order'], 'is_primary' => $img['is_primary']]);
            }
            foreach (ProductVariant::forProduct((int) $product['id']) as $variant) {
                ProductVariant::create([
                    'product_id' => $newId, 'name' => $variant['name'], 'sku' => Product::uniqueSku($variant['sku'] . '-COPIA'),
                    'color_hex' => $variant['color_hex'], 'price' => $variant['price'], 'compare_at_price' => $variant['compare_at_price'],
                    'stock' => 0, 'is_active' => $variant['is_active'], 'sort_order' => $variant['sort_order'],
                ]);
            }
            return $newId;
        });
        AuditLog::record('product.duplicate', 'product', $newId, ['from' => (int) $id]);
        $this->done('Producto duplicado sin existencias e inactivo. Revíselo antes de activarlo.', 'admin/productos/' . $newId . '/editar');
    }

    public function toggle(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        $active = (int) $product['is_active'] === 1 ? 0 : 1;
        Product::update((int) $id, ['is_active' => $active]);
        AuditLog::record($active ? 'product.activate' : 'product.deactivate', 'product', (int) $id);
        $this->done($active ? 'Producto activado: ya es visible en la tienda.' : 'Producto desactivado: ya no se muestra en la tienda.', (string) ($this->request->input('back') === 'edit' ? 'admin/productos/' . $id . '/editar' : 'admin/productos'));
    }

    public function destroy(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        if (Product::hasHistory((int) $id)) {
            Product::update((int) $id, ['is_active' => 0]);
            AuditLog::record('product.deactivate', 'product', (int) $id, ['reason' => 'tiene historial']);
            $this->done('El producto tiene pedidos o movimientos de inventario registrados, así que se desactivó en lugar de eliminarse para conservar el historial.', 'admin/productos', 'info');
        }
        $images = Product::images((int) $id);
        Product::delete((int) $id);
        foreach ($images as $img) {
            if (!Product::imagePathInUse($img['path'])) {
                UploadService::delete($img['path']);
            }
        }
        AuditLog::record('product.delete', 'product', (int) $id, ['sku' => $product['sku'], 'name' => $product['name']]);
        $this->done('Producto eliminado definitivamente.', 'admin/productos');
    }

    // ------------------------------------------------------------------
    // Variantes
    // ------------------------------------------------------------------

    private function validatedVariant(int $productId, int $variantId, bool $creating): array
    {
        $input = $this->request->all();
        foreach (['price', 'compare_at_price'] as $money) {
            $parsed = parse_money($input[$money] ?? null);
            $input[$money] = $parsed === null ? '' : (string) $parsed;
        }
        $v = Validator::make($input, [
            'name' => 'required|string|min:1|max:120',
            'sku' => 'required|string|min:2|max:60',
            'color_hex' => 'string|max:7',
            'price' => 'numeric|min:0|max:99999999',
            'compare_at_price' => 'numeric|min:0|max:99999999',
            'stock' => 'int|min:0|max:1000000',
            'sort_order' => 'int|min:0|max:9999',
            'is_active' => 'bool',
        ], ['name' => 'nombre de la variante', 'sku' => 'SKU', 'price' => 'precio', 'compare_at_price' => 'precio anterior', 'stock' => 'existencias']);
        $data = $v->validated();
        $sku = strtoupper(preg_replace('/[^A-Za-z0-9\-_.]/', '', (string) ($data['sku'] ?? '')));
        if ($sku !== '' && Product::skuExists($sku, 0, $variantId)) {
            $v->addError('sku', 'Ya existe un producto o variante con ese SKU.');
        }
        $hex = $data['color_hex'] ?? null;
        if ($hex && !preg_match('/^#[0-9A-Fa-f]{6}$/', $hex)) {
            $v->addError('color_hex', 'El color debe tener el formato #RRGGBB.');
        }
        if (!empty($data['compare_at_price']) && !empty($data['price']) && $data['compare_at_price'] <= $data['price']) {
            $v->addError('compare_at_price', 'El precio anterior debe ser mayor que el precio de la variante.');
        }
        if ($v->fails()) {
            flash('error', 'Variante: ' . implode(' ', $v->errors()));
            redirect('admin/productos/' . $productId . '/editar#variantes');
        }
        return [
            'name' => clean_text($data['name'], 120),
            'sku' => $sku,
            'color_hex' => $hex ? strtoupper($hex) : null,
            'price' => $data['price'] !== null ? round((float) $data['price']) : null,
            'compare_at_price' => $data['compare_at_price'] ? round((float) $data['compare_at_price']) : null,
            'sort_order' => $data['sort_order'] ?? 0,
            'is_active' => $creating ? 1 : $data['is_active'],
            '_stock' => (int) ($data['stock'] ?? 0),
        ];
    }

    public function storeVariant(string $id): void
    {
        $product = Product::find((int) $id) ?? abort(404);
        if ((int) $product['has_variants'] !== 1) {
            $this->done('Active primero la opción "Este producto tiene variantes".', 'admin/productos/' . $id . '/editar', 'error');
        }
        $data = $this->validatedVariant((int) $id, 0, true);
        $stock = $data['_stock'];
        unset($data['_stock']);
        $data['product_id'] = (int) $id;
        $data['stock'] = $stock;
        $variantId = Database::transaction(static function () use ($data, $id, $stock): int {
            $variantId = ProductVariant::create($data);
            InventoryService::initial((int) $id, $variantId, $stock, auth_id());
            return $variantId;
        });
        AuditLog::record('variant.create', 'product', (int) $id, ['variant_id' => $variantId, 'sku' => $data['sku']]);
        $this->done('Variante agregada.', 'admin/productos/' . $id . '/editar#variantes');
    }

    public function updateVariant(string $id, string $variantId): void
    {
        $variant = ProductVariant::find((int) $variantId);
        if (!$variant || (int) $variant['product_id'] !== (int) $id) {
            abort(404);
        }
        $data = $this->validatedVariant((int) $id, (int) $variantId, false);
        unset($data['_stock']);
        ProductVariant::update((int) $variantId, $data);
        AuditLog::record('variant.update', 'product', (int) $id, ['variant_id' => (int) $variantId, 'price' => $data['price'], 'is_active' => $data['is_active']]);
        $this->done('Variante actualizada.', 'admin/productos/' . $id . '/editar#variantes');
    }
}

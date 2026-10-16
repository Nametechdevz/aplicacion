<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Support\Dec;
use App\Validators\Validator;

/** Alta y edición de productos, presentaciones, precios y costos. */
final class ProductService
{
    private const PRICE_FIELDS = ['price', 'cost', 'min_price'];

    public function __construct(private ?Database $db = null)
    {
        $this->db ??= Database::connection();
    }

    public function validate(array $input, ?int $id = null): array
    {
        $data = Validator::make($input, [
            'code' => 'required|code|max:40',
            'sku' => 'nullable|code|max:60',
            'barcode' => 'nullable|regex:/^[0-9A-Za-z\-]{3,60}$/',
            'name' => 'required|string|max:160',
            'description' => 'nullable|string|max:2000',
            'brand_id' => 'nullable|int',
            'category_id' => 'nullable|int',
            'subcategory_id' => 'nullable|int',
            'base_unit_id' => 'required|int',
            'sale_mode' => 'required|in:unit,fractional',
            'qty_precision' => 'nullable|int',
            'container_content' => 'nullable|decimal:3|min:0',
            'container_label' => 'nullable|string|max:60',
            'price' => 'required|decimal:2|min:0',
            'cost' => 'nullable|decimal:4|min:0',
            'min_price' => 'nullable|decimal:2|min:0',
            'max_discount_pct' => 'nullable|decimal:2|min:0|maxval:100',
            'min_margin_pct' => 'nullable|decimal:2|maxval:100',
            'allow_negative_stock' => 'bool',
            'is_active' => 'bool',
        ], [
            'code' => 'el código interno', 'sku' => 'el SKU', 'barcode' => 'el código de barras', 'name' => 'el nombre comercial',
            'base_unit_id' => 'la unidad base', 'sale_mode' => 'la forma de venta', 'price' => 'el precio de venta',
            'cost' => 'el costo', 'min_price' => 'el precio mínimo', 'max_discount_pct' => 'el descuento máximo',
            'container_content' => 'el contenido neto',
        ]);
        $data['code'] = strtoupper($data['code']);
        $data['cost'] ??= '0.0000';

        $unit = $this->db->one('SELECT * FROM units_of_measure WHERE id = :id', ['id' => $data['base_unit_id']]);
        if (!$unit) {
            throw ValidationException::field('base_unit_id', 'Seleccione una unidad base válida.');
        }
        // Las unidades discretas nunca se fraccionan.
        if (!(int) $unit['allows_decimal']) {
            $data['sale_mode'] = 'unit';
            $data['qty_precision'] = 0;
        } elseif ($data['sale_mode'] === 'unit') {
            $data['qty_precision'] = 0;
        } else {
            $p = (int) ($data['qty_precision'] ?? $unit['max_precision']);
            if ($p < 0 || $p > (int) $unit['max_precision']) {
                throw ValidationException::field('qty_precision', "La unidad {$unit['code']} admite como máximo {$unit['max_precision']} decimales.");
            }
            $data['qty_precision'] = $p;
        }
        if ($data['min_price'] !== null && Dec::cmp($data['min_price'], $data['price']) > 0) {
            throw ValidationException::field('min_price', 'El precio mínimo no puede ser mayor que el precio de venta.');
        }
        foreach (['brand_id' => 'brands', 'category_id' => 'categories', 'subcategory_id' => 'categories'] as $field => $table) {
            if ($data[$field] !== null && !$this->db->value("SELECT id FROM $table WHERE id = :id", ['id' => $data[$field]])) {
                throw ValidationException::field($field, 'La opción seleccionada no existe.');
            }
        }
        $this->assertUniqueCodes($data['code'], $data['sku'], $data['barcode'], $id, null);
        return $data;
    }

    /** Valida que código, SKU y código de barras no se repitan entre productos ni presentaciones. */
    public function assertUniqueCodes(?string $code, ?string $sku, ?string $barcode, ?int $productId, ?int $variantId): void
    {
        $checks = [
            ['code', $code, 'products', 'code', 'El código interno ya está asignado a otro producto.'],
            ['sku', $sku, 'products', 'sku', 'El SKU ya está asignado a otro producto.'],
            ['barcode', $barcode, 'products', 'barcode', 'El código de barras ya está asignado a otro producto.'],
            ['sku', $sku, 'product_variants', 'sku', 'El SKU ya está asignado a una presentación.'],
            ['barcode', $barcode, 'product_variants', 'barcode', 'El código de barras ya está asignado a una presentación.'],
        ];
        foreach ($checks as [$field, $value, $table, $col, $msg]) {
            if ($value === null || $value === '') {
                continue;
            }
            $excludeId = $table === 'products' ? $productId : $variantId;
            $found = $this->db->value(
                "SELECT id FROM $table WHERE $col = :v" . ($excludeId ? ' AND id <> :x' : ''),
                $excludeId ? ['v' => $value, 'x' => $excludeId] : ['v' => $value]
            );
            if ($found) {
                throw ValidationException::field($field, $msg);
            }
        }
    }

    public function create(array $input): int
    {
        Auth::authorize('products.manage');
        $data = $this->validate($input);
        $variants = $this->validateVariants($input['variants'] ?? [], $data, null);
        return $this->db->transaction(function () use ($data, $variants) {
            $data['created_by'] = Auth::id();
            $data['updated_by'] = Auth::id();
            $id = $this->db->insert('products', $data);
            $this->syncVariants($id, $variants);
            $this->db->insert('product_price_history', [
                'product_id' => $id, 'field' => 'price', 'old_value' => null, 'new_value' => $data['price'],
                'source' => 'create', 'user_id' => Auth::id(),
            ]);
            Audit::log('product.create', 'product', $id, "Producto creado: {$data['name']}", null, $data);
            return $id;
        });
    }

    public function update(int $id, array $input): void
    {
        Auth::authorize('products.manage');
        $current = $this->db->one('SELECT * FROM products WHERE id = :id', ['id' => $id]);
        if (!$current) {
            throw HttpException::notFound('El producto no existe.');
        }
        $data = $this->validate($input, $id);
        $canPrice = Auth::can('products.price');
        foreach (self::PRICE_FIELDS as $f) {
            if ((string) ($current[$f] ?? '') !== (string) ($data[$f] ?? '') && !$canPrice) {
                throw HttpException::forbidden('No tiene permiso para modificar precios ni costos base.');
            }
        }
        $variants = $this->validateVariants($input['variants'] ?? [], $data, $id);
        $this->db->transaction(function () use ($id, $current, $data, $variants) {
            $data['updated_by'] = Auth::id();
            $this->db->update('products', $data, 'id = :id', ['id' => $id]);
            foreach (self::PRICE_FIELDS as $f) {
                if ((string) ($current[$f] ?? '') !== (string) ($data[$f] ?? '')) {
                    $this->db->insert('product_price_history', [
                        'product_id' => $id, 'field' => $f, 'old_value' => $current[$f], 'new_value' => $data[$f],
                        'source' => 'manual', 'user_id' => Auth::id(),
                    ]);
                }
            }
            $this->syncVariants($id, $variants);
            [$old, $new] = Audit::diff($current, $data);
            if ($new) {
                $isPrice = array_intersect(array_keys($new), self::PRICE_FIELDS);
                Audit::log($isPrice ? 'product.price_change' : 'product.update', 'product', $id,
                    "Producto modificado: {$data['name']}", $old, $new);
            }
        });
    }

    public function toggle(int $id): bool
    {
        Auth::authorize('products.manage');
        $p = $this->db->one('SELECT id, name, is_active FROM products WHERE id = :id', ['id' => $id]);
        if (!$p) {
            throw HttpException::notFound();
        }
        $new = (int) $p['is_active'] ? 0 : 1;
        $this->db->update('products', ['is_active' => $new, 'updated_by' => Auth::id()], 'id = :id', ['id' => $id]);
        Audit::log($new ? 'product.activate' : 'product.deactivate', 'product', $id, $p['name'], ['is_active' => $p['is_active']], ['is_active' => $new]);
        return (bool) $new;
    }

    private function validateVariants(array $rows, array $product, ?int $productId): array
    {
        $out = [];
        $seen = [];
        foreach ($rows as $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '' && trim((string) ($row['price'] ?? '')) === '') {
                continue;
            }
            $v = Validator::make($row, [
                'id' => 'nullable|int',
                'name' => 'required|string|max:80',
                'sku' => 'nullable|code|max:60',
                'barcode' => 'nullable|regex:/^[0-9A-Za-z\-]{3,60}$/',
                'base_qty' => 'required|decimal:3|gt:0',
                'price' => 'required|decimal:2|min:0',
                'is_active' => 'bool',
            ], ['name' => 'el nombre de la presentación', 'base_qty' => 'el contenido de la presentación', 'price' => 'el precio de la presentación']);
            if ((int) $product['qty_precision'] === 0 && Dec::decimals($v['base_qty']) > 0) {
                throw new ValidationException("La presentación «{$v['name']}» debe consumir unidades completas.");
            }
            foreach (['sku', 'barcode'] as $f) {
                if ($v[$f] !== null) {
                    if (isset($seen[$f][$v[$f]]) || $v[$f] === ($product[$f] ?? null)) {
                        throw new ValidationException("El $f «{$v[$f]}» está repetido.");
                    }
                    $seen[$f][$v[$f]] = true;
                }
            }
            if ($v['id'] && $productId) {
                $owner = $this->db->value('SELECT product_id FROM product_variants WHERE id = :id', ['id' => $v['id']]);
                if ((int) $owner !== $productId) {
                    throw new ValidationException('Presentación no válida.');
                }
            } else {
                $v['id'] = null;
            }
            $this->assertUniqueCodes(null, $v['sku'], $v['barcode'], null, $v['id']);
            // Un SKU/código de presentación no puede coincidir con el de otro producto.
            foreach (['sku', 'barcode'] as $f) {
                if ($v[$f] !== null && $this->db->value("SELECT id FROM products WHERE $f = :v", ['v' => $v[$f]])) {
                    throw new ValidationException("El $f «{$v[$f]}» ya pertenece a un producto.");
                }
            }
            $out[] = $v;
        }
        return $out;
    }

    private function syncVariants(int $productId, array $variants): void
    {
        $keep = [];
        foreach ($variants as $i => $v) {
            $data = [
                'name' => $v['name'], 'sku' => $v['sku'], 'barcode' => $v['barcode'],
                'base_qty' => $v['base_qty'], 'price' => $v['price'], 'is_active' => $v['is_active'], 'sort_order' => $i,
            ];
            if ($v['id']) {
                $old = $this->db->one('SELECT * FROM product_variants WHERE id = :id', ['id' => $v['id']]);
                $this->db->update('product_variants', $data, 'id = :id', ['id' => $v['id']]);
                if ((string) $old['price'] !== (string) $v['price']) {
                    $this->db->insert('product_price_history', [
                        'product_id' => $productId, 'variant_id' => $v['id'], 'field' => 'price',
                        'old_value' => $old['price'], 'new_value' => $v['price'], 'source' => 'manual', 'user_id' => Auth::id(),
                    ]);
                }
                $keep[] = (int) $v['id'];
            } else {
                $data['product_id'] = $productId;
                $keep[] = $this->db->insert('product_variants', $data);
            }
        }
        // Las presentaciones retiradas se desactivan (no se borran: pueden estar en ventas).
        [$in, $params] = Database::in($keep ?: [0]);
        $this->db->execute(
            "UPDATE product_variants SET is_active = 0 WHERE product_id = :p AND id NOT IN ($in)",
            array_merge($params, ['p' => $productId])
        );
    }

    /**
     * Actualiza el costo vigente según la política configurada al ingresar
     * mercancía. No modifica el costo histórico de ventas ya registradas
     * (sale_items conserva su propio costo).
     */
    public function applyIncomingCost(int $productId, string $qty, string $unitCost, string $source): void
    {
        $product = $this->db->one('SELECT id, cost FROM products WHERE id = :id FOR UPDATE', ['id' => $productId]);
        $policy = Settings::get('cost_policy', 'weighted_average');
        if ($policy === 'last') {
            $new = Dec::norm($unitCost, 4);
        } else {
            $onHand = (string) ($this->db->value(
                'SELECT COALESCE(SUM(GREATEST(quantity, 0) + in_transit), 0) FROM inventory WHERE product_id = :p',
                ['p' => $productId]
            ) ?? '0');
            $totalQty = Dec::add($onHand, $qty, 3);
            $new = Dec::isPositive($totalQty)
                ? Dec::div(Dec::add(Dec::mul($onHand, $product['cost'], 6), Dec::mul($qty, $unitCost, 6), 6), $totalQty, 4)
                : Dec::norm($unitCost, 4);
        }
        if (Dec::cmp($new, $product['cost']) !== 0) {
            $this->db->execute('UPDATE products SET cost = :c WHERE id = :id', ['c' => $new, 'id' => $productId]);
            $this->db->insert('product_price_history', [
                'product_id' => $productId, 'field' => 'cost', 'old_value' => $product['cost'], 'new_value' => $new,
                'source' => $source, 'user_id' => Auth::id(),
            ]);
        }
    }
}

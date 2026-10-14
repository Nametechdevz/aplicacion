<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Product;
use App\Models\ProductVariant;
use DomainException;

/**
 * Carrito en la sesión de PHP. Solo guarda ids y cantidades: precios, nombres
 * y existencias se consultan siempre en la base de datos.
 */
final class CartService
{
    private const KEY = 'cart';

    public static function key(int $productId, ?int $variantId): string
    {
        return $productId . '-' . ($variantId ?? 0);
    }

    public static function items(): array
    {
        $items = $_SESSION[self::KEY] ?? [];
        return is_array($items) ? $items : [];
    }

    public static function count(): int
    {
        return array_sum(array_map(static fn ($i) => (int) $i['qty'], self::items()));
    }

    private static function maxQuantity(): int
    {
        return (int) config('app.catalog.max_cart_quantity', 50);
    }

    /** @return string mensaje de éxito */
    public static function add(int $productId, ?int $variantId, int $quantity): string
    {
        if ($quantity < 1) {
            throw new DomainException('La cantidad debe ser al menos 1.');
        }
        [$product, $variant, $available] = self::resolve($productId, $variantId);

        $key = self::key($productId, $variant ? (int) $variant['id'] : null);
        $current = (int) (self::items()[$key]['qty'] ?? 0);
        $newQty = $current + $quantity;

        if ($available <= 0) {
            throw new DomainException('Este producto está agotado.');
        }
        if ($newQty > $available) {
            $left = max(0, $available - $current);
            throw new DomainException($left > 0
                ? "Solo puedes agregar $left unidad(es) más: hay $available disponible(s) y ya tienes $current en el carrito."
                : "Ya tienes en el carrito todas las unidades disponibles ($available).");
        }
        if ($newQty > self::maxQuantity()) {
            throw new DomainException('Para compras de más de ' . self::maxQuantity() . ' unidades escríbenos por WhatsApp.');
        }

        $_SESSION[self::KEY][$key] = [
            'product_id' => $productId,
            'variant_id' => $variant ? (int) $variant['id'] : null,
            'qty' => $newQty,
        ];
        $name = $product['name'] . ($variant ? ' — ' . $variant['name'] : '');
        return "$name se agregó al carrito.";
    }

    public static function update(string $key, int $quantity): void
    {
        $items = self::items();
        if (!isset($items[$key])) {
            throw new DomainException('El producto ya no está en el carrito.');
        }
        if ($quantity <= 0) {
            self::remove($key);
            return;
        }
        [, , $available] = self::resolve((int) $items[$key]['product_id'], $items[$key]['variant_id'] !== null ? (int) $items[$key]['variant_id'] : null);
        if ($quantity > $available) {
            throw new DomainException($available > 0 ? "Solo hay $available unidad(es) disponible(s)." : 'Este producto se agotó.');
        }
        if ($quantity > self::maxQuantity()) {
            throw new DomainException('La cantidad máxima por producto es ' . self::maxQuantity() . '.');
        }
        $_SESSION[self::KEY][$key]['qty'] = $quantity;
    }

    public static function remove(string $key): void
    {
        unset($_SESSION[self::KEY][$key]);
    }

    public static function clear(): void
    {
        unset($_SESSION[self::KEY]);
    }

    /** Valida producto/variante y devuelve [producto, variante, disponible]. */
    private static function resolve(int $productId, ?int $variantId): array
    {
        $product = Product::findManyActive([$productId])[$productId] ?? null;
        if (!$product || (int) $product['is_active'] !== 1 || (int) $product['category_active'] !== 1) {
            throw new DomainException('El producto no está disponible.');
        }
        $variant = null;
        if ((int) $product['has_variants'] === 1) {
            if ($variantId === null) {
                throw new DomainException('Selecciona una opción (color o presentación) antes de agregar al carrito.');
            }
            $variant = ProductVariant::find($variantId);
            if (!$variant || (int) $variant['product_id'] !== $productId || (int) $variant['is_active'] !== 1) {
                throw new DomainException('La opción seleccionada no está disponible.');
            }
            $available = (int) $variant['stock'];
        } else {
            $available = (int) $product['stock'];
        }
        return [$product, $variant, $available];
    }

    /**
     * Construye el resumen con datos actuales de la BD. Si un producto se desactivó o
     * bajó su stock, ajusta el carrito y devuelve avisos para el cliente.
     */
    public static function summary(): array
    {
        $items = self::items();
        $products = Product::findManyActive(array_column($items, 'product_id'));
        $variants = ProductVariant::findMany(array_filter(array_column($items, 'variant_id')));

        $lines = [];
        $notices = [];
        $subtotal = 0.0;
        $discount = 0.0;

        foreach ($items as $key => $item) {
            $product = $products[(int) $item['product_id']] ?? null;
            $variant = $item['variant_id'] !== null ? ($variants[(int) $item['variant_id']] ?? null) : null;

            $valid = $product && (int) $product['is_active'] === 1 && (int) $product['category_active'] === 1;
            if ($valid && (int) $product['has_variants'] === 1) {
                $valid = $variant && (int) $variant['product_id'] === (int) $product['id'] && (int) $variant['is_active'] === 1;
            } elseif ($valid && $variant !== null) {
                $valid = false;
            }
            if (!$valid) {
                $notices[] = 'Un producto de tu carrito ya no está disponible y se retiró.';
                self::remove($key);
                continue;
            }

            $available = (int) ($variant ? $variant['stock'] : $product['stock']);
            $qty = (int) $item['qty'];
            if ($available <= 0) {
                $notices[] = "{$product['name']} se agotó y se retiró del carrito.";
                self::remove($key);
                continue;
            }
            if ($qty > $available) {
                $notices[] = "Ajustamos la cantidad de {$product['name']} a $available: son las unidades disponibles.";
                $qty = $available;
                $_SESSION[self::KEY][$key]['qty'] = $qty;
            }

            $price = PricingService::price($product, $variant);
            $lineBase = $price['base'] * $qty;
            $lineDiscount = $price['discount'] * $qty;
            $subtotal += $lineBase;
            $discount += $lineDiscount;

            $lines[] = [
                'key' => $key,
                'product_id' => (int) $product['id'],
                'variant_id' => $variant ? (int) $variant['id'] : null,
                'name' => $product['name'],
                'variant_name' => $variant['name'] ?? null,
                'sku' => $variant['sku'] ?? $product['sku'],
                'slug' => $product['slug'],
                'image_path' => $product['image_path'],
                'quantity' => $qty,
                'available' => $available,
                'pricing' => $price,
                'unit_price' => $price['base'],
                'unit_final' => $price['final'],
                'line_total' => $price['final'] * $qty,
            ];
        }

        $itemsTotal = $subtotal - $discount;
        $shipping = ShippingService::quote($itemsTotal);
        $total = $itemsTotal + ($shipping['cost'] ?? 0);

        return [
            'lines' => $lines,
            'count' => array_sum(array_column($lines, 'quantity')),
            'subtotal' => $subtotal,
            'discount' => $discount,
            'items_total' => $itemsTotal,
            'shipping' => $shipping,
            'total' => $total,
            'notices' => array_values(array_unique($notices)),
        ];
    }
}

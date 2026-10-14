<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Promotion;

/**
 * Única fuente de verdad para precios. Todo precio mostrado o cobrado pasa por aquí;
 * nunca se usan precios enviados por el navegador.
 */
final class PricingService
{
    /**
     * Calcula el precio de un producto (o de una variante) aplicando la mejor promoción vigente.
     *
     * @return array{base: float, final: float, discount: float, old_price: ?float, percent: int, promotion: ?string}
     */
    public static function price(array $product, ?array $variant = null): array
    {
        $base = (float) ($variant !== null && $variant['price'] !== null ? $variant['price'] : $product['price']);
        $compare = $variant !== null && $variant['price'] !== null
            ? ($variant['compare_at_price'] !== null ? (float) $variant['compare_at_price'] : null)
            : ($product['compare_at_price'] !== null ? (float) $product['compare_at_price'] : null);

        $bestDiscount = 0.0;
        $bestName = null;
        foreach (Promotion::active() as $promo) {
            if (!self::applies($promo, (int) $product['id'], (int) $product['category_id'])) {
                continue;
            }
            $discount = self::discountFor($promo, $base);
            if ($discount > $bestDiscount) {
                $bestDiscount = $discount;
                $bestName = $promo['name'];
            }
        }

        $final = max(0.0, $base - $bestDiscount);
        $oldPrice = null;
        if ($bestDiscount > 0) {
            $oldPrice = $base;
        } elseif ($compare !== null && $compare > $base) {
            $oldPrice = $compare;
        }
        $percent = $oldPrice ? (int) round((1 - $final / $oldPrice) * 100) : 0;

        return [
            'base' => $base,
            'final' => $final,
            'discount' => $bestDiscount,
            'old_price' => $oldPrice,
            'percent' => $percent,
            'promotion' => $bestName,
        ];
    }

    public static function applies(array $promo, int $productId, int $categoryId): bool
    {
        return match ($promo['scope']) {
            'all' => true,
            'products' => isset($promo['product_ids'][$productId]),
            'categories' => isset($promo['category_ids'][$categoryId]),
            default => false,
        };
    }

    /** Descuento unitario en pesos, redondeado y nunca mayor que el precio. */
    public static function discountFor(array $promo, float $base): float
    {
        $value = (float) $promo['discount_value'];
        $discount = $promo['discount_type'] === 'percent'
            ? round($base * min(max($value, 0), 100) / 100)
            : round($value);
        return max(0.0, min($discount, $base));
    }

    /** Añade a cada fila de producto la clave 'pricing' para listados. */
    public static function decorate(array $products): array
    {
        foreach ($products as &$product) {
            $source = $product;
            if ((int) ($product['has_variants'] ?? 0) === 1 && isset($product['from_price'])) {
                $source['price'] = $product['from_price'];
                $source['compare_at_price'] = null;
            }
            $product['pricing'] = self::price($source);
        }
        return $products;
    }
}

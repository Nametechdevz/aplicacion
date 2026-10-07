<?php
namespace App\Services;

/**
 * Cálculo de líneas con precio IVA incluido.
 * total_linea = precio * cantidad - descuento ; base = total / (1 + iva) ; iva = total - base
 */
class Calculator
{
    public static function line(float $unitPrice, int $qty, float $discountPct, float $taxRate): array
    {
        $gross = round($unitPrice * $qty, 2);
        $discount = round($gross * $discountPct / 100, 2);
        $total = round($gross - $discount, 2);
        $base = round($total / (1 + $taxRate / 100), 2);
        $tax = round($total - $base, 2);
        return [
            'gross'           => $gross,
            'discount_amount' => $discount,
            'total'           => $total,
            'base'            => $base,
            'tax'             => $tax,
        ];
    }

    /** Combina descuento de línea y descuento global en un solo porcentaje efectivo */
    public static function combineDiscounts(float $linePct, float $globalPct): float
    {
        $linePct = max(0, min(100, $linePct));
        $globalPct = max(0, min(100, $globalPct));
        return round((1 - (1 - $linePct / 100) * (1 - $globalPct / 100)) * 100, 3);
    }

    /** Agrupa impuestos por tarifa: [['rate'=>19,'base'=>..,'tax'=>..], ...] */
    public static function taxBreakdown(array $lines): array
    {
        $groups = [];
        foreach ($lines as $l) {
            $key = number_format((float) $l['tax_rate'], 2, '.', '');
            $groups[$key] ??= ['rate' => (float) $l['tax_rate'], 'base' => 0.0, 'tax' => 0.0];
            $groups[$key]['base'] += (float) $l['base'];
            $groups[$key]['tax'] += (float) $l['tax'];
        }
        foreach ($groups as &$g) {
            $g['base'] = round($g['base'], 2);
            $g['tax'] = round($g['tax'], 2);
        }
        ksort($groups);
        return array_values($groups);
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Cálculo de envío según la configuración:
 *  - manual: el costo se confirma por WhatsApp (no se suma al total).
 *  - flat: tarifa fija nacional, con envío gratis opcional desde un monto mínimo.
 */
final class ShippingService
{
    /** @return array{cost: ?float, pending: bool, label: string} */
    public static function quote(float $itemsTotal): array
    {
        $mode = setting('shipping_mode', 'manual');
        if ($mode === 'flat') {
            $rate = max(0.0, (float) setting('shipping_flat_rate', '0'));
            $threshold = max(0.0, (float) setting('free_shipping_threshold', '0'));
            if ($threshold > 0 && $itemsTotal >= $threshold) {
                return ['cost' => 0.0, 'pending' => false, 'label' => 'Gratis'];
            }
            return ['cost' => $rate, 'pending' => false, 'label' => $rate > 0 ? money($rate) : 'Gratis'];
        }
        return ['cost' => null, 'pending' => true, 'label' => 'Por confirmar'];
    }

    public static function freeShippingThreshold(): ?float
    {
        if (setting('shipping_mode', 'manual') !== 'flat') {
            return null;
        }
        $threshold = (float) setting('free_shipping_threshold', '0');
        return $threshold > 0 ? $threshold : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Enlaces de WhatsApp con el formato oficial https://wa.me/NUMERO?text=TEXTO.
 * Abrir un enlace no garantiza que el mensaje se haya enviado: la confirmación del
 * pedido siempre la hace manualmente el administrador.
 */
final class WhatsAppService
{
    public static function storeNumber(): ?string
    {
        return normalize_whatsapp((string) setting('whatsapp_number', ''));
    }

    public static function isConfigured(): bool
    {
        return self::storeNumber() !== null;
    }

    public static function link(string $message = '', ?string $number = null): ?string
    {
        $number = $number !== null ? normalize_whatsapp($number) : self::storeNumber();
        if ($number === null) {
            return null;
        }
        return 'https://wa.me/' . $number . ($message !== '' ? '?text=' . rawurlencode($message) : '');
    }

    public static function orderMessage(array $order, array $items): string
    {
        $lines = [];
        $lines[] = (string) setting('whatsapp_order_intro', 'Hola, Nailora Beauty. Quiero confirmar mi pedido.');
        $lines[] = '';
        $lines[] = 'Pedido: ' . $order['code'];
        $lines[] = 'Productos:';
        foreach ($items as $item) {
            $name = $item['product_name'] . ($item['variant_name'] ? ' (' . $item['variant_name'] . ')' : '');
            $units = (int) $item['quantity'] === 1 ? '1 unidad' : $item['quantity'] . ' unidades';
            $lines[] = '• ' . $name . ' — ' . $units . ' — ' . money($item['line_total']);
        }
        $lines[] = '';
        $lines[] = 'Subtotal: ' . money($order['subtotal']);
        if ((float) $order['discount_total'] > 0) {
            $lines[] = 'Descuento: -' . money($order['discount_total']);
        }
        $lines[] = 'Envío: ' . ($order['shipping_cost'] === null ? 'Por confirmar' : ((float) $order['shipping_cost'] > 0 ? money($order['shipping_cost']) : 'Gratis'));
        $lines[] = ($order['shipping_cost'] === null ? 'Total provisional: ' : 'Total: ') . money($order['total']);
        if (!empty($order['payment_method'])) {
            $lines[] = 'Método de pago: ' . $order['payment_method'];
        }
        $lines[] = '';
        $lines[] = 'Cliente: ' . $order['customer_name'];
        $lines[] = 'Ciudad: ' . $order['city'] . ', ' . $order['department'];
        $lines[] = 'Dirección: ' . $order['address'] . (!empty($order['neighborhood']) ? ' — Barrio ' . $order['neighborhood'] : '');
        if (!empty($order['delivery_notes'])) {
            $lines[] = 'Indicaciones: ' . $order['delivery_notes'];
        }
        $lines[] = '';
        $lines[] = 'Quedo pendiente de la confirmación.';
        return implode("\n", $lines);
    }

    public static function productMessage(array $product, ?string $productUrl = null): string
    {
        $text = 'Hola, ' . setting('store_name', 'Nailora Beauty') . '. Quisiera más información sobre: ' . $product['name'];
        if (!empty($product['sku'])) {
            $text .= ' (Ref. ' . $product['sku'] . ')';
        }
        if ($productUrl) {
            $text .= "\n" . $productUrl;
        }
        return $text;
    }

    public static function cartMessage(array $summary): string
    {
        $lines = ['Hola, ' . setting('store_name', 'Nailora Beauty') . '. Me interesan estos productos:', ''];
        foreach ($summary['lines'] as $line) {
            $name = $line['name'] . ($line['variant_name'] ? ' (' . $line['variant_name'] . ')' : '');
            $lines[] = '• ' . $name . ' — ' . $line['quantity'] . ' — ' . money($line['line_total']);
        }
        $lines[] = '';
        $lines[] = 'Total productos: ' . money($summary['items_total']);
        $lines[] = 'Envío: ' . $summary['shipping']['label'];
        $lines[] = '';
        $lines[] = '(Aún no he registrado el pedido en la tienda).';
        return implode("\n", $lines);
    }

    /** Mensaje del administrador hacia el cliente desde el panel de pedidos. */
    public static function adminToCustomerMessage(array $order): string
    {
        return 'Hola, ' . strtok($order['customer_name'], ' ') . '. Te escribimos de ' . setting('store_name', 'Nailora Beauty')
            . ' sobre tu pedido ' . $order['code'] . '.';
    }
}

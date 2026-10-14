<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use PDOException;

final class CheckoutService
{
    /**
     * Crea el pedido de forma atómica:
     * bloquea existencias, recalcula precios en el servidor, guarda cliente, pedido,
     * líneas (con copia de nombre/SKU/precio), descuenta stock y registra el historial.
     *
     * @param array $customer datos validados del formulario
     * @param array $cartItems ítems del carrito en sesión (solo ids y cantidades)
     * @param string $checkoutToken token de un solo uso que evita pedidos duplicados
     */
    public static function placeOrder(array $customer, array $cartItems, string $checkoutToken, ?string $ip): array
    {
        if (!$cartItems) {
            throw new CheckoutException('Tu carrito está vacío.');
        }

        $existing = Order::findByCheckoutToken($checkoutToken);
        if ($existing) {
            return $existing;
        }

        // Orden estable de bloqueo (producto, variante) para evitar interbloqueos entre pedidos simultáneos
        $cartItems = array_values($cartItems);
        usort($cartItems, static fn ($a, $b) => [(int) $a['product_id'], (int) ($a['variant_id'] ?? 0)] <=> [(int) $b['product_id'], (int) ($b['variant_id'] ?? 0)]);

        try {
            return Database::transaction(static function () use ($customer, $cartItems, $checkoutToken, $ip): array {
                $lines = [];
                $problems = [];
                $subtotal = 0.0;
                $discount = 0.0;

                foreach ($cartItems as $item) {
                    $qty = (int) $item['qty'];
                    $productId = (int) $item['product_id'];
                    $variantId = $item['variant_id'] !== null ? (int) $item['variant_id'] : null;
                    if ($qty < 1) {
                        continue;
                    }
                    try {
                        $row = InventoryService::lockRow($productId, $variantId);
                    } catch (\DomainException) {
                        $problems[] = 'Un producto de tu carrito ya no está disponible.';
                        continue;
                    }
                    $product = $row['product'];
                    $variant = $row['variant'];
                    $categoryActive = (int) Database::value('SELECT is_active FROM categories WHERE id = :id', ['id' => (int) $product['category_id']]);
                    if ((int) $product['is_active'] !== 1 || $categoryActive !== 1 || ($variant && (int) $variant['is_active'] !== 1)) {
                        $problems[] = "{$product['name']} ya no está disponible.";
                        continue;
                    }
                    if ($row['stock'] < $qty) {
                        $problems[] = $row['stock'] > 0
                            ? "Solo quedan {$row['stock']} unidad(es) de {$product['name']}" . ($variant ? " ({$variant['name']})" : '') . '.'
                            : "{$product['name']}" . ($variant ? " ({$variant['name']})" : '') . ' se agotó.';
                        continue;
                    }

                    $price = PricingService::price($product, $variant);
                    $subtotal += $price['base'] * $qty;
                    $discount += $price['discount'] * $qty;
                    $lines[] = compact('product', 'variant', 'qty', 'price') + ['stock_before' => $row['stock']];
                }

                if ($problems) {
                    throw new CheckoutException(implode(' ', array_unique($problems)) . ' Revisa tu carrito antes de continuar.');
                }
                if (!$lines) {
                    throw new CheckoutException('Tu carrito está vacío.');
                }

                $itemsTotal = $subtotal - $discount;
                $shipping = ShippingService::quote($itemsTotal);
                $total = $itemsTotal + ($shipping['cost'] ?? 0);

                $customerId = Customer::upsertByPhone([
                    'full_name' => $customer['full_name'],
                    'phone' => $customer['phone'],
                    'email' => $customer['email'],
                    'department' => $customer['department'],
                    'city' => $customer['city'],
                    'address' => $customer['address'],
                    'neighborhood' => $customer['neighborhood'],
                ]);

                $now = date('Y-m-d H:i:s');
                $orderId = Database::insert('orders', [
                    'public_token' => bin2hex(random_bytes(16)),
                    'checkout_token' => $checkoutToken,
                    'customer_id' => $customerId,
                    'customer_name' => $customer['full_name'],
                    'customer_phone' => $customer['phone'],
                    'customer_email' => $customer['email'],
                    'department' => $customer['department'],
                    'city' => $customer['city'],
                    'address' => $customer['address'],
                    'neighborhood' => $customer['neighborhood'],
                    'delivery_notes' => $customer['delivery_notes'],
                    'payment_method' => $customer['payment_method'],
                    'status' => 'pending',
                    'stock_status' => 'reserved',
                    'subtotal' => $subtotal,
                    'discount_total' => $discount,
                    'shipping_cost' => $shipping['cost'],
                    'total' => $total,
                    'privacy_accepted_at' => $now,
                    'ip_address' => $ip,
                    'created_at' => $now,
                ]);
                $code = Order::generateCode($orderId, $now);
                Database::query('UPDATE orders SET code = :code WHERE id = :id', ['code' => $code, 'id' => $orderId]);

                foreach ($lines as $line) {
                    $product = $line['product'];
                    $variant = $line['variant'];
                    $price = $line['price'];
                    OrderItem::create([
                        'order_id' => $orderId,
                        'product_id' => (int) $product['id'],
                        'variant_id' => $variant ? (int) $variant['id'] : null,
                        'product_name' => $product['name'],
                        'variant_name' => $variant['name'] ?? null,
                        'sku' => $variant['sku'] ?? $product['sku'],
                        'unit_price' => $price['base'],
                        'discount_amount' => $price['discount'],
                        'final_price' => $price['final'],
                        'quantity' => $line['qty'],
                        'line_total' => $price['final'] * $line['qty'],
                        'promotion_name' => $price['promotion'],
                    ]);
                    InventoryService::reserveLine($orderId, $code, (int) $product['id'], $variant ? (int) $variant['id'] : null, $line['stock_before'], $line['qty']);
                }

                Order::logStatus($orderId, null, 'pending', null, 'Pedido registrado desde la tienda');

                return Order::find($orderId);
            });
        } catch (PDOException $e) {
            // Doble envío simultáneo con el mismo token: devolver el pedido ya creado
            if ($e->getCode() === '23000') {
                $existing = Order::findByCheckoutToken($checkoutToken);
                if ($existing) {
                    return $existing;
                }
            }
            throw $e;
        }
    }
}

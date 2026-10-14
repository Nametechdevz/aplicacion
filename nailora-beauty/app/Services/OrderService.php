<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\AuditLog;
use App\Models\Order;
use DomainException;

final class OrderService
{
    /** Cambia el estado respetando las transiciones permitidas y registrando quién lo hizo. */
    public static function changeStatus(int $orderId, string $newStatus, ?int $userId, ?string $note = null): array
    {
        if (!isset(Order::STATUSES[$newStatus])) {
            throw new DomainException('Estado no válido.');
        }

        $result = Database::transaction(static function () use ($orderId, $newStatus, $userId, $note): array {
            $order = Database::fetch('SELECT * FROM orders WHERE id = :id FOR UPDATE', ['id' => $orderId]);
            if (!$order) {
                throw new DomainException('El pedido no existe.');
            }
            $from = $order['status'];
            if ($from === $newStatus) {
                throw new DomainException('El pedido ya está en ese estado.');
            }
            if (!in_array($newStatus, Order::TRANSITIONS[$from], true)) {
                throw new DomainException(sprintf(
                    'No se puede pasar de "%s" a "%s".',
                    Order::STATUSES[$from],
                    Order::STATUSES[$newStatus]
                ));
            }

            $data = ['status' => $newStatus];
            $restored = 0;
            if ($newStatus === 'confirmed') {
                $data['confirmed_at'] = date('Y-m-d H:i:s');
            }
            if ($newStatus === 'cancelled') {
                $data['cancelled_at'] = date('Y-m-d H:i:s');
                $restored = InventoryService::releaseOrder($order, Order::items($orderId), $userId);
            }
            Database::update('orders', $data, 'id = :id', ['id' => $orderId]);

            $historyNote = $note;
            if ($newStatus === 'cancelled') {
                $historyNote = trim(($note !== null && $note !== '' ? rtrim($note, '. ') . '.' : '') . ' ' . ($restored > 0 ? "Se devolvieron $restored unidad(es) al inventario." : ''));
            }
            Order::logStatus($orderId, $from, $newStatus, $userId, $historyNote !== '' ? $historyNote : null);
            return ['from' => $from, 'to' => $newStatus, 'restored' => $restored, 'code' => $order['code']];
        });

        AuditLog::record('order.status', 'order', $orderId, $result);
        return $result;
    }

    /** Define o actualiza el costo de envío (por ejemplo, después de cotizarlo por WhatsApp). */
    public static function setShippingCost(int $orderId, ?float $cost, ?int $userId): void
    {
        Database::transaction(static function () use ($orderId, $cost, $userId): void {
            $order = Database::fetch('SELECT * FROM orders WHERE id = :id FOR UPDATE', ['id' => $orderId]);
            if (!$order) {
                throw new DomainException('El pedido no existe.');
            }
            if (in_array($order['status'], ['delivered', 'cancelled'], true)) {
                throw new DomainException('No se puede modificar el envío de un pedido entregado o cancelado.');
            }
            if ($cost !== null && $cost < 0) {
                throw new DomainException('El costo de envío no puede ser negativo.');
            }
            $total = (float) $order['subtotal'] - (float) $order['discount_total'] + ($cost ?? 0);
            Database::update('orders', ['shipping_cost' => $cost, 'total' => $total], 'id = :id', ['id' => $orderId]);
            $previous = $order['shipping_cost'] === null ? 'por confirmar' : money($order['shipping_cost']);
            Order::addNote($orderId, $userId, 'Costo de envío: ' . $previous . ' → ' . ($cost === null ? 'por confirmar' : money($cost)) . '. Nuevo total: ' . money($total) . '.');
        });
        AuditLog::record('order.shipping', 'order', $orderId, ['shipping_cost' => $cost]);
    }

    public static function setPaymentStatus(int $orderId, string $status, ?int $userId): void
    {
        if (!isset(Order::PAYMENT_STATUSES[$status])) {
            throw new DomainException('Estado de pago no válido.');
        }
        Database::transaction(static function () use ($orderId, $status, $userId): void {
            $order = Database::fetch('SELECT payment_status FROM orders WHERE id = :id FOR UPDATE', ['id' => $orderId]);
            if (!$order) {
                throw new DomainException('El pedido no existe.');
            }
            if ($order['payment_status'] === $status) {
                throw new DomainException('El pago ya tiene ese estado.');
            }
            Database::update('orders', ['payment_status' => $status], 'id = :id', ['id' => $orderId]);
            Order::addNote($orderId, $userId, 'Estado de pago: ' . payment_status_label($order['payment_status']) . ' → ' . payment_status_label($status) . '.');
        });
        AuditLog::record('order.payment', 'order', $orderId, ['payment_status' => $status]);
    }

    /** Registra que el cliente abrió WhatsApp desde la confirmación. No confirma el pedido. */
    public static function markWhatsAppOpened(int $orderId): void
    {
        Database::query('UPDATE orders SET whatsapp_opened_at = NOW() WHERE id = :id AND whatsapp_opened_at IS NULL', ['id' => $orderId]);
    }
}

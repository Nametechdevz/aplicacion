<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\Order;
use App\Services\OrderService;
use App\Services\WhatsAppService;

final class OrderController extends StorefrontController
{
    /** La confirmación solo se muestra con el token secreto del pedido: los datos del cliente no son públicos. */
    private function authorizedOrder(string $code, ?string $token): array
    {
        $order = Order::findByCode($code);
        $token = (string) ($token ?? '');
        if (!$order || $token === '' || !hash_equals($order['public_token'], $token)) {
            abort(404, 'No encontramos ese pedido.');
        }
        return $order;
    }

    public function show(string $code): void
    {
        $order = $this->authorizedOrder($code, $this->request->query('t'));
        $items = Order::items((int) $order['id']);
        $this->view('orders/confirmation', $this->seo('Pedido ' . $order['code'], null, ['robots' => 'noindex,nofollow']) + [
            'order' => $order,
            'items' => $items,
            'whatsappConfigured' => WhatsAppService::isConfigured(),
            'whatsappMessage' => WhatsAppService::orderMessage($order, $items),
        ]);
    }

    /** Registra que el cliente abrió WhatsApp y lo redirige a wa.me con el resumen real del pedido. */
    public function whatsapp(string $code): void
    {
        $order = $this->authorizedOrder($code, (string) $this->request->input('t', ''));
        $link = WhatsAppService::link(WhatsAppService::orderMessage($order, Order::items((int) $order['id'])));
        if (!$link) {
            flash('error', 'La tienda aún no ha configurado su número de WhatsApp. Tu pedido sí quedó registrado.');
            redirect('pedido/' . $order['code'] . '?t=' . $order['public_token']);
        }
        OrderService::markWhatsAppOpened((int) $order['id']);
        redirect($link);
    }
}

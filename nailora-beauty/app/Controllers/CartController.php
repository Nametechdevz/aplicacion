<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\CartService;
use App\Services\ShippingService;
use App\Services\WhatsAppService;
use DomainException;

final class CartController extends StorefrontController
{
    public function index(): void
    {
        $summary = CartService::summary();
        foreach ($summary['notices'] as $notice) {
            flash('info', $notice);
        }
        $this->view('cart/index', $this->seo('Tu carrito', null, ['robots' => 'noindex,nofollow']) + [
            'summary' => $summary,
            'freeShippingThreshold' => ShippingService::freeShippingThreshold(),
            'cartWhatsApp' => $summary['lines'] ? WhatsAppService::link(WhatsAppService::cartMessage($summary)) : null,
        ]);
    }

    public function summary(): void
    {
        $summary = CartService::summary();
        json_response(['ok' => true, 'count' => $summary['count'], 'total' => money($summary['items_total'])]);
    }

    public function add(): void
    {
        $productId = $this->request->int('product_id');
        $variantId = $this->request->int('variant_id');
        $quantity = $this->request->int('quantity', 1);
        try {
            if ($productId <= 0) {
                throw new DomainException('Producto no válido.');
            }
            $message = CartService::add($productId, $variantId > 0 ? $variantId : null, $quantity);
            $this->respond(true, $message);
        } catch (DomainException $e) {
            $this->respond(false, $e->getMessage());
        }
    }

    public function update(): void
    {
        try {
            CartService::update((string) $this->request->input('key', ''), $this->request->int('quantity', 0));
            $this->respond(true, 'Carrito actualizado.', 'carrito');
        } catch (DomainException $e) {
            $this->respond(false, $e->getMessage(), 'carrito');
        }
    }

    public function remove(): void
    {
        CartService::remove((string) $this->request->input('key', ''));
        $this->respond(true, 'Producto eliminado del carrito.', 'carrito');
    }

    public function clear(): void
    {
        CartService::clear();
        $this->respond(true, 'Vaciaste tu carrito.', 'carrito');
    }

    /** Abre WhatsApp con el contenido del carrito (consulta, no crea pedido). */
    public function whatsapp(): void
    {
        $summary = CartService::summary();
        $link = $summary['lines'] ? WhatsAppService::link(WhatsAppService::cartMessage($summary)) : null;
        if (!$link) {
            flash('error', $summary['lines'] ? 'La tienda aún no ha configurado su número de WhatsApp.' : 'Tu carrito está vacío.');
            redirect('carrito');
        }
        redirect($link);
    }

    private function respond(bool $ok, string $message, ?string $fallback = null): never
    {
        if ($this->request->wantsJson()) {
            $summary = CartService::summary();
            json_response([
                'ok' => $ok,
                'message' => $message,
                'count' => $summary['count'],
                'subtotal' => money($summary['subtotal']),
                'discount' => money($summary['discount']),
                'total' => money($summary['total']),
            ], $ok ? 200 : 422);
        }
        flash($ok ? 'success' : 'error', $message);
        $fallback !== null ? redirect($fallback) : back('carrito');
    }
}

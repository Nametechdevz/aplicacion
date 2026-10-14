<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\ErrorHandler;
use App\Core\Session;
use App\Core\Validator;
use App\Services\CartService;
use App\Services\CheckoutException;
use App\Services\CheckoutService;

final class CheckoutController extends StorefrontController
{
    public function show(): void
    {
        $summary = CartService::summary();
        if (!$summary['lines']) {
            foreach ($summary['notices'] as $notice) {
                flash('info', $notice);
            }
            flash('info', 'Tu carrito está vacío. Agrega productos para continuar.');
            redirect('carrito');
        }
        foreach ($summary['notices'] as $notice) {
            flash('info', $notice);
        }
        // Token de un solo uso: evita pedidos duplicados por doble clic o recarga
        $_SESSION['checkout_token'] = bin2hex(random_bytes(16));

        $this->view('checkout/index', $this->seo('Finalizar compra', null, ['robots' => 'noindex,nofollow']) + [
            'summary' => $summary,
            'departments' => config('colombia'),
            'paymentMethods' => self::paymentMethods(),
            'checkoutToken' => $_SESSION['checkout_token'],
        ]);
    }

    public static function paymentMethods(): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) setting('payment_methods', '')))));
    }

    public function store(): void
    {
        $r = $this->request;
        $token = (string) $r->input('checkout_token', '');

        // Reenvío del mismo formulario (doble clic, recarga): mostrar el pedido ya creado
        $done = $_SESSION['checkout_done'][$token] ?? null;
        if ($token !== '' && $done) {
            redirect('pedido/' . $done['code'] . '?t=' . $done['token']);
        }
        if ($token === '' || !hash_equals((string) ($_SESSION['checkout_token'] ?? ''), $token)) {
            flash('error', 'El formulario expiró. Revisa tus datos y vuelve a enviarlo.');
            Session::flashInput($r->all());
            redirect('checkout');
        }

        $paymentMethods = self::paymentMethods();
        $v = Validator::make($r->all(), [
            'full_name' => 'required|string|min:3|max:150',
            'phone' => 'required|phone_co',
            'department' => 'required|string|max:80',
            'city' => 'required|string|min:2|max:100',
            'address' => 'required|string|min:5|max:255',
            'neighborhood' => 'string|max:120',
            'delivery_notes' => 'string|max:500',
            'email' => 'email|max:190',
            'payment_method' => $paymentMethods ? 'required|string|max:80' : 'string|max:80',
            'accept_terms' => 'required',
        ], [
            'full_name' => 'nombre completo',
            'phone' => 'celular / WhatsApp',
            'department' => 'departamento',
            'city' => 'ciudad o municipio',
            'address' => 'dirección',
            'neighborhood' => 'barrio',
            'delivery_notes' => 'indicaciones',
            'payment_method' => 'método de pago',
        ]);
        // Listas con comas en sus valores: se validan contra la lista exacta
        if (!isset($v->errors()['department']) && !in_array($r->input('department'), config('colombia'), true)) {
            $v->addError('department', 'Selecciona un departamento de la lista.');
        }
        if ($paymentMethods && !isset($v->errors()['payment_method']) && !in_array($r->input('payment_method'), $paymentMethods, true)) {
            $v->addError('payment_method', 'Selecciona un método de pago de la lista.');
        }
        if (isset($v->errors()['accept_terms']) || !in_array($r->input('accept_terms'), ['1', 'on'], true)) {
            $v->addError('accept_terms', 'Debes aceptar la política de tratamiento de datos y las condiciones de compra.');
        }
        if ($v->fails()) {
            $this->failValidation($v->errors(), 'checkout', 'Revisa los datos marcados para continuar.');
        }

        $data = $v->validated();
        $customer = [
            'full_name' => clean_text($data['full_name'], 150),
            'phone' => normalize_phone_co($data['phone']),
            'email' => $data['email'] ? mb_strtolower($data['email']) : null,
            'department' => $data['department'],
            'city' => clean_text($data['city'], 100),
            'address' => clean_text($data['address'], 255),
            'neighborhood' => $data['neighborhood'] ? clean_text($data['neighborhood'], 120) : null,
            'delivery_notes' => $data['delivery_notes'] ? clean_text($data['delivery_notes'], 500) : null,
            'payment_method' => $data['payment_method'] ?: null,
        ];

        try {
            $order = CheckoutService::placeOrder($customer, CartService::items(), $token, $r->ip());
        } catch (CheckoutException $e) {
            Session::flashInput($r->all());
            flash('error', $e->getMessage());
            redirect('carrito');
        } catch (\Throwable $e) {
            ErrorHandler::log('Error al registrar pedido: ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
            Session::flashInput($r->all());
            flash('error', 'No pudimos registrar tu pedido por un error técnico. No se realizó ningún cobro. Inténtalo de nuevo o escríbenos por WhatsApp.');
            redirect('checkout');
        }

        CartService::clear();
        unset($_SESSION['checkout_token']);
        $_SESSION['checkout_done'][$token] = ['code' => $order['code'], 'token' => $order['public_token']];
        $_SESSION['checkout_done'] = array_slice($_SESSION['checkout_done'], -5, 5, true);
        $_SESSION['my_orders'][$order['code']] = $order['public_token'];

        redirect('pedido/' . $order['code'] . '?t=' . $order['public_token']);
    }
}

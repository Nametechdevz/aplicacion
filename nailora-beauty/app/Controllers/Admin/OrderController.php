<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\WhatsAppService;
use DomainException;

final class OrderController extends AdminController
{
    private function filters(): array
    {
        $date = static function (?string $v): ?string {
            $d = $v ? \DateTime::createFromFormat('Y-m-d', $v) : false;
            return $d && $d->format('Y-m-d') === $v ? $v : null;
        };
        $status = (string) $this->request->query('estado', '');
        return [
            'q' => mb_substr((string) $this->request->query('q', ''), 0, 80),
            'status' => isset(Order::STATUSES[$status]) ? $status : '',
            'from' => $date($this->request->query('desde')),
            'to' => $date($this->request->query('hasta')),
        ];
    }

    public function index(): void
    {
        $f = $this->filters();
        [$orders, $pager] = Order::paginate($f, $this->page(), $this->perPage());
        $this->render('orders/index', [
            'title' => 'Pedidos',
            'orders' => $orders,
            'pager' => $pager,
            'filters' => $f,
            'counts' => Order::statusCounts(),
            'query' => array_filter(['q' => $f['q'], 'estado' => $f['status'], 'desde' => $f['from'], 'hasta' => $f['to']]),
        ], ['Pedidos' => null]);
    }

    private function load(string $id): array
    {
        return Order::find((int) $id) ?? abort(404, 'El pedido no existe.');
    }

    public function show(string $id): void
    {
        $order = $this->load($id);
        $this->render('orders/show', [
            'title' => 'Pedido ' . $order['code'],
            'order' => $order,
            'items' => Order::items((int) $id),
            'history' => Order::history((int) $id),
            'notes' => Order::notes((int) $id),
            'transitions' => Order::TRANSITIONS[$order['status']],
            'customerWhatsApp' => WhatsAppService::link(WhatsAppService::adminToCustomerMessage($order), $order['customer_phone']),
        ], ['Pedidos' => 'admin/pedidos', $order['code'] => null]);
    }

    public function printView(string $id): void
    {
        $order = $this->load($id);
        AuditLog::record('order.print', 'order', (int) $id);
        $this->view('admin/orders/print', [
            'pageTitle' => 'Orden ' . $order['code'],
            'order' => $order,
            'items' => Order::items((int) $id),
        ], 'layouts/print');
    }

    public function status(string $id): void
    {
        $this->load($id);
        $status = (string) $this->request->input('status', '');
        $note = clean_text((string) $this->request->input('note', ''), 500);
        try {
            $result = OrderService::changeStatus((int) $id, $status, auth_id(), $note !== '' ? $note : null);
        } catch (DomainException $e) {
            $this->done($e->getMessage(), 'admin/pedidos/' . $id, 'error');
        }
        $message = 'Estado actualizado a "' . order_status_label($status) . '".';
        if ($status === 'cancelled') {
            $message .= $result['restored'] > 0 ? " Se devolvieron {$result['restored']} unidad(es) al inventario." : ' No había unidades por devolver.';
        }
        $this->done($message, 'admin/pedidos/' . $id);
    }

    public function note(string $id): void
    {
        $this->load($id);
        $note = clean_text((string) $this->request->input('note', ''), 1000);
        if ($note === '') {
            $this->done('Escriba la observación.', 'admin/pedidos/' . $id . '#notas', 'error');
        }
        Order::addNote((int) $id, auth_id(), $note);
        AuditLog::record('order.note', 'order', (int) $id);
        $this->done('Observación interna agregada.', 'admin/pedidos/' . $id . '#notas');
    }

    public function shipping(string $id): void
    {
        $this->load($id);
        $raw = (string) $this->request->input('shipping_cost', '');
        $cost = $raw === '' ? null : parse_money($raw);
        try {
            if ($raw !== '' && $cost === null) {
                throw new DomainException('Ingrese un valor numérico para el envío.');
            }
            OrderService::setShippingCost((int) $id, $cost !== null ? round($cost) : null, auth_id());
        } catch (DomainException $e) {
            $this->done($e->getMessage(), 'admin/pedidos/' . $id, 'error');
        }
        $this->done('Costo de envío actualizado y total recalculado.', 'admin/pedidos/' . $id);
    }

    public function payment(string $id): void
    {
        $this->load($id);
        try {
            OrderService::setPaymentStatus((int) $id, (string) $this->request->input('payment_status', ''), auth_id());
        } catch (DomainException $e) {
            $this->done($e->getMessage(), 'admin/pedidos/' . $id, 'error');
        }
        $this->done('Estado de pago actualizado.', 'admin/pedidos/' . $id);
    }
}

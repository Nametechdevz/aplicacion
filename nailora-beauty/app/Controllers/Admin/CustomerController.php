<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Models\Customer;
use App\Services\WhatsAppService;

final class CustomerController extends AdminController
{
    public function index(): void
    {
        $q = mb_substr((string) $this->request->query('q', ''), 0, 80);
        [$customers, $pager] = Customer::paginate($q, $this->page(), $this->perPage());
        $this->render('customers/index', [
            'title' => 'Clientes', 'customers' => $customers, 'pager' => $pager, 'q' => $q, 'query' => array_filter(['q' => $q]),
        ], ['Clientes' => null]);
    }

    public function show(string $id): void
    {
        $customer = Customer::find((int) $id) ?? abort(404);
        $this->render('customers/show', [
            'title' => $customer['full_name'],
            'customer' => $customer,
            'orders' => Customer::orders((int) $id),
            'whatsapp' => WhatsAppService::link('Hola, ' . strtok($customer['full_name'], ' ') . '. Te escribimos de ' . setting('store_name') . '.', $customer['phone']),
        ], ['Clientes' => 'admin/clientes', $customer['full_name'] => null]);
    }
}

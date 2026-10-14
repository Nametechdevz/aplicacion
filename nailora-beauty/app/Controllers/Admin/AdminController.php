<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Core\Controller;
use App\Core\Database;
use App\Core\Request;
use App\Core\View;

abstract class AdminController extends Controller
{
    public function __construct(Request $request)
    {
        parent::__construct($request);
        if (auth_id()) {
            View::share('pendingOrders', (int) Database::value("SELECT COUNT(*) FROM orders WHERE status = 'pending'"));
        }
    }

    protected function render(string $template, array $data = [], array $breadcrumbs = []): void
    {
        $data['breadcrumbs'] = $breadcrumbs;
        $data['pageTitle'] = ($data['title'] ?? 'Panel') . ' | Administración';
        $this->view('admin/' . $template, $data, 'layouts/admin');
    }

    protected function perPage(): int
    {
        return (int) config('app.admin.per_page', 20);
    }

    protected function page(): int
    {
        return max(1, (int) $this->request->query('pagina', 1));
    }

    /** Respuesta estándar tras una acción: mensaje y redirección. */
    protected function done(string $message, string $to, string $type = 'success'): never
    {
        flash($type, $message);
        redirect($to);
    }
}

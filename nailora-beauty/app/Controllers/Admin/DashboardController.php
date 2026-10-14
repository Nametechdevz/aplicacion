<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Models\Order;
use App\Services\ReportService;

final class DashboardController extends AdminController
{
    public function index(): void
    {
        $period = ReportService::resolvePeriod(
            $this->request->query('periodo'),
            $this->request->query('desde'),
            $this->request->query('hasta')
        );
        $this->render('dashboard/index', [
            'title' => 'Dashboard',
            'period' => $period,
            'summary' => ReportService::summary($period),
            'series' => ReportService::series($period),
            'topProducts' => ReportService::topProducts($period, 5),
            'stock' => ReportService::stockCounts(),
            'stockAlerts' => ReportService::stockAlerts(6),
            'latestOrders' => Order::latest(6),
            'statusCounts' => Order::statusCounts(),
        ]);
    }
}

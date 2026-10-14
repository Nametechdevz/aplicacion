<?php

declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Models\AuditLog;

final class AuditController extends AdminController
{
    public function index(): void
    {
        $q = mb_substr((string) $this->request->query('q', ''), 0, 60);
        [$rows, $pager] = AuditLog::paginate($this->page(), 40, $q);
        $this->render('audit/index', ['title' => 'Auditoría', 'rows' => $rows, 'pager' => $pager, 'q' => $q, 'query' => array_filter(['q' => $q])], ['Auditoría' => null]);
    }
}

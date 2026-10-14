<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\Paginator;
use App\Core\Request;

final class AuditLog
{
    public static function record(string $action, ?string $entityType = null, ?int $entityId = null, array $details = []): void
    {
        Database::insert('audit_logs', [
            'user_id' => auth_id(),
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'details' => $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
            'ip_address' => Request::current()?->ip(),
        ]);
    }

    public static function paginate(int $page, int $perPage, string $q = ''): array
    {
        $where = '1=1';
        $params = [];
        if ($q !== '') {
            $where = '(a.action LIKE :q1 OR a.entity_type LIKE :q2 OR u.name LIKE :q3)';
            $params = ['q1' => "%$q%", 'q2' => "%$q%", 'q3' => "%$q%"];
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE $where", $params);
        $pager = new Paginator($total, $perPage, $page);
        $rows = Database::fetchAll(
            "SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
             WHERE $where ORDER BY a.id DESC LIMIT {$pager->perPage} OFFSET {$pager->offset}",
            $params
        );
        return [$rows, $pager];
    }
}

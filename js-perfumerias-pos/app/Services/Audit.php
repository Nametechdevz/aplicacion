<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;

/**
 * Registro de auditoría de operaciones sensibles. Solo inserta: no existe
 * ninguna ruta de la aplicación que modifique o elimine registros de auditoría.
 */
final class Audit
{
    private static ?string $ip = null;
    private static ?string $agent = null;

    public static function setContext(?string $ip, ?string $agent): void
    {
        self::$ip = $ip;
        self::$agent = $agent;
    }

    public static function log(
        string $action,
        ?string $entityType = null,
        ?int $entityId = null,
        ?string $description = null,
        ?array $old = null,
        ?array $new = null,
        ?int $branchId = null,
        ?int $userId = null,
    ): void {
        Database::connection()->insert('audit_logs', [
            'user_id' => $userId ?? Auth::id(),
            'branch_id' => $branchId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'description' => $description !== null ? mb_substr($description, 0, 255) : null,
            'old_values' => $old !== null ? json_encode($old, JSON_UNESCAPED_UNICODE) : null,
            'new_values' => $new !== null ? json_encode($new, JSON_UNESCAPED_UNICODE) : null,
            'ip_address' => self::$ip,
            'user_agent' => self::$agent,
        ]);
    }

    /** Devuelve solo los campos que cambiaron entre dos estados. */
    public static function diff(array $before, array $after): array
    {
        $old = [];
        $new = [];
        foreach ($after as $k => $v) {
            if (array_key_exists($k, $before) && (string) $before[$k] !== (string) $v) {
                $old[$k] = $before[$k];
                $new[$k] = $v;
            }
        }
        return [$old, $new];
    }
}

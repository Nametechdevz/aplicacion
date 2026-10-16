<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Auth;
use App\Core\Database;

/** Configuración general persistida en la tabla settings. */
final class Settings
{
    private static ?array $cache = null;

    public const EDITABLE = [
        'company_name', 'company_tax_id', 'company_address', 'company_phone', 'company_email',
        'allow_negative_stock', 'allow_mixed_payments', 'min_margin_pct', 'cost_policy',
        'approval_expiry_min', 'cash_close_requires_approval', 'cash_difference_tolerance',
        'returns_require_approval', 'receipt_footer',
    ];

    public static function all(): array
    {
        if (self::$cache === null) {
            $rows = Database::connection()->all('SELECT setting_key, value FROM settings');
            self::$cache = array_column($rows, 'value', 'setting_key');
        }
        return self::$cache;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        return self::all()[$key] ?? $default;
    }

    public static function bool(string $key): bool
    {
        return self::get($key, '0') === '1';
    }

    public static function flush(): void
    {
        self::$cache = null;
    }

    public static function save(array $values): void
    {
        $db = Database::connection();
        $before = self::all();
        $changedOld = [];
        $changedNew = [];
        $db->transaction(function () use ($db, $values, $before, &$changedOld, &$changedNew) {
            foreach ($values as $key => $value) {
                if (!in_array($key, self::EDITABLE, true)) {
                    continue;
                }
                $value = (string) $value;
                if (($before[$key] ?? null) === $value) {
                    continue;
                }
                $db->query(
                    'INSERT INTO settings (setting_key, value, updated_by) VALUES (:k, :v, :u)
                     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
                    ['k' => $key, 'v' => $value, 'u' => Auth::id()]
                );
                $changedOld[$key] = $before[$key] ?? null;
                $changedNew[$key] = $value;
            }
            if ($changedNew) {
                Audit::log('settings.update', 'settings', null, 'Configuración general modificada', $changedOld, $changedNew);
            }
        });
        self::flush();
    }
}

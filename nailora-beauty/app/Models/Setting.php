<?php

declare(strict_types=1);

namespace App\Models;

use App\Core\Database;
use App\Core\ErrorHandler;
use Throwable;

final class Setting
{
    private static ?array $cache = null;

    public const DEFAULTS = [
        'store_name' => 'Nailora Beauty',
        'currency' => 'COP',
        'shipping_mode' => 'manual',
        'whatsapp_order_intro' => 'Hola, Nailora Beauty. Quiero confirmar mi pedido.',
        'low_stock_default' => '5',
    ];

    public static function all(): array
    {
        if (self::$cache === null) {
            try {
                $rows = Database::fetchAll('SELECT `key`, `value` FROM settings');
                self::$cache = array_column($rows, 'value', 'key');
            } catch (Throwable $e) {
                ErrorHandler::log('No se pudo leer la configuración: ' . $e->getMessage());
                self::$cache = [];
            }
        }
        return self::$cache;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $all = self::all();
        $value = $all[$key] ?? null;
        if ($value === null || $value === '') {
            return $default ?? (self::DEFAULTS[$key] ?? $value);
        }
        return $value;
    }

    public static function setMany(array $values): void
    {
        $stmt = Database::connection()->prepare(
            'INSERT INTO settings (`key`, `value`) VALUES (:k, :v) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
        );
        foreach ($values as $key => $value) {
            $stmt->execute(['k' => $key, 'v' => $value === null ? null : (string) $value]);
        }
        self::$cache = null;
    }

    public static function flush(): void
    {
        self::$cache = null;
    }
}

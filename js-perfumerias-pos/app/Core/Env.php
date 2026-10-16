<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Carga mínima de archivos .env (KEY=valor, comentarios con #).
 * Las variables ya definidas en el entorno del servidor tienen prioridad.
 */
final class Env
{
    private static array $values = [];

    public static function load(string $file): void
    {
        if (!is_file($file)) {
            return;
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (preg_match('/^"(.*)"(\s+#.*)?$/', $value, $m) || preg_match("/^'(.*)'(\\s+#.*)?$/", $value, $m)) {
                $value = $m[1];
            } else {
                $value = trim(preg_replace('/\s+#.*$/', '', $value));
            }
            self::$values[$key] = $value;
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $value = getenv($key);
        if ($value === false) {
            $value = self::$values[$key] ?? null;
        }
        if ($value === null) {
            return $default;
        }
        return match (strtolower((string) $value)) {
            'true' => true,
            'false' => false,
            'null' => null,
            default => $value,
        };
    }

    public static function set(string $key, string $value): void
    {
        self::$values[$key] = $value;
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\User;
use PDO;
use Throwable;

/**
 * Instalación: importa el esquema (y opcionalmente los datos de demostración),
 * crea el primer administrador y deja un archivo de bloqueo que impide repetirla.
 */
final class InstallService
{
    public static function lockFile(): string
    {
        return BASE_PATH . '/storage/installed.lock';
    }

    public static function isInstalled(): bool
    {
        return is_file(self::lockFile());
    }

    /** Diagnóstico de requisitos del servidor. */
    public static function requirements(): array
    {
        return [
            'PHP 8.1 o superior' => PHP_VERSION_ID >= 80100,
            'Extensión PDO MySQL' => extension_loaded('pdo_mysql'),
            'Extensión mbstring' => extension_loaded('mbstring'),
            'Extensión fileinfo' => extension_loaded('fileinfo'),
            'Extensión GD (recomendada para optimizar imágenes)' => extension_loaded('gd'),
            'storage/ con permisos de escritura' => is_writable(BASE_PATH . '/storage'),
            'public/uploads/ con permisos de escritura' => is_writable(PUBLIC_PATH . '/uploads'),
        ];
    }

    public static function databaseStatus(): array
    {
        try {
            $pdo = Database::connection();
            $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
            $hasSchema = in_array('users', $tables, true) && in_array('orders', $tables, true);
            return [
                'connected' => true,
                'has_schema' => $hasSchema,
                'admins' => $hasSchema ? User::count() : 0,
                'error' => null,
            ];
        } catch (Throwable $e) {
            return ['connected' => false, 'has_schema' => false, 'admins' => 0, 'error' => 'No se pudo conectar a la base de datos. Revise los datos DB_* del archivo .env.'];
        }
    }

    public static function importFile(string $file): void
    {
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new \RuntimeException('No se pudo leer ' . basename($file));
        }
        $pdo = Database::connection();
        foreach (self::splitStatements($sql) as $statement) {
            $pdo->exec($statement);
        }
    }

    /** Divide un script SQL en sentencias respetando cadenas y comentarios. */
    public static function splitStatements(string $sql): array
    {
        $statements = [];
        $buffer = '';
        $length = strlen($sql);
        $quote = null;
        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];
            $next = $sql[$i + 1] ?? '';
            if ($quote === null) {
                if ($char === '-' && $next === '-') {
                    $end = strpos($sql, "\n", $i);
                    $i = $end === false ? $length : $end;
                    $buffer .= "\n";
                    continue;
                }
                if ($char === '/' && $next === '*') {
                    $end = strpos($sql, '*/', $i + 2);
                    $i = $end === false ? $length : $end + 1;
                    continue;
                }
                if ($char === "'" || $char === '"' || $char === '`') {
                    $quote = $char;
                } elseif ($char === ';') {
                    if (trim($buffer) !== '') {
                        $statements[] = trim($buffer);
                    }
                    $buffer = '';
                    continue;
                }
            } elseif ($char === '\\' && $quote !== '`') {
                $buffer .= $char . $next;
                $i++;
                continue;
            } elseif ($char === $quote) {
                if ($next === $quote) {
                    $buffer .= $char . $next;
                    $i++;
                    continue;
                }
                $quote = null;
            }
            $buffer .= $char;
        }
        if (trim($buffer) !== '') {
            $statements[] = trim($buffer);
        }
        return $statements;
    }

    public static function writeLock(): void
    {
        $content = 'Instalado el ' . date('c') . PHP_EOL . 'Borre este archivo solo si necesita volver a ejecutar el instalador.' . PHP_EOL;
        if (file_put_contents(self::lockFile(), $content, LOCK_EX) === false) {
            throw new \RuntimeException('No se pudo crear storage/installed.lock. Revise los permisos de storage/.');
        }
    }
}

<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/** Registro de errores en storage/logs sin exponer detalles al usuario. */
final class Log
{
    public static function error(Throwable|string $error, array $context = []): void
    {
        $line = $error instanceof Throwable
            ? sprintf('%s: %s in %s:%d', get_class($error), $error->getMessage(), $error->getFile(), $error->getLine())
            : $error;
        if ($error instanceof Throwable) {
            $line .= "\n" . $error->getTraceAsString();
        }
        self::write('error', $line, $context);
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('info', $message, $context);
    }

    private static function write(string $level, string $message, array $context): void
    {
        // Nunca registrar contraseñas ni tokens.
        foreach (['password', 'password_hash', '_token', 'DB_PASSWORD'] as $secret) {
            unset($context[$secret]);
        }
        $file = base_path('storage/logs/app-' . gmdate('Y-m-d') . '.log');
        $entry = sprintf("[%s] %s: %s %s\n", gmdate('Y-m-d H:i:s'), strtoupper($level), $message, $context ? json_encode($context, JSON_UNESCAPED_UNICODE) : '');
        @file_put_contents($file, $entry, FILE_APPEND | LOCK_EX);
    }
}

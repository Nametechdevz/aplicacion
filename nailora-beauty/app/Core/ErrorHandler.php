<?php

declare(strict_types=1);

namespace App\Core;

use Throwable;

final class ErrorHandler
{
    private static bool $debug = false;
    private static string $logPath = '';

    public static function register(bool $debug, string $logPath): void
    {
        self::$debug = $debug;
        self::$logPath = $logPath;

        error_reporting(E_ALL);
        ini_set('display_errors', $debug ? '1' : '0');
        ini_set('log_errors', '1');
        ini_set('error_log', $logPath . '/php-' . date('Y-m') . '.log');

        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            if (!(error_reporting() & $severity)) {
                return false;
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });

        set_exception_handler([self::class, 'handle']);
    }

    public static function log(string $message, array $context = []): void
    {
        $line = sprintf("[%s] %s %s\n", date('Y-m-d H:i:s'), $message, $context ? json_encode($context, JSON_UNESCAPED_UNICODE) : '');
        $dir = self::$logPath ?: BASE_PATH . '/storage/logs';
        if (is_dir($dir) && is_writable($dir)) {
            file_put_contents($dir . '/app-' . date('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);
        } else {
            error_log($line);
        }
    }

    public static function handle(Throwable $e): void
    {
        $status = $e instanceof HttpException ? $e->getStatus() : 500;

        if ($status >= 500) {
            self::log(get_class($e) . ': ' . $e->getMessage(), [
                'file' => $e->getFile() . ':' . $e->getLine(),
                'uri' => $_SERVER['REQUEST_URI'] ?? 'cli',
            ]);
        }

        if (PHP_SAPI === 'cli') {
            fwrite(STDERR, $e->getMessage() . "\n" . $e->getTraceAsString() . "\n");
            exit(1);
        }

        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!headers_sent()) {
            http_response_code($status);
        }

        $wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
        $message = $e instanceof HttpException ? $e->getMessage() : 'Ocurrió un error inesperado. Inténtelo de nuevo en unos minutos.';

        if ($wantsJson) {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
            return;
        }

        try {
            echo View::render('errors/error', [
                'status' => $status,
                'message' => $message,
                'debug' => self::$debug && !($e instanceof HttpException) ? $e : null,
                'pageTitle' => $status === 404 ? 'Página no encontrada' : 'Error',
            ], 'layouts/minimal');
        } catch (Throwable) {
            header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><meta charset="utf-8"><title>Error</title><p style="font-family:sans-serif;padding:2rem">'
                . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
        }
    }
}

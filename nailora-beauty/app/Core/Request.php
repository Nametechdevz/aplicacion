<?php

declare(strict_types=1);

namespace App\Core;

final class Request
{
    private static ?Request $current = null;

    private function __construct(
        public readonly string $method,
        public readonly string $path,
        private array $query,
        private array $body,
        private array $files,
        private array $server,
    ) {
    }

    public static function capture(): self
    {
        $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $uriPath = rawurldecode($uriPath);

        // Quitar el prefijo de la instalación (por ejemplo /nailora-beauty o /nailora-beauty/public)
        $basePath = rtrim((string) parse_url((string) config('app.url'), PHP_URL_PATH), '/');
        foreach ([$basePath . '/public', $basePath] as $prefix) {
            if ($prefix !== '' && ($uriPath === $prefix || str_starts_with($uriPath, $prefix . '/'))) {
                $uriPath = substr($uriPath, strlen($prefix));
                break;
            }
        }
        if (str_starts_with($uriPath, '/index.php')) {
            $uriPath = substr($uriPath, strlen('/index.php'));
        }
        $path = '/' . trim($uriPath, '/');

        self::$current = new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $path,
            $_GET,
            $_POST,
            $_FILES,
            $_SERVER
        );
        return self::$current;
    }

    public static function current(): ?self
    {
        return self::$current;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        $value = $this->query[$key] ?? $default;
        return is_string($value) ? trim($value) : $value;
    }

    public function allQuery(): array
    {
        return $this->query;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        $value = $this->body[$key] ?? $default;
        return is_string($value) ? trim($value) : $value;
    }

    public function all(): array
    {
        return $this->body;
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->body);
    }

    public function int(string $key, int $default = 0): int
    {
        $value = $this->body[$key] ?? $this->query[$key] ?? null;
        $filtered = filter_var($value, FILTER_VALIDATE_INT);
        return $filtered === false ? $default : (int) $filtered;
    }

    public function file(string $key): ?array
    {
        $file = $this->files[$key] ?? null;
        if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
            return null;
        }
        return $file['error'] === UPLOAD_ERR_NO_FILE ? null : $file;
    }

    /** Normaliza <input type="file" multiple> a una lista de archivos. */
    public function files(string $key): array
    {
        $raw = $this->files[$key] ?? null;
        if (!is_array($raw) || !isset($raw['name'])) {
            return [];
        }
        if (!is_array($raw['name'])) {
            return $raw['error'] === UPLOAD_ERR_NO_FILE ? [] : [$raw];
        }
        $list = [];
        foreach ($raw['name'] as $i => $name) {
            if (($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $list[] = [
                'name' => $name,
                'type' => $raw['type'][$i] ?? '',
                'tmp_name' => $raw['tmp_name'][$i] ?? '',
                'error' => $raw['error'][$i] ?? UPLOAD_ERR_NO_FILE,
                'size' => $raw['size'][$i] ?? 0,
            ];
        }
        return $list;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $this->server[$key] ?? null;
    }

    public function wantsJson(): bool
    {
        return str_contains((string) $this->header('Accept'), 'application/json')
            || $this->header('X-Requested-With') === 'fetch';
    }

    public function ip(): string
    {
        // No se confía en X-Forwarded-For: puede ser falsificado por el cliente.
        return (string) ($this->server['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function userAgent(): string
    {
        return mb_substr((string) ($this->server['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }

    public static function isHttps(): bool
    {
        // Incluye hostings detrás de proxy/CDN (Hostinger, Cloudflare) que informan el protocolo por cabecera
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443
            || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https'
            || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '')) === 'on'
            || str_contains((string) ($_SERVER['HTTP_CF_VISITOR'] ?? ''), 'https')
            || (PHP_SAPI === 'cli' && str_starts_with((string) config('app.url'), 'https://'));
    }
}

<?php
declare(strict_types=1);

namespace App\Core;

final class Request
{
    public array $params = [];
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query = [],
        public readonly array $post = [],
        public readonly array $files = [],
        public readonly array $server = [],
        private readonly string $rawBody = '',
    ) {
    }

    public static function capture(): self
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base)) ?: '/';
        }
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        return new self(
            $method,
            '/' . trim($path, '/'),
            $_GET,
            $_POST,
            $_FILES,
            $_SERVER,
            in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) ? (string) file_get_contents('php://input') : ''
        );
    }

    /** Valor de la petición: JSON, formulario o query string, en ese orden. */
    public function input(string $key, mixed $default = null): mixed
    {
        $json = $this->json();
        if (array_key_exists($key, $json)) {
            return $json[$key];
        }
        if (array_key_exists($key, $this->post)) {
            return $this->post[$key];
        }
        return $this->query[$key] ?? $default;
    }

    public function all(): array
    {
        return array_merge($this->query, $this->post, $this->json());
    }

    public function str(string $key, string $default = ''): string
    {
        $v = $this->input($key, $default);
        return is_scalar($v) ? trim((string) $v) : $default;
    }

    public function int(string $key, ?int $default = null): ?int
    {
        $v = $this->input($key);
        if ($v === null || $v === '' || !is_scalar($v) || !preg_match('/^-?\d+$/', (string) $v)) {
            return $default;
        }
        return (int) $v;
    }

    public function json(): array
    {
        if ($this->json === null) {
            $this->json = [];
            if ($this->rawBody !== '' && str_contains($this->header('Content-Type', ''), 'application/json')) {
                $decoded = json_decode($this->rawBody, true);
                $this->json = is_array($decoded) ? $decoded : [];
            }
        }
        return $this->json;
    }

    public function header(string $name, string $default = ''): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if ($name === 'Content-Type') {
            return (string) ($this->server['CONTENT_TYPE'] ?? $this->server[$key] ?? $default);
        }
        return (string) ($this->server[$key] ?? $default);
    }

    public function ip(): string
    {
        return (string) ($this->server['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function userAgent(): string
    {
        return mb_substr((string) ($this->server['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }

    public function wantsJson(): bool
    {
        return str_contains($this->header('Accept'), 'application/json')
            || $this->header('X-Requested-With') === 'XMLHttpRequest'
            || str_starts_with($this->path, '/api/');
    }

    public function isSecure(): bool
    {
        return (!empty($this->server['HTTPS']) && $this->server['HTTPS'] !== 'off')
            || ($this->server['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }

    public function param(string $key): ?string
    {
        return $this->params[$key] ?? null;
    }

    public function file(string $key): ?array
    {
        return $this->files[$key] ?? null;
    }
}

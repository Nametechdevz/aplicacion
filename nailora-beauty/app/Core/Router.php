<?php

declare(strict_types=1);

namespace App\Core;

use App\Middleware\AuthMiddleware;
use App\Middleware\CsrfMiddleware;

final class Router
{
    private array $routes = [];
    private array $groupMiddleware = [];
    private string $groupPrefix = '';

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    public function group(string $prefix, array $middleware, callable $callback): void
    {
        $previousPrefix = $this->groupPrefix;
        $previousMiddleware = $this->groupMiddleware;
        $this->groupPrefix .= $prefix;
        $this->groupMiddleware = array_merge($this->groupMiddleware, $middleware);
        $callback($this);
        $this->groupPrefix = $previousPrefix;
        $this->groupMiddleware = $previousMiddleware;
    }

    private function add(string $method, string $path, array $handler, array $middleware): void
    {
        $full = '/' . trim($this->groupPrefix . $path, '/');
        $regex = '#^' . preg_replace_callback('/\{(\w+)(?::((?:[^{}]|\{[^{}]*\})+))?\}/', static function (array $m): string {
            $pattern = $m[2] ?? '[^/]+';
            return '(?P<' . $m[1] . '>' . $pattern . ')';
        }, $full) . '$#u';

        $this->routes[] = [
            'method' => $method,
            'regex' => $regex,
            'handler' => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    public function dispatch(Request $request): void
    {
        $method = $request->method === 'HEAD' ? 'GET' : $request->method;
        $allowed = [];

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            if ($route['method'] !== $method) {
                $allowed[] = $route['method'];
                continue;
            }

            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

            // Toda petición que modifica datos exige token CSRF
            if ($method === 'POST') {
                CsrfMiddleware::handle($request);
            }
            foreach ($route['middleware'] as $name) {
                match ($name) {
                    'auth' => AuthMiddleware::handle($request),
                    'guest' => AuthMiddleware::guest($request),
                    default => throw new \LogicException("Middleware desconocido: $name"),
                };
            }

            [$class, $action] = $route['handler'];
            $controller = new $class($request);
            $controller->$action(...array_values($params));
            return;
        }

        if ($allowed) {
            throw new HttpException(405);
        }
        throw new HttpException(404);
    }
}

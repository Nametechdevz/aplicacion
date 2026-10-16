<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Enrutador con parámetros {id} y middleware declarativo:
 *  'auth'             sesión iniciada
 *  'guest'            solo sin sesión
 *  'perm:a|b'         requiere al menos uno de los permisos indicados
 * La verificación CSRF se aplica a todas las peticiones que modifican estado.
 */
final class Router
{
    private array $routes = [];
    private array $groupMiddleware = [];

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->add('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->add('POST', $path, $handler, $middleware);
    }

    public function group(array $middleware, callable $callback): void
    {
        $previous = $this->groupMiddleware;
        $this->groupMiddleware = array_merge($this->groupMiddleware, $middleware);
        $callback($this);
        $this->groupMiddleware = $previous;
    }

    private function add(string $method, string $path, array $handler, array $middleware): void
    {
        $pattern = preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[0-9]+)', rtrim($path, '/') ?: '/');
        $pattern = preg_replace('#\{([a-z_]+):slug\}#', '(?P<$1>[A-Za-z0-9_\-.]+)', $pattern);
        $this->routes[] = [
            'method' => $method,
            'regex' => '#^' . $pattern . '$#',
            'handler' => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    public function dispatch(Request $request): Response
    {
        $allowed = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $m)) {
                continue;
            }
            if ($route['method'] !== $request->method) {
                $allowed = true;
                continue;
            }
            $request->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            if ($request->method !== 'GET') {
                Csrf::verify($request);
            }
            foreach ($route['middleware'] as $mw) {
                $result = $this->runMiddleware($mw, $request);
                if ($result instanceof Response) {
                    return $result;
                }
            }
            [$class, $action] = $route['handler'];
            $controller = new $class($request);
            $response = $controller->$action(...array_map('intval', array_values($request->params)));
            return $response instanceof Response ? $response : Response::html((string) $response);
        }
        if ($allowed) {
            throw new HttpException(405, 'Método no permitido.');
        }
        throw HttpException::notFound('La página que busca no existe.');
    }

    private function runMiddleware(string $mw, Request $request): ?Response
    {
        [$name, $arg] = array_pad(explode(':', $mw, 2), 2, null);
        switch ($name) {
            case 'auth':
                if (!Auth::check()) {
                    if ($request->wantsJson()) {
                        throw new HttpException(401, 'Su sesión expiró. Inicie sesión nuevamente.');
                    }
                    Session::put('intended', $request->path);
                    return Response::redirect('/login');
                }
                return null;
            case 'guest':
                return Auth::check() ? Response::redirect('/') : null;
            case 'perm':
                $perms = explode('|', (string) $arg);
                foreach ($perms as $p) {
                    if (Auth::can($p)) {
                        return null;
                    }
                }
                throw HttpException::forbidden();
            default:
                throw new \LogicException("Middleware desconocido: $name");
        }
    }
}

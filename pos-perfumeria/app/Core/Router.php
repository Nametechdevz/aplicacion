<?php
namespace App\Core;

class Router
{
    private array $routes = [];

    /**
     * @param array $opts ['public' => bool, 'roles' => ['admin']]
     */
    public function get(string $path, array $handler, array $opts = []): void
    {
        $this->add('GET', $path, $handler, $opts);
    }

    public function post(string $path, array $handler, array $opts = []): void
    {
        $this->add('POST', $path, $handler, $opts);
    }

    private function add(string $method, string $path, array $handler, array $opts): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', rtrim($path, '/') ?: '/') . '$#';
        $this->routes[] = compact('method', 'regex', 'handler', 'opts');
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $base = base_path();
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base));
        }
        $path = '/' . trim(preg_replace('#^/index\.php#', '', $path), '/');

        foreach ($this->routes as $r) {
            if ($r['method'] !== $method || !preg_match($r['regex'], $path, $m)) {
                continue;
            }
            $params = array_map('intval', array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));

            if (empty($r['opts']['public'])) {
                if (!Auth::check()) {
                    if (is_ajax()) {
                        json_response(['ok' => false, 'error' => 'Sesión expirada. Vuelve a iniciar sesión.'], 401);
                    }
                    redirect('/login');
                }
                if (!empty($r['opts']['roles']) && !in_array(Auth::user()['role'], $r['opts']['roles'], true)) {
                    http_response_code(403);
                    View::render('errors/403', ['title' => 'Acceso denegado']);
                    return;
                }
            }
            if ($method === 'POST') {
                Csrf::verify();
            }

            [$class, $action] = $r['handler'];
            (new $class())->$action(...array_values($params));
            return;
        }

        http_response_code(404);
        View::render(Auth::check() ? 'errors/404' : 'errors/404', ['title' => 'Página no encontrada'], Auth::check() ? 'layout' : null);
    }
}

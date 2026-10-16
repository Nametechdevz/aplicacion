<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Core\View;

abstract class Controller
{
    protected Database $db;

    public function __construct(protected Request $request)
    {
        $this->db = Database::connection();
    }

    protected function view(string $view, array $data = [], ?string $layout = 'layouts/app'): Response
    {
        return Response::html(View::render($view, $data, $layout));
    }

    protected function json(mixed $data, int $status = 200): Response
    {
        return Response::json($data, $status);
    }

    protected function redirect(string $to): Response
    {
        return Response::redirect($to);
    }

    protected function back(string $fallback = '/'): Response
    {
        $ref = $this->request->header('Referer');
        $path = $ref ? (parse_url($ref, PHP_URL_PATH) ?: $fallback) : $fallback;
        $query = $ref ? parse_url($ref, PHP_URL_QUERY) : null;
        $base = rtrim((string) parse_url(url('/'), PHP_URL_PATH), '/');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base)) ?: '/';
        }
        return Response::redirect($path . ($query ? '?' . $query : ''));
    }

    protected function success(string $message, string $to): Response
    {
        if ($this->request->wantsJson()) {
            return $this->json(['ok' => true, 'message' => $message, 'redirect' => url($to)]);
        }
        Session::flash('success', $message);
        return $this->redirect($to);
    }

    /** Filtro de sucursal validado contra el alcance del usuario. */
    protected function branchFilter(string $key = 'branch'): array
    {
        return Auth::scopeBranches($this->request->int($key));
    }

    /** Paginación simple. */
    protected function page(): array
    {
        $page = max(1, (int) $this->request->int('page', 1));
        $per = min(100, max(10, (int) $this->request->int('per', 25)));
        return [$page, $per, ($page - 1) * $per];
    }
}

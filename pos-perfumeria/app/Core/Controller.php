<?php
namespace App\Core;

abstract class Controller
{
    protected function view(string $view, array $data = [], ?string $layout = 'layout'): void
    {
        View::render($view, $data, $layout);
    }

    protected function back(string $fallback = '/'): never
    {
        $ref = $_SERVER['HTTP_REFERER'] ?? '';
        if ($ref !== '' && parse_url($ref, PHP_URL_HOST) === ($_SERVER['HTTP_HOST'] ? parse_url('http://' . $_SERVER['HTTP_HOST'], PHP_URL_HOST) : null)) {
            header('Location: ' . $ref);
            exit;
        }
        redirect($fallback);
    }

    protected function jsonBody(): array
    {
        $data = json_decode((string) file_get_contents('php://input'), true);
        return is_array($data) ? $data : [];
    }
}

<?php

declare(strict_types=1);

namespace App\Core;

abstract class Controller
{
    public function __construct(protected Request $request)
    {
        Session::consumeInput();
    }

    protected function view(string $template, array $data = [], string $layout = 'layouts/store', int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        $this->securityHeaders();
        $data['flashMessages'] = Session::pullFlash();
        echo View::render($template, $data, $layout);
    }

    protected function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; form-action 'self' https://wa.me https://api.whatsapp.com; base-uri 'self'");
        if (Request::isHttps()) {
            header('Strict-Transport-Security: max-age=31536000');
        }
    }

    /** Devuelve a la página anterior con los errores y los datos del formulario. */
    protected function failValidation(array $errors, string $fallback, ?string $message = null): never
    {
        if ($this->request->wantsJson()) {
            json_response(['ok' => false, 'message' => $message ?? reset($errors), 'errors' => $errors], 422);
        }
        Session::flashInput($this->request->all(), $errors);
        flash('error', $message ?? 'Revise los campos marcados.');
        back($fallback);
    }
}

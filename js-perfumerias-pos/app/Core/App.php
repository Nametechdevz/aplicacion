<?php
declare(strict_types=1);

namespace App\Core;

use App\Services\Audit;
use App\Support\Log;
use Throwable;

/** Núcleo HTTP: sesión, enrutamiento, manejo de errores y cabeceras de seguridad. */
final class App
{
    private Router $router;

    public function __construct()
    {
        $this->router = new Router();
        $router = $this->router;
        require base_path('routes/web.php');
    }

    public function router(): Router
    {
        return $this->router;
    }

    public function handle(Request $request): Response
    {
        $base = rtrim(str_replace('\\', '/', dirname($request->server['SCRIPT_NAME'] ?? '/index.php')), '/');
        Config::set('app.base_path', $base === '/' ? '' : $base);

        $secureSetting = Config::get('app.session_secure', 'auto');
        $secure = $secureSetting === 'auto' ? $request->isSecure() : (bool) $secureSetting;
        Session::start($secure);
        Audit::setContext($request->ip(), $request->userAgent());

        try {
            $response = $this->router->dispatch($request);
            Session::forget('_old');
            Session::forget('_errors');
        } catch (ValidationException $e) {
            $response = $this->validationResponse($request, $e);
        } catch (HttpException $e) {
            $response = $this->errorResponse($request, $e->status, $e->getMessage());
        } catch (Throwable $e) {
            Log::error($e);
            $message = Config::get('app.debug')
                ? get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine()
                : 'Ocurrió un error inesperado. Intente de nuevo; si persiste, contacte al administrador.';
            $response = $this->errorResponse($request, 500, $message);
        }
        return $this->secure($response);
    }

    private function validationResponse(Request $request, ValidationException $e): Response
    {
        if ($request->wantsJson()) {
            return Response::json(['ok' => false, 'message' => $e->getMessage(), 'errors' => $e->errors], 422);
        }
        Session::withInput($request->post, $e->errors);
        Session::flash('error', $e->getMessage());
        $ref = $request->header('Referer');
        $path = $ref ? (parse_url($ref, PHP_URL_PATH) ?: '/') : '/';
        $query = $ref ? parse_url($ref, PHP_URL_QUERY) : null;
        $base = (string) Config::get('app.base_path', '');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base)) ?: '/';
        }
        return Response::redirect($path . ($query ? '?' . $query : ''));
    }

    private function errorResponse(Request $request, int $status, string $message): Response
    {
        if ($request->wantsJson()) {
            return Response::json(['ok' => false, 'message' => $message], $status);
        }
        if ($status === 419) {
            Session::flash('error', $message);
            return Response::redirect(Auth::check() ? '/' : '/login');
        }
        try {
            $logged = Auth::check();
        } catch (Throwable) {
            $logged = false; // p. ej. base de datos aún sin instalar
        }
        $html = View::render('errors/error', ['status' => $status, 'message' => $message], $logged ? 'layouts/app' : 'layouts/guest');
        return Response::html($html, $status);
    }

    private function secure(Response $response): Response
    {
        $csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            . "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; "
            . "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
        return $response
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('X-Frame-Options', 'SAMEORIGIN')
            ->withHeader('Referrer-Policy', 'same-origin')
            ->withHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
            ->withHeader('Content-Security-Policy', $csp);
    }
}

<?php

declare(strict_types=1);

use App\Core\Env;
use App\Core\Session;
use App\Models\Setting;

function env(string $key, mixed $default = null): mixed
{
    return Env::get($key, $default);
}

function config(string $key, mixed $default = null): mixed
{
    static $cache = [];
    $parts = explode('.', $key);
    $file = array_shift($parts);
    if (!array_key_exists($file, $cache)) {
        $path = BASE_PATH . '/config/' . $file . '.php';
        $cache[$file] = is_file($path) ? require $path : [];
    }
    $value = $cache[$file];
    foreach ($parts as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

/** Ajuste de la tienda guardado en la tabla settings (con valor por defecto). */
function setting(string $key, ?string $default = null): ?string
{
    return Setting::get($key, $default);
}

function e(mixed $value): string
{
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function url(string $path = ''): string
{
    $base = (string) config('app.url');
    if ($path === '' || $path === '/') {
        return $base . '/';
    }
    return $base . '/' . ltrim($path, '/');
}

/** URL de un archivo dentro de public/ (assets o uploads) con versión para caché. */
function asset(string $path): string
{
    $path = ltrim($path, '/');
    $file = PUBLIC_PATH . '/' . $path;
    $version = is_file($file) ? '?v=' . filemtime($file) : '';
    return url($path) . $version;
}

/** URL de imagen guardada en BD (ruta relativa a public/) o el placeholder. */
function image_url(?string $path, string $placeholder = 'assets/images/placeholder.svg'): string
{
    if ($path === null || $path === '' || str_contains($path, '..')) {
        return url($placeholder);
    }
    return is_file(PUBLIC_PATH . '/' . ltrim($path, '/')) ? url($path) : url($placeholder);
}

function current_path(): string
{
    return App\Core\Request::current()?->path ?? '/';
}

function is_active_path(string $prefix, bool $exact = false): bool
{
    $path = current_path();
    return $exact ? $path === $prefix : ($path === $prefix || str_starts_with($path, rtrim($prefix, '/') . '/'));
}

function redirect(string $path, int $status = 302): never
{
    $target = preg_match('#^https?://#', $path) ? $path : url($path);
    header('Location: ' . $target, true, $status);
    exit;
}

function back(string $fallback = '/'): never
{
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $base = (string) config('app.url');
    if ($referer !== '' && str_starts_with($referer, $base)) {
        header('Location: ' . $referer, true, 302);
        exit;
    }
    redirect($fallback);
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function abort(int $status, string $message = ''): never
{
    throw new App\Core\HttpException($status, $message);
}

function csrf_token(): string
{
    if (empty($_SESSION['_csrf'])) {
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['_csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . e(csrf_token()) . '">';
}

function flash(string $type, string $message): void
{
    Session::flash($type, $message);
}

function old(string $key, mixed $default = ''): mixed
{
    $old = $GLOBALS['__old_input'] ?? [];
    return array_key_exists($key, $old) ? $old[$key] : $default;
}

function errors(): array
{
    return $GLOBALS['__errors'] ?? [];
}

function error_for(string $field): string
{
    $message = errors()[$field] ?? null;
    return $message ? '<p class="field-error" id="err-' . e($field) . '">' . e($message) . '</p>' : '';
}

function has_error(string $field): bool
{
    return isset(errors()[$field]);
}

function auth_user(): ?array
{
    return $_SESSION['admin_user'] ?? null;
}

function auth_id(): ?int
{
    return isset($_SESSION['admin_user']['id']) ? (int) $_SESSION['admin_user']['id'] : null;
}

function selected(mixed $a, mixed $b): string
{
    return (string) $a === (string) $b ? ' selected' : '';
}

function checked(mixed $value): string
{
    return in_array($value, [1, '1', true, 'on'], true) ? ' checked' : '';
}

function str_limit(?string $text, int $limit = 120): string
{
    $text = trim(preg_replace('/\s+/u', ' ', (string) $text));
    return mb_strlen($text) > $limit ? rtrim(mb_substr($text, 0, $limit - 1)) . '…' : $text;
}

function slugify(string $text): string
{
    $text = mb_strtolower(trim($text));
    $map = ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u'];
    $text = strtr($text, $map);
    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        if ($converted !== false) {
            $text = $converted;
        }
    }
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    return trim($text, '-') ?: 'item';
}

/** Convierte texto plano editable en HTML seguro: párrafos, "## " títulos y "- " listas. */
function rich_text(?string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", trim((string) $text));
    if ($text === '') {
        return '';
    }
    $html = '';
    foreach (preg_split("/\n{2,}/", $text) as $block) {
        $lines = explode("\n", trim($block));
        if (str_starts_with($lines[0], '## ')) {
            $html .= '<h2>' . e(substr($lines[0], 3)) . '</h2>';
            array_shift($lines);
            if (!$lines) {
                continue;
            }
        } elseif (str_starts_with($lines[0], '### ')) {
            $html .= '<h3>' . e(substr($lines[0], 4)) . '</h3>';
            array_shift($lines);
            if (!$lines) {
                continue;
            }
        }
        $isList = array_reduce($lines, static fn ($c, $l) => $c && str_starts_with(ltrim($l), '- '), true);
        if ($isList) {
            $html .= '<ul>' . implode('', array_map(static fn ($l) => '<li>' . e(substr(ltrim($l), 2)) . '</li>', $lines)) . '</ul>';
        } else {
            $html .= '<p>' . implode('<br>', array_map('e', $lines)) . '</p>';
        }
    }
    return $html;
}

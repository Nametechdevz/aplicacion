<?php
use App\Core\Auth;
use App\Core\Csrf;
use App\Core\Settings;

function base_path(): string
{
    static $base = null;
    if ($base === null) {
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base === '.' ) {
            $base = '';
        }
    }
    return $base;
}

function url(string $path = '/', array $query = []): string
{
    $u = base_path() . '/' . ltrim($path, '/');
    return $query ? $u . '?' . http_build_query($query) : $u;
}

function asset(string $path): string
{
    $file = BASE_PATH . '/public/assets/' . ltrim($path, '/');
    $v = is_file($file) ? filemtime($file) : 1;
    return url('assets/' . ltrim($path, '/')) . '?v=' . $v;
}

function e(mixed $value): string
{
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function money(mixed $value, bool $symbol = true): string
{
    $v = (float) $value;
    $decimals = abs($v - round($v)) > 0.004 ? 2 : 0;
    return ($symbol ? '$ ' : '') . number_format($v, $decimals, ',', '.');
}

function num(mixed $value, int $decimals = 0): string
{
    return number_format((float) $value, $decimals, ',', '.');
}

function redirect(string $path): never
{
    header('Location: ' . (preg_match('#^https?://#', $path) ? $path : url($path)));
    exit;
}

function flash(string $type, string $message): void
{
    $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
}

function flashes(): array
{
    $f = $_SESSION['_flash'] ?? [];
    unset($_SESSION['_flash']);
    return $f;
}

function old(string $key, mixed $default = ''): mixed
{
    return $_SESSION['_old'][$key] ?? $default;
}

function remember_input(): void
{
    $_SESSION['_old'] = $_POST;
}

function clear_old(): void
{
    unset($_SESSION['_old']);
}

function csrf_token(): string
{
    return Csrf::token();
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(Csrf::token()) . '">';
}

function input(string $key, mixed $default = null): mixed
{
    $v = $_POST[$key] ?? $_GET[$key] ?? $default;
    return is_string($v) ? trim($v) : $v;
}

function setting(string $key, ?string $default = null): ?string
{
    return Settings::get($key, $default);
}

function user(): ?array
{
    return Auth::user();
}

function is_admin(): bool
{
    return Auth::isAdmin();
}

function is_ajax(): bool
{
    return strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'xmlhttprequest'
        || str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function active_nav(string $prefix): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = substr($path, strlen(base_path())) ?: '/';
    if ($prefix === '/') {
        return $path === '/' ? 'active' : '';
    }
    return str_starts_with($path, $prefix) ? 'active' : '';
}

function fdate(?string $date, string $format = 'd/m/Y'): string
{
    return $date ? date($format, strtotime($date)) : '';
}

/** Dígito de verificación de NIT (DIAN) */
function nit_dv(string $nit): string
{
    $nit = preg_replace('/\D/', '', $nit);
    $primes = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    $sum = 0;
    $digits = strrev($nit);
    for ($i = 0, $n = strlen($digits); $i < $n && $i < count($primes); $i++) {
        $sum += (int) $digits[$i] * $primes[$i];
    }
    $r = $sum % 11;
    return (string) ($r > 1 ? 11 - $r : $r);
}

function payment_methods(): array
{
    return [
        'efectivo'        => 'Efectivo',
        'tarjeta_debito'  => 'Tarjeta débito',
        'tarjeta_credito' => 'Tarjeta crédito',
        'transferencia'   => 'Transferencia',
        'nequi'           => 'Nequi',
        'daviplata'       => 'Daviplata',
        'bono'            => 'Bono / Gift card',
    ];
}

function payment_label(string $method): string
{
    return payment_methods()[$method] ?? ucfirst($method);
}

function doc_types(): array
{
    return [
        '13' => 'Cédula de ciudadanía',
        '31' => 'NIT',
        '22' => 'Cédula de extranjería',
        '41' => 'Pasaporte',
        '12' => 'Tarjeta de identidad',
        '11' => 'Registro civil',
        '42' => 'Documento de identificación extranjero',
        '47' => 'PEP',
        '48' => 'PPT',
    ];
}

function doc_type_short(string $code): string
{
    return ['13' => 'CC', '31' => 'NIT', '22' => 'CE', '41' => 'PAS', '12' => 'TI', '11' => 'RC', '42' => 'DIE', '47' => 'PEP', '48' => 'PPT'][$code] ?? $code;
}

function edoc_badge(?string $status): string
{
    $map = [
        'aceptado'  => 'success',
        'pendiente' => 'warning',
        'rechazado' => 'danger',
        'error'     => 'danger',
    ];
    if (!$status) {
        return '<span class="badge text-bg-secondary">Sin documento</span>';
    }
    return '<span class="badge text-bg-' . ($map[$status] ?? 'secondary') . '">' . e(ucfirst($status)) . '</span>';
}

function paginate(int $total, int $perPage = 25): array
{
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pages = max(1, (int) ceil($total / $perPage));
    $page = min($page, $pages);
    return ['page' => $page, 'pages' => $pages, 'offset' => ($page - 1) * $perPage, 'limit' => $perPage, 'total' => $total];
}

function page_url(int $page): string
{
    $q = $_GET;
    $q['page'] = $page;
    return '?' . http_build_query($q);
}

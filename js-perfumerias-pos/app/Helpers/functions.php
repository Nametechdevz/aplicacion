<?php
declare(strict_types=1);

use App\Core\Auth;
use App\Core\Config;
use App\Core\Csrf;
use App\Core\Session;
use App\Services\Settings;

/** Escapa texto para HTML. */
function e(mixed $value): string
{
    return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function base_path(string $path = ''): string
{
    return dirname(__DIR__, 2) . ($path !== '' ? '/' . ltrim($path, '/') : '');
}

function url(string $path = '/', array $query = []): string
{
    if (preg_match('#^https?://#', $path)) {
        return $path;
    }
    $base = rtrim((string) Config::get('app.base_path', ''), '/');
    $q = array_filter($query, static fn ($v) => $v !== null && $v !== '');
    return $base . '/' . ltrim($path, '/') . ($q ? '?' . http_build_query($q) : '');
}

/** URL de un recurso estático con versión para invalidar caché. */
function asset(string $path): string
{
    $file = base_path('public/assets/' . ltrim($path, '/'));
    $v = is_file($file) ? substr(md5((string) filemtime($file)), 0, 8) : '1';
    return url('assets/' . ltrim($path, '/')) . '?v=' . $v;
}

function upload_url(?string $file): ?string
{
    return $file ? url('uploads/products/' . rawurlencode($file)) : null;
}

function csrf_token(): string
{
    return Csrf::token();
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . e(Csrf::token()) . '">';
}

function can(string $permission): bool
{
    return Auth::can($permission);
}

function setting(string $key, ?string $default = null): ?string
{
    return Settings::get($key, $default);
}

/**
 * Formato monetario COP: $ 1.234.567. Se muestra redondeado a pesos (el
 * peso colombiano no usa centavos en la práctica); el valor almacenado
 * conserva sus decimales. Con $forceDecimals se muestran dos decimales.
 */
function money(mixed $amount, bool $forceDecimals = false): string
{
    $str = (string) ($amount ?? '0');
    if (!$forceDecimals && \App\Support\Dec::isValid($str)) {
        $str = \App\Support\Dec::norm($str, 0);
    }
    $neg = str_starts_with($str, '-');
    $str = ltrim($str, '-');
    [$int, $dec] = array_pad(explode('.', $str), 2, '');
    $dec = rtrim($dec, '0');
    $int = number_format((int) $int, 0, ',', '.');
    $out = '$ ' . $int . (($dec !== '' || $forceDecimals) ? ',' . str_pad(substr($dec, 0, 2), 2, '0') : '');
    return ($neg ? '−' : '') . $out;
}

/** Cantidad con separadores colombianos sin ceros decimales sobrantes. */
function qty(mixed $value, ?string $unit = null): string
{
    $str = (string) ($value ?? '0');
    $neg = str_starts_with($str, '-');
    $str = ltrim($str, '-');
    [$int, $dec] = array_pad(explode('.', $str), 2, '');
    $dec = rtrim($dec, '0');
    $out = number_format((int) $int, 0, ',', '.') . ($dec !== '' ? ',' . $dec : '');
    return ($neg ? '−' : '') . $out . ($unit ? ' ' . $unit : '');
}

function pct(mixed $value, int $decimals = 1): string
{
    return number_format((float) $value, $decimals, ',', '.') . ' %';
}

/** Convierte un DATETIME UTC a la zona de la empresa. */
function local_dt(?string $utc): ?DateTimeImmutable
{
    if (!$utc) {
        return null;
    }
    $tz = new DateTimeZone((string) Config::get('app.timezone', 'America/Bogota'));
    return (new DateTimeImmutable($utc, new DateTimeZone('UTC')))->setTimezone($tz);
}

function fmt_dt(?string $utc, string $format = 'd/m/Y H:i'): string
{
    $d = local_dt($utc);
    return $d ? $d->format($format) : '—';
}

function fmt_date(?string $utc): string
{
    return fmt_dt($utc, 'd/m/Y');
}

/** Fecha relativa breve en español. */
function time_ago(?string $utc): string
{
    if (!$utc) {
        return '—';
    }
    $diff = time() - (new DateTimeImmutable($utc, new DateTimeZone('UTC')))->getTimestamp();
    return match (true) {
        $diff < 60 => 'hace un momento',
        $diff < 3600 => 'hace ' . intdiv($diff, 60) . ' min',
        $diff < 86400 => 'hace ' . intdiv($diff, 3600) . ' h',
        $diff < 172800 => 'ayer',
        default => fmt_dt($utc, 'd/m/Y'),
    };
}

/** Hoy en la zona horaria local (Y-m-d). */
function local_today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone((string) Config::get('app.timezone', 'America/Bogota'))))->format('Y-m-d');
}

/**
 * Convierte un rango de fechas locales (Y-m-d, inclusivo) en límites UTC
 * [desde, hasta) para filtrar columnas DATETIME.
 */
function utc_range(string $from, string $to): array
{
    $tz = new DateTimeZone((string) Config::get('app.timezone', 'America/Bogota'));
    $utc = new DateTimeZone('UTC');
    $start = (new DateTimeImmutable($from . ' 00:00:00', $tz))->setTimezone($utc);
    $end = (new DateTimeImmutable($to . ' 00:00:00', $tz))->modify('+1 day')->setTimezone($utc);
    return [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')];
}

/** Desplazamiento horario local para CONVERT_TZ en SQL, p. ej. '-05:00'. */
function tz_offset(): string
{
    $tz = new DateTimeZone((string) Config::get('app.timezone', 'America/Bogota'));
    return (new DateTimeImmutable('now', $tz))->format('P');
}

function old(string $key, mixed $default = ''): mixed
{
    $old = Session::get('_old', []);
    return $old[$key] ?? $default;
}

function field_error(string $key): ?string
{
    $errors = Session::get('_errors', []);
    return $errors[$key] ?? null;
}

/** Ícono del sprite SVG. */
function icon(string $name, string $class = ''): string
{
    return '<svg class="icon ' . e($class) . '" aria-hidden="true" focusable="false"><use href="#i-' . e($name) . '"></use></svg>';
}

/** Iniciales para avatares. */
function initials(string $name): string
{
    $parts = preg_split('/\s+/', trim($name)) ?: [];
    $out = '';
    foreach (array_slice($parts, 0, 2) as $p) {
        $out .= mb_strtoupper(mb_substr($p, 0, 1));
    }
    return $out ?: '·';
}

/** Etiqueta y tono visual de un estado. */
function status_badge(string $status): string
{
    static $map = [
        'completed' => ['Completada', 'success'], 'voided' => ['Anulada', 'danger'],
        'open' => ['Abierta', 'success'], 'closed' => ['Cerrada', 'neutral'], 'approved' => ['Aprobada', 'gold'],
        'requested' => ['Solicitada', 'warning'], 'in_transit' => ['En tránsito', 'info'],
        'received' => ['Recibida', 'success'], 'received_with_differences' => ['Con diferencias', 'danger'],
        'resolved' => ['Resuelta', 'neutral'], 'rejected' => ['Rechazada', 'danger'], 'cancelled' => ['Cancelada', 'neutral'],
        'draft' => ['Borrador', 'neutral'], 'ordered' => ['Ordenada', 'info'], 'partial' => ['Recepción parcial', 'warning'],
        'pending' => ['Pendiente', 'warning'], 'used' => ['Utilizada', 'neutral'], 'expired' => ['Vencida', 'neutral'],
        'active' => ['Activo', 'success'], 'inactive' => ['Inactivo', 'neutral'],
    ];
    [$label, $tone] = $map[$status] ?? [ucfirst($status), 'neutral'];
    return '<span class="badge badge-' . $tone . '">' . e($label) . '</span>';
}

function movement_label(string $type): string
{
    return [
        'initial' => 'Inventario inicial', 'entry' => 'Entrada de mercancía', 'purchase_receipt' => 'Recepción de compra',
        'supplier_return' => 'Devolución a proveedor', 'sale' => 'Venta', 'sale_void' => 'Anulación de venta',
        'customer_return' => 'Devolución de cliente', 'transfer_out' => 'Transferencia (salida)',
        'transfer_in' => 'Transferencia (entrada)', 'transfer_return' => 'Retorno de transferencia',
        'adjustment' => 'Ajuste', 'count' => 'Conteo físico', 'waste' => 'Merma / pérdida',
    ][$type] ?? $type;
}

/** Query string actual con cambios, para enlaces de filtros y paginación. */
function query_with(array $changes): string
{
    $q = array_merge($_GET, $changes);
    $q = array_filter($q, static fn ($v) => $v !== null && $v !== '');
    return $q ? '?' . http_build_query($q) : '?';
}

<?php

declare(strict_types=1);

/** Pesos colombianos sin decimales: $24.000 */
function money(float|int|string|null $amount): string
{
    $value = (float) ($amount ?? 0);
    $formatted = number_format(abs(round($value)), 0, ',', '.');
    return ($value < 0 ? '-$' : '$') . $formatted;
}

function percent(float $value): string
{
    return number_format($value, 0, ',', '.') . '%';
}

function date_es(?string $datetime, bool $withTime = false): string
{
    if (!$datetime) {
        return '—';
    }
    $ts = strtotime($datetime);
    if ($ts === false) {
        return '—';
    }
    $months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    $out = date('j', $ts) . ' ' . $months[(int) date('n', $ts) - 1] . ' ' . date('Y', $ts);
    if ($withTime) {
        $out .= ', ' . date('g:i a', $ts);
    }
    return $out;
}

function number_es(int|float $value): string
{
    return number_format($value, 0, ',', '.');
}

function order_status_label(string $status): string
{
    return App\Models\Order::STATUSES[$status] ?? $status;
}

function payment_status_label(string $status): string
{
    return App\Models\Order::PAYMENT_STATUSES[$status] ?? $status;
}

function movement_type_label(string $type): string
{
    return App\Models\InventoryMovement::TYPES[$type] ?? $type;
}

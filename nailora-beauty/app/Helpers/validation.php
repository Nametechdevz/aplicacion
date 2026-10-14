<?php

declare(strict_types=1);

/**
 * Normaliza un celular colombiano a formato internacional sin signos: 573001234567.
 * Acepta "300 123 4567", "+57 300-123-4567", "573001234567". Devuelve null si no es válido.
 */
function normalize_phone_co(string $phone): ?string
{
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    if (strlen($digits) === 12 && str_starts_with($digits, '57')) {
        $digits = substr($digits, 2);
    }
    // Celulares (3xx) o fijos con indicativo nacional (60x) de 10 dígitos
    if (strlen($digits) === 10 && preg_match('/^(3\d{9}|60\d{8})$/', $digits)) {
        return '57' . $digits;
    }
    return null;
}

/** Número para enlaces wa.me: solo dígitos con indicativo de país. */
function normalize_whatsapp(string $number): ?string
{
    $digits = preg_replace('/\D+/', '', $number) ?? '';
    if ($digits === '') {
        return null;
    }
    if (strlen($digits) === 10 && str_starts_with($digits, '3')) {
        $digits = '57' . $digits;
    }
    return (strlen($digits) >= 11 && strlen($digits) <= 15) ? $digits : null;
}

function format_phone(?string $phone): string
{
    $digits = preg_replace('/\D+/', '', (string) $phone) ?? '';
    if (strlen($digits) === 12 && str_starts_with($digits, '57')) {
        return '+57 ' . substr($digits, 2, 3) . ' ' . substr($digits, 5, 3) . ' ' . substr($digits, 8);
    }
    return (string) $phone;
}

/** Convierte "24.000", "24000", "24,000.50" en número. Los precios en COP se manejan como enteros. */
function parse_money(mixed $value): ?float
{
    if ($value === null) {
        return null;
    }
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    $value = str_replace(['$', ' ', '.'], '', $value);
    $value = str_replace(',', '.', $value);
    return is_numeric($value) ? round((float) $value, 2) : null;
}

function clean_text(?string $value, int $max = 255): string
{
    $value = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $value) ?? '');
    return mb_substr($value, 0, $max);
}

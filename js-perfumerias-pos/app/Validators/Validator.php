<?php
declare(strict_types=1);

namespace App\Validators;

use App\Core\ValidationException;
use App\Support\Dec;

/**
 * Validación del lado del servidor con mensajes en español orientados a
 * explicar cómo corregir el dato.
 *
 *   $data = Validator::make($input, [
 *       'name'  => 'required|string|max:120',
 *       'price' => 'required|decimal:2|min:0',
 *   ], ['name' => 'nombre']);
 */
final class Validator
{
    public static function make(array $input, array $rules, array $labels = []): array
    {
        $errors = [];
        $clean = [];
        foreach ($rules as $field => $ruleString) {
            $rulesList = is_array($ruleString) ? $ruleString : explode('|', $ruleString);
            $label = $labels[$field] ?? str_replace('_', ' ', $field);
            $value = $input[$field] ?? null;
            if (is_string($value)) {
                $value = trim($value);
            }
            $present = !($value === null || $value === '' || $value === []);

            if (!$present) {
                if (in_array('required', $rulesList, true)) {
                    $errors[$field] = "Indique $label.";
                } elseif (in_array('bool', $rulesList, true)) {
                    $clean[$field] = 0;
                } else {
                    $clean[$field] = null;
                }
                continue;
            }

            $error = null;
            foreach ($rulesList as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $error = self::check($name, $arg, $value, $label, $input);
                if ($error !== null) {
                    break;
                }
                if ($name === 'int') {
                    $value = (int) $value;
                } elseif ($name === 'decimal') {
                    $value = Dec::norm(str_replace(',', '.', (string) $value), (int) ($arg ?? 2));
                } elseif ($name === 'bool') {
                    $value = in_array($value, [1, '1', true, 'on', 'true'], true) ? 1 : 0;
                } elseif ($name === 'email') {
                    $value = mb_strtolower((string) $value);
                }
            }
            if ($error !== null) {
                $errors[$field] = $error;
                continue;
            }
            $clean[$field] = $value;
        }
        if ($errors) {
            throw new ValidationException('Revise los campos marcados.', $errors);
        }
        return $clean;
    }

    private static function check(string $name, ?string $arg, mixed $value, string $label, array $input): ?string
    {
        switch ($name) {
            case 'required':
            case 'nullable':
                return null;
            case 'string':
                return is_scalar($value) ? null : "El campo $label no es válido.";
            case 'max':
                if (is_numeric($value) && !is_string($value)) {
                    return $value > (float) $arg ? "$label no puede ser mayor que $arg." : null;
                }
                return mb_strlen((string) $value) > (int) $arg ? "$label admite como máximo $arg caracteres." : null;
            case 'min':
                if (Dec::isValid((string) $value)) {
                    return Dec::cmp((string) $value, (string) $arg) < 0 ? "$label debe ser como mínimo $arg." : null;
                }
                return mb_strlen((string) $value) < (int) $arg ? "$label debe tener al menos $arg caracteres." : null;
            case 'maxval':
                return Dec::cmp((string) $value, (string) $arg) > 0 ? "$label no puede superar $arg." : null;
            case 'gt':
                return Dec::cmp((string) $value, (string) $arg) <= 0 ? "$label debe ser mayor que $arg." : null;
            case 'int':
                return is_scalar($value) && preg_match('/^-?\d+$/', (string) $value) ? null : "$label debe ser un número entero.";
            case 'decimal':
                $str = str_replace(',', '.', (string) $value);
                if (!Dec::isValid($str)) {
                    return "$label debe ser un número válido (use punto como separador decimal).";
                }
                return Dec::decimals($str) > (int) ($arg ?? 2) ? "$label admite como máximo {$arg} decimales." : null;
            case 'email':
                return filter_var($value, FILTER_VALIDATE_EMAIL) ? null : "Escriba un correo electrónico válido para $label.";
            case 'in':
                return in_array((string) $value, explode(',', (string) $arg), true) ? null : "Seleccione una opción válida para $label.";
            case 'date':
                $d = \DateTimeImmutable::createFromFormat('Y-m-d', (string) $value);
                return $d && $d->format('Y-m-d') === $value ? null : "$label debe ser una fecha válida.";
            case 'bool':
                return null;
            case 'regex':
                return preg_match((string) $arg, (string) $value) ? null : "El formato de $label no es válido.";
            case 'code':
                return preg_match('/^[A-Za-z0-9_\-.]+$/', (string) $value) ? null : "$label solo admite letras, números, guiones y puntos.";
            case 'confirmed':
                return ($input[$arg ?? ''] ?? null) === $value ? null : 'La confirmación no coincide.';
            case 'password':
                $ok = mb_strlen((string) $value) >= 10 && preg_match('/[A-Za-z]/', (string) $value) && preg_match('/\d/', (string) $value);
                return $ok ? null : 'La contraseña debe tener al menos 10 caracteres e incluir letras y números.';
            default:
                throw new \LogicException("Regla desconocida: $name");
        }
    }

    /** Normaliza una cantidad decimal recibida del navegador. */
    public static function quantity(mixed $value, int $precision, string $label = 'la cantidad'): string
    {
        $str = str_replace(',', '.', trim((string) $value));
        if (!Dec::isValid($str) || !Dec::isPositive($str)) {
            throw new ValidationException("Indique $label como un número mayor que cero.");
        }
        if (Dec::decimals($str) > $precision) {
            throw new ValidationException($precision === 0
                ? "Este producto se vende por unidades completas; $label no admite decimales."
                : "Este producto admite como máximo $precision decimales en $label.");
        }
        return Dec::norm($str, 3);
    }

    public static function money(mixed $value, string $label = 'el valor', bool $allowZero = true): string
    {
        $str = str_replace(',', '.', trim((string) $value));
        if (!Dec::isValid($str) || Dec::isNegative($str) || (!$allowZero && Dec::isZero($str))) {
            throw new ValidationException("Indique $label como un valor válido.");
        }
        if (Dec::decimals($str) > 2) {
            throw new ValidationException("$label admite como máximo 2 decimales.");
        }
        return Dec::norm($str, 2);
    }
}

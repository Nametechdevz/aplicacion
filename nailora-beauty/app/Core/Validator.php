<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Validador sencillo. Reglas: required, string, int, numeric, min:n, max:n,
 * email, in:a,b,c, phone_co, slug, date, datetime, bool, url.
 * Para string, min/max miden caracteres; para int/numeric, valor.
 */
final class Validator
{
    private array $errors = [];
    private array $clean = [];

    public function __construct(private array $data, private array $rules, private array $labels = [])
    {
    }

    public static function make(array $data, array $rules, array $labels = []): self
    {
        $v = new self($data, $rules, $labels);
        $v->run();
        return $v;
    }

    private function run(): void
    {
        foreach ($this->rules as $field => $ruleString) {
            $rules = is_array($ruleString) ? $ruleString : explode('|', $ruleString);
            $raw = $this->data[$field] ?? null;
            $value = is_string($raw) ? trim($raw) : $raw;
            $label = $this->labels[$field] ?? str_replace('_', ' ', $field);
            $isNumeric = in_array('int', $rules, true) || in_array('numeric', $rules, true);

            if (in_array('bool', $rules, true)) {
                $this->clean[$field] = in_array($value, ['1', 1, true, 'on', 'true'], true) ? 1 : 0;
                continue;
            }

            if ($value === null || $value === '' || (is_array($value) && !$value)) {
                if (in_array('required', $rules, true)) {
                    $this->errors[$field] = "El campo $label es obligatorio.";
                }
                $this->clean[$field] = null;
                continue;
            }

            if (is_array($value) && !in_array('array', $rules, true)) {
                $this->errors[$field] = "El campo $label no es válido.";
                continue;
            }

            foreach ($rules as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $error = match ($name) {
                    'int' => filter_var($value, FILTER_VALIDATE_INT) === false ? "El campo $label debe ser un número entero." : null,
                    'numeric' => !is_numeric(str_replace(',', '.', (string) $value)) ? "El campo $label debe ser un número." : null,
                    'min' => $isNumeric
                        ? ((float) str_replace(',', '.', (string) $value) < (float) $arg ? "El campo $label debe ser como mínimo $arg." : null)
                        : (mb_strlen((string) $value) < (int) $arg ? "El campo $label debe tener al menos $arg caracteres." : null),
                    'max' => $isNumeric
                        ? ((float) str_replace(',', '.', (string) $value) > (float) $arg ? "El campo $label no puede superar $arg." : null)
                        : (mb_strlen((string) $value) > (int) $arg ? "El campo $label no puede superar $arg caracteres." : null),
                    'email' => filter_var($value, FILTER_VALIDATE_EMAIL) === false ? "Ingrese un correo electrónico válido." : null,
                    'in' => !in_array((string) $value, explode(',', (string) $arg), true) ? "Seleccione una opción válida para $label." : null,
                    'phone_co' => normalize_phone_co((string) $value) === null ? "Ingrese un número de celular colombiano válido (10 dígitos)." : null,
                    'slug' => !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', (string) $value) ? "El campo $label solo admite minúsculas, números y guiones." : null,
                    'date' => !self::validDate((string) $value, 'Y-m-d') ? "Ingrese una fecha válida en $label." : null,
                    'datetime' => !self::validDate(str_replace('T', ' ', (string) $value), 'Y-m-d H:i') ? "Ingrese una fecha y hora válidas en $label." : null,
                    'url' => filter_var($value, FILTER_VALIDATE_URL) === false || !preg_match('#^https?://#i', (string) $value) ? "Ingrese una URL válida (https://...) en $label." : null,
                    default => null,
                };
                if ($error !== null) {
                    $this->errors[$field] = $error;
                    break;
                }
            }

            if (!isset($this->errors[$field])) {
                $this->clean[$field] = match (true) {
                    in_array('int', $rules, true) => (int) $value,
                    in_array('numeric', $rules, true) => (float) str_replace(',', '.', (string) $value),
                    in_array('datetime', $rules, true) => str_replace('T', ' ', (string) $value) . (strlen((string) $value) === 16 ? ':00' : ''),
                    default => $value,
                };
            }
        }
    }

    private static function validDate(string $value, string $format): bool
    {
        $value = substr($value, 0, strlen(date($format)));
        $d = \DateTime::createFromFormat($format, $value);
        return $d !== false && $d->format($format) === $value;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public function addError(string $field, string $message): void
    {
        $this->errors[$field] = $message;
    }

    public function validated(): array
    {
        return $this->clean;
    }
}

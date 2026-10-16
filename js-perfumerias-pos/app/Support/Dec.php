<?php
declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use OverflowException;

/**
 * Aritmética decimal de punto fijo sobre cadenas, sin FLOAT.
 * Los valores se representan como enteros escalados (10^escala) y el
 * redondeo es "half up" (alejándose de cero), como se usa en facturación.
 *
 *   Dec::mul('35', '1250.00', 2)  => '43750.00'
 *   Dec::sub('1000.000', '35', 3) => '965.000'
 */
final class Dec
{
    private const MAX_SCALE = 8;

    public static function isValid(mixed $value): bool
    {
        if (is_int($value)) {
            return true;
        }
        return is_string($value) && preg_match('/^-?\d{1,15}(\.\d{1,8})?$/', trim($value)) === 1;
    }

    /** Normaliza a una cadena con la escala indicada. */
    public static function norm(mixed $value, int $scale = 2): string
    {
        [$int, $s] = self::parse($value);
        return self::format(self::rescale($int, $s, $scale), $scale);
    }

    public static function add(mixed $a, mixed $b, int $scale = 2): string
    {
        [$ia, $sa] = self::parse($a);
        [$ib, $sb] = self::parse($b);
        $s = max($sa, $sb);
        $sum = self::checked(self::rescale($ia, $sa, $s) + self::rescale($ib, $sb, $s));
        return self::format(self::rescale($sum, $s, $scale), $scale);
    }

    public static function sub(mixed $a, mixed $b, int $scale = 2): string
    {
        return self::add($a, self::neg($b), $scale);
    }

    public static function mul(mixed $a, mixed $b, int $scale = 2): string
    {
        [$ia, $sa] = self::parse($a);
        [$ib, $sb] = self::parse($b);
        $product = self::checked($ia * $ib);
        return self::format(self::rescale($product, $sa + $sb, $scale), $scale);
    }

    public static function div(mixed $a, mixed $b, int $scale = 2): string
    {
        [$ia, $sa] = self::parse($a);
        [$ib, $sb] = self::parse($b);
        if ($ib === 0) {
            throw new InvalidArgumentException('División por cero');
        }
        // resultado = (ia / 10^sa) / (ib / 10^sb) escalado a 10^scale
        $exp = $scale + $sb - $sa;
        $num = $ia;
        $den = $ib;
        if ($exp >= 0) {
            $num = self::checked($num * (10 ** $exp));
        } else {
            $den = self::checked($den * (10 ** -$exp));
        }
        return self::format(self::roundDiv($num, $den), $scale);
    }

    /** Porcentaje que representa $part sobre $whole (0..100). */
    public static function percentOf(mixed $part, mixed $whole, int $scale = 4): string
    {
        if (self::isZero($whole)) {
            return self::norm('0', $scale);
        }
        return self::div(self::mul($part, '100', 6), $whole, $scale);
    }

    /** Aplica un porcentaje: $amount * $pct / 100. */
    public static function pct(mixed $amount, mixed $pct, int $scale = 2): string
    {
        return self::div(self::mul($amount, $pct, 6), '100', $scale);
    }

    public static function cmp(mixed $a, mixed $b): int
    {
        [$ia, $sa] = self::parse($a);
        [$ib, $sb] = self::parse($b);
        $s = max($sa, $sb);
        return self::rescale($ia, $sa, $s) <=> self::rescale($ib, $sb, $s);
    }

    public static function isZero(mixed $a): bool
    {
        return self::cmp($a, '0') === 0;
    }

    public static function isNegative(mixed $a): bool
    {
        return self::cmp($a, '0') < 0;
    }

    public static function isPositive(mixed $a): bool
    {
        return self::cmp($a, '0') > 0;
    }

    public static function neg(mixed $a): string
    {
        [$i, $s] = self::parse($a);
        return self::format(-$i, $s);
    }

    public static function abs(mixed $a): string
    {
        [$i, $s] = self::parse($a);
        return self::format(abs($i), $s);
    }

    public static function min(mixed $a, mixed $b): string
    {
        return self::cmp($a, $b) <= 0 ? (string) $a : (string) $b;
    }

    public static function max(mixed $a, mixed $b): string
    {
        return self::cmp($a, $b) >= 0 ? (string) $a : (string) $b;
    }

    /** Suma una lista de valores. */
    public static function sum(iterable $values, int $scale = 2): string
    {
        $total = self::norm('0', $scale);
        foreach ($values as $v) {
            $total = self::add($total, $v, $scale);
        }
        return $total;
    }

    /** Número de decimales significativos de un valor (sin ceros finales). */
    public static function decimals(mixed $value): int
    {
        $str = is_int($value) ? (string) $value : trim((string) $value);
        if (!str_contains($str, '.')) {
            return 0;
        }
        return strlen(rtrim(explode('.', $str)[1], '0'));
    }

    // -----------------------------------------------------------------

    /** @return array{0:int,1:int} entero escalado y escala */
    private static function parse(mixed $value): array
    {
        if (is_int($value)) {
            return [$value, 0];
        }
        if (is_float($value)) {
            throw new InvalidArgumentException('Dec no acepta FLOAT; use cadenas decimales');
        }
        $str = trim((string) $value);
        if ($str === '' || !preg_match('/^(-)?(\d+)(?:\.(\d+))?$/', $str, $m)) {
            throw new InvalidArgumentException("Valor decimal inválido: '$str'");
        }
        $frac = $m[3] ?? '';
        if (strlen($frac) > self::MAX_SCALE) {
            $frac = substr($frac, 0, self::MAX_SCALE + 1);
            $int = (int) ($m[2] . $frac);
            $int = self::rescale($int, strlen($frac), self::MAX_SCALE);
            return [($m[1] ?? '') === '-' ? -$int : $int, self::MAX_SCALE];
        }
        if (strlen($m[2]) + strlen($frac) > 18) {
            throw new OverflowException('Valor decimal fuera de rango');
        }
        $int = (int) ($m[2] . $frac);
        return [($m[1] ?? '') === '-' ? -$int : $int, strlen($frac)];
    }

    private static function rescale(int $value, int $from, int $to): int
    {
        if ($to === $from) {
            return $value;
        }
        if ($to > $from) {
            return self::checked($value * (10 ** ($to - $from)));
        }
        return self::roundDiv($value, 10 ** ($from - $to));
    }

    /** División entera con redondeo half-up (alejándose de cero). */
    private static function roundDiv(int $num, int $den): int
    {
        if ($den < 0) {
            $num = -$num;
            $den = -$den;
        }
        $q = intdiv($num, $den);
        $r = $num % $den;
        if (2 * abs($r) >= $den) {
            $q += $num < 0 ? -1 : 1;
        }
        return $q;
    }

    private static function checked(int|float $value): int
    {
        if (is_float($value)) {
            throw new OverflowException('Desbordamiento en cálculo decimal');
        }
        return $value;
    }

    private static function format(int $value, int $scale): string
    {
        $neg = $value < 0;
        $digits = (string) abs($value);
        if ($scale > 0) {
            $digits = str_pad($digits, $scale + 1, '0', STR_PAD_LEFT);
            $digits = substr($digits, 0, -$scale) . '.' . substr($digits, -$scale);
        }
        return ($neg && trim($digits, '0.') !== '' ? '-' : '') . $digits;
    }
}

<?php
namespace App\Services;

/** Convierte valores a letras en español (para "valor en letras" de la factura). */
class NumberToWords
{
    private const UNITS = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
        'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
        'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    private const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    private const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    public static function pesos(float $amount): string
    {
        $int = (int) floor(round($amount, 2));
        $cents = (int) round(($amount - $int) * 100);
        $words = $int === 0 ? 'CERO' : self::convert($int);
        $suffix = $int === 1 ? ' PESO' : (($int % 1000000 === 0 && $int > 0) ? ' DE PESOS' : ' PESOS');
        $out = trim($words) . $suffix;
        if ($cents > 0) {
            $out .= ' CON ' . self::convert($cents) . ' CENTAVOS';
        }
        return $out . ' M/CTE';
    }

    private static function convert(int $n): string
    {
        if ($n >= 1000000) {
            $m = intdiv($n, 1000000);
            $rest = $n % 1000000;
            return ($m === 1 ? 'UN MILLÓN' : self::convert($m) . ' MILLONES') . ($rest ? ' ' . self::convert($rest) : '');
        }
        if ($n >= 1000) {
            $t = intdiv($n, 1000);
            $rest = $n % 1000;
            return ($t === 1 ? 'MIL' : self::convert($t) . ' MIL') . ($rest ? ' ' . self::convert($rest) : '');
        }
        if ($n >= 100) {
            if ($n === 100) {
                return 'CIEN';
            }
            $rest = $n % 100;
            return self::HUNDREDS[intdiv($n, 100)] . ($rest ? ' ' . self::convert($rest) : '');
        }
        if ($n < 30) {
            return self::UNITS[$n];
        }
        $u = $n % 10;
        return self::TENS[intdiv($n, 10)] . ($u ? ' Y ' . self::UNITS[$u] : '');
    }
}

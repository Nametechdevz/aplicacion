<?php
namespace App\Services;

use App\Core\DB;
use RuntimeException;

class Numbering
{
    /**
     * Reserva el siguiente consecutivo. Debe llamarse dentro de una transacción.
     * @return array{range: array, number: int, full_number: string}
     */
    public static function next(string $docType): array
    {
        $range = DB::one(
            'SELECT * FROM numbering_ranges
              WHERE doc_type = ? AND active = 1 AND current_number < to_number
                AND (valid_to IS NULL OR valid_to >= CURDATE())
                AND (valid_from IS NULL OR valid_from <= CURDATE())
              ORDER BY id LIMIT 1 FOR UPDATE',
            [$docType]
        );
        if (!$range) {
            $names = ['FEV' => 'factura electrónica', 'POS' => 'documento equivalente POS', 'NC' => 'nota crédito'];
            throw new RuntimeException('No hay una resolución de numeración vigente para ' . ($names[$docType] ?? $docType) . '. Configúrala en Configuración → Resoluciones.');
        }
        $number = max((int) $range['current_number'] + 1, (int) $range['from_number']);
        DB::update('numbering_ranges', ['current_number' => $number], 'id = ?', [$range['id']]);
        return ['range' => $range, 'number' => $number, 'full_number' => $range['prefix'] . $number];
    }
}

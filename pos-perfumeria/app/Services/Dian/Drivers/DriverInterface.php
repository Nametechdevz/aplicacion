<?php
namespace App\Services\Dian\Drivers;

interface DriverInterface
{
    /**
     * Envía el documento. Debe devolver:
     *  ['status' => 'aceptado'|'rechazado'|'error'|'pendiente', 'track_id' => ?string, 'message' => string, 'uuid' => ?string]
     *  Si el proveedor devuelve su propio CUFE/CUDE se retorna en 'uuid' y reemplaza al calculado.
     */
    public function send(array $payload, string $xml): array;
}

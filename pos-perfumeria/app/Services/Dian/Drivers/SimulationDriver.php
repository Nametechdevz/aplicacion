<?php
namespace App\Services\Dian\Drivers;

/**
 * Modo simulación: valida la estructura localmente y marca el documento como
 * aceptado SIN enviarlo a la DIAN. Útil para capacitar personal y probar el POS.
 */
class SimulationDriver implements DriverInterface
{
    public function send(array $payload, string $xml): array
    {
        $errors = [];
        if (!preg_match('/^\d{5,15}$/', $payload['issuer']['doc_number'] ?? '')) {
            $errors[] = 'NIT del emisor inválido.';
        }
        if (empty($payload['issuer']['city_code'])) {
            $errors[] = 'Falta el código DANE del municipio del emisor.';
        }
        if (strlen($payload['uuid']) !== 96) {
            $errors[] = 'CUFE/CUDE inválido.';
        }
        if ($payload['kind'] === 'FEV' && empty($payload['customer']['email'])) {
            $errors[] = 'El adquiriente no tiene correo electrónico.';
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            $errors[] = 'XML mal formado.';
        }
        $sum = round(array_sum(array_column($payload['lines'], 'base')), 2);
        if (abs($sum - $payload['totals']['line_extension']) > 0.05) {
            $errors[] = 'La suma de las líneas no coincide con el subtotal.';
        }

        if ($errors) {
            return ['status' => 'rechazado', 'track_id' => null, 'message' => implode(' ', $errors)];
        }
        return [
            'status'   => 'aceptado',
            'track_id' => 'SIM-' . strtoupper(substr($payload['uuid'], 0, 12)),
            'message'  => 'Documento validado en MODO SIMULACIÓN (no fue enviado a la DIAN).',
        ];
    }
}

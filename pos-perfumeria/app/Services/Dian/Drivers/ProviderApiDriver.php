<?php
namespace App\Services\Dian\Drivers;

use App\Core\Settings;

/**
 * Conector genérico para un Proveedor Tecnológico autorizado por la DIAN.
 *
 * Envía por HTTP POST (JSON) el payload normalizado + el XML UBL en base64 al
 * endpoint configurado en Configuración → Facturación electrónica.
 * El proveedor se encarga de firmar (certificado digital), enviar a la DIAN,
 * y devolver el resultado de validación.
 *
 * Cada proveedor tiene su propio formato: ajusta mapRequest()/mapResponse()
 * según la documentación del proveedor que contrates.
 */
class ProviderApiDriver implements DriverInterface
{
    public function send(array $payload, string $xml): array
    {
        $url = trim((string) Settings::get('dian_provider_url'));
        $token = trim((string) Settings::get('dian_provider_token'));
        if ($url === '') {
            return ['status' => 'error', 'track_id' => null, 'message' => 'No se ha configurado la URL del proveedor tecnológico.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER     => array_filter([
                'Content-Type: application/json',
                'Accept: application/json',
                $token !== '' ? 'Authorization: Bearer ' . $token : null,
            ]),
            CURLOPT_POSTFIELDS     => json_encode($this->mapRequest($payload, $xml), JSON_UNESCAPED_UNICODE),
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return ['status' => 'error', 'track_id' => null, 'message' => 'No se pudo conectar con el proveedor: ' . $err];
        }
        return $this->mapResponse($code, (string) $body);
    }

    protected function mapRequest(array $payload, string $xml): array
    {
        return [
            'document_type' => $payload['kind'],          // FEV | POS | NC
            'number'        => $payload['number'],
            'uuid'          => $payload['uuid'],
            'environment'   => $payload['environment'],
            'test_set_id'   => Settings::get('dian_test_set_id'),
            'xml_base64'    => base64_encode($xml),
            'data'          => $payload,
        ];
    }

    protected function mapResponse(int $httpCode, string $body): array
    {
        $json = json_decode($body, true);
        if (!is_array($json)) {
            return ['status' => 'error', 'track_id' => null, 'message' => "Respuesta inválida del proveedor (HTTP $httpCode): " . mb_substr($body, 0, 500)];
        }
        $valid = $json['is_valid'] ?? $json['success'] ?? $json['valid'] ?? ($httpCode >= 200 && $httpCode < 300);
        $message = $json['message'] ?? $json['status_message'] ?? $json['StatusMessage'] ?? json_encode($json, JSON_UNESCAPED_UNICODE);
        if (!empty($json['errors'])) {
            $message .= ' | ' . (is_array($json['errors']) ? implode(' | ', array_map(fn($e) => is_string($e) ? $e : json_encode($e, JSON_UNESCAPED_UNICODE), $json['errors'])) : $json['errors']);
        }
        return [
            'status'   => $httpCode >= 500 ? 'error' : ($valid ? 'aceptado' : 'rechazado'),
            'track_id' => $json['track_id'] ?? $json['zip_key'] ?? $json['id'] ?? null,
            'uuid'     => $json['cufe'] ?? $json['cude'] ?? $json['uuid'] ?? null,
            'message'  => (string) $message,
        ];
    }
}

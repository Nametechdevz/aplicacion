<?php
namespace App\Services\Dian;

/**
 * Códigos únicos DIAN (Anexo Técnico Factura Electrónica de Venta v1.9 y
 * Anexo Técnico Documento Equivalente Electrónico).
 *
 *  CUFE = SHA-384(NumFac + FecFac + HorFac + ValFac + 01 + ValImp1 + 04 + ValImp2 + 03 + ValImp3 + ValTot + NitOFE + NumAdq + ClTec + TipoAmbiente)
 *  CUDE = igual, pero en lugar de la clave técnica se usa el PIN del software.
 */
class Cufe
{
    public static function amount(float $v): string
    {
        return number_format($v, 2, '.', '');
    }

    /**
     * @param array $taxes ['01' => IVA, '04' => INC, '03' => ICA]
     */
    public static function build(
        string $number,
        string $date,
        string $time,
        float $lineExtension,
        array $taxes,
        float $payable,
        string $issuerNit,
        string $buyerDoc,
        string $keyOrPin,
        string $environment
    ): string {
        $raw = $number . $date . $time . self::amount($lineExtension)
            . '01' . self::amount($taxes['01'] ?? 0)
            . '04' . self::amount($taxes['04'] ?? 0)
            . '03' . self::amount($taxes['03'] ?? 0)
            . self::amount($payable)
            . $issuerNit . $buyerDoc . $keyOrPin . $environment;
        return hash('sha384', $raw);
    }

    /** SoftwareSecurityCode = SHA-384(SoftwareID + PIN + NúmeroDocumento) */
    public static function softwareSecurityCode(string $softwareId, string $pin, string $number): string
    {
        return hash('sha384', $softwareId . $pin . $number);
    }

    public static function qrUrl(string $uuid, string $environment): string
    {
        $host = $environment === '1' ? 'https://catalogo-vpfe.dian.gov.co' : 'https://catalogo-vpfe-hab.dian.gov.co';
        return $host . '/document/searchqr?documentkey=' . $uuid;
    }
}

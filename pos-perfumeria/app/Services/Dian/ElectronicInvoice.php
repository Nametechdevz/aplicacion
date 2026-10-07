<?php
namespace App\Services\Dian;

use App\Core\DB;
use App\Core\Settings;
use App\Services\Calculator;
use App\Services\Dian\Drivers\DriverInterface;
use App\Services\Dian\Drivers\ProviderApiDriver;
use App\Services\Dian\Drivers\SimulationDriver;
use RuntimeException;

/**
 * Orquesta la emisión de documentos electrónicos DIAN:
 * arma el payload → calcula CUFE/CUDE → genera XML UBL 2.1 → lo guarda → lo envía con el driver configurado.
 */
class ElectronicInvoice
{
    public static function driver(): DriverInterface
    {
        return match (Settings::get('dian_driver', 'simulacion')) {
            'proveedor' => new ProviderApiDriver(),
            default     => new SimulationDriver(),
        };
    }

    public static function issueForSale(int $saleId): array
    {
        return self::emit(self::payloadForSale($saleId), ['sale_id' => $saleId]);
    }

    public static function issueForCreditNote(int $creditNoteId): array
    {
        return self::emit(self::payloadForCreditNote($creditNoteId), ['credit_note_id' => $creditNoteId]);
    }

    public static function retry(int $docId): array
    {
        $doc = DB::one('SELECT * FROM electronic_documents WHERE id = ?', [$docId]);
        if (!$doc) {
            throw new RuntimeException('Documento no encontrado.');
        }
        if ($doc['status'] === 'aceptado') {
            throw new RuntimeException('El documento ya fue aceptado.');
        }
        return $doc['sale_id'] ? self::issueForSale((int) $doc['sale_id']) : self::issueForCreditNote((int) $doc['credit_note_id']);
    }

    private static function emit(array $payload, array $owner): array
    {
        $key = array_key_first($owner);
        $existing = DB::one("SELECT * FROM electronic_documents WHERE $key = ?", [$owner[$key]]);
        if ($existing && $existing['status'] === 'aceptado') {
            return $existing;
        }

        $xml = (new UblBuilder())->build($payload);
        $dir = 'xml/' . date('Y/m', strtotime($payload['issue_date']));
        if (!is_dir(BASE_PATH . '/storage/' . $dir)) {
            mkdir(BASE_PATH . '/storage/' . $dir, 0775, true);
        }
        $relPath = $dir . '/' . preg_replace('/[^A-Za-z0-9_-]/', '', $payload['number']) . '.xml';
        file_put_contents(BASE_PATH . '/storage/' . $relPath, $xml);

        $driverName = Settings::get('dian_driver', 'simulacion');
        $base = [
            'doc_kind'    => $payload['kind'],
            'full_number' => $payload['number'],
            'uuid'        => $payload['uuid'],
            'qr_data'     => $payload['qr'],
            'xml_path'    => $relPath,
            'environment' => $payload['environment'],
            'driver'      => $driverName,
        ];
        if ($existing) {
            DB::update('electronic_documents', $base + ['status' => 'pendiente'], 'id = ?', [$existing['id']]);
            $docId = (int) $existing['id'];
        } else {
            $docId = DB::insert('electronic_documents', $owner + $base + ['status' => 'pendiente']);
        }

        try {
            $result = self::driver()->send($payload, $xml);
        } catch (\Throwable $e) {
            $result = ['status' => 'error', 'track_id' => null, 'message' => $e->getMessage()];
        }

        $update = [
            'status'   => $result['status'],
            'track_id' => $result['track_id'] ?? null,
            'response' => mb_substr((string) ($result['message'] ?? ''), 0, 60000),
            'sent_at'  => date('Y-m-d H:i:s'),
        ];
        if (!empty($result['uuid']) && strlen($result['uuid']) === 96) {
            $update['uuid'] = $result['uuid'];
        }
        DB::update('electronic_documents', $update, 'id = ?', [$docId]);
        DB::run('UPDATE electronic_documents SET attempts = attempts + 1 WHERE id = ?', [$docId]);

        return DB::one('SELECT * FROM electronic_documents WHERE id = ?', [$docId]);
    }

    // ------------------------------------------------------------------
    //  Payloads
    // ------------------------------------------------------------------

    public static function issuer(): array
    {
        $s = Settings::all();
        return [
            'person_type'          => (int) ($s['company_person_type'] ?? 1),
            'doc_type'             => '31',
            'doc_number'           => preg_replace('/\D/', '', $s['company_nit'] ?? ''),
            'nit'                  => preg_replace('/\D/', '', $s['company_nit'] ?? ''),
            'dv'                   => (string) ($s['company_dv'] ?? ''),
            'name'                 => $s['company_name'] ?? '',
            'trade_name'           => $s['company_trade_name'] ?: ($s['company_name'] ?? ''),
            'tax_regime'           => $s['company_tax_regime'] ?? '48',
            'tax_responsibilities' => $s['company_tax_responsibilities'] ?? 'O-13',
            'address'              => $s['company_address'] ?? '',
            'city_code'            => $s['company_city_code'] ?? '',
            'city_name'            => $s['company_city_name'] ?? '',
            'department'           => $s['company_department'] ?? '',
            'phone'                => $s['company_phone'] ?? '',
            'email'                => $s['company_email'] ?? '',
        ];
    }

    private static function customer(array $c): array
    {
        return [
            'id'                   => (int) $c['id'],
            'person_type'          => (int) $c['person_type'],
            'doc_type'             => $c['doc_type'],
            'doc_number'           => $c['doc_number'],
            'dv'                   => (string) ($c['dv'] ?? ''),
            'name'                 => $c['name'],
            'tax_regime'           => $c['tax_regime'],
            'tax_responsibilities' => $c['tax_responsibilities'] ?: 'R-99-PN',
            'address'              => $c['address'] ?? '',
            'city_code'            => $c['city_code'] ?? '',
            'city_name'            => $c['city_name'] ?? '',
            'department'           => $c['department'] ?? '',
            'phone'                => $c['phone'] ?? '',
            'email'                => $c['email'] ?? '',
        ];
    }

    private static function lines(array $items): array
    {
        $out = [];
        foreach ($items as $it) {
            $rate = (float) $it['tax_rate'];
            $unitBase = round((float) $it['unit_price'] / (1 + $rate / 100), 2);
            $grossBase = round($unitBase * (int) $it['qty'], 2);
            $out[] = [
                'code'         => $it['code'],
                'description'  => $it['description'],
                'qty'          => (int) $it['qty'],
                'unit_price'   => (float) $it['unit_price'],
                'unit_base'    => $unitBase,
                'gross_base'   => $grossBase,
                'allowance'    => max(0, round($grossBase - (float) $it['base'], 2)),
                'discount_pct' => (float) ($it['discount_pct'] ?? 0),
                'tax_rate'     => $rate,
                'base'         => (float) $it['base'],
                'tax'          => (float) $it['tax'],
                'total'        => (float) $it['total'],
            ];
        }
        return $out;
    }

    private static function software(string $number): array
    {
        $id = (string) Settings::get('dian_software_id', '');
        $pin = (string) Settings::get('dian_software_pin', '');
        return ['id' => $id, 'security_code' => Cufe::softwareSecurityCode($id, $pin, $number)];
    }

    private static function paymentMeansCode(array $payments): string
    {
        usort($payments, fn($a, $b) => $b['amount'] <=> $a['amount']);
        return match ($payments[0]['method'] ?? 'efectivo') {
            'efectivo'        => '10',
            'tarjeta_credito' => '48',
            'tarjeta_debito'  => '49',
            'transferencia', 'nequi', 'daviplata' => '47',
            default           => 'ZZZ',
        };
    }

    private static function qr(array $p, string $label): string
    {
        $iva = array_sum(array_column($p['taxes'], 'tax'));
        return implode("\n", [
            'NumFac=' . $p['number'],
            'FecFac=' . $p['issue_date'],
            'HorFac=' . $p['issue_time'],
            'NitFac=' . $p['issuer']['nit'],
            'DocAdq=' . $p['customer']['doc_number'],
            'ValFac=' . Cufe::amount($p['totals']['line_extension']),
            'ValIva=' . Cufe::amount($iva),
            'ValOtroIm=0.00',
            'ValTolFac=' . Cufe::amount($p['totals']['payable']),
            $label . '=' . $p['uuid'],
            'QRCode=' . Cufe::qrUrl($p['uuid'], $p['environment']),
        ]);
    }

    private static function finalize(array $p, string $keyOrPin): array
    {
        $iva = array_sum(array_column($p['taxes'], 'tax'));
        $p['uuid'] = Cufe::build(
            $p['number'],
            $p['issue_date'],
            $p['issue_time'],
            $p['totals']['line_extension'],
            ['01' => $iva],
            $p['totals']['payable'],
            $p['issuer']['nit'],
            $p['customer']['doc_number'],
            $keyOrPin,
            $p['environment']
        );
        $p['qr'] = self::qr($p, $p['uuid_scheme'] === 'CUFE-SHA384' ? 'CUFE' : 'CUDE');
        return $p;
    }

    public static function payloadForSale(int $saleId): array
    {
        $sale = DB::one('SELECT s.*, u.name AS cashier FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [$saleId]);
        if (!$sale) {
            throw new RuntimeException('Venta no encontrada.');
        }
        $items = DB::all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [$saleId]);
        $payments = DB::all('SELECT * FROM sale_payments WHERE sale_id = ?', [$saleId]);
        $customer = DB::one('SELECT * FROM customers WHERE id = ?', [$sale['customer_id']]);
        $range = $sale['numbering_range_id'] ? DB::one('SELECT * FROM numbering_ranges WHERE id = ?', [$sale['numbering_range_id']]) : null;
        $env = Settings::get('dian_environment', '2') === '1' ? '1' : '2';
        $isPos = $sale['doc_type'] === 'POS';
        $lines = self::lines($items);
        $issuer = self::issuer();
        $issuer['prefix'] = $sale['prefix'];

        $notes = [];
        if ($isPos) {
            $notes[] = 'Caja: ' . Settings::get('pos_box_plate', 'CAJA-01') . ' | Tipo: ' . Settings::get('pos_box_type', 'POS') . ' | Cajero: ' . $sale['cashier'];
            $notes[] = 'Software: ' . Settings::get('software_name', 'POS Perfumería') . ' | Fabricante: ' . Settings::get('software_manufacturer', '');
        }
        if ($sale['notes']) {
            $notes[] = $sale['notes'];
        }

        $p = [
            'kind'               => $sale['doc_type'],
            'environment'        => $env,
            'number'             => $sale['full_number'],
            'issue_date'         => date('Y-m-d', strtotime($sale['issued_at'])),
            'issue_time'         => date('H:i:sP', strtotime($sale['issued_at'])),
            'customization_id'   => '10',
            'profile_id'         => $isPos ? 'DIAN 2.1: documento equivalente electrónico del tiquete de máquina registradora con sistema P.O.S.' : 'DIAN 2.1: Factura Electrónica de Venta',
            'type_code'          => $isPos ? '20' : '01',
            'uuid_scheme'        => $isPos ? 'CUDE-SHA384' : 'CUFE-SHA384',
            'range'              => $range,
            'issuer'             => $issuer,
            'customer'           => self::customer($customer),
            'software'           => self::software($sale['full_number']),
            'notes'              => $notes,
            'payment_means_code' => self::paymentMeansCode($payments),
            'payments'           => array_map(fn($x) => ['method' => $x['method'], 'amount' => (float) $x['amount']], $payments),
            'lines'              => $lines,
            'taxes'              => Calculator::taxBreakdown($lines),
            'totals'             => [
                'line_extension' => (float) $sale['subtotal'],
                'tax_exclusive'  => (float) $sale['subtotal'],
                'tax_inclusive'  => (float) $sale['total'],
                'discounts'      => (float) $sale['discount_total'],
                'payable'        => (float) $sale['total'],
            ],
        ];
        $key = $isPos ? (string) Settings::get('dian_software_pin', '') : (string) ($range['technical_key'] ?? '');
        return self::finalize($p, $key);
    }

    public static function payloadForCreditNote(int $cnId): array
    {
        $cn = DB::one('SELECT * FROM credit_notes WHERE id = ?', [$cnId]);
        if (!$cn) {
            throw new RuntimeException('Nota crédito no encontrada.');
        }
        $sale = DB::one('SELECT * FROM sales WHERE id = ?', [$cn['sale_id']]);
        $saleDoc = DB::one('SELECT * FROM electronic_documents WHERE sale_id = ?', [$sale['id']]);
        $items = DB::all('SELECT * FROM credit_note_items WHERE credit_note_id = ? ORDER BY id', [$cnId]);
        $customer = DB::one('SELECT * FROM customers WHERE id = ?', [$sale['customer_id']]);
        $env = Settings::get('dian_environment', '2') === '1' ? '1' : '2';
        $lines = self::lines($items);
        $isPos = $sale['doc_type'] === 'POS';

        $p = [
            'kind'               => 'NC',
            'environment'        => $env,
            'number'             => $cn['full_number'],
            'issue_date'         => date('Y-m-d', strtotime($cn['issued_at'])),
            'issue_time'         => date('H:i:sP', strtotime($cn['issued_at'])),
            'customization_id'   => '20',
            'profile_id'         => $isPos ? 'DIAN 2.1: Nota de ajuste de tipo crédito al documento equivalente' : 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
            'type_code'          => '91',
            'uuid_scheme'        => 'CUDE-SHA384',
            'range'              => null,
            'issuer'             => self::issuer(),
            'customer'           => self::customer($customer),
            'software'           => self::software($cn['full_number']),
            'notes'              => [$cn['reason_text']],
            'payment_means_code' => self::paymentMeansCode([['method' => $cn['refund_method'], 'amount' => 1]]),
            'payments'           => [['method' => $cn['refund_method'], 'amount' => (float) $cn['total']]],
            'reference'          => [
                'number'      => $sale['full_number'],
                'uuid'        => $saleDoc['uuid'] ?? '',
                'uuid_scheme' => $isPos ? 'CUDE-SHA384' : 'CUFE-SHA384',
                'issue_date'  => date('Y-m-d', strtotime($sale['issued_at'])),
                'reason_code' => $cn['reason_code'],
                'reason_text' => $cn['reason_text'],
            ],
            'lines'              => $lines,
            'taxes'              => Calculator::taxBreakdown($lines),
            'totals'             => [
                'line_extension' => (float) $cn['subtotal'],
                'tax_exclusive'  => (float) $cn['subtotal'],
                'tax_inclusive'  => (float) $cn['total'],
                'discounts'      => 0.0,
                'payable'        => (float) $cn['total'],
            ],
        ];
        return self::finalize($p, (string) Settings::get('dian_software_pin', ''));
    }
}

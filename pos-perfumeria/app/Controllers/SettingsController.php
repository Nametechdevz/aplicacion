<?php
namespace App\Controllers;

use App\Core\Controller;
use App\Core\DB;
use App\Core\Settings;

class SettingsController extends Controller
{
    private const KEYS = [
        'company_name', 'company_trade_name', 'company_nit', 'company_person_type', 'company_tax_regime',
        'company_tax_responsibilities', 'company_address', 'company_city_code', 'company_city_name', 'company_department',
        'company_phone', 'company_email', 'ticket_footer', 'allow_negative_stock', 'cashier_max_discount',
        'dian_environment', 'dian_driver', 'dian_software_id', 'dian_software_pin', 'dian_test_set_id',
        'dian_provider_url', 'dian_provider_token', 'pos_box_plate', 'pos_box_type', 'software_manufacturer', 'software_name',
    ];

    public function index(): void
    {
        $this->view('settings/index', [
            'title'  => 'Configuración',
            's'      => Settings::all(),
            'ranges' => DB::all('SELECT * FROM numbering_ranges ORDER BY doc_type, id'),
        ]);
    }

    public function update(): void
    {
        $values = [];
        foreach (self::KEYS as $k) {
            if (array_key_exists($k, $_POST)) {
                $values[$k] = trim((string) $_POST[$k]);
            }
        }
        // Checkbox
        $values['allow_negative_stock'] = !empty($_POST['allow_negative_stock']) ? '1' : '0';
        if (isset($values['company_nit'])) {
            $values['company_nit'] = preg_replace('/\D/', '', $values['company_nit']);
            $values['company_dv'] = nit_dv($values['company_nit']);
        }
        if (isset($values['dian_provider_token']) && $values['dian_provider_token'] === '********') {
            unset($values['dian_provider_token']); // no sobreescribir el token guardado
        }
        if (isset($values['dian_software_pin']) && $values['dian_software_pin'] === '********') {
            unset($values['dian_software_pin']);
        }
        if (isset($values['company_department_code'])) {
            unset($values['company_department_code']);
        }
        if (!empty($values['company_city_code'])) {
            $values['company_department_code'] = substr($values['company_city_code'], 0, 2);
        }
        Settings::set($values);
        flash('success', 'Configuración guardada.');
        redirect('/settings' . (string) ($_POST['_tab'] ?? ''));
    }

    public function storeRange(): void
    {
        DB::insert('numbering_ranges', $this->rangeData() + ['current_number' => max(0, (int) input('from_number', 1) - 1)]);
        flash('success', 'Resolución agregada.');
        redirect('/settings#ranges');
    }

    public function updateRange(int $id): void
    {
        $data = $this->rangeData();
        $cur = (int) DB::value('SELECT current_number FROM numbering_ranges WHERE id = ?', [$id]);
        if ($cur < $data['from_number'] - 1) {
            $data['current_number'] = $data['from_number'] - 1;
        }
        DB::update('numbering_ranges', $data, 'id = ?', [$id]);
        flash('success', 'Resolución actualizada.');
        redirect('/settings#ranges');
    }

    private function rangeData(): array
    {
        $date = fn($k) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) input($k)) ? input($k) : null;
        $from = max(1, (int) input('from_number', 1));
        return [
            'doc_type'          => in_array(input('doc_type'), ['FEV', 'POS', 'NC'], true) ? input('doc_type') : 'POS',
            'prefix'            => mb_strtoupper(mb_substr((string) input('prefix', ''), 0, 10)),
            'from_number'       => $from,
            'to_number'         => max($from, (int) input('to_number', $from)),
            'resolution_number' => mb_substr((string) input('resolution_number', ''), 0, 40) ?: null,
            'resolution_date'   => $date('resolution_date'),
            'valid_from'        => $date('valid_from'),
            'valid_to'          => $date('valid_to'),
            'technical_key'     => mb_substr((string) input('technical_key', ''), 0, 120) ?: null,
            'active'            => input('active') ? 1 : 0,
        ];
    }
}

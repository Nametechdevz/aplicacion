<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Response;
use App\Core\ValidationException;
use App\Services\Audit;
use App\Services\DiscountService;
use App\Services\Settings;
use App\Validators\Validator;

final class SettingsController extends Controller
{
    public function index(): Response
    {
        return $this->view('settings/index', [
            'title' => 'Configuración', 'active' => 'settings', 'crumbs' => [['Configuración', null]],
            's' => Settings::all(),
            'methods' => $this->db->all('SELECT * FROM payment_methods ORDER BY sort_order'),
            'roles' => $this->db->all("SELECT r.*, dl.max_percent FROM roles r LEFT JOIN discount_limits dl ON dl.scope = 'role' AND dl.scope_id = r.id ORDER BY r.id"),
            'branches' => $this->db->all("SELECT b.id, b.name, dl.max_percent FROM branches b LEFT JOIN discount_limits dl ON dl.scope = 'branch' AND dl.scope_id = b.id WHERE b.type = 'store' ORDER BY b.name"),
        ]);
    }

    public function save(): Response
    {
        $d = Validator::make($this->request->post, [
            'company_name' => 'required|string|max:120', 'company_tax_id' => 'nullable|string|max:40', 'company_address' => 'nullable|string|max:255',
            'company_phone' => 'nullable|string|max:40', 'company_email' => 'nullable|email|max:160', 'receipt_footer' => 'nullable|string|max:255',
            'min_margin_pct' => 'required|decimal:2|min:0|maxval:100', 'approval_expiry_min' => 'required|int|min:5',
            'cash_difference_tolerance' => 'required|decimal:2|min:0', 'cost_policy' => 'required|in:weighted_average,last',
            'allow_negative_stock' => 'bool', 'allow_mixed_payments' => 'bool', 'cash_close_requires_approval' => 'bool', 'returns_require_approval' => 'bool',
        ], ['company_name' => 'el nombre de la empresa', 'min_margin_pct' => 'el margen mínimo']);
        $d = array_map(static fn ($v) => $v === null ? '' : (string) $v, $d);
        Settings::save($d);
        return $this->success('Configuración guardada.', '/settings');
    }

    public function discountLimit(): Response
    {
        $scope = $this->request->str('scope');
        $limits = (array) ($this->request->post['limits'] ?? []);
        $svc = new DiscountService();
        foreach ($limits as $id => $value) {
            $svc->saveLimit($scope, (int) $id, trim((string) $value) === '' ? ($scope === 'role' ? '0' : null) : (string) $value);
        }
        return $this->success('Límites de descuento actualizados.', '/settings#descuentos');
    }

    public function paymentMethods(): Response
    {
        Auth::authorize('settings.manage');
        $rows = (array) ($this->request->post['methods'] ?? []);
        $this->db->transaction(function () use ($rows) {
            foreach ($rows as $id => $m) {
                $this->db->update('payment_methods', [
                    'name' => mb_substr(trim((string) ($m['name'] ?? '')), 0, 60) ?: throw new ValidationException('Cada medio de pago necesita un nombre.'),
                    'is_active' => !empty($m['is_active']) ? 1 : 0,
                    'requires_reference' => !empty($m['requires_reference']) ? 1 : 0,
                ], 'id = :id', ['id' => (int) $id]);
            }
            $new = trim((string) ($this->request->post['new_name'] ?? ''));
            if ($new !== '') {
                $type = in_array($this->request->str('new_type'), ['cash', 'bank_transfer', 'wallet', 'card', 'other'], true) ? $this->request->str('new_type') : 'other';
                $this->db->insert('payment_methods', ['code' => 'm' . bin2hex(random_bytes(4)), 'name' => mb_substr($new, 0, 60), 'type' => $type, 'requires_reference' => $type === 'cash' ? 0 : 1, 'sort_order' => 99]);
            }
            if (!(int) $this->db->value("SELECT COUNT(*) FROM payment_methods WHERE is_active = 1 AND type = 'cash'")) {
                throw new ValidationException('Debe existir al menos un medio de pago en efectivo activo para la caja.');
            }
            Audit::log('settings.payment_methods', 'payment_methods', null, 'Medios de pago actualizados', null, $rows);
        });
        return $this->success('Medios de pago actualizados.', '/settings#pagos');
    }
}

<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Response;
use App\Services\CashService;
use App\Services\DiscountService;
use App\Services\SaleService;
use App\Services\Settings;
use App\Support\Dec;

/** Punto de venta: catálogo con existencias de la sucursal activa, cálculo, autorizaciones y cobro. */
final class PosController extends Controller
{
    public function index(): Response
    {
        $branchId = Auth::activeBranchId();
        $branch = $branchId ? $this->db->one('SELECT * FROM branches WHERE id = :id', ['id' => $branchId]) : null;
        [$in, $bp] = Database::in(Auth::branchIds() ?: [0]);
        $stores = $this->db->all("SELECT id, name FROM branches WHERE id IN ($in) AND type = 'store' AND is_active = 1 ORDER BY name", $bp);
        $base = [
            'title' => 'Punto de venta', 'active' => 'pos', 'crumbs' => [['Punto de venta', null]],
            'flush' => true, 'collapseSidebar' => true, 'bodyClass' => 'pos-page',
        ];
        if (!$branch || $branch['type'] !== 'store' || !(int) $branch['is_active']) {
            return $this->view('pos/choose-branch', $base + ['stores' => $stores, 'branch' => $branch]);
        }
        $cash = new CashService();
        $session = $cash->openSessionFor((int) Auth::id(), $branchId);
        $opening = $cash->openingContext($branchId, (int) Auth::id());
        $registers = $opening['registers'];
        $config = [
            'branch' => ['id' => (int) $branch['id'], 'name' => $branch['name']],
            'user' => ['id' => Auth::id(), 'name' => Auth::user()['name']],
            'session' => $session ? ['id' => (int) $session['id'], 'register' => $session['register_name'], 'opened_at' => fmt_dt($session['opened_at'], 'H:i')] : null,
            'methods' => array_map(static fn ($m) => [
                'id' => (int) $m['id'], 'name' => $m['name'], 'type' => $m['type'], 'requires_reference' => (int) $m['requires_reference'] === 1,
            ], $this->db->all('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order')),
            'categories' => $this->db->all('SELECT id, name FROM categories WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order, name'),
            'mixed_payments' => Settings::bool('allow_mixed_payments'),
            'money_decimals' => (int) (Settings::get('money_decimals', '0') ?? '0'),
            'discount_limit' => (new DiscountService())->effectiveLimit((int) Auth::id(), $branchId),
            'can_discount' => Auth::can('pos.discount'),
            'can_customers' => Auth::can('customers.manage'),
            'can_search_customers' => Auth::can('customers.view'),
            'can_approve' => Auth::can('discounts.approve'),
            'storage_key' => 'jsp-cart-' . Auth::id() . '-' . $branchId,
        ];
        return $this->view('pos/index', $base + [
            'config' => $config, 'session' => $session, 'registers' => $registers, 'elsewhere' => $opening['elsewhere'], 'branch' => $branch, 'stores' => $stores,
            'scripts' => ['pos.js'],
        ]);
    }

    /** Catálogo completo de la sucursal activa (filtrado en el navegador para respuesta instantánea). */
    public function catalog(): Response
    {
        $branchId = $this->storeBranch();
        $rows = $this->db->all(
            "SELECT p.id, p.code, p.sku, p.barcode, p.name, p.price, p.sale_mode, p.qty_precision, p.category_id, p.subcategory_id,
                    b.name AS brand, u.code AS unit, COALESCE(i.quantity - i.reserved, 0) AS available, COALESCE(i.min_stock, 0) AS min_stock,
                    (SELECT pi.thumb_name FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS thumb
             FROM products p JOIN units_of_measure u ON u.id = p.base_unit_id LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = :b
             WHERE p.is_active = 1 ORDER BY p.name",
            ['b' => $branchId]
        );
        $variants = [];
        foreach ($this->db->all('SELECT id, product_id, name, sku, barcode, base_qty, price FROM product_variants WHERE is_active = 1 ORDER BY sort_order') as $v) {
            $variants[(int) $v['product_id']][] = [
                'id' => (int) $v['id'], 'name' => $v['name'], 'sku' => $v['sku'], 'barcode' => $v['barcode'],
                'base_qty' => $v['base_qty'], 'price' => $v['price'],
            ];
        }
        $items = array_map(static fn ($r) => [
            'id' => (int) $r['id'], 'code' => $r['code'], 'sku' => $r['sku'], 'barcode' => $r['barcode'], 'name' => $r['name'],
            'brand' => $r['brand'], 'price' => $r['price'], 'fractional' => $r['sale_mode'] === 'fractional',
            'precision' => (int) $r['qty_precision'], 'unit' => $r['unit'], 'category' => $r['category_id'] ? (int) $r['category_id'] : null,
            'available' => Dec::norm($r['available'], 3), 'min' => Dec::norm($r['min_stock'], 3),
            'thumb' => upload_url($r['thumb']), 'variants' => $variants[(int) $r['id']] ?? [],
        ], $rows);
        return $this->json(['ok' => true, 'items' => $items, 'at' => gmdate('c')]);
    }

    public function quote(): Response
    {
        $branchId = $this->storeBranch();
        $svc = new SaleService();
        $quote = $svc->quote(['items' => $this->request->input('items', [])], (int) Auth::id(), $branchId);
        return $this->json(['ok' => true] + $svc->publicQuote($quote));
    }

    public function sale(): Response
    {
        $result = (new SaleService())->create($this->request->json());
        return $this->json([
            'ok' => true,
            'message' => $result['duplicate'] ? 'Esta venta ya estaba registrada; no se duplicó.' : 'Venta registrada.',
            'sale' => $result,
            'receipt_url' => url('/sales/' . $result['id'] . '/receipt'),
        ]);
    }

    public function requestApproval(): Response
    {
        $branchId = $this->storeBranch();
        $productId = $this->request->int('product_id');
        $row = (new DiscountService())->request(
            $branchId,
            $productId ?: null,
            (string) $this->request->input('base_amount', '0'),
            (string) $this->request->input('percent', '0'),
            $this->request->str('reason')
        );
        return $this->json(['ok' => true, 'approval' => $this->approvalPayload($row)]);
    }

    public function approvalStatus(int $id): Response
    {
        $row = (new DiscountService())->find($id);
        if ((int) $row['requested_by'] !== Auth::id() && !Auth::can('discounts.approve')) {
            throw HttpException::forbidden();
        }
        return $this->json(['ok' => true, 'approval' => $this->approvalPayload($row)]);
    }

    public function authorizeInPlace(int $id): Response
    {
        $row = (new DiscountService())->find($id);
        if ((int) $row['requested_by'] !== Auth::id()) {
            throw HttpException::forbidden();
        }
        $row = (new DiscountService())->authorizeWithCredentials(
            $id,
            $this->request->str('username'),
            (string) $this->request->input('password', ''),
            $this->request->ip()
        );
        return $this->json(['ok' => true, 'message' => 'Descuento autorizado por ' . $row['decider'] . '.', 'approval' => $this->approvalPayload($row)]);
    }

    private function approvalPayload(array $row): array
    {
        return [
            'id' => (int) $row['id'], 'status' => $row['status'], 'percent' => $row['requested_percent'],
            'product_id' => $row['product_id'] ? (int) $row['product_id'] : null, 'decider' => $row['decider'] ?? null,
            'notes' => $row['decision_notes'] ?? null,
        ];
    }

    private function storeBranch(): int
    {
        $id = Auth::activeBranchId();
        $type = $id ? $this->db->value('SELECT type FROM branches WHERE id = :id AND is_active = 1', ['id' => $id]) : null;
        if ($type !== 'store') {
            throw new \App\Core\ValidationException('Seleccione una sucursal de venta activa.');
        }
        return $id;
    }
}

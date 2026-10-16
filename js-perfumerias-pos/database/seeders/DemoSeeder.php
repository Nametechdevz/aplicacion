<?php
declare(strict_types=1);

namespace Database\Seeders;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Session;
use App\Services\BranchService;
use App\Services\CashService;
use App\Services\DiscountService;
use App\Services\InventoryService;
use App\Services\ProductService;
use App\Services\PurchaseService;
use App\Services\ReturnService;
use App\Services\SaleService;
use App\Services\TransferService;
use App\Services\UserService;

/**
 * DATOS DE DEMOSTRACIÓN — NO USAR EN PRODUCCIÓN.
 *
 * Todo se crea a través de los servicios reales (compras, recepción,
 * distribución, ventas, descuentos, devoluciones, cierres), de modo que los
 * indicadores resultan de operaciones consistentes. Marcas, clientes y
 * proveedor llevan la palabra "Demo" para que nunca se confundan con datos
 * reales. Las ventas históricas se fechan hacia atrás para poblar gráficas.
 */
final class DemoSeeder
{
    private Database $db;
    private array $users = [];
    private array $branches = [];
    private array $products = [];

    public function __construct(private string $password)
    {
        $this->db = Database::connection();
    }

    public function run(callable $out): void
    {
        mt_srand(20261016);
        Session::useMemory();
        $adminId = (int) $this->db->value("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'superadmin' ORDER BY u.id LIMIT 1");
        if (!$adminId) {
            throw new \RuntimeException('Primero cree el superadministrador: php bin/create-superadmin.php');
        }
        $this->as($adminId);
        $alm = (int) $this->db->value("SELECT id FROM branches WHERE code = 'ALM'");

        $out('Sucursales…');
        $bs = new BranchService();
        foreach ([['S01', 'Sucursal Centro', 'Bogotá', 'Cra. 7 # 12-40'], ['S02', 'Sucursal Norte', 'Bogotá', 'Calle 140 # 15-20'], ['S03', 'Sucursal Occidente', 'Bogotá', 'Av. Boyacá # 64-10']] as [$code, $name, $city, $addr]) {
            $this->branches[$code] = $bs->save(null, ['code' => $code, 'name' => $name, 'type' => 'store', 'city' => $city, 'address' => $addr, 'phone' => '601 000 0000', 'receipt_footer' => 'Cambios dentro de los 30 días con su comprobante.']);
        }
        $this->branches['ALM'] = $alm;

        $out('Usuarios…');
        $us = new UserService();
        $mk = function (string $name, string $username, string $role, array $codes) use ($us) {
            return $this->users[$username] = $us->create([
                'name' => $name, 'username' => $username, 'password' => $this->password, 'password_confirmation' => $this->password,
                'roles' => [$role], 'branches' => array_map(fn ($c) => $this->branches[$c], $codes),
            ]);
        };
        $mk('Administración Centro (demo)', 'admin.centro', 'branch_admin', ['S01', 'S03']);
        $mk('Administración Norte (demo)', 'admin.norte', 'branch_admin', ['S02']);
        $mk('Cajero Centro (demo)', 'cajero.centro', 'cashier', ['S01']);
        $mk('Cajero Norte (demo)', 'cajero.norte', 'cashier', ['S02']);
        $mk('Cajero Occidente (demo)', 'cajero.occidente', 'cashier', ['S03']);

        $out('Catálogo…');
        $cat = fn (string $name, ?int $parent = null) => $this->db->insert('categories', ['name' => $name, 'parent_id' => $parent]);
        $perf = $cat('Perfumes');
        $mujer = $cat('Mujer', $perf);
        $hombre = $cat('Hombre', $perf);
        $unisex = $cat('Unisex', $perf);
        $granel = $cat('Fragancias a granel');
        $cuidado = $cat('Cremas y cuidado');
        $splash = $cat('Splash y body mist');
        $brand = fn (string $n) => $this->db->insert('brands', ['name' => $n]);
        $bA = $brand('Atelier Demo');
        $bE = $brand('Esencias Demo');
        $bG = $brand('Granel Demo');
        $bB = $brand('Botánica Demo');
        $unit = fn (string $c) => (int) $this->db->value('SELECT id FROM units_of_measure WHERE code = :c', ['c' => $c]);

        $ps = new ProductService();
        $defs = [
            // código, nombre, marca, cat, subcat, unidad, modo, precisión, precio, costo, contenido, etiqueta, variantes
            ['PF-001', 'Eau de Parfum Ámbar Nocturno 100 ml', $bA, $perf, $mujer, 'und', 'unit', 0, '289000', '131000', null, null, []],
            ['PF-002', 'Eau de Parfum Rosa Imperial 90 ml', $bA, $perf, $mujer, 'und', 'unit', 0, '265000', '118000', null, null, []],
            ['PF-003', 'Eau de Toilette Cedro y Bergamota 100 ml', $bA, $perf, $hombre, 'und', 'unit', 0, '248000', '109000', null, null, []],
            ['PF-004', 'Parfum Vetiver Profundo 75 ml', $bE, $perf, $hombre, 'und', 'unit', 0, '312000', '146000', null, null, []],
            ['PF-005', 'Eau de Parfum Neroli Solar 50 ml', $bE, $perf, $unisex, 'und', 'unit', 0, '198000', '84000', null, null, []],
            ['PF-006', 'Extrait Oud Ahumado 50 ml', $bE, $perf, $unisex, 'und', 'unit', 0, '355000', '172000', null, null, []],
            ['PF-007', 'Eau de Toilette Té Blanco 100 ml', $bB, $perf, $mujer, 'und', 'unit', 0, '176000', '72000', null, null, []],
            ['PF-008', 'Eau de Cologne Cítricos Frescos 150 ml', $bB, $perf, $unisex, 'und', 'unit', 0, '149000', '58000', null, null, []],
            ['GR-101', 'Fragancia a granel Vainilla Ámbar', $bG, $granel, null, 'ml', 'fractional', 1, '1250', '410', '1000', 'Garrafa 1 L',
                [['name' => 'Decant 5 ml', 'base_qty' => '5', 'price' => '8500'], ['name' => 'Decant 10 ml', 'base_qty' => '10', 'price' => '15000'], ['name' => 'Atomizador 30 ml', 'base_qty' => '30', 'price' => '39000']]],
            ['GR-102', 'Fragancia a granel Maderas Blancas', $bG, $granel, null, 'ml', 'fractional', 1, '1350', '450', '1000', 'Garrafa 1 L',
                [['name' => 'Decant 10 ml', 'base_qty' => '10', 'price' => '16000'], ['name' => 'Atomizador 30 ml', 'base_qty' => '30', 'price' => '42000']]],
            ['GR-103', 'Fragancia a granel Flor de Azahar', $bG, $granel, null, 'ml', 'fractional', 1, '1180', '380', '1000', 'Garrafa 1 L', []],
            ['GR-104', 'Loción base alcohol perfumero', $bG, $granel, null, 'ml', 'fractional', 0, '95', '28', '1000', 'Litro', []],
            ['CR-201', 'Crema corporal Karité y Almendra', $bB, $cuidado, null, 'g', 'fractional', 0, '210', '70', '500', 'Tarro 500 g', []],
            ['CR-202', 'Crema de manos Rosa Mosqueta 75 g', $bB, $cuidado, null, 'und', 'unit', 0, '48000', '19000', null, null, []],
            ['SP-301', 'Body mist Frutos Rojos 250 ml', $bE, $splash, null, 'und', 'unit', 0, '69000', '26000', null, null, []],
            ['SP-302', 'Splash Coco y Vainilla 240 ml', $bE, $splash, null, 'und', 'unit', 0, '62000', '23000', null, null, []],
        ];
        $n = 0;
        foreach ($defs as [$code, $name, $brandId, $catId, $sub, $u, $mode, $prec, $price, $cost, $content, $label, $variants]) {
            $n++;
            $this->products[$code] = $ps->create([
                'code' => $code, 'sku' => 'SKU-' . $code, 'barcode' => '77' . str_pad((string) (100000000 + $n * 7919), 11, '0', STR_PAD_LEFT),
                'name' => $name, 'description' => 'Producto de demostración.', 'brand_id' => $brandId, 'category_id' => $catId,
                'subcategory_id' => $sub, 'base_unit_id' => $unit($u), 'sale_mode' => $mode, 'qty_precision' => $prec,
                'price' => $price, 'cost' => '0', 'container_content' => $content, 'container_label' => $label,
                'min_price' => null, 'max_discount_pct' => $code === 'PF-006' ? '10' : null, 'is_active' => '1', 'variants' => $variants,
            ]);
        }

        $out('Compras y recepción en el almacén…');
        $supplier = $this->db->insert('suppliers', ['name' => 'Distribuidora Demo S.A.S.', 'tax_id' => '900000000-0', 'contact_name' => 'Contacto demo', 'phone' => '601 000 0001', 'email' => 'compras@demo.invalid']);
        $purch = new PurchaseService();
        $items = [];
        foreach ($defs as [$code, , , , , $u, , , , $cost]) {
            $q = match ($u) { 'ml' => '6000', 'g' => '5000', default => (string) mt_rand(90, 130) };
            $items[] = ['product_id' => $this->products[$code], 'quantity' => $q, 'unit_cost' => $cost, 'discount_amount' => '0'];
        }
        $po = $purch->create(['supplier_id' => $supplier, 'branch_id' => $alm, 'order_date' => date('Y-m-d', strtotime('-40 days')), 'items' => $items, 'submit' => 'order', 'notes' => 'Compra inicial (demo)']);
        $poItems = $this->db->all('SELECT id, quantity FROM purchase_order_items WHERE purchase_order_id = :id', ['id' => $po]);
        $purch->receive($po, ['received' => array_column($poItems, 'quantity', 'id'), 'supplier_invoice' => 'FV-DEMO-001', 'additional_costs' => '180000']);
        // Segunda orden pendiente de recibir (aparece en "compras por recibir").
        $purch->create(['supplier_id' => $supplier, 'branch_id' => $alm, 'order_date' => date('Y-m-d', strtotime('-2 days')), 'expected_date' => date('Y-m-d', strtotime('+5 days')),
            'items' => [['product_id' => $this->products['PF-001'], 'quantity' => '24', 'unit_cost' => '131000'], ['product_id' => $this->products['GR-101'], 'quantity' => '3000', 'unit_cost' => '410']], 'submit' => 'order']);

        $out('Distribución a sucursales…');
        $matrix = [];
        foreach (['S01', 'S02', 'S03'] as $i => $b) {
            foreach ($defs as [$code, , , , , $u]) {
                $matrix[$this->branches[$b]][$this->products[$code]] = match ($u) { 'ml' => (string) (1500 - $i * 300), 'g' => (string) (1200 - $i * 200), default => (string) mt_rand(20, 30) };
            }
        }
        $ts = new TransferService();
        $transferIds = $ts->distribute($alm, $matrix, 'Surtido inicial de sucursales (demo)');
        foreach ($transferIds as $tid) {
            $t = $this->db->one('SELECT to_branch_id FROM stock_transfers WHERE id = :id', ['id' => $tid]);
            $this->as($adminId);
            $items = $this->db->all('SELECT id, qty_sent FROM stock_transfer_items WHERE transfer_id = :t', ['t' => $tid]);
            $ts->receive($tid, array_column($items, 'qty_sent', 'id'));
            unset($t);
        }
        // Stock mínimo por sucursal
        $inv = new InventoryService();
        foreach (['S01', 'S02', 'S03'] as $b) {
            foreach ($defs as [$code, , , , , $u]) {
                $inv->setMinStock($this->branches[$b], $this->products[$code], $u === 'ml' ? '400' : ($u === 'g' ? '300' : '4'));
            }
        }
        // Solicitud de transferencia pendiente desde una sucursal.
        $this->as($this->users['admin.norte']);
        $ts->create($alm, $this->branches['S02'], [['product_id' => $this->products['PF-004'], 'quantity' => '6'], ['product_id' => $this->products['GR-102'], 'quantity' => '500']], 'Reposición por alta demanda (demo)');

        $out('Clientes…');
        $customers = [];
        for ($i = 1; $i <= 12; $i++) {
            $customers[] = $this->db->insert('customers', [
                'full_name' => sprintf('Cliente Demo %02d', $i), 'document_type' => 'CC', 'document_number' => (string) (1000000000 + $i * 7331),
                'phone' => '300' . str_pad((string) ($i * 104729 % 10000000), 7, '0', STR_PAD_LEFT), 'branch_id' => $this->branches[['S01', 'S02', 'S03'][$i % 3]],
                'preferences' => $i % 2 ? 'Prefiere notas amaderadas' : 'Prefiere notas florales',
            ]);
        }

        $out('Ventas históricas (30 días)…');
        $cash = new CashService();
        $sales = new SaleService();
        $cashierByBranch = ['S01' => 'cajero.centro', 'S02' => 'cajero.norte', 'S03' => 'cajero.occidente'];
        $methods = array_column($this->db->all('SELECT id, code FROM payment_methods'), 'id', 'code');
        $codes = array_keys($this->products);
        $variantRows = $this->db->all('SELECT id, product_id FROM product_variants WHERE is_active = 1');
        for ($day = 29; $day >= 0; $day--) {
            foreach ($cashierByBranch as $bcode => $username) {
                $this->as($this->users[$username], $this->branches[$bcode]);
                $register = (int) $this->db->value('SELECT id FROM cash_registers WHERE branch_id = :b LIMIT 1', ['b' => $this->branches[$bcode]]);
                $sessionId = $cash->open($register, '200000');
                $count = mt_rand(2, 6) + ($bcode === 'S01' ? 2 : 0) + (in_array((int) date('N', strtotime("-$day days")), [5, 6], true) ? 2 : 0);
                $saleIds = [];
                for ($k = 0; $k < $count; $k++) {
                    $lines = [];
                    $nLines = mt_rand(1, 3);
                    for ($l = 0; $l < $nLines; $l++) {
                        $r = mt_rand(1, 100);
                        if ($r <= 18 && $variantRows) {
                            $v = $variantRows[array_rand($variantRows)];
                            $lines[] = ['product_id' => (int) $v['product_id'], 'variant_id' => (int) $v['id'], 'quantity' => (string) mt_rand(1, 2)];
                        } else {
                            $code = $codes[array_rand($codes)];
                            $q = match (substr($code, 0, 2)) { 'GR' => (string) [25, 30, 35, 50, 100][mt_rand(0, 4)], 'CR' => $code === 'CR-201' ? (string) [100, 150, 250][mt_rand(0, 2)] : '1', default => '1' };
                            $line = ['product_id' => $this->products[$code], 'quantity' => $q];
                            if (mt_rand(1, 100) <= 15) {
                                $line['discount'] = ['type' => 'percent', 'value' => (string) mt_rand(2, 5), 'reason' => 'Cliente frecuente'];
                            }
                            $lines[] = $line;
                        }
                    }
                    try {
                        $quote = $sales->quote(['items' => $lines], $this->users[$username], $this->branches[$bcode]);
                        $total = $quote['total'];
                        $m = mt_rand(1, 100);
                        $payments = match (true) {
                            $m <= 45 => [['method_id' => $methods['cash'], 'amount' => (string) (ceil(((float) $total) / 10000) * 10000)]],
                            $m <= 65 => [['method_id' => $methods['nequi'], 'amount' => $total, 'reference' => 'NQ' . mt_rand(100000, 999999)]],
                            $m <= 85 => [['method_id' => $methods['card'], 'amount' => $total, 'reference' => (string) mt_rand(1000, 9999)]],
                            default => [['method_id' => $methods['transfer'], 'amount' => $total, 'reference' => 'TRF' . mt_rand(10000, 99999)]],
                        };
                        $res = $sales->create([
                            'client_request_id' => self::uuid(), 'items' => $lines, 'payments' => $payments,
                            'customer_id' => mt_rand(1, 100) <= 40 ? $customers[array_rand($customers)] : null,
                        ]);
                        $saleIds[] = $res['id'];
                    } catch (\App\Core\ValidationException) {
                        // Sin existencias suficientes para la combinación aleatoria: se omite.
                    }
                }
                $isToday = $day === 0 && $bcode === 'S01';
                if (!$isToday) {
                    $summary = $cash->summary($sessionId);
                    $diff = mt_rand(1, 10) === 1 ? '-5000' : '0';
                    $counted = \App\Support\Dec::add($summary['expected_cash'], $diff);
                    $cash->close($sessionId, $counted, [], $diff !== '0' ? 'Diferencia por cambio entregado de más (demo)' : '');
                }
                $this->backdate($day, $sessionId, $saleIds, $isToday);
            }
        }
        // Aprobar cierres antiguos como lo haría el supervisor.
        $this->as($adminId);
        foreach ($this->db->column("SELECT id FROM cash_sessions WHERE status = 'closed' AND closed_at < UTC_TIMESTAMP() - INTERVAL 2 DAY") as $sid) {
            $cash->approve((int) $sid, 'Revisado (demo)');
        }

        $out('Descuento autorizado, anulación y devolución…');
        $this->as($this->users['cajero.centro'], $this->branches['S01']);
        $ds = new DiscountService();
        $pick = fn () => $this->db->one(
            "SELECT p.id, p.price FROM inventory i JOIN products p ON p.id = i.product_id
             WHERE i.branch_id = :b AND p.sale_mode = 'unit' AND (i.quantity - i.reserved) >= 2 AND p.max_discount_pct IS NULL
             ORDER BY (i.quantity - i.reserved) DESC LIMIT 1",
            ['b' => $this->branches['S01']]
        );
        $p1 = $pick();
        $pf1 = (int) $p1['id'];
        $approval = $ds->request($this->branches['S01'], $pf1, $p1['price'], '12', 'Cliente corporativo (demo)');
        $ds->decide((int) $approval['id'], true, 'Autorizado por administración', $this->users['admin.centro']);
        $sale = $sales->create(['client_request_id' => self::uuid(), 'items' => [['product_id' => $pf1, 'quantity' => '1', 'discount' => ['type' => 'percent', 'value' => '12', 'approval_id' => $approval['id'], 'reason' => 'Cliente corporativo']]],
            'payments' => [['method_id' => $methods['card'], 'amount' => \App\Support\Dec::sub($p1['price'], \App\Support\Dec::pct($p1['price'], '12')), 'reference' => '4521']], 'customer_id' => $customers[0]]);
        $p2 = $pick();
        $toVoid = $sales->create(['client_request_id' => self::uuid(), 'items' => [['product_id' => (int) $p2['id'], 'quantity' => '1']], 'payments' => [['method_id' => $methods['cash'], 'amount' => $p2['price']]]]);
        $this->as($this->users['admin.centro'], $this->branches['S01']);
        $sales->void($toVoid['id'], 'Error de digitación del producto (demo)');
        $ds->request($this->branches['S01'], $this->products['PF-006'], '355000', '15', 'Solicitud pendiente (demo)');
        $rs = new ReturnService();
        $lastSaleItem = $this->db->one("SELECT si.id, si.sale_id FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.branch_id = :b AND s.status = 'completed' AND si.unit_code = 'und' AND si.variant_id IS NULL ORDER BY s.id DESC LIMIT 1 OFFSET 3", ['b' => $this->branches['S01']]);
        if ($lastSaleItem) {
            $this->as($this->users['admin.centro'], $this->branches['S01']);
            $this->db->execute("UPDATE cash_sessions SET user_id = user_id WHERE status = 'open'");
            try {
                $rs->create((int) $lastSaleItem['sale_id'], ['reason' => 'Cliente cambió de opinión (demo)', 'refund_method_id' => $methods['card'],
                    'items' => [$lastSaleItem['id'] => ['quantity' => '1', 'condition' => 'resaleable', 'restock' => '1']]]);
            } catch (\Throwable) {
                // opcional
            }
        }
        unset($sale);
        $this->as($adminId);
        $out('Datos de demostración listos.');
    }

    private function backdate(int $day, int $sessionId, array $saleIds, bool $keepOpen): void
    {
        if ($day === 0) {
            return;
        }
        $shift = "INTERVAL $day DAY";
        $this->db->execute("UPDATE cash_sessions SET opened_at = opened_at - $shift, closed_at = IF(closed_at IS NULL, NULL, closed_at - $shift) WHERE id = :id", ['id' => $sessionId]);
        $this->db->execute("UPDATE cash_movements SET created_at = created_at - $shift WHERE cash_session_id = :id", ['id' => $sessionId]);
        if ($saleIds) {
            [$in, $p] = Database::in($saleIds);
            $hourShift = mt_rand(0, 6);
            $this->db->execute("UPDATE sales SET created_at = created_at - $shift - INTERVAL $hourShift HOUR WHERE id IN ($in)", $p);
            $this->db->execute("UPDATE discounts SET created_at = created_at - $shift WHERE sale_id IN ($in)", $p);
            $this->db->execute("UPDATE inventory_movements SET created_at = created_at - $shift WHERE reference_type = 'sale' AND reference_id IN ($in)", $p);
        }
        unset($keepOpen);
    }

    private function as(int $userId, ?int $branchId = null): void
    {
        Auth::actingAs($userId);
        if ($branchId) {
            Auth::setActiveBranch($branchId);
        }
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}

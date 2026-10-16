<?php
declare(strict_types=1);

/**
 * Pruebas automatizadas (unitarias + integración) sin dependencias externas.
 *   php tests/run.php
 * Usa una base de datos aislada: <DB_DATABASE>_test (se borra y recrea).
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';
require __DIR__ . '/TestCase.php';

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ValidationException;
use App\Services\CashService;
use App\Services\DiscountService;
use App\Services\ImageService;
use App\Services\InventoryService;
use App\Services\ProductService;
use App\Services\PurchaseService;
use App\Services\ReportService;
use App\Services\ReturnService;
use App\Services\SaleService;
use App\Services\TransferService;
use App\Support\Dec;
use Tests\TestCase as T;

App\Core\Config::set('app.env', 'testing');
App\Core\Config::set('app.debug', false);

echo "\nJS Perfumerías POS — pruebas\n\n";

// ---------------------------------------------------------------------------
echo "Unitarias: aritmética decimal y validación\n";
T::test('Dec: 35 ml × $1.250 = $43.750 sin flotantes', function () {
    T::assertSame('43750.00', Dec::mul('35', '1250.00', 2));
    T::assertSame('965.000', Dec::sub('1000.000', '35', 3));
});
T::test('Dec: redondeo half-up y división', function () {
    T::assertSame('1.01', Dec::norm('1.005', 2));
    T::assertSame('-0.13', Dec::div('-1', '8', 2));
    T::assertSame('0.30', Dec::add('0.1', '0.2', 2));
    T::assertThrows(fn () => Dec::add(0.1, '1'), InvalidArgumentException::class);
});
T::test('Validador: unidades discretas no admiten decimales', function () {
    T::assertThrows(fn () => App\Validators\Validator::quantity('1.5', 0), ValidationException::class, 'unidades completas');
    T::assertSame('35.500', App\Validators\Validator::quantity('35,5', 1));
});

T::setUpDatabase();
$ids = T::$ids;
$db = Database::connection();
$cash = new CashService();
$sales = new SaleService();
$methodCash = (int) $db->value("SELECT id FROM payment_methods WHERE code = 'cash'");
$methodNequi = (int) $db->value("SELECT id FROM payment_methods WHERE code = 'nequi'");

// Turnos abiertos para los cajeros de prueba.
T::actingAs('cashier1', 's1');
$session1 = $cash->open($ids['r1'], '100000');
T::actingAs('cashier1b', 's1');
$session1b = $cash->open($ids['r1b'], '50000');
T::actingAs('cashier2', 's2');
$cash->open($ids['r2'], '0');

$sell = function (array $items, array $payments, ?string $requestId = null) use ($sales) {
    return $sales->create(['client_request_id' => $requestId ?? T::uuid(), 'items' => $items, 'payments' => $payments]);
};

// ---------------------------------------------------------------------------
echo "\nCriterio 1 · Aislamiento por sucursal\n";
T::test('Un cajero de S01 no puede ver el inventario de S02 (HTTP)', function () use ($ids) {
    T::actingAs('cashier1', 's1');
    $r = T::http('GET', '/inventory?branch=' . $ids['s2']);
    T::assertSame(403, $r->status);
});
T::test('Un administrador de S01 recibe 403 al pedir el inventario de S02 por URL', function () use ($ids) {
    T::actingAs('admin1', 's1');
    T::assertSame(200, T::http('GET', '/inventory?branch=' . $ids['s1'], [], false)->status);
    T::assertSame(403, T::http('GET', '/inventory?branch=' . $ids['s2'])->status);
});
T::test('No se puede activar como sucursal de trabajo una sucursal ajena', function () use ($ids) {
    T::actingAs('cashier1', 's1');
    T::assertSame(403, T::http('POST', '/branch/switch', ['branch_id' => (string) $ids['s2']])->status);
});
T::test('Una venta de otra sucursal no es visible modificando el ID', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier2', 's2');
    $s = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '200000']]);
    T::actingAs('admin1', 's1');
    T::assertSame(403, T::http('GET', '/api/sales/' . $s['id'])->status);
});

// ---------------------------------------------------------------------------
echo "\nCriterio 2 · Precios base protegidos\n";
T::test('Un usuario sin products.price no puede modificar el precio base', function () use ($ids, $db) {
    T::actingAs('super');
    $db->query("INSERT INTO user_permissions (user_id, permission_id, effect) SELECT :u, id, 'grant' FROM permissions WHERE code = 'products.manage'", ['u' => $ids['admin1']]);
    T::actingAs('admin1', 's1');
    $p = $db->one('SELECT * FROM products WHERE id = :id', ['id' => $ids['p_unit']]);
    $input = array_merge($p, ['price' => '1000', 'is_active' => '1']);
    T::assertThrows(fn () => (new ProductService())->update($ids['p_unit'], $input), HttpException::class, 'precios');
    T::assertSame('200000.00', $db->value('SELECT price FROM products WHERE id = :id', ['id' => $ids['p_unit']]));
});
T::test('Un cajero no puede acceder a la edición de productos (HTTP 403)', function () use ($ids) {
    T::actingAs('cashier1', 's1');
    T::assertSame(403, T::http('POST', '/products/' . $ids['p_unit'], ['price' => '1'])->status);
});

// ---------------------------------------------------------------------------
echo "\nCriterio 3 · Descuentos con límite y autorización\n";
T::test('Un descuento superior al límite del cajero (5 %) exige autorización', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier1', 's1');
    T::assertThrows(fn () => $sell(
        [['product_id' => $ids['p_unit'], 'quantity' => '1', 'discount' => ['type' => 'percent', 'value' => '15']]],
        [['method_id' => $methodCash, 'amount' => '170000']]
    ), ValidationException::class, 'autorización');
});
T::test('Con autorización aprobada por un supervisor la venta se registra y guarda quién autorizó', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    $ds = new DiscountService();
    $a = $ds->request($ids['s1'], $ids['p_unit'], '200000', '15', 'Cliente corporativo');
    $ds->decide((int) $a['id'], true, 'ok', $ids['admin1']);
    T::actingAs('cashier1', 's1');
    $s = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1', 'discount' => ['type' => 'percent', 'value' => '15', 'approval_id' => $a['id']]]],
        [['method_id' => $methodCash, 'amount' => '170000']]);
    $d = $db->one('SELECT * FROM discounts WHERE sale_id = :s', ['s' => $s['id']]);
    T::assertSame('30000.00', $d['amount']);
    T::assertSame($ids['admin1'], (int) $d['approved_by']);
    T::assertSame('used', $db->value('SELECT status FROM discount_approvals WHERE id = :id', ['id' => $a['id']]));
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_unit'], 'quantity' => '1', 'discount' => ['type' => 'percent', 'value' => '15', 'approval_id' => $a['id']]]],
        [['method_id' => $methodCash, 'amount' => '170000']]), ValidationException::class, 'utilizada');
});
T::test('Quien solicita no puede autorizarse a sí mismo', function () use ($ids) {
    T::actingAs('admin1', 's1');
    $ds = new DiscountService();
    $a = $ds->request($ids['s1'], $ids['p_unit'], '200000', '10', 'prueba');
    T::assertThrows(fn () => $ds->decide((int) $a['id'], true, '', $ids['admin1']), HttpException::class, 'distinta');
});
T::test('El servidor ignora precios y totales enviados por el navegador', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    $s = $sales = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1', 'price' => '1', 'total' => '1']], [['method_id' => $methodCash, 'amount' => '200000']]);
    T::assertSame('200000.00', $db->value('SELECT total FROM sales WHERE id = :id', ['id' => $s['id']]));
    unset($sales);
});

// ---------------------------------------------------------------------------
echo "\nCriterios 4 y 5 · Inventario de la venta y fraccionados\n";
T::test('Una venta descuenta el inventario de la sucursal correcta', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier1', 's1');
    $b1 = T::stock('s1', 'p_unit');
    $b2 = T::stock('s2', 'p_unit');
    $sell([['product_id' => $ids['p_unit'], 'quantity' => '2']], [['method_id' => $methodCash, 'amount' => '400000']]);
    T::assertSame(Dec::sub($b1, '2', 3), T::stock('s1', 'p_unit'));
    T::assertSame($b2, T::stock('s2', 'p_unit'), 'S02 no cambia');
});
T::test('Venta de 35 ml: 1.000 ml → 965 ml, precio por ml y snapshot histórico', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    T::assertSame('1000.000', T::stock('s1', 'p_ml'));
    $s = $sell([['product_id' => $ids['p_ml'], 'quantity' => '35', 'discount' => ['type' => 'percent', 'value' => '4']]], [['method_id' => $methodCash, 'amount' => '50000']]);
    T::assertSame('965.000', T::stock('s1', 'p_ml'));
    $it = $db->one('SELECT * FROM sale_items WHERE sale_id = :s', ['s' => $s['id']]);
    T::assertSame('35.000', $it['quantity']);
    T::assertSame('35.000', $it['qty_base']);
    T::assertSame('1000.000', $it['stock_before']);
    T::assertSame('965.000', $it['stock_after']);
    T::assertSame('1250.00', $it['list_unit_price']);
    T::assertSame('43750.00', $it['gross_amount']);
    T::assertSame('1750.00', $it['discount_amount']);
    T::assertSame('42000.00', $it['total']);
    $m = $db->one("SELECT * FROM inventory_movements WHERE reference_type = 'sale' AND reference_id = :s", ['s' => $s['id']]);
    T::assertSame('-35.000', $m['quantity']);
});
T::test('Una presentación (decant 10 ml) descuenta 10 ml por unidad', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier1', 's1');
    $before = T::stock('s1', 'p_ml');
    $sell([['product_id' => $ids['p_ml'], 'variant_id' => $ids['v_10ml'], 'quantity' => '2']], [['method_id' => $methodCash, 'amount' => '30000']]);
    T::assertSame(Dec::sub($before, '20', 3), T::stock('s1', 'p_ml'));
});
T::test('No se permite vender un producto por unidad con decimales ni sin existencias', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier1', 's1');
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_unit'], 'quantity' => '0.5']], [['method_id' => $methodCash, 'amount' => '100000']]), ValidationException::class, 'unidades completas');
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_g'], 'quantity' => '5000']], [['method_id' => $methodCash, 'amount' => '1000000']]), ValidationException::class, 'insuficientes');
});

// ---------------------------------------------------------------------------
echo "\nCriterio 6 · Concurrencia sobre el mismo stock\n";
T::test('Dos ventas simultáneas no pueden vender la misma última unidad', function () use ($ids, $db, $methodCash) {
    if (!function_exists('pcntl_fork')) {
        echo "      (pcntl no disponible: prueba omitida)\n";
        return;
    }
    T::actingAs('super');
    // Deja exactamente 1 unidad en S01.
    $current = T::stock('s1', 'p_unit');
    (new InventoryService())->adjust($ids['s1'], $ids['p_unit'], 'set', '1', 'adjustment', 'Preparación prueba de concurrencia');
    $results = [];
    $pids = [];
    foreach (['cashier1', 'cashier1b'] as $k => $who) {
        $sock = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
        $pid = pcntl_fork();
        if ($pid === 0) {
            fclose($sock[0]);
            Database::setConnection(null);
            try {
                T::actingAs($who, 's1');
                usleep(100000);
                (new SaleService())->create(['client_request_id' => T::uuid(), 'items' => [['product_id' => $ids['p_unit'], 'quantity' => '1']], 'payments' => [['method_id' => $methodCash, 'amount' => '200000']]]);
                fwrite($sock[1], 'ok');
            } catch (Throwable $e) {
                fwrite($sock[1], 'fail:' . $e->getMessage());
            }
            fclose($sock[1]);
            // Terminar sin destructores: la conexión heredada del proceso padre no debe cerrarse.
            posix_kill(getmypid(), SIGKILL);
        }
        fclose($sock[1]);
        $pids[] = [$pid, $sock[0]];
    }
    foreach ($pids as [$pid, $s]) {
        $results[] = stream_get_contents($s);
        pcntl_waitpid($pid, $status);
    }
    $ok = count(array_filter($results, fn ($r) => $r === 'ok'));
    T::assertSame(1, $ok, 'Solo una venta debe completarse (' . implode(' | ', $results) . ')');
    T::assertSame('0.000', T::stock('s1', 'p_unit'));
    T::actingAs('super');
    (new InventoryService())->adjust($ids['s1'], $ids['p_unit'], 'set', $current, 'adjustment', 'Restablecer tras prueba de concurrencia');
    unset($db);
});

// ---------------------------------------------------------------------------
echo "\nCriterio 7 · Transferencias sin duplicar existencias\n";
T::test('Flujo completo: reserva, tránsito y recepción conservan el total', function () use ($ids, $db) {
    $total = fn () => (string) $db->value('SELECT SUM(quantity + in_transit) FROM inventory WHERE product_id = :p', ['p' => $ids['p_unit']]);
    $before = $total();
    T::actingAs('admin1', 's1');
    $ts = new TransferService();
    $id = $ts->create($ids['alm'], $ids['s1'], [['product_id' => $ids['p_unit'], 'quantity' => '5']], 'prueba');
    T::actingAs('super');
    $ts->approve($id);
    T::assertSame('5.000', $db->value('SELECT reserved FROM inventory WHERE branch_id = :b AND product_id = :p', ['b' => $ids['alm'], 'p' => $ids['p_unit']]));
    $ts->dispatch($id);
    T::assertSame($before, $total(), 'El total (existencia + tránsito) no cambia al despachar');
    T::assertThrows(fn () => $ts->dispatch($id), ValidationException::class, 'cambió de estado');
    T::actingAs('admin1', 's1');
    $item = (int) $db->value('SELECT id FROM stock_transfer_items WHERE transfer_id = :t', ['t' => $id]);
    $ts->receive($id, [$item => '5']);
    T::assertSame($before, $total(), 'El total no cambia al recibir');
    T::assertThrows(fn () => $ts->receive($id, [$item => '5']), ValidationException::class);
    T::assertSame('received', $db->value('SELECT status FROM stock_transfers WHERE id = :id', ['id' => $id]));
});
T::test('Recepción con faltante queda con diferencias y se resuelve con trazabilidad', function () use ($ids, $db) {
    T::actingAs('super');
    $ts = new TransferService();
    $id = $ts->create($ids['alm'], $ids['s1'], [['product_id' => $ids['p_ml'], 'quantity' => '500']], 'prueba');
    $ts->approve($id);
    $ts->dispatch($id);
    $alm = T::stock('alm', 'p_ml');
    $item = (int) $db->value('SELECT id FROM stock_transfer_items WHERE transfer_id = :t', ['t' => $id]);
    T::actingAs('admin1', 's1');
    T::assertSame('received_with_differences', $ts->receive($id, [$item => '480']));
    T::actingAs('super');
    $ts->resolve($id, [$item => 'return_origin'], 'Se encontraron 20 ml en el almacén');
    T::assertSame(Dec::add($alm, '20', 3), T::stock('alm', 'p_ml'));
});

// ---------------------------------------------------------------------------
echo "\nCriterio 8 · Recepción parcial de compras\n";
T::test('Una orden no mueve inventario; la recepción parcial suma solo lo recibido', function () use ($ids, $db) {
    T::actingAs('super');
    $sup = $db->insert('suppliers', ['name' => 'Proveedor de prueba']);
    $ps = new PurchaseService();
    $before = T::stock('alm', 'p_unit');
    $po = $ps->create(['supplier_id' => $sup, 'branch_id' => $ids['alm'], 'order_date' => date('Y-m-d'), 'submit' => 'order', 'items' => [['product_id' => $ids['p_unit'], 'quantity' => '10', 'unit_cost' => '90000']]]);
    T::assertSame($before, T::stock('alm', 'p_unit'), 'La orden no cambia existencias');
    $item = (int) $db->value('SELECT id FROM purchase_order_items WHERE purchase_order_id = :p', ['p' => $po]);
    $ps->receive($po, ['received' => [$item => '4']]);
    T::assertSame(Dec::add($before, '4', 3), T::stock('alm', 'p_unit'));
    T::assertSame('partial', $db->value('SELECT status FROM purchase_orders WHERE id = :id', ['id' => $po]));
    T::assertThrows(fn () => $ps->receive($po, ['received' => [$item => '7']]), ValidationException::class, 'supera lo pendiente');
    $ps->receive($po, ['received' => [$item => '6']]);
    T::assertSame('received', $db->value('SELECT status FROM purchase_orders WHERE id = :id', ['id' => $po]));
});

// ---------------------------------------------------------------------------
echo "\nCriterio 9 · Devoluciones limitadas a lo vendido\n";
T::test('No se puede devolver más de lo vendido menos lo ya devuelto', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    $s = $sell([['product_id' => $ids['p_ml'], 'quantity' => '50']], [['method_id' => $methodCash, 'amount' => '62500']]);
    $item = (int) $db->value('SELECT id FROM sale_items WHERE sale_id = :s', ['s' => $s['id']]);
    T::actingAs('admin1', 's1');
    $rs = new ReturnService();
    $card = (int) $db->value("SELECT id FROM payment_methods WHERE code = 'card'");
    // Un reembolso en efectivo exige caja abierta de quien lo aplica.
    T::assertThrows(fn () => $rs->create($s['id'], ['reason' => 'Prueba efectivo', 'refund_method_id' => $methodCash, 'items' => [$item => ['quantity' => '1']]]), ValidationException::class, 'turno de caja');
    $before = T::stock('s1', 'p_ml');
    $r = $rs->create($s['id'], ['reason' => 'Prueba de devolución', 'refund_method_id' => $card, 'items' => [$item => ['quantity' => '30', 'condition' => 'resaleable', 'restock' => '1']]]);
    T::assertSame('completed', $r['status']);
    T::assertSame('37500.00', $r['total']);
    T::assertSame(Dec::add($before, '30', 3), T::stock('s1', 'p_ml'));
    T::assertThrows(fn () => $rs->create($s['id'], ['reason' => 'Exceso', 'refund_method_id' => $card, 'items' => [$item => ['quantity' => '25']]]), ValidationException::class, 'disponible 20');
    $r2 = $rs->create($s['id'], ['reason' => 'Resto dañado', 'refund_method_id' => $card, 'items' => [$item => ['quantity' => '20', 'condition' => 'damaged', 'restock' => '1']]]);
    T::assertSame('25000.00', $r2['total']);
    T::assertSame(Dec::add($before, '30', 3), T::stock('s1', 'p_ml'), 'Lo dañado no reingresa');
    T::assertSame('completed', $db->value('SELECT status FROM sales WHERE id = :id', ['id' => $s['id']]), 'La venta original se conserva');
});

// ---------------------------------------------------------------------------
echo "\nCriterio 10 · Pagos coinciden con el total\n";
T::test('Pago insuficiente o electrónico excedido es rechazado', function () use ($ids, $sell, $methodCash, $methodNequi) {
    T::actingAs('cashier1', 's1');
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '150000']]), ValidationException::class, 'menor que el total');
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodNequi, 'amount' => '250000', 'reference' => 'NQ123']]), ValidationException::class, 'electrónicos');
});
T::test('Pago mixto: suma aplicada = total y el cambio sale del efectivo', function () use ($ids, $sell, $methodCash, $methodNequi, $db) {
    T::actingAs('cashier1', 's1');
    $s = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodNequi, 'amount' => '120000', 'reference' => 'NQ555'], ['method_id' => $methodCash, 'amount' => '100000']]);
    T::assertSame('20000.00', $s['change']);
    T::assertSame('200000.00', $db->value('SELECT SUM(amount) FROM sale_payments WHERE sale_id = :s', ['s' => $s['id']]));
    T::assertSame('pending_manual', $db->value("SELECT verification FROM sale_payments WHERE sale_id = :s AND payment_method_id = :m", ['s' => $s['id'], 'm' => $methodNequi]));
});

// ---------------------------------------------------------------------------
echo "\nCriterio 11 · Idempotencia\n";
T::test('La misma solicitud enviada dos veces genera una sola venta', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    $req = T::uuid();
    $before = T::stock('s1', 'p_unit');
    $a = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '200000']], $req);
    $b = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '200000']], $req);
    T::assertSame($a['id'], $b['id']);
    T::assertTrue($b['duplicate']);
    T::assertSame(1, (int) $db->value('SELECT COUNT(*) FROM sales WHERE client_request_id = :r', ['r' => $req]));
    T::assertSame(Dec::sub($before, '1', 3), T::stock('s1', 'p_unit'));
});

// ---------------------------------------------------------------------------
echo "\nCriterio 12 · Cierre de caja\n";
T::test('El cierre calcula esperado y diferencia; un turno cerrado no admite movimientos', function () use ($ids, $cash, $session1b, $sell, $methodCash) {
    T::actingAs('cashier1b', 's1');
    $start = $cash->summary($session1b)['expected_cash'];
    // Venta en efectivo de 200.000: paga 250.000 y recibe 50.000 de cambio → +200.000 en caja.
    $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '250000']]);
    $expected = Dec::add($start, '200000');
    T::assertSame($expected, $cash->summary($session1b)['expected_cash']);
    $counted = Dec::sub($expected, '5000');
    T::assertThrows(fn () => $cash->close($session1b, $counted, [], ''), ValidationException::class, 'diferencia');
    $r = $cash->close($session1b, $counted, [], 'Faltante por cambio mal entregado');
    T::assertSame('-5000.00', $r['difference']);
    T::assertSame($expected, $r['expected']);
    T::assertThrows(fn () => $cash->close($session1b, '250000', [], 'otra vez'), ValidationException::class, 'cerrado');
    T::actingAs('admin1', 's1');
    T::assertThrows(fn () => $cash->movement($session1b, 'cash_in', '1000', 'Intento tardío'), ValidationException::class, 'cerrado');
    $cash->approve($session1b, 'Revisado');
});
T::test('Una venta no puede registrarse con la caja cerrada', function () use ($ids, $sell, $methodCash) {
    T::actingAs('cashier1b', 's1');
    T::assertThrows(fn () => $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '200000']]), ValidationException::class, 'abrir su caja');
});

// ---------------------------------------------------------------------------
echo "\nCriterio 13 · Reportes respetan filtros y permisos\n";
T::test('Reporte por sucursal: S01 no incluye ventas de S02', function () use ($ids, $db) {
    T::actingAs('super');
    $rs = new ReportService();
    $f = ['from' => local_today(), 'to' => local_today(), 'branch_ids' => [$ids['s1']], 'user_id' => null];
    $res = $rs->run('sales_branch', $f);
    T::assertSame(1, count($res['rows']));
    T::assertSame('Sucursal Uno', $res['rows'][0]['branch']);
    $expected = (string) $db->value("SELECT SUM(total) FROM sales WHERE branch_id = :b AND status = 'completed'", ['b' => $ids['s1']]);
    T::assertSame(Dec::norm($expected), Dec::norm($res['rows'][0]['total']));
});
T::test('Un administrador de S01 no puede exportar datos de S02 y un cajero no ve reportes', function () use ($ids) {
    T::actingAs('admin1', 's1');
    T::assertSame(403, T::http('GET', '/reports/export?type=sales_branch&branch=' . $ids['s2'])->status);
    $ok = T::http('GET', '/reports/export?type=sales_branch', [], false);
    T::assertSame(200, $ok->status);
    T::assertTrue(!str_contains($ok->body, 'Sucursal Dos'), 'La exportación no debe incluir S02');
    T::actingAs('cashier1', 's1');
    T::assertSame(403, T::http('GET', '/reports')->status);
});
T::test('Un usuario al que se le niega reports.financial no accede al reporte de márgenes', function () {
    App\Core\Database::connection()->query("INSERT INTO user_permissions (user_id, permission_id, effect) SELECT :u, id, 'deny' FROM permissions WHERE code = 'reports.financial'", ['u' => T::$ids['admin1']]);
    T::actingAs('admin1', 's1');
    T::assertThrows(fn () => (new ReportService())->run('margins', ['from' => local_today(), 'to' => local_today(), 'branch_ids' => [T::$ids['s1']]]), HttpException::class);
});

// ---------------------------------------------------------------------------
echo "\nCriterio 14 · Cambios de precio no alteran ventas históricas\n";
T::test('Cambiar el precio y el nombre no modifica las ventas registradas', function () use ($ids, $sell, $methodCash, $db) {
    T::actingAs('cashier1', 's1');
    $s = $sell([['product_id' => $ids['p_unit'], 'quantity' => '1']], [['method_id' => $methodCash, 'amount' => '200000']]);
    T::actingAs('super');
    $p = $db->one('SELECT * FROM products WHERE id = :id', ['id' => $ids['p_unit']]);
    (new ProductService())->update($ids['p_unit'], array_merge($p, ['price' => '250000', 'name' => 'Nombre nuevo', 'is_active' => '1']));
    $it = $db->one('SELECT * FROM sale_items WHERE sale_id = :s', ['s' => $s['id']]);
    T::assertSame('200000.00', $it['list_unit_price']);
    T::assertSame('Perfume de prueba 100 ml', $it['product_name']);
    T::assertSame('200000.00', $db->value('SELECT total FROM sales WHERE id = :id', ['id' => $s['id']]));
    T::assertSame(1, (int) $db->value("SELECT COUNT(*) FROM audit_logs WHERE action = 'product.price_change' AND entity_id = :id", ['id' => $ids['p_unit']]));
    T::assertTrue((int) $db->value("SELECT COUNT(*) FROM product_price_history WHERE product_id = :id AND field = 'price' AND new_value = 250000", ['id' => $ids['p_unit']]) === 1);
});
T::test('Anular una venta compensa inventario y caja y conserva el registro', function () use ($ids, $sell, $methodCash, $db, $cash, $session1) {
    T::actingAs('cashier1', 's1');
    $before = T::stock('s1', 'p_ml');
    $expected = $cash->summary($session1)['expected_cash'];
    $s = $sell([['product_id' => $ids['p_ml'], 'quantity' => '10']], [['method_id' => $methodCash, 'amount' => '12500']]);
    T::actingAs('admin1', 's1');
    $sales = new SaleService();
    $sales->void($s['id'], 'Error al registrar el producto');
    T::assertSame($before, T::stock('s1', 'p_ml'));
    T::assertSame($expected, $cash->summary($session1)['expected_cash']);
    T::assertSame('voided', $db->value('SELECT status FROM sales WHERE id = :id', ['id' => $s['id']]));
    T::assertSame(1, (int) $db->value('SELECT COUNT(*) FROM sale_items WHERE sale_id = :id', ['id' => $s['id']]));
});

// ---------------------------------------------------------------------------
echo "\nCriterio 15 · Archivos subidos seguros\n";
$tmpDir = sys_get_temp_dir() . '/jsp_upload_test_' . bin2hex(random_bytes(3));
mkdir($tmpDir);
T::test('Un script PHP con extensión .jpg es rechazado', function () use ($tmpDir) {
    $f = $tmpDir . '/malicioso.jpg';
    file_put_contents($f, "<?php system(\$_GET['c']); ?>");
    $svc = new ImageService(null, $tmpDir . '/out');
    T::assertThrows(fn () => $svc->process(['name' => 'malicioso.jpg', 'tmp_name' => $f, 'error' => UPLOAD_ERR_OK, 'size' => filesize($f)]), ValidationException::class, 'formato');
});
T::test('Una imagen válida con código incrustado se re-codifica a WebP sin el código', function () use ($tmpDir) {
    $img = imagecreatetruecolor(40, 40);
    imagefill($img, 0, 0, imagecolorallocate($img, 197, 164, 109));
    $f = $tmpDir . '/foto.png';
    ob_start();
    imagepng($img);
    $png = ob_get_clean();
    file_put_contents($f, $png . '<?php echo "pwned"; ?>');
    $svc = new ImageService(null, $tmpDir . '/out');
    [$main, $thumb] = $svc->process(['name' => 'foto.png', 'tmp_name' => $f, 'error' => UPLOAD_ERR_OK, 'size' => filesize($f)]);
    T::assertTrue((bool) preg_match('/^[0-9a-f]{32}\.webp$/', $main), 'Nombre aleatorio .webp');
    $bytes = file_get_contents($tmpDir . '/out/' . $main);
    T::assertTrue(!str_contains($bytes, '<?php'), 'No debe contener código PHP');
    T::assertSame('image/webp', (new finfo(FILEINFO_MIME_TYPE))->file($tmpDir . '/out/' . $thumb));
});
T::test('La carpeta pública de imágenes bloquea la ejecución de scripts', function () {
    $ht = (string) file_get_contents(base_path('public/uploads/.htaccess'));
    T::assertTrue(str_contains($ht, 'php_flag engine off') && str_contains($ht, 'Require all denied'));
});
T::test('Archivos excesivamente grandes son rechazados', function () use ($tmpDir) {
    $svc = new ImageService(null, $tmpDir . '/out');
    T::assertThrows(fn () => $svc->process(['name' => 'x.jpg', 'tmp_name' => '/dev/null', 'error' => UPLOAD_ERR_OK, 'size' => 50 * 1024 * 1024]), ValidationException::class, 'tamaño');
});

// ---------------------------------------------------------------------------
echo "\nSeguridad adicional\n";
T::test('Las peticiones sin token CSRF son rechazadas (419)', function () {
    T::actingAs('super');
    $req = new App\Core\Request('POST', '/settings', [], ['company_name' => 'X'], [], ['REMOTE_ADDR' => '127.0.0.1', 'SCRIPT_NAME' => '/index.php', 'HTTP_ACCEPT' => 'application/json']);
    T::assertSame(419, (new App\Core\App())->handle($req)->status);
});
T::test('Bloqueo tras intentos fallidos de inicio de sesión', function () {
    $auth = new App\Services\AuthService();
    for ($i = 0; $i < 5; $i++) {
        T::assertSame(null, $auth->verifyCredentials('cashier2', 'incorrecta', '10.0.0.9'));
    }
    T::assertThrows(fn () => $auth->verifyCredentials('cashier2', 'Prueba12345', '10.0.0.9'), ValidationException::class, 'demasiados intentos');
});
T::test('Las contraseñas se almacenan con hash y la auditoría registra eventos sensibles', function () use ($db) {
    T::assertTrue(str_starts_with((string) $db->value("SELECT password_hash FROM users WHERE username = 'super'"), '$2y$'));
    foreach (['sale.create', 'sale.void', 'discount.approve', 'cash.close', 'transfer.dispatch', 'return.complete', 'inventory.adjustment'] as $a) {
        T::assertTrue((int) $db->value('SELECT COUNT(*) FROM audit_logs WHERE action = :a', ['a' => $a]) > 0, "Falta auditoría de $a");
    }
});
T::test('Las salidas HTML se escapan (XSS)', function () {
    T::assertSame('&lt;script&gt;alert(1)&lt;/script&gt;', e('<script>alert(1)</script>'));
});

T::test('Apertura de caja: el POS explica qué caja está ocupada y un supervisor puede cerrar ese turno', function () use ($ids, $cash, $session1, $db) {
    T::actingAs('admin1', 's1');
    $html = T::http('GET', '/pos', [], false)->body;
    $busyName = (string) $db->value('SELECT name FROM cash_registers WHERE id = :id', ['id' => $ids['r1']]);
    T::assertTrue(str_contains($html, '<strong>' . e($busyName) . '</strong> está en uso por'), 'Debe indicar la caja ocupada');
    T::assertTrue(str_contains($html, 'value="' . $ids['r1b'] . '" selected'), 'Debe preseleccionar una caja libre');
    T::assertTrue(!str_contains($html, '<option value="' . $ids['r1'] . '"'), 'La caja ocupada no se ofrece');
    $expected = $cash->summary($session1)['expected_cash'];
    T::assertSame(200, T::http('POST', '/cash/close', ['session_id' => (string) $session1, 'counted_cash' => $expected, 'notes' => ''])->status);
    T::assertTrue($db->value('SELECT status FROM cash_sessions WHERE id = :id', ['id' => $session1]) !== 'open');
    T::actingAs('cashier1', 's1');
    T::assertTrue(str_contains(T::http('GET', '/pos', [], false)->body, 'value="' . $ids['r1'] . '" selected'));
});

exit(T::summary());

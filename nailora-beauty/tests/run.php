<?php

declare(strict_types=1);

/**
 * Pruebas automatizadas de Nailora Beauty (sin dependencias externas).
 *
 * Uso:  php tests/run.php
 * Requiere una base de datos de PRUEBA vacía o desechable. Se configura con
 * TEST_DB_DATABASE (por defecto "nailora_test") y usa el resto de DB_* del .env.
 * ¡Las tablas de esa base de datos se borran y recrean en cada ejecución!
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Database;
use App\Core\Env;
use App\Core\Validator;
use App\Models\Order;
use App\Models\Promotion;
use App\Models\Setting;
use App\Models\User;
use App\Services\CartService;
use App\Services\CheckoutException;
use App\Services\CheckoutService;
use App\Services\InstallService;
use App\Services\InventoryService;
use App\Services\OrderService;
use App\Services\PricingService;
use App\Services\UploadService;
use App\Services\WhatsAppService;

$testDb = getenv('TEST_DB_DATABASE') ?: 'nailora_test';
if ($testDb === env('DB_DATABASE') && getenv('ALLOW_MAIN_DB') !== '1') {
    fwrite(STDERR, "Por seguridad, TEST_DB_DATABASE no puede ser la base de datos principal.\n");
    exit(1);
}
Env::set('DB_DATABASE', $testDb);

$passed = 0;
$failed = 0;
function check(string $name, bool $condition, string $detail = ''): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  \033[32m✔\033[0m $name\n";
    } else {
        $failed++;
        echo "  \033[31m✘ $name\033[0m" . ($detail ? " — $detail" : '') . "\n";
    }
}
function throws(callable $fn, string $class = Throwable::class): bool
{
    try {
        $fn();
    } catch (Throwable $e) {
        return $e instanceof $class;
    }
    return false;
}
function section(string $title): void
{
    echo "\n\033[1m$title\033[0m\n";
}

// ---------------------------------------------------------------------------
// Preparación de la base de datos de prueba
// ---------------------------------------------------------------------------
$pdo = Database::connection();
$pdo->exec('SET foreign_key_checks = 0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
    $pdo->exec("DROP TABLE `$table`");
}
$pdo->exec('SET foreign_key_checks = 1');
InstallService::importFile(BASE_PATH . '/database/schema.sql');
InstallService::importFile(BASE_PATH . '/database/seed.sql');
InstallService::importFile(BASE_PATH . '/database/seed.sql'); // idempotencia
Setting::setMany(['whatsapp_number' => '573001234567', 'shipping_mode' => 'manual']);
$_SESSION = [];

$sku = static fn (string $s) => Database::fetch('SELECT * FROM products WHERE sku = :s', ['s' => $s]);
$vsku = static fn (string $s) => Database::fetch('SELECT * FROM product_variants WHERE sku = :s', ['s' => $s]);

section('Base de datos e instalación');
check('El esquema crea las tablas principales', count($pdo->query('SHOW TABLES')->fetchAll()) >= 18);
check('Importar el seed dos veces no duplica productos', (int) Database::value("SELECT COUNT(*) FROM products WHERE sku LIKE 'DEMO-%'") === 22);
check('Importar el seed dos veces no duplica imágenes', (int) Database::value('SELECT COUNT(*) FROM product_images') === 26);
check('Los movimientos iniciales cuadran con el stock', (int) Database::value("SELECT COUNT(*) FROM products p WHERE p.has_variants = 0 AND p.stock <> COALESCE((SELECT SUM(quantity_change) FROM inventory_movements m WHERE m.product_id = p.id AND m.variant_id IS NULL), 0)") === 0);
check('El separador de SQL respeta ";" dentro de cadenas', count(InstallService::splitStatements("INSERT INTO t VALUES ('a;b');\nSELECT 1;")) === 2);

section('Validación y formato');
check('Formato de moneda COP', money(1234567) === '$1.234.567' && money(0) === '$0');
check('Normaliza celular colombiano', normalize_phone_co('300 123 4567') === '573001234567' && normalize_phone_co('+57 (300) 123-4567') === '573001234567');
check('Rechaza teléfonos inválidos', normalize_phone_co('12345') === null && normalize_phone_co('2001234567') === null);
check('Número de WhatsApp sin signos', normalize_whatsapp('+57 300-123-4567') === '573001234567');
check('parse_money entiende 24.000', parse_money('24.000') === 24000.0);
check('Escape HTML', e('<script>alert("x")</script>') === '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
check('rich_text no permite HTML', !str_contains(rich_text("## Hola\n\n<b>x</b>"), '<b>'));
$v = Validator::make(['email' => 'malo', 'qty' => 'abc', 'name' => ''], ['email' => 'email', 'qty' => 'int', 'name' => 'required']);
check('Validator detecta errores', count($v->errors()) === 3);
check('slugify', slugify('Esmalte Rosa Ñandú Básico') === 'esmalte-rosa-nandu-basico');

section('Precios y promociones (siempre en el servidor)');
$nude = $sku('DEMO-ET-001');
check('Precio base sin promociones', PricingService::price($nude)['final'] === 12000.0);
$promoId = Promotion::save(null, ['name' => 'Test 25%', 'discount_type' => 'percent', 'discount_value' => 25, 'scope' => 'products', 'starts_at' => date('Y-m-d H:i:s', time() - 3600), 'ends_at' => date('Y-m-d H:i:s', time() + 3600), 'is_active' => 1], [(int) $nude['id']], []);
$p = PricingService::price($nude);
check('Promoción vigente aplica 25%', $p['final'] === 9000.0 && $p['old_price'] === 12000.0 && $p['percent'] === 25);
Promotion::save(null, ['name' => 'Fija enorme', 'discount_type' => 'fixed', 'discount_value' => 999999, 'scope' => 'all', 'starts_at' => date('Y-m-d H:i:s', time() - 3600), 'ends_at' => date('Y-m-d H:i:s', time() + 3600), 'is_active' => 0], [], []);
check('Promoción inactiva no aplica', PricingService::price($nude)['final'] === 9000.0);
$expired = Promotion::save(null, ['name' => 'Vencida', 'discount_type' => 'fixed', 'discount_value' => 5000, 'scope' => 'all', 'starts_at' => '2020-01-01 00:00:00', 'ends_at' => '2020-02-01 00:00:00', 'is_active' => 1], [], []);
check('Promoción vencida no aplica', PricingService::price($sku('DEMO-ET-002'))['final'] === 12000.0);
check('Descuento fijo nunca deja precio negativo', PricingService::discountFor(['discount_type' => 'fixed', 'discount_value' => 50000], 12000) === 12000.0);
check('La BD rechaza porcentajes mayores a 90', throws(fn () => Database::insert('promotions', ['name' => 'x', 'discount_type' => 'percent', 'discount_value' => 95, 'scope' => 'all', 'starts_at' => '2026-01-01', 'ends_at' => '2027-01-01'])));
$white = $vsku('DEMO-ET-100-BP');
check('La variante usa su propio precio', PricingService::price($sku('DEMO-ET-100'), $white)['final'] === 14000.0);
Promotion::delete($promoId);
Promotion::delete($expired);

section('Carrito');
$_SESSION = [];
CartService::add((int) $nude['id'], null, 2);
check('Añade productos al carrito', CartService::count() === 2);
check('No permite superar el stock', throws(fn () => CartService::add((int) $nude['id'], null, 500), DomainException::class));
check('No permite comprar agotados', throws(fn () => CartService::add((int) $sku('DEMO-HM-003')['id'], null, 1), DomainException::class));
check('Exige variante en productos con variantes', throws(fn () => CartService::add((int) $sku('DEMO-ET-100')['id'], null, 1), DomainException::class));
check('Rechaza variante de otro producto', throws(fn () => CartService::add((int) $nude['id'], (int) $white['id'], 1), DomainException::class));
check('Rechaza cantidades no positivas', throws(fn () => CartService::add((int) $nude['id'], null, 0), DomainException::class));
$vino = $vsku('DEMO-ET-100-VI');
CartService::add((int) $vino['product_id'], (int) $vino['id'], 2);
$summary = CartService::summary();
check('Resumen calcula subtotal desde la BD', $summary['subtotal'] === 2 * 12000.0 + 2 * 13000.0, (string) $summary['subtotal']);
check('Envío "por confirmar" en modo manual', $summary['shipping']['pending'] === true && $summary['total'] === $summary['items_total']);
CartService::update(CartService::key((int) $nude['id'], null), 3);
check('Actualiza cantidades', CartService::count() === 5);
Database::query('UPDATE products SET stock = 1 WHERE id = :id', ['id' => $nude['id']]);
$summary = CartService::summary();
check('Ajusta la cantidad si el stock bajó', $summary['lines'][0]['quantity'] === 1 && $summary['notices'] !== []);
Database::query('UPDATE products SET stock = 25 WHERE id = :id', ['id' => $nude['id']]);
Setting::setMany(['shipping_mode' => 'flat', 'shipping_flat_rate' => '12000', 'free_shipping_threshold' => '100000']);
$summary = CartService::summary();
check('Tarifa fija de envío se suma al total', $summary['shipping']['cost'] === 12000.0 && $summary['total'] === $summary['items_total'] + 12000.0);
Setting::setMany(['shipping_mode' => 'manual']);
CartService::remove(CartService::key((int) $nude['id'], null));
check('Elimina productos', CartService::count() === 2);

section('Checkout y pedidos');
$_SESSION = [];
CartService::add((int) $nude['id'], null, 3);
CartService::add((int) $vino['product_id'], (int) $vino['id'], 2);
$customer = ['full_name' => 'Cliente Prueba', 'phone' => '573009998877', 'email' => null, 'department' => 'Antioquia', 'city' => 'Medellín', 'address' => 'Calle 10 # 20-30', 'neighborhood' => null, 'delivery_notes' => null, 'payment_method' => 'Transferencia bancaria'];
$token = bin2hex(random_bytes(16));
$order = CheckoutService::placeOrder($customer, CartService::items(), $token, '127.0.0.1');
check('Crea el pedido con código NB-AAAA-000000', (bool) preg_match('/^NB-\d{4}-\d{6}$/', (string) $order['code']));
check('El total se calcula en el servidor', (float) $order['total'] === 3 * 12000.0 + 2 * 13000.0);
check('Estado inicial pendiente', $order['status'] === 'pending' && $order['stock_status'] === 'reserved');
check('Descuenta stock del producto', (int) $sku('DEMO-ET-001')['stock'] === 22);
check('Descuenta stock de la variante', (int) $vsku('DEMO-ET-100-VI')['stock'] === 0);
$items = Order::items((int) $order['id']);
check('Guarda copia de nombre, SKU y precio', count($items) === 2 && $items[0]['sku'] !== '' && (float) $items[0]['unit_price'] > 0);
check('Registra el historial de estado', count(Order::history((int) $order['id'])) === 1);
$again = CheckoutService::placeOrder($customer, CartService::items(), $token, '127.0.0.1');
check('El mismo token no crea pedidos duplicados', (int) $again['id'] === (int) $order['id'] && (int) Database::value('SELECT COUNT(*) FROM orders') === 1);
check('No descuenta stock dos veces', (int) $sku('DEMO-ET-001')['stock'] === 22);
check('Sin stock suficiente el pedido se rechaza', throws(fn () => CheckoutService::placeOrder($customer, CartService::items(), bin2hex(random_bytes(16)), null), CheckoutException::class));
check('El pedido rechazado no altera el stock', (int) $sku('DEMO-ET-001')['stock'] === 22 && (int) Database::value('SELECT COUNT(*) FROM orders') === 1);
check('Carrito vacío se rechaza', throws(fn () => CheckoutService::placeOrder($customer, [], bin2hex(random_bytes(16)), null), CheckoutException::class));
$_SESSION = [];
CartService::add((int) $nude['id'], null, 1);
$order2 = CheckoutService::placeOrder(['full_name' => 'Cliente Prueba Dos'] + $customer, CartService::items(), bin2hex(random_bytes(16)), null);
check('Códigos de pedido únicos', $order2['code'] !== $order['code']);
check('Un mismo teléfono no duplica clientes', (int) Database::value('SELECT COUNT(*) FROM customers') === 1);

section('WhatsApp');
$msg = WhatsAppService::orderMessage(Order::find((int) $order['id']), $items);
$link = (string) WhatsAppService::link($msg);
check('Enlace con formato wa.me oficial', str_starts_with($link, 'https://wa.me/573001234567?text='));
check('Mensaje codificado con rawurlencode', !str_contains($link, ' ') && str_contains($link, '%0A'));
check('El mensaje contiene el código y el total', str_contains($msg, $order['code']) && str_contains($msg, 'Total provisional: $62.000'));
Setting::setMany(['whatsapp_number' => '']);
check('Sin número configurado no se genera enlace', WhatsAppService::link('hola') === null);
Setting::setMany(['whatsapp_number' => '573001234567']);

section('Estados e inventario');
$adminId = User::create('Admin Test', 'test@example.com', 'ClaveDePrueba123');
check('Contraseña guardada con hash', password_verify('ClaveDePrueba123', (string) Database::value('SELECT password_hash FROM users WHERE id = :id', ['id' => $adminId])) && Database::value('SELECT password_hash FROM users WHERE id = :id', ['id' => $adminId]) !== 'ClaveDePrueba123');
check('Política de contraseñas', User::passwordPolicyError('corta') !== null && User::passwordPolicyError('soloLetrasLargas') !== null && User::passwordPolicyError('Letras12345') === null);
check('Transición inválida rechazada', throws(fn () => OrderService::changeStatus((int) $order['id'], 'delivered', $adminId), DomainException::class));
OrderService::changeStatus((int) $order['id'], 'confirmed', $adminId);
check('Confirmación registra fecha y usuario', Order::find((int) $order['id'])['confirmed_at'] !== null && (int) Order::history((int) $order['id'])[1]['user_id'] === $adminId);
OrderService::changeStatus((int) $order['id'], 'cancelled', $adminId, 'Prueba');
check('Cancelar devuelve el stock', (int) $sku('DEMO-ET-001')['stock'] === 24 && (int) $vsku('DEMO-ET-100-VI')['stock'] === 2);
check('Cancelar dos veces no está permitido', throws(fn () => OrderService::changeStatus((int) $order['id'], 'cancelled', $adminId), DomainException::class));
$restored = InventoryService::releaseOrder(Order::find((int) $order['id']), Order::items((int) $order['id']), $adminId);
check('La devolución es idempotente', $restored === 0 && (int) $sku('DEMO-ET-001')['stock'] === 24);
check('La BD impide duplicar devoluciones de la misma línea', throws(fn () => Database::insert('inventory_movements', ['product_id' => $nude['id'], 'movement_type' => 'order_cancel_return', 'quantity_before' => 0, 'quantity_change' => 1, 'quantity_after' => 1, 'reason' => 'x', 'order_id' => $order['id']])));
$r = InventoryService::adjust((int) $nude['id'], null, 'purchase', 6, 'Reposición', 'FAC-1', $adminId);
check('Entrada de inventario', $r['before'] === 24 && $r['after'] === 30);
check('Salida mayor al stock rechazada', throws(fn () => InventoryService::adjust((int) $nude['id'], null, 'damage', 100, 'Daño', null, $adminId), DomainException::class));
check('Motivo obligatorio', throws(fn () => InventoryService::adjust((int) $nude['id'], null, 'purchase', 1, '  ', null, $adminId), DomainException::class));
InventoryService::adjust((int) $nude['id'], null, 'adjustment', 12, 'Conteo físico', null, $adminId);
$last = Database::fetch('SELECT * FROM inventory_movements WHERE product_id = :p ORDER BY id DESC LIMIT 1', ['p' => $nude['id']]);
check('Ajuste por conteo registra antes/cambio/después', (int) $last['quantity_before'] === 30 && (int) $last['quantity_change'] === -18 && (int) $last['quantity_after'] === 12 && (int) $last['user_id'] === $adminId);
check('Stock negativo imposible en la BD', throws(fn () => Database::query('UPDATE products SET stock = -1 WHERE id = :id', ['id' => $nude['id']])));
OrderService::setShippingCost((int) $order2['id'], 15000, $adminId);
check('Costo de envío recalcula el total', (float) Order::find((int) $order2['id'])['total'] === 12000.0 + 15000.0);

section('Subida de imágenes');
UploadService::$allowNonUploadedFiles = true;
$tmpDir = sys_get_temp_dir();
$fake = tempnam($tmpDir, 'nb');
file_put_contents($fake, '<?php echo 1; ?>');
check('Rechaza PHP disfrazado de imagen', throws(fn () => UploadService::storeImage(['error' => UPLOAD_ERR_OK, 'tmp_name' => $fake, 'name' => 'x.jpg', 'size' => 16], 'products'), DomainException::class));
check('Rechaza carpetas no permitidas', throws(fn () => UploadService::storeImage(['error' => UPLOAD_ERR_OK, 'tmp_name' => $fake], '../../config'), DomainException::class));
if (extension_loaded('gd')) {
    $png = tempnam($tmpDir, 'nb');
    $img = imagecreatetruecolor(120, 120);
    imagepng($img, $png);
    $stored = UploadService::storeImage(['error' => UPLOAD_ERR_OK, 'tmp_name' => $png, 'name' => 'a.png', 'size' => filesize($png)], 'products');
    check('Acepta PNG válido con nombre aleatorio', (bool) preg_match('#^uploads/products/[a-f0-9]{32}\.(webp|png)$#', $stored) && is_file(PUBLIC_PATH . '/' . $stored));
    UploadService::delete($stored);
    check('Elimina la imagen subida', !is_file(PUBLIC_PATH . '/' . $stored));
    unlink($png);
}
UploadService::delete('../config/app.php');
check('No elimina archivos fuera de uploads', is_file(BASE_PATH . '/config/app.php'));
is_file($fake) && unlink($fake);

echo "\n" . ($failed === 0 ? "\033[32m" : "\033[31m") . "$passed pruebas correctas, $failed fallidas\033[0m\n";
exit($failed === 0 ? 0 : 1);

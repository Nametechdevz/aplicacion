<?php
declare(strict_types=1);

namespace Tests;

use App\Core\App;
use App\Core\Auth;
use App\Core\Config;
use App\Core\Csrf;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;
use App\Services\Settings;
use App\Support\Migrator;
use PDO;

/**
 * Utilidades de prueba: base de datos aislada (DB_DATABASE + "_test"),
 * datos mínimos y peticiones HTTP simuladas contra el núcleo real.
 */
final class TestCase
{
    public static array $ids = [];
    private static int $passed = 0;
    private static array $failures = [];

    public static function setUpDatabase(): void
    {
        $cfg = Config::get('database');
        $name = (getenv('DB_DATABASE_TEST') ?: $cfg['database'] . '_test');
        if (!preg_match('/_test$/', $name)) {
            throw new \RuntimeException('La base de pruebas debe terminar en _test');
        }
        $pdo = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $cfg['host'], $cfg['port']), $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec("DROP DATABASE IF EXISTS `$name`");
        $pdo->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `$name`");
        $pdo->exec("SET time_zone = '+00:00'");
        (new Migrator($pdo, base_path('database/migrations')))->run(static fn () => null);
        Config::set('database.database', $name);
        Database::setConnection(null);
        Session::useMemory();
        Settings::flush();
        self::seed();
    }

    private static function seed(): void
    {
        $db = Database::connection();
        $hash = password_hash('Prueba12345', PASSWORD_DEFAULT);
        $user = function (string $username, string $role, array $branches) use ($db, $hash): int {
            $id = $db->insert('users', ['name' => ucfirst($username), 'username' => $username, 'password_hash' => $hash]);
            $db->query('INSERT INTO user_roles (user_id, role_id) SELECT :u, id FROM roles WHERE code = :r', ['u' => $id, 'r' => $role]);
            foreach ($branches as $i => $b) {
                $db->insert('branch_user_assignments', ['branch_id' => $b, 'user_id' => $id, 'is_default' => $i === 0 ? 1 : 0]);
            }
            return $id;
        };
        $alm = (int) $db->value("SELECT id FROM branches WHERE code = 'ALM'");
        $s1 = $db->insert('branches', ['code' => 'S01', 'name' => 'Sucursal Uno', 'type' => 'store']);
        $s2 = $db->insert('branches', ['code' => 'S02', 'name' => 'Sucursal Dos', 'type' => 'store']);
        $r1 = $db->insert('cash_registers', ['branch_id' => $s1, 'code' => 'CAJA1', 'name' => 'Caja 1']);
        $r1b = $db->insert('cash_registers', ['branch_id' => $s1, 'code' => 'CAJA2', 'name' => 'Caja 2']);
        $r2 = $db->insert('cash_registers', ['branch_id' => $s2, 'code' => 'CAJA1', 'name' => 'Caja 1']);
        self::$ids = [
            'alm' => $alm, 's1' => $s1, 's2' => $s2, 'r1' => $r1, 'r1b' => $r1b, 'r2' => $r2,
            'super' => $user('super', 'superadmin', [$alm]),
            'admin1' => $user('admin1', 'branch_admin', [$s1]),
            'cashier1' => $user('cashier1', 'cashier', [$s1]),
            'cashier1b' => $user('cashier1b', 'cashier', [$s1]),
            'cashier2' => $user('cashier2', 'cashier', [$s2]),
        ];
        $unit = fn (string $c) => (int) $db->value('SELECT id FROM units_of_measure WHERE code = :c', ['c' => $c]);
        self::$ids['p_unit'] = $db->insert('products', ['code' => 'T-UND', 'barcode' => '7700000000017', 'name' => 'Perfume de prueba 100 ml', 'base_unit_id' => $unit('und'), 'sale_mode' => 'unit', 'qty_precision' => 0, 'price' => '200000.00', 'cost' => '80000.0000']);
        self::$ids['p_ml'] = $db->insert('products', ['code' => 'T-ML', 'name' => 'Fragancia a granel de prueba', 'base_unit_id' => $unit('ml'), 'sale_mode' => 'fractional', 'qty_precision' => 1, 'price' => '1250.00', 'cost' => '400.0000']);
        self::$ids['v_10ml'] = $db->insert('product_variants', ['product_id' => self::$ids['p_ml'], 'name' => 'Decant 10 ml', 'base_qty' => '10.000', 'price' => '15000.00']);
        self::$ids['p_g'] = $db->insert('products', ['code' => 'T-G', 'name' => 'Crema por peso de prueba', 'base_unit_id' => $unit('g'), 'sale_mode' => 'fractional', 'qty_precision' => 0, 'price' => '200.00', 'cost' => '60.0000']);
        // Existencias iniciales por medio del servicio real.
        self::actingAs('super');
        $inv = new \App\Services\InventoryService();
        $inv->entry($alm, [['product_id' => self::$ids['p_unit'], 'quantity' => '50'], ['product_id' => self::$ids['p_ml'], 'quantity' => '5000']], 'initial', 'Inventario inicial de prueba');
        $inv->entry($s1, [['product_id' => self::$ids['p_unit'], 'quantity' => '10'], ['product_id' => self::$ids['p_ml'], 'quantity' => '1000'], ['product_id' => self::$ids['p_g'], 'quantity' => '500']], 'initial', 'Inventario inicial de prueba');
        $inv->entry($s2, [['product_id' => self::$ids['p_unit'], 'quantity' => '5']], 'initial', 'Inventario inicial de prueba');
    }

    public static function actingAs(string $key, ?string $branchKey = null): int
    {
        $id = self::$ids[$key];
        Auth::actingAs($id);
        if ($branchKey) {
            Auth::setActiveBranch(self::$ids[$branchKey]);
        }
        return $id;
    }

    public static function stock(string $branchKey, string $productKey): string
    {
        return (string) (Database::connection()->value(
            'SELECT quantity FROM inventory WHERE branch_id = :b AND product_id = :p',
            ['b' => self::$ids[$branchKey], 'p' => self::$ids[$productKey]]
        ) ?? '0.000');
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    /** Petición HTTP simulada contra el enrutador real (con CSRF válido). */
    public static function http(string $method, string $path, array $data = [], bool $json = true): Response
    {
        Auth::reset();
        $token = Csrf::token();
        $server = ['REMOTE_ADDR' => '127.0.0.1', 'SCRIPT_NAME' => '/index.php', 'HTTP_X_CSRF_TOKEN' => $token];
        if ($json) {
            $server['HTTP_ACCEPT'] = 'application/json';
        }
        $parts = parse_url($path);
        parse_str($parts['query'] ?? '', $query);
        $req = new Request($method, $parts['path'], $method === 'GET' ? array_merge($query, $data) : $query, $method === 'GET' ? [] : $data, [], $server);
        $resp = (new App())->handle($req);
        Auth::reset();
        return $resp;
    }

    // ---------------------------------------------------------------

    public static function test(string $name, callable $fn): void
    {
        $db = Database::connection();
        try {
            $fn();
            self::$passed++;
            echo "  \033[32m✔\033[0m $name\n";
        } catch (\Throwable $e) {
            self::$failures[] = [$name, $e];
            echo "  \033[31m✘ $name\033[0m\n      " . get_class($e) . ': ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ")\n";
        } finally {
            if ($db->inTransaction()) {
                $db->pdo()->rollBack();
            }
        }
    }

    public static function assertTrue(bool $cond, string $msg = 'Se esperaba verdadero'): void
    {
        if (!$cond) {
            throw new \AssertionError($msg);
        }
    }

    public static function assertSame(mixed $expected, mixed $actual, string $msg = ''): void
    {
        if ($expected !== $actual) {
            throw new \AssertionError(($msg ? "$msg: " : '') . 'esperado ' . var_export($expected, true) . ', obtenido ' . var_export($actual, true));
        }
    }

    public static function assertThrows(callable $fn, string $class, ?string $contains = null): \Throwable
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            if (!$e instanceof $class) {
                throw new \AssertionError("Se esperaba $class, se obtuvo " . get_class($e) . ': ' . $e->getMessage());
            }
            if ($contains !== null && !str_contains(mb_strtolower($e->getMessage()), mb_strtolower($contains))) {
                throw new \AssertionError("El mensaje «{$e->getMessage()}» no contiene «{$contains}»");
            }
            return $e;
        }
        throw new \AssertionError("Se esperaba la excepción $class");
    }

    public static function summary(): int
    {
        $total = self::$passed + count(self::$failures);
        echo "\n" . (self::$failures ? "\033[31m" : "\033[32m") . self::$passed . " de $total pruebas superadas\033[0m\n";
        return self::$failures ? 1 : 0;
    }
}

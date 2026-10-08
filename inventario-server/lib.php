<?php
/**
 * Inventario Pro - servidor (PHP 7.4+ y MySQL/MariaDB).
 * Funciones comunes: base de datos, esquema, autenticación y respuestas JSON.
 */
if (!defined('INV_APP')) {
    http_response_code(403);
    exit;
}

const INV_VERSION = '1.0.0';
const INV_SCHEMA = 1;

class ApiError extends Exception
{
    public $status;

    public function __construct($message, $status = 400)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

/**
 * Columnas de cada tabla sincronizada. Tipos: i = entero, i? = entero o null, f = decimal,
 * b = sí/no, s = texto corto, t = texto largo. Los nombres coinciden con los de la app.
 */
function entity_fields()
{
    return array(
        'items' => array(
            'id' => 'i', 'category' => 's', 'name' => 's', 'plan' => 's', 'accessUser' => 's',
            'accessPassword' => 's', 'profilePin' => 's', 'accessUrl' => 't', 'extraInfo' => 't',
            'supplier' => 's', 'costPrice' => 'f', 'suggestedPrice' => 'f', 'purchaseDate' => 'i?',
            'expirationDate' => 'i?', 'status' => 's', 'clientId' => 'i?', 'saleDate' => 'i?',
            'salePrice' => 'f', 'clientExpirationDate' => 'i?', 'paid' => 'b', 'lastReminderAt' => 'i?',
            'notes' => 't', 'createdAt' => 'i', 'updatedAt' => 'i', 'kind' => 's', 'parentId' => 'i?',
            'rev' => 'i',
        ),
        'clients' => array(
            'id' => 'i', 'name' => 's', 'whatsapp' => 's', 'email' => 's', 'notes' => 't',
            'createdAt' => 'i', 'rev' => 'i',
        ),
        'sales' => array(
            'id' => 'i', 'itemId' => 'i?', 'clientId' => 'i?', 'itemName' => 's', 'clientName' => 's',
            'category' => 's', 'amount' => 'f', 'cost' => 'f', 'date' => 'i', 'kind' => 's',
            'createdAt' => 'i', 'createdBy' => 's', 'rev' => 'i',
        ),
    );
}

function now_ms()
{
    return (int) round(microtime(true) * 1000);
}

function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = connect_db(DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS);
    }
    return $pdo;
}

function connect_db($host, $port, $name, $user, $pass)
{
    $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
    return new PDO($dsn, $user, $pass, array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ));
}

/**
 * Crea las tablas (si no existen). Cada usuario tiene su propio inventario: todas las tablas de
 * datos llevan owner_id y la clave primaria es (owner_id, id), así los datos nunca se mezclan.
 */
function create_schema(PDO $pdo)
{
    $engine = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    foreach (entity_fields() as $table => $fields) {
        $cols = array();
        foreach ($fields as $name => $type) {
            if ($name === 'id') {
                $cols[] = '`owner_id` INT NOT NULL';
                $cols[] = '`id` BIGINT NOT NULL';
                continue;
            }
            switch ($type) {
                case 'i': $cols[] = "`$name` BIGINT NOT NULL DEFAULT 0"; break;
                case 'i?': $cols[] = "`$name` BIGINT NULL DEFAULT NULL"; break;
                case 'f': $cols[] = "`$name` DOUBLE NOT NULL DEFAULT 0"; break;
                case 'b': $cols[] = "`$name` TINYINT(1) NOT NULL DEFAULT 0"; break;
                case 't': $cols[] = "`$name` TEXT NULL"; break;
                default: $cols[] = "`$name` VARCHAR(500) NOT NULL DEFAULT ''";
            }
        }
        $cols[] = 'PRIMARY KEY (`owner_id`, `id`)';
        $cols[] = 'INDEX idx_owner_rev (`owner_id`, `rev`)';
        $pdo->exec("CREATE TABLE IF NOT EXISTS `$table` (" . implode(', ', $cols) . ") $engine");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS `deletions` (
        `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `owner_id` INT NOT NULL, `entity` VARCHAR(20) NOT NULL, `entityId` BIGINT NOT NULL, `rev` BIGINT NOT NULL,
        INDEX idx_owner_rev (`owner_id`, `rev`)) $engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(100) NOT NULL, `username` VARCHAR(60) NOT NULL UNIQUE,
        `password_hash` VARCHAR(255) NOT NULL, `role` VARCHAR(10) NOT NULL DEFAULT 'USER',
        `phone` VARCHAR(40) NOT NULL DEFAULT '', `expires_at` BIGINT NOT NULL DEFAULT 0,
        `active` TINYINT(1) NOT NULL DEFAULT 1, `failed` INT NOT NULL DEFAULT 0,
        `locked_until` BIGINT NOT NULL DEFAULT 0, `created_at` BIGINT NOT NULL DEFAULT 0,
        `last_login` BIGINT NOT NULL DEFAULT 0) $engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `tokens` (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY, `user_id` INT NOT NULL,
        `created_at` BIGINT NOT NULL, `last_used` BIGINT NOT NULL, `device` VARCHAR(100) NOT NULL DEFAULT '',
        INDEX idx_user (`user_id`)) $engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `activity` (
        `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, `user_id` INT NOT NULL,
        `user_name` VARCHAR(100) NOT NULL, `action` VARCHAR(500) NOT NULL, `created_at` BIGINT NOT NULL,
        INDEX idx_created (`created_at`)) $engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `user_settings` (`user_id` INT NOT NULL PRIMARY KEY, `data` TEXT NULL) $engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `meta` (`k` VARCHAR(50) NOT NULL PRIMARY KEY, `v` TEXT NULL) $engine");
    $pdo->exec("INSERT IGNORE INTO `meta` (`k`, `v`) VALUES ('rev', '0'), ('schema', '" . INV_SCHEMA . "')");
}

// ---------------------------------------------------------------- respuestas

function send_json($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body()
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input');
        $data = $raw === '' ? array() : json_decode($raw, true);
        if (!is_array($data)) {
            throw new ApiError('Solicitud inválida (JSON)');
        }
    }
    return $data;
}

function require_method($method)
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        throw new ApiError('Método no permitido', 405);
    }
}

// ---------------------------------------------------------------- filas

/** Convierte un valor recibido o leído de la BD al tipo de la columna. */
function cast_value($type, $value)
{
    switch ($type) {
        case 'i': return (int) $value;
        case 'i?': return ($value === null || $value === '') ? null : (int) $value;
        case 'f': return (float) $value;
        case 'b': return (bool) $value;
        default: return $value === null ? '' : (string) $value;
    }
}

function cast_row($table, $row)
{
    $out = array();
    foreach (entity_fields()[$table] as $name => $type) {
        $out[$name] = cast_value($type, isset($row[$name]) ? $row[$name] : null);
    }
    return $out;
}

function fetch_row($owner, $table, $id, $forUpdate = false)
{
    $st = db()->prepare("SELECT * FROM `$table` WHERE `owner_id` = ? AND `id` = ?" . ($forUpdate ? ' FOR UPDATE' : ''));
    $st->execute(array($owner, $id));
    $row = $st->fetch();
    return $row ? cast_row($table, $row) : null;
}

function upsert_row($owner, $table, $row)
{
    $row['owner_id'] = (int) $owner;
    $fields = array_merge(array('owner_id'), array_keys(entity_fields()[$table]));
    $cols = '`' . implode('`, `', $fields) . '`';
    $marks = implode(', ', array_fill(0, count($fields), '?'));
    $updates = array();
    foreach ($fields as $f) {
        if ($f !== 'id' && $f !== 'owner_id') {
            $updates[] = "`$f` = VALUES(`$f`)";
        }
    }
    $values = array();
    foreach ($fields as $f) {
        $v = $row[$f];
        $values[] = is_bool($v) ? ($v ? 1 : 0) : $v;
    }
    $sql = "INSERT INTO `$table` ($cols) VALUES ($marks) ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
    db()->prepare($sql)->execute($values);
}

// ---------------------------------------------------------------- meta y revisiones

function meta_get($k, $default = null)
{
    $st = db()->prepare('SELECT `v` FROM `meta` WHERE `k` = ?');
    $st->execute(array($k));
    $v = $st->fetchColumn();
    return $v === false ? $default : $v;
}

function meta_set($k, $v)
{
    db()->prepare('INSERT INTO `meta` (`k`, `v`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `v` = VALUES(`v`)')
        ->execute(array($k, $v));
}

/** Reserva la siguiente revisión global (dentro de una transacción; bloquea a otros escritores). */
function next_rev()
{
    $current = (int) db()->query("SELECT `v` FROM `meta` WHERE `k` = 'rev' FOR UPDATE")->fetchColumn();
    $rev = $current + 1;
    meta_set('rev', (string) $rev);
    return $rev;
}

function current_rev()
{
    return (int) meta_get('rev', '0');
}

/** Ajustes (marca, moneda, plantillas...) de cada usuario. */
function user_settings($userId)
{
    $st = db()->prepare('SELECT `data` FROM `user_settings` WHERE `user_id` = ?');
    $st->execute(array($userId));
    $s = json_decode((string) $st->fetchColumn(), true);
    return is_array($s) ? $s : null;
}

function save_user_settings($userId, $settings)
{
    db()->prepare('INSERT INTO `user_settings` (`user_id`, `data`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `data` = VALUES(`data`)')
        ->execute(array($userId, json_encode($settings, JSON_UNESCAPED_UNICODE)));
}

/**
 * Última versión publicada de la app. Viene de updates/release.json (incluido en el ZIP del
 * servidor) o de una publicación hecha desde el panel web; gana la de versionCode mayor.
 */
function latest_release()
{
    $best = null;
    $file = __DIR__ . '/updates/release.json';
    if (is_file($file)) {
        $r = json_decode((string) file_get_contents($file), true);
        if (is_array($r) && !empty($r['versionCode']) && !empty($r['file']) && is_file(__DIR__ . '/updates/' . basename($r['file']))) {
            $r['url'] = base_url() . '/updates/' . rawurlencode(basename($r['file']));
            $best = $r;
        }
    }
    $panel = json_decode((string) meta_get('app_release', ''), true);
    if (is_array($panel) && !empty($panel['versionCode']) && !empty($panel['url'])) {
        if ($best === null || (int) $panel['versionCode'] > (int) $best['versionCode']) {
            $best = $panel;
        }
    }
    if ($best === null) {
        return null;
    }
    return array(
        'versionCode' => (int) $best['versionCode'],
        'versionName' => (string) (isset($best['versionName']) ? $best['versionName'] : ''),
        'notes' => (string) (isset($best['notes']) ? $best['notes'] : ''),
        'url' => (string) $best['url'],
    );
}

/** Dirección pública de la carpeta del servidor (https://dominio.com/inventario). */
function base_url()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    return ($https ? 'https' : 'http') . '://' . $host . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
}

function log_activity($user, $action)
{
    $action = trim((string) $action);
    if ($action === '') {
        return;
    }
    db()->prepare('INSERT INTO `activity` (`user_id`, `user_name`, `action`, `created_at`) VALUES (?, ?, ?, ?)')
        ->execute(array($user['id'], $user['name'], mb_substr($action, 0, 500), now_ms()));
}

// ---------------------------------------------------------------- autenticación

function request_token()
{
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return $_SERVER['HTTP_X_AUTH_TOKEN'];
    }
    $auth = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (stripos($auth, 'Bearer ') === 0) {
        return substr($auth, 7);
    }
    return '';
}

function public_user($u)
{
    return array(
        'id' => (int) $u['id'],
        'name' => $u['name'],
        'username' => $u['username'],
        'phone' => isset($u['phone']) ? $u['phone'] : '',
        'role' => $u['role'],
        'active' => (bool) $u['active'],
        'expiresAt' => (int) $u['expires_at'],
        'lastLogin' => (int) $u['last_login'],
    );
}

/** Acceso vencido: el administrador le puso fecha límite y ya pasó. */
function access_expired($u)
{
    return $u['role'] !== 'ADMIN' && (int) $u['expires_at'] > 0 && (int) $u['expires_at'] < now_ms();
}

/** Usuario de la sesión actual o error 401. */
function auth_user()
{
    static $user = null;
    if ($user !== null) {
        return $user;
    }
    $token = request_token();
    if ($token === '') {
        throw new ApiError('Inicie sesión', 401);
    }
    $st = db()->prepare('SELECT u.* FROM `tokens` t JOIN `users` u ON u.id = t.user_id WHERE t.token_hash = ?');
    $st->execute(array(hash('sha256', $token)));
    $u = $st->fetch();
    if (!$u) {
        throw new ApiError('La sesión expiró, inicie sesión de nuevo', 401);
    }
    if (!$u['active']) {
        throw new ApiError('Su usuario está desactivado', 401);
    }
    if (access_expired($u)) {
        throw new ApiError('Su acceso venció. Comuníquese con el administrador para renovarlo', 402);
    }
    db()->prepare('UPDATE `tokens` SET `last_used` = ? WHERE `token_hash` = ?')
        ->execute(array(now_ms(), hash('sha256', $token)));
    $user = $u;
    return $user;
}

function require_admin()
{
    $u = auth_user();
    if ($u['role'] !== 'ADMIN') {
        throw new ApiError('Solo el administrador puede hacer esto', 403);
    }
    return $u;
}

function create_user(PDO $pdo, $name, $username, $password, $role, $phone = '', $expiresAt = 0)
{
    $pdo->prepare('INSERT INTO `users` (`name`, `username`, `password_hash`, `role`, `phone`, `expires_at`, `active`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        ->execute(array($name, strtolower($username), password_hash($password, PASSWORD_DEFAULT), $role, $phone, (int) $expiresAt, now_ms()));
    return (int) $pdo->lastInsertId();
}

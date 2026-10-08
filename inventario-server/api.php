<?php
/**
 * Inventario Pro - API para la app Android.
 * Cada usuario (revendedor) tiene su propio inventario, clientes, ventas y marca; puede abrirlos
 * desde varios dispositivos. El administrador crea y gestiona las cuentas de los usuarios.
 * Rutas: api.php?r=<ruta>. Autenticación con la cabecera X-Auth-Token.
 */
define('INV_APP', true);
require __DIR__ . '/lib.php';

if (!file_exists(__DIR__ . '/config.php')) {
    send_json(array('error' => 'El servidor no está instalado. Abra install.php'), 503);
}
require __DIR__ . '/config.php';

header('X-Content-Type-Options: nosniff');

$route = isset($_GET['r']) ? $_GET['r'] : '';

try {
    switch ($route) {
        case 'ping':
            send_json(array('ok' => true, 'app' => 'inventario-pro', 'version' => INV_VERSION));
            break;
        case 'version':
            send_json(array('release' => latest_release()));
            break;
        case 'login':
            api_login();
            break;
        case 'logout':
            api_logout();
            break;
        case 'me':
            send_json(array('user' => public_user(auth_user())));
            break;
        case 'password':
            api_password();
            break;
        case 'sync':
            api_sync();
            break;
        case 'commit':
            api_commit();
            break;
        case 'settings':
            api_settings();
            break;
        case 'import':
            api_import();
            break;
        case 'users':
            api_users();
            break;
        case 'users_save':
            api_users_save();
            break;
        case 'activity':
            api_activity();
            break;
        default:
            throw new ApiError('Ruta desconocida', 404);
    }
} catch (ApiError $e) {
    if (db_in_transaction()) {
        db()->rollBack();
    }
    send_json(array('error' => $e->getMessage()), $e->status);
} catch (Throwable $e) {
    if (db_in_transaction()) {
        db()->rollBack();
    }
    error_log('Inventario Pro: ' . $e);
    send_json(array('error' => 'Error interno del servidor'), 500);
}

function db_in_transaction()
{
    try {
        return db()->inTransaction();
    } catch (Throwable $e) {
        return false;
    }
}

// ---------------------------------------------------------------- sesión

function api_login()
{
    require_method('POST');
    $b = body();
    $username = strtolower(trim(isset($b['username']) ? (string) $b['username'] : ''));
    $password = isset($b['password']) ? (string) $b['password'] : '';
    if ($username === '' || $password === '') {
        throw new ApiError('Escriba usuario y contraseña');
    }
    $st = db()->prepare('SELECT * FROM `users` WHERE `username` = ?');
    $st->execute(array($username));
    $u = $st->fetch();
    $now = now_ms();
    if ($u && (int) $u['locked_until'] > $now) {
        $min = (int) ceil(((int) $u['locked_until'] - $now) / 60000);
        throw new ApiError("Demasiados intentos. Intente de nuevo en $min minuto(s)", 429);
    }
    if (!$u || !password_verify($password, $u['password_hash'])) {
        if ($u) {
            $failed = (int) $u['failed'] + 1;
            $locked = $failed >= 8 ? $now + 10 * 60000 : 0;
            db()->prepare('UPDATE `users` SET `failed` = ?, `locked_until` = ? WHERE `id` = ?')
                ->execute(array($locked ? 0 : $failed, $locked, $u['id']));
        }
        throw new ApiError('Usuario o contraseña incorrectos', 401);
    }
    if (!$u['active']) {
        throw new ApiError('Su usuario está desactivado. Comuníquese con el administrador', 403);
    }
    if (access_expired($u)) {
        throw new ApiError('Su acceso venció. Comuníquese con el administrador para renovarlo', 402);
    }
    $token = bin2hex(random_bytes(32));
    $device = mb_substr(isset($b['device']) ? (string) $b['device'] : '', 0, 100);
    db()->prepare('INSERT INTO `tokens` (`token_hash`, `user_id`, `created_at`, `last_used`, `device`) VALUES (?, ?, ?, ?, ?)')
        ->execute(array(hash('sha256', $token), $u['id'], $now, $now, $device));
    db()->prepare('UPDATE `users` SET `failed` = 0, `locked_until` = 0, `last_login` = ? WHERE `id` = ?')
        ->execute(array($now, $u['id']));
    $u['last_login'] = $now;
    log_activity($u, 'Inició sesión' . ($device !== '' ? " ($device)" : ''));
    send_json(array('token' => $token, 'user' => public_user($u), 'hasData' => owner_has_data($u['id'])));
}

function api_logout()
{
    require_method('POST');
    auth_user();
    db()->prepare('DELETE FROM `tokens` WHERE `token_hash` = ?')->execute(array(hash('sha256', request_token())));
    send_json(array('ok' => true));
}

function api_password()
{
    require_method('POST');
    $u = auth_user();
    $b = body();
    $current = isset($b['current']) ? (string) $b['current'] : '';
    $new = isset($b['new']) ? (string) $b['new'] : '';
    if (!password_verify($current, $u['password_hash'])) {
        throw new ApiError('La contraseña actual no es correcta');
    }
    if (strlen($new) < 6) {
        throw new ApiError('La nueva contraseña debe tener al menos 6 caracteres');
    }
    db()->prepare('UPDATE `users` SET `password_hash` = ? WHERE `id` = ?')
        ->execute(array(password_hash($new, PASSWORD_DEFAULT), $u['id']));
    // Cierra las sesiones de los demás dispositivos.
    db()->prepare('DELETE FROM `tokens` WHERE `user_id` = ? AND `token_hash` <> ?')
        ->execute(array($u['id'], hash('sha256', request_token())));
    log_activity($u, 'Cambió su contraseña');
    send_json(array('ok' => true));
}

function owner_has_data($owner)
{
    $st = db()->prepare('SELECT (SELECT COUNT(*) FROM `items` WHERE `owner_id` = ?) + (SELECT COUNT(*) FROM `clients` WHERE `owner_id` = ?)');
    $st->execute(array($owner, $owner));
    return ((int) $st->fetchColumn()) > 0;
}

// ---------------------------------------------------------------- sincronización

/** Cambios del inventario del usuario desde la revisión indicada (since=0: todo). */
function api_sync()
{
    $u = auth_user();
    $owner = (int) $u['id'];
    $since = isset($_GET['since']) ? (int) $_GET['since'] : 0;
    $out = array('rev' => current_rev(), 'user' => public_user($u));
    foreach (array_keys(entity_fields()) as $table) {
        $st = db()->prepare("SELECT * FROM `$table` WHERE `owner_id` = ? AND `rev` > ? ORDER BY `rev`");
        $st->execute(array($owner, $since));
        $rows = array();
        foreach ($st->fetchAll() as $row) {
            $rows[] = cast_row($table, $row);
        }
        $out[$table] = $rows;
    }
    $deleted = array('items' => array(), 'clients' => array(), 'sales' => array());
    if ($since > 0) {
        $st = db()->prepare('SELECT `entity`, `entityId` FROM `deletions` WHERE `owner_id` = ? AND `rev` > ?');
        $st->execute(array($owner, $since));
        foreach ($st->fetchAll() as $d) {
            if (isset($deleted[$d['entity']])) {
                $deleted[$d['entity']][] = (int) $d['entityId'];
            }
        }
    }
    $out['deleted'] = $deleted;
    $out['settings'] = user_settings($owner);
    send_json($out);
}

/**
 * Aplica un lote de cambios (venta, renovación, edición...) en una sola transacción.
 * "expect" trae la revisión que el dispositivo conocía de cada producto que leyó o cambió: si se
 * modificó desde otro dispositivo, se rechaza con 409 y la app se actualiza antes de reintentar.
 */
function api_commit()
{
    require_method('POST');
    $u = auth_user();
    $owner = (int) $u['id'];
    $b = body();
    $upsert = isset($b['upsert']) && is_array($b['upsert']) ? $b['upsert'] : array();
    $delete = isset($b['delete']) && is_array($b['delete']) ? $b['delete'] : array();
    $expect = isset($b['expect']['items']) && is_array($b['expect']['items']) ? $b['expect']['items'] : array();

    $pdo = db();
    $pdo->beginTransaction();
    $rev = next_rev();

    foreach ($expect as $id => $knownRev) {
        $row = fetch_row($owner, 'items', (int) $id, true);
        $actual = $row ? $row['rev'] : 0;
        if ($actual !== (int) $knownRev) {
            throw new ApiError('Este producto se modificó desde otro dispositivo. Se actualizaron los datos, revise e intente de nuevo.', 409);
        }
    }

    $result = array('items' => array(), 'clients' => array(), 'sales' => array());
    $now = now_ms();
    foreach (array('clients', 'items', 'sales') as $table) {
        $rows = isset($upsert[$table]) && is_array($upsert[$table]) ? $upsert[$table] : array();
        foreach ($rows as $incoming) {
            if (!is_array($incoming) || empty($incoming['id'])) {
                throw new ApiError('Datos incompletos');
            }
            $row = cast_row($table, $incoming);
            if ($table === 'items') {
                $row['updatedAt'] = $now;
            }
            $row['rev'] = $rev;
            upsert_row($owner, $table, $row);
            $result[$table][] = fetch_row($owner, $table, $row['id']);
        }
    }

    foreach (array('sales', 'items', 'clients') as $table) {
        $ids = isset($delete[$table]) && is_array($delete[$table]) ? $delete[$table] : array();
        foreach ($ids as $id) {
            $pdo->prepare("DELETE FROM `$table` WHERE `owner_id` = ? AND `id` = ?")->execute(array($owner, (int) $id));
            $pdo->prepare('INSERT INTO `deletions` (`owner_id`, `entity`, `entityId`, `rev`) VALUES (?, ?, ?, ?)')
                ->execute(array($owner, $table, (int) $id, $rev));
        }
    }

    $pdo->commit();
    $result['rev'] = $rev;
    send_json($result);
}

/** Sube los datos que el usuario tenía en el teléfono (solo si su inventario en el servidor está vacío). */
function api_import()
{
    require_method('POST');
    $u = auth_user();
    $owner = (int) $u['id'];
    $b = body();
    $pdo = db();
    $pdo->beginTransaction();
    if (owner_has_data($owner)) {
        throw new ApiError('Su cuenta en el servidor ya tiene datos. Solo se puede subir a una cuenta vacía.', 409);
    }
    $rev = next_rev();
    $n = 0;
    foreach (array('clients', 'items', 'sales') as $table) {
        $rows = isset($b[$table]) && is_array($b[$table]) ? $b[$table] : array();
        foreach ($rows as $incoming) {
            $row = cast_row($table, $incoming);
            $row['rev'] = $rev;
            upsert_row($owner, $table, $row);
            if ($table === 'items') {
                $n++;
            }
        }
    }
    if (isset($b['settings']) && is_array($b['settings']) && user_settings($owner) === null) {
        save_user_settings($owner, $b['settings']);
    }
    log_activity($u, "Subió los datos de su teléfono ($n productos)");
    $pdo->commit();
    send_json(array('ok' => true, 'items' => $n, 'rev' => $rev));
}

/** Guarda la marca y ajustes del usuario (se comparten entre sus dispositivos). */
function api_settings()
{
    require_method('POST');
    $u = auth_user();
    $b = body();
    $allowed = array(
        'businessName', 'currencySymbol', 'currencyDecimals', 'countryCode', 'dueSoonDays', 'defaultSaleMonths',
        'templateCredentials', 'templateReminder', 'templateExpired', 'templatePayment',
    );
    $s = array();
    foreach ($allowed as $k) {
        if (array_key_exists($k, $b)) {
            $s[$k] = $b[$k];
        }
    }
    save_user_settings((int) $u['id'], $s);
    send_json(array('ok' => true, 'settings' => $s));
}

// ---------------------------------------------------------------- usuarios (administrador)

function api_users()
{
    require_admin();
    $rows = db()->query(
        'SELECT u.*, (SELECT COUNT(*) FROM `items` i WHERE i.owner_id = u.id) AS item_count
         FROM `users` u ORDER BY u.`active` DESC, u.`name`'
    )->fetchAll();
    $out = array();
    foreach ($rows as $r) {
        $pu = public_user($r);
        $pu['itemCount'] = (int) $r['item_count'];
        $out[] = $pu;
    }
    send_json(array('users' => $out));
}

function api_users_save()
{
    require_method('POST');
    $admin = require_admin();
    $b = body();
    $id = isset($b['id']) ? (int) $b['id'] : 0;
    $name = trim(isset($b['name']) ? (string) $b['name'] : '');
    $username = strtolower(trim(isset($b['username']) ? (string) $b['username'] : ''));
    $password = isset($b['password']) ? (string) $b['password'] : '';
    $phone = trim(isset($b['phone']) ? (string) $b['phone'] : '');
    $role = (isset($b['role']) && $b['role'] === 'ADMIN') ? 'ADMIN' : 'USER';
    $active = !isset($b['active']) || (bool) $b['active'];
    $expiresAt = isset($b['expiresAt']) ? max(0, (int) $b['expiresAt']) : 0;

    if ($name === '' || !preg_match('/^[a-z0-9._-]{3,60}$/', $username)) {
        throw new ApiError('Nombre requerido y usuario de 3 a 60 caracteres (letras, números, punto, guion)');
    }
    $st = db()->prepare('SELECT `id` FROM `users` WHERE `username` = ? AND `id` <> ?');
    $st->execute(array($username, $id));
    if ($st->fetch()) {
        throw new ApiError('Ese usuario ya existe');
    }

    if ($id === 0) {
        if (strlen($password) < 6) {
            throw new ApiError('La contraseña debe tener al menos 6 caracteres');
        }
        $id = create_user(db(), $name, $username, $password, $role, $phone, $expiresAt);
        log_activity($admin, "Creó el usuario $username");
    } else {
        if ($id === (int) $admin['id'] && ($role !== 'ADMIN' || !$active)) {
            throw new ApiError('No puede quitarse a sí mismo el rol de administrador ni desactivarse');
        }
        db()->prepare('UPDATE `users` SET `name` = ?, `username` = ?, `role` = ?, `phone` = ?, `active` = ?, `expires_at` = ? WHERE `id` = ?')
            ->execute(array($name, $username, $role, $phone, $active ? 1 : 0, $expiresAt, $id));
        if ($password !== '') {
            if (strlen($password) < 6) {
                throw new ApiError('La contraseña debe tener al menos 6 caracteres');
            }
            db()->prepare('UPDATE `users` SET `password_hash` = ?, `failed` = 0, `locked_until` = 0 WHERE `id` = ?')
                ->execute(array(password_hash($password, PASSWORD_DEFAULT), $id));
        }
        if (!$active || $password !== '') {
            db()->prepare('DELETE FROM `tokens` WHERE `user_id` = ?')->execute(array($id));
        }
        log_activity($admin, "Actualizó el usuario $username");
    }
    $st = db()->prepare('SELECT * FROM `users` WHERE `id` = ?');
    $st->execute(array($id));
    send_json(array('user' => public_user($st->fetch())));
}

/** Actividad: el administrador ve la de todos; cada usuario, la suya. */
function api_activity()
{
    $u = auth_user();
    $limit = isset($_GET['limit']) ? max(1, min(500, (int) $_GET['limit'])) : 200;
    if ($u['role'] === 'ADMIN') {
        $st = db()->prepare("SELECT * FROM `activity` ORDER BY `id` DESC LIMIT $limit");
        $st->execute();
    } else {
        $st = db()->prepare("SELECT * FROM `activity` WHERE `user_id` = ? ORDER BY `id` DESC LIMIT $limit");
        $st->execute(array($u['id']));
    }
    $out = array();
    foreach ($st->fetchAll() as $r) {
        $out[] = array(
            'id' => (int) $r['id'],
            'userName' => $r['user_name'],
            'action' => $r['action'],
            'createdAt' => (int) $r['created_at'],
        );
    }
    send_json(array('activity' => $out));
}

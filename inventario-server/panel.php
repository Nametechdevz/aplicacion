<?php
/**
 * Inventario Pro - panel web.
 * Administrador: usuarios/revendedores, accesos, actividad y publicación de actualizaciones.
 * Cada usuario: su propio inventario, clientes y ventas (solo lectura) y su contraseña.
 */
define('INV_APP', true);
require __DIR__ . '/lib.php';
if (!file_exists(__DIR__ . '/config.php')) {
    header('Location: install.php');
    exit;
}
require __DIR__ . '/config.php';
date_default_timezone_set(defined('TIMEZONE') ? TIMEZONE : 'America/Bogota');

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_name('inventario_panel');
session_set_cookie_params(array('lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax'));
session_start();
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

function h($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

function csrf_token()
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function csrf_field()
{
    return '<input type="hidden" name="csrf" value="' . csrf_token() . '">';
}

function check_csrf()
{
    if (!isset($_POST['csrf']) || !hash_equals(csrf_token(), post('csrf'))) {
        flash('La sesión del formulario expiró, intente de nuevo.', 'err');
        redirect(isset($_GET['p']) ? $_GET['p'] : 'home');
    }
}

function post($k)
{
    return isset($_POST[$k]) ? (string) $_POST[$k] : '';
}

function flash($msg, $type = 'ok')
{
    $_SESSION['flash'] = array($msg, $type);
}

function redirect($page, $extra = '')
{
    header('Location: panel.php?p=' . urlencode($page) . $extra);
    exit;
}

function today_epoch()
{
    return (int) floor((time() + (int) date('Z')) / 86400);
}

function fmt_day($epochDay)
{
    return $epochDay === null ? '—' : gmdate('d/m/Y', (int) $epochDay * 86400);
}

function fmt_ms($ms)
{
    return $ms ? date('d/m/Y H:i', (int) floor($ms / 1000)) : '—';
}

function money($v, $s)
{
    $dec = isset($s['currencyDecimals']) ? (int) $s['currencyDecimals'] : 0;
    $sym = isset($s['currencySymbol']) ? $s['currencySymbol'] : '$';
    return $sym . number_format((float) $v, $dec, ',', '.');
}

function days_text($d)
{
    if ($d === null) return 'Sin vencimiento';
    if ($d < -1) return 'Venció hace ' . (-$d) . ' días';
    if ($d == -1) return 'Venció ayer';
    if ($d == 0) return 'Vence hoy';
    if ($d == 1) return 'Vence mañana';
    return "Faltan $d días";
}

function category_label($c)
{
    $map = array(
        'STREAMING' => 'Streaming', 'IPTV' => 'IPTV / TV', 'CURSO' => 'Curso', 'SISTEMA_WEB' => 'Sistema web',
        'APLICACION' => 'Aplicación', 'LICENCIA' => 'Licencia / Software', 'JUEGOS' => 'Juegos', 'OTRO' => 'Otro',
    );
    return isset($map[$c]) ? $map[$c] : 'Otro';
}

/** Estado del producto igual que en la app: disponible/vendida/inactiva + por vencer/vencida. */
function item_state($it, $today, $dueSoon)
{
    $exp = $it['status'] === 'SOLD' ? ($it['clientExpirationDate'] !== null ? $it['clientExpirationDate'] : $it['expirationDate']) : $it['expirationDate'];
    $days = $exp === null ? null : $exp - $today;
    $time = 'none';
    if ($days !== null) {
        $time = $days < 0 ? 'expired' : ($days <= $dueSoon ? 'soon' : 'ok');
    }
    return array('exp' => $exp, 'days' => $days, 'time' => $time);
}

function display_name($it)
{
    $base = $it['plan'] !== '' ? $it['name'] . ' - ' . $it['plan'] : $it['name'];
    if ($it['kind'] === 'PROFILE' && $it['profilePin'] !== '') return "$base ({$it['profilePin']})";
    if ($it['kind'] === 'ACCOUNT') return "$base (cuenta completa)";
    return $base;
}

function load_rows($table, $owner)
{
    $st = db()->prepare("SELECT * FROM `$table` WHERE `owner_id` = ?");
    $st->execute(array($owner));
    return array_map(function ($r) use ($table) {
        return cast_row($table, $r);
    }, $st->fetchAll());
}

// ---------------------------------------------------------------- sesión

$user = null;
if (!empty($_SESSION['uid'])) {
    $st = db()->prepare('SELECT * FROM `users` WHERE `id` = ?');
    $st->execute(array($_SESSION['uid']));
    $user = $st->fetch() ?: null;
    if (!$user || !$user['active'] || access_expired($user)) {
        $user = null;
        $_SESSION = array();
        flash('Su sesión terminó o su acceso no está activo.', 'err');
    }
}
$page = isset($_GET['p']) ? (string) $_GET['p'] : 'home';
$isAdmin = $user && $user['role'] === 'ADMIN';

if ($page === 'logout') {
    $_SESSION = array();
    session_destroy();
    header('Location: panel.php');
    exit;
}

if (!$user) {
    $error = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        check_csrf();
        $username = strtolower(trim((string) (isset($_POST['username']) ? $_POST['username'] : '')));
        $password = (string) (isset($_POST['password']) ? $_POST['password'] : '');
        $st = db()->prepare('SELECT * FROM `users` WHERE `username` = ?');
        $st->execute(array($username));
        $u = $st->fetch();
        $now = now_ms();
        if ($u && (int) $u['locked_until'] > $now) {
            $error = 'Demasiados intentos. Espere unos minutos.';
        } elseif (!$u || !password_verify($password, $u['password_hash'])) {
            if ($u) {
                $failed = (int) $u['failed'] + 1;
                $locked = $failed >= 8 ? $now + 10 * 60000 : 0;
                db()->prepare('UPDATE `users` SET `failed` = ?, `locked_until` = ? WHERE `id` = ?')->execute(array($locked ? 0 : $failed, $locked, $u['id']));
            }
            $error = 'Usuario o contraseña incorrectos.';
        } elseif (!$u['active']) {
            $error = 'Su usuario está desactivado.';
        } elseif (access_expired($u)) {
            $error = 'Su acceso venció. Comuníquese con el administrador.';
        } else {
            session_regenerate_id(true);
            $_SESSION['uid'] = (int) $u['id'];
            db()->prepare('UPDATE `users` SET `failed` = 0, `locked_until` = 0, `last_login` = ? WHERE `id` = ?')->execute(array($now, $u['id']));
            log_activity($u, 'Entró al panel web');
            header('Location: panel.php');
            exit;
        }
    }
    render_login($error);
    exit;
}

$uid = (int) $user['id'];
$settings = user_settings($uid);
if (!is_array($settings)) $settings = array();
$brand = !empty($settings['businessName']) ? $settings['businessName'] : 'Inventario Pro';
$dueSoon = isset($settings['dueSoonDays']) ? (int) $settings['dueSoonDays'] : 3;

// ---------------------------------------------------------------- acciones

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $action = isset($_POST['action']) ? $_POST['action'] : '';
    try {
        if ($action === 'password') {
            if (!password_verify(post('current'), $user['password_hash'])) throw new ApiError('La contraseña actual no es correcta.');
            if (strlen(post('new')) < 6) throw new ApiError('La nueva contraseña debe tener al menos 6 caracteres.');
            if (post('new') !== post('repeat')) throw new ApiError('Las contraseñas no coinciden.');
            db()->prepare('UPDATE `users` SET `password_hash` = ? WHERE `id` = ?')->execute(array(password_hash(post('new'), PASSWORD_DEFAULT), $uid));
            db()->prepare('DELETE FROM `tokens` WHERE `user_id` = ?')->execute(array($uid));
            log_activity($user, 'Cambió su contraseña (panel web)');
            flash('Contraseña actualizada. Inicie sesión de nuevo en la app.');
            redirect('account');
        }
        if (!$isAdmin) throw new ApiError('Solo el administrador puede hacer esto.');

        if ($action === 'user_save') {
            $id = (int) post('id');
            $name = trim(post('name'));
            $username = strtolower(trim(post('username')));
            $password = post('password');
            $phone = trim(post('phone'));
            $role = (isset($_POST['role']) && $_POST['role'] === 'ADMIN') ? 'ADMIN' : 'USER';
            $active = !empty($_POST['active']);
            $expires = trim(post('expires'));
            $expiresAt = $expires === '' ? 0 : (strtotime($expires . ' 23:59:59') * 1000);
            if ($name === '' || !preg_match('/^[a-z0-9._-]{3,60}$/', $username)) throw new ApiError('Nombre requerido y usuario de 3 a 60 caracteres (letras, números, punto, guion).');
            $st = db()->prepare('SELECT `id` FROM `users` WHERE `username` = ? AND `id` <> ?');
            $st->execute(array($username, $id));
            if ($st->fetch()) throw new ApiError('Ese usuario ya existe.');
            if ($id === 0) {
                if (strlen($password) < 6) throw new ApiError('La contraseña debe tener al menos 6 caracteres.');
                create_user(db(), $name, $username, $password, $role, $phone, $expiresAt);
                log_activity($user, "Creó el usuario $username (panel web)");
                flash("Usuario $username creado ✅");
            } else {
                if ($id === $uid && ($role !== 'ADMIN' || !$active)) throw new ApiError('No puede quitarse el rol de administrador ni desactivarse.');
                db()->prepare('UPDATE `users` SET `name` = ?, `username` = ?, `role` = ?, `phone` = ?, `active` = ?, `expires_at` = ? WHERE `id` = ?')
                    ->execute(array($name, $username, $role, $phone, $active ? 1 : 0, $expiresAt, $id));
                if ($password !== '') {
                    if (strlen($password) < 6) throw new ApiError('La contraseña debe tener al menos 6 caracteres.');
                    db()->prepare('UPDATE `users` SET `password_hash` = ?, `failed` = 0, `locked_until` = 0 WHERE `id` = ?')->execute(array(password_hash($password, PASSWORD_DEFAULT), $id));
                }
                if (!$active || $password !== '') db()->prepare('DELETE FROM `tokens` WHERE `user_id` = ?')->execute(array($id));
                log_activity($user, "Actualizó el usuario $username (panel web)");
                flash("Usuario $username actualizado ✅");
            }
            redirect('users');
        }

        if ($action === 'user_extend') {
            $id = (int) post('id');
            $months = max(1, min(24, (int) post('months')));
            $st = db()->prepare('SELECT * FROM `users` WHERE `id` = ?');
            $st->execute(array($id));
            $u = $st->fetch();
            if (!$u) throw new ApiError('Usuario no encontrado.');
            $from = max((int) $u['expires_at'], now_ms());
            $newExp = strtotime("+$months month", (int) floor($from / 1000)) * 1000;
            db()->prepare('UPDATE `users` SET `expires_at` = ?, `active` = 1 WHERE `id` = ?')->execute(array($newExp, $id));
            log_activity($user, "Renovó el acceso de {$u['username']} (+$months mes)");
            flash("Acceso de {$u['username']} extendido hasta " . date('d/m/Y', (int) floor($newExp / 1000)) . ' ✅');
            redirect('users');
        }

        if ($action === 'release') {
            $versionCode = (int) post('versionCode');
            $versionName = trim(post('versionName'));
            $notes = trim(post('notes'));
            $url = trim(post('url'));
            if ($versionCode <= 0 || $versionName === '') throw new ApiError('Indique el número de versión (versionCode) y el nombre (ej. 1.3.0).');
            if (!empty($_FILES['apk']['tmp_name']) && is_uploaded_file($_FILES['apk']['tmp_name'])) {
                $head = file_get_contents($_FILES['apk']['tmp_name'], false, null, 0, 2);
                if ($head !== 'PK') throw new ApiError('El archivo no es un APK válido.');
                $dir = __DIR__ . '/updates';
                if (!is_dir($dir)) @mkdir($dir, 0755, true);
                $fileName = 'InventarioPro-' . preg_replace('/[^0-9A-Za-z._-]/', '', $versionName) . '.apk';
                if (!move_uploaded_file($_FILES['apk']['tmp_name'], "$dir/$fileName")) throw new ApiError('No se pudo guardar el APK (permisos de la carpeta updates).');
                $url = base_url() . '/updates/' . rawurlencode($fileName);
            } elseif (!empty($_FILES['apk']['error']) && $_FILES['apk']['error'] !== UPLOAD_ERR_NO_FILE) {
                throw new ApiError('No se pudo subir el archivo (tamaño máximo del hosting: ' . ini_get('upload_max_filesize') . '). Use un enlace de descarga.');
            }
            if ($url === '' || !preg_match('#^https?://#', $url)) throw new ApiError('Suba el APK o pegue el enlace de descarga.');
            meta_set('app_release', json_encode(array(
                'versionCode' => $versionCode, 'versionName' => $versionName, 'notes' => $notes, 'url' => $url,
            ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            log_activity($user, "Publicó la versión $versionName de la app");
            flash("Versión $versionName publicada. Las apps instaladas mostrarán el aviso de actualización ✅");
            redirect('release');
        }
        throw new ApiError('Acción desconocida.');
    } catch (ApiError $e) {
        flash($e->getMessage(), 'err');
        redirect($page, isset($_POST['id']) && $page === 'users' ? '&edit=' . (int) post('id') : '');
    }
}

// ---------------------------------------------------------------- datos para las páginas

$today = today_epoch();

$nav = array(
    'home' => array('Inicio', 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10'),
    'inventory' => array('Mi inventario', 'M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10L4 17V7m8 14V11'),
    'clients' => array('Mis clientes', 'M17 20h5v-2a4 4 0 00-5-3.87M9 20H2v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z'),
    'sales' => array('Ventas', 'M3 3v18h18M7 15l4-4 3 3 5-6'),
);
if ($isAdmin) {
    $nav['users'] = array('Usuarios', 'M12 4a4 4 0 110 8 4 4 0 010-8zM4 20a8 8 0 0116 0');
    $nav['release'] = array('Actualizaciones', 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4');
}
$nav['activity'] = array('Actividad', 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z');
$nav['account'] = array('Mi cuenta', 'M15 7a3 3 0 11-6 0 3 3 0 016 0zM5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2');
if (!isset($nav[$page])) $page = 'home';

ob_start();
switch ($page) {
    case 'inventory': page_inventory(); break;
    case 'clients': page_clients(); break;
    case 'sales': page_sales(); break;
    case 'users': page_users(); break;
    case 'release': page_release(); break;
    case 'activity': page_activity(); break;
    case 'account': page_account(); break;
    default: page_home();
}
$content = ob_get_clean();
render_layout($nav[$page][0], $content);

// ================================================================ páginas

function kpi($label, $value, $tone, $href = '')
{
    $tag = $href ? 'a href="' . h($href) . '"' : 'div';
    $end = $href ? 'a' : 'div';
    return "<$tag class=\"kpi $tone\"><span class=\"kpi-v\">" . h($value) . "</span><span class=\"kpi-l\">" . h($label) . "</span></$end>";
}

function inventory_data()
{
    global $uid, $today, $dueSoon;
    $items = load_rows('items', $uid);
    $byId = array();
    foreach ($items as $it) $byId[$it['id']] = $it;
    $children = array();
    foreach ($items as $it) if ($it['parentId'] !== null) $children[$it['parentId']][] = $it;
    // Igual que la app: los perfiles libres se muestran dentro de su cuenta.
    $visible = array();
    foreach ($items as $it) {
        if ($it['kind'] === 'PROFILE' && $it['status'] !== 'SOLD' && isset($byId[$it['parentId']])) continue;
        $it['_state'] = item_state($it, $today, $dueSoon);
        $it['_free'] = null;
        if ($it['kind'] === 'ACCOUNT' && !empty($children[$it['id']])) {
            $free = 0;
            foreach ($children[$it['id']] as $c) if ($c['status'] === 'AVAILABLE' && $it['status'] === 'AVAILABLE') $free++;
            $it['_free'] = array($free, count($children[$it['id']]));
        }
        $visible[] = $it;
    }
    return $visible;
}

function matches_filter($it, $f)
{
    $active = $it['status'] !== 'INACTIVE';
    $t = $it['_state']['time'];
    switch ($f) {
        case 'available':
            if ($it['_free'] !== null && $it['status'] === 'AVAILABLE') return $it['_free'][0] > 0 && $t !== 'expired';
            return $it['status'] === 'AVAILABLE' && $t !== 'expired';
        case 'sold': return $it['status'] === 'SOLD';
        case 'soon': return $active && $t === 'soon';
        case 'expired': return $active && $t === 'expired';
        case 'unpaid': return $it['status'] === 'SOLD' && !$it['paid'];
        case 'inactive': return $it['status'] === 'INACTIVE';
        default: return $active;
    }
}

function page_home()
{
    global $isAdmin, $uid, $today, $settings, $user;
    $items = inventory_data();
    $count = function ($f) use ($items) {
        return count(array_filter($items, function ($i) use ($f) { return matches_filter($i, $f); }));
    };
    $sales = load_rows('sales', $uid);
    $first = $today - (int) date('j') + 1;
    $month = array_filter($sales, function ($s) use ($first, $today) { return $s['date'] >= $first && $s['date'] <= $today; });
    $income = array_sum(array_map(function ($s) { return $s['amount']; }, $month));
    $profit = array_sum(array_map(function ($s) { return $s['amount'] - $s['cost']; }, $month));
    $unpaid = array_filter($items, function ($i) { return $i['status'] === 'SOLD' && !$i['paid']; });

    echo '<p class="lead">Hola, <b>' . h($user['name']) . '</b> 👋 Este es el resumen de su negocio.</p>';
    echo '<div class="kpis">';
    echo kpi('Disponibles', $count('available'), 'green', 'panel.php?p=inventory&f=available');
    echo kpi('Vendidas', $count('sold'), 'blue', 'panel.php?p=inventory&f=sold');
    echo kpi('Por vencer', $count('soon'), 'amber', 'panel.php?p=inventory&f=soon');
    echo kpi('Vencidas', $count('expired'), 'red', 'panel.php?p=inventory&f=expired');
    echo '</div>';
    echo '<div class="grid2">';
    echo '<section class="card"><h3>Finanzas del mes</h3><div class="stats">';
    echo '<div><span>Ventas y renovaciones</span><b>' . count($month) . '</b></div>';
    echo '<div><span>Ingresos</span><b class="t-blue">' . h(money($income, $settings)) . '</b></div>';
    echo '<div><span>Ganancia</span><b class="t-green">' . h(money($profit, $settings)) . '</b></div>';
    echo '<div><span>Por cobrar</span><b class="t-red">' . h(money(array_sum(array_map(function ($i) { return $i['salePrice']; }, $unpaid)), $settings)) . '</b></div>';
    echo '</div></section>';

    $upcoming = array_filter($items, function ($i) {
        return $i['status'] !== 'INACTIVE' && in_array($i['_state']['time'], array('soon', 'expired'), true);
    });
    usort($upcoming, function ($a, $b) { return $a['_state']['exp'] - $b['_state']['exp']; });
    echo '<section class="card"><h3>Atención: vencimientos</h3>';
    if (!$upcoming) echo '<p class="muted">Todo al día ✅</p>';
    $clients = array();
    foreach (load_rows('clients', $uid) as $c) $clients[$c['id']] = $c['name'];
    echo '<ul class="list">';
    foreach (array_slice($upcoming, 0, 8) as $i) {
        $tone = $i['_state']['time'] === 'expired' ? 'red' : 'amber';
        $who = $i['clientId'] !== null && isset($clients[$i['clientId']]) ? $clients[$i['clientId']] : $i['accessUser'];
        echo '<li><div><b>' . h(display_name($i)) . '</b><small>' . h($who) . '</small></div><span class="pill ' . $tone . '">' . h(days_text($i['_state']['days'])) . '</span></li>';
    }
    echo '</ul></section></div>';

    if ($isAdmin) {
        $users = db()->query("SELECT * FROM `users` WHERE `role` <> 'ADMIN'")->fetchAll();
        $now = now_ms();
        $active = 0; $expiring = array(); $expired = 0;
        foreach ($users as $u) {
            if (!$u['active']) continue;
            if ($u['expires_at'] > 0 && $u['expires_at'] < $now) { $expired++; continue; }
            $active++;
            if ($u['expires_at'] > 0 && $u['expires_at'] < $now + 7 * 86400000) $expiring[] = $u;
        }
        echo '<h2 class="section">Revendedores</h2><div class="kpis">';
        echo kpi('Usuarios', count($users), 'purple', 'panel.php?p=users');
        echo kpi('Activos', $active, 'green', 'panel.php?p=users');
        echo kpi('Vencen en 7 días', count($expiring), 'amber', 'panel.php?p=users');
        echo kpi('Acceso vencido', $expired, 'red', 'panel.php?p=users');
        echo '</div>';
        if ($expiring) {
            echo '<section class="card"><h3>Accesos por vencer</h3><ul class="list">';
            foreach ($expiring as $u) {
                echo '<li><div><b>' . h($u['name']) . '</b><small>@' . h($u['username']) . '</small></div><span class="pill amber">' . h(fmt_ms($u['expires_at'])) . '</span></li>';
            }
            echo '</ul></section>';
        }
    }
}

function page_inventory()
{
    global $uid, $settings;
    $items = inventory_data();
    $clients = array();
    foreach (load_rows('clients', $uid) as $c) $clients[$c['id']] = $c;
    $f = isset($_GET['f']) ? $_GET['f'] : 'all';
    $q = trim(isset($_GET['q']) ? (string) $_GET['q'] : '');
    $filters = array('all' => 'Todas', 'available' => 'Disponibles', 'sold' => 'Vendidas', 'soon' => 'Por vencer', 'expired' => 'Vencidas', 'unpaid' => 'Por cobrar', 'inactive' => 'Inactivas');
    echo '<form class="toolbar" method="get"><input type="hidden" name="p" value="inventory"><input type="hidden" name="f" value="' . h($f) . '">';
    echo '<input class="search" name="q" value="' . h($q) . '" placeholder="Buscar servicio, correo o cliente…"></form>';
    echo '<div class="chips">';
    foreach ($filters as $k => $label) {
        $n = count(array_filter($items, function ($i) use ($k) { return matches_filter($i, $k); }));
        echo '<a class="chip' . ($k === $f ? ' on' : '') . '" href="panel.php?p=inventory&f=' . $k . '&q=' . urlencode($q) . '">' . h($label) . " <span>$n</span></a>";
    }
    echo '</div>';
    $rows = array_filter($items, function ($i) use ($f, $q, $clients) {
        if (!matches_filter($i, $f)) return false;
        if ($q === '') return true;
        $hay = strtolower($i['name'] . ' ' . $i['plan'] . ' ' . $i['accessUser'] . ' ' . $i['profilePin'] . ' ' . ($i['clientId'] !== null && isset($clients[$i['clientId']]) ? $clients[$i['clientId']]['name'] : ''));
        return strpos($hay, strtolower($q)) !== false;
    });
    usort($rows, function ($a, $b) {
        $x = $a['_state']['exp'] === null ? PHP_INT_MAX : $a['_state']['exp'];
        $y = $b['_state']['exp'] === null ? PHP_INT_MAX : $b['_state']['exp'];
        return $x <=> $y;
    });
    if (!$rows) {
        echo '<div class="empty">No hay productos con este filtro. Los productos se agregan desde la app.</div>';
        return;
    }
    echo '<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Acceso</th><th>Estado</th><th>Cliente</th><th>Vence</th><th class="r">Precio</th></tr></thead><tbody>';
    foreach ($rows as $i) {
        $st = $i['_state'];
        $status = $i['status'] === 'SOLD' ? '<span class="pill blue">Vendida</span>' : ($i['status'] === 'INACTIVE' ? '<span class="pill gray">Inactiva</span>' : '<span class="pill green">Disponible</span>');
        if ($i['status'] !== 'INACTIVE' && $st['time'] === 'soon') $status .= ' <span class="pill amber">Por vencer</span>';
        if ($i['status'] !== 'INACTIVE' && $st['time'] === 'expired') $status .= ' <span class="pill red">Vencida</span>';
        if ($i['status'] === 'SOLD' && !$i['paid']) $status .= ' <span class="pill red">Por cobrar</span>';
        $client = $i['clientId'] !== null && isset($clients[$i['clientId']]) ? $clients[$i['clientId']] : null;
        $price = $i['status'] === 'SOLD' ? $i['salePrice'] : $i['suggestedPrice'];
        $sub = category_label($i['category']);
        if ($i['_free'] !== null) $sub .= " · {$i['_free'][0]}/{$i['_free'][1]} perfiles libres";
        $tone = $st['time'] === 'expired' ? 't-red' : ($st['time'] === 'soon' ? 't-amber' : '');
        echo '<tr><td><b>' . h(display_name($i)) . '</b><small>' . h($sub) . '</small></td>';
        echo '<td>' . h($i['accessUser']) . ($i['profilePin'] !== '' ? '<small>' . h($i['profilePin']) . '</small>' : '') . '</td>';
        echo "<td>$status</td>";
        echo '<td>' . ($client ? h($client['name']) . '<small>' . h($client['whatsapp']) . '</small>' : '<span class="muted">—</span>') . '</td>';
        echo '<td class="' . $tone . '">' . h(fmt_day($st['exp'])) . '<small>' . h(days_text($st['days'])) . '</small></td>';
        echo '<td class="r">' . ($price > 0 ? h(money($price, $settings)) : '—') . '</td></tr>';
    }
    echo '</tbody></table></div>';
}

function page_clients()
{
    global $uid, $settings;
    $clients = load_rows('clients', $uid);
    $items = load_rows('items', $uid);
    $sales = load_rows('sales', $uid);
    usort($clients, function ($a, $b) { return strcasecmp($a['name'], $b['name']); });
    if (!$clients) {
        echo '<div class="empty">Aún no tiene clientes. Se crean al vender desde la app.</div>';
        return;
    }
    echo '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th class="r">Servicios activos</th><th class="r">Total comprado</th></tr></thead><tbody>';
    foreach ($clients as $c) {
        $active = count(array_filter($items, function ($i) use ($c) { return $i['clientId'] === $c['id'] && $i['status'] === 'SOLD'; }));
        $total = array_sum(array_map(function ($s) { return $s['amount']; }, array_filter($sales, function ($s) use ($c) { return $s['clientId'] === $c['id']; })));
        $wa = preg_replace('/\D/', '', $c['whatsapp']);
        echo '<tr><td><b>' . h($c['name']) . '</b>' . ($c['email'] ? '<small>' . h($c['email']) . '</small>' : '') . '</td>';
        echo '<td>' . ($wa ? '<a class="wa" target="_blank" rel="noopener" href="https://wa.me/' . h($wa) . '">' . h($c['whatsapp']) . '</a>' : '<span class="muted">—</span>') . '</td>';
        echo "<td class=\"r\">$active</td><td class=\"r\">" . h(money($total, $settings)) . '</td></tr>';
    }
    echo '</tbody></table></div>';
}

function page_sales()
{
    global $uid, $settings;
    $sales = load_rows('sales', $uid);
    usort($sales, function ($a, $b) { return $b['date'] - $a['date']; });
    // Ingresos de los últimos 6 meses.
    $months = array();
    for ($i = 5; $i >= 0; $i--) {
        $key = date('Y-m', strtotime("first day of -$i month"));
        $months[$key] = 0;
    }
    foreach ($sales as $s) {
        $key = gmdate('Y-m', $s['date'] * 86400);
        if (isset($months[$key])) $months[$key] += $s['amount'];
    }
    $max = max(1, max($months));
    $names = array('01' => 'Ene', '02' => 'Feb', '03' => 'Mar', '04' => 'Abr', '05' => 'May', '06' => 'Jun', '07' => 'Jul', '08' => 'Ago', '09' => 'Sep', '10' => 'Oct', '11' => 'Nov', '12' => 'Dic');
    echo '<section class="card"><h3>Ingresos de los últimos 6 meses</h3><div class="bars">';
    foreach ($months as $k => $v) {
        $pct = round($v / $max * 100);
        echo '<div class="bar"><span class="bar-v">' . h(money($v, $settings)) . '</span><div class="bar-track"><div class="bar-fill" style="height:' . $pct . '%"></div></div><span class="bar-l">' . $names[substr($k, 5)] . '</span></div>';
    }
    echo '</div></section>';
    if (!$sales) {
        echo '<div class="empty">Aún no hay ventas.</div>';
        return;
    }
    echo '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cliente</th><th class="r">Valor</th><th class="r">Ganancia</th></tr></thead><tbody>';
    foreach (array_slice($sales, 0, 300) as $s) {
        echo '<tr><td>' . h(fmt_day($s['date'])) . '</td><td>' . ($s['kind'] === 'VENTA' ? '<span class="pill blue">Venta</span>' : '<span class="pill purple">Renovación</span>') . '</td>';
        echo '<td>' . h($s['itemName']) . '</td><td>' . h($s['clientName']) . '</td><td class="r">' . h(money($s['amount'], $settings)) . '</td><td class="r t-green">' . h(money($s['amount'] - $s['cost'], $settings)) . '</td></tr>';
    }
    echo '</tbody></table></div>';
}

function page_users()
{
    $users = db()->query('SELECT u.*, (SELECT COUNT(*) FROM `items` i WHERE i.owner_id = u.id) AS item_count FROM `users` u ORDER BY u.`role`, u.`name`')->fetchAll();
    $edit = null;
    if (isset($_GET['edit'])) {
        foreach ($users as $u) if ((int) $u['id'] === (int) $_GET['edit']) $edit = $u;
    }
    $showForm = $edit !== null || isset($_GET['new']) || (isset($_GET['edit']) && (int) $_GET['edit'] === 0);
    echo '<div class="toolbar"><p class="muted">Cada usuario tiene su propio inventario, clientes y marca; puede entrar desde varios dispositivos. Usted no ve sus datos.</p><a class="btn" href="panel.php?p=users&new=1">+ Nuevo usuario</a></div>';
    if ($showForm) {
        $e = $edit ?: array('id' => 0, 'name' => '', 'username' => '', 'phone' => '', 'role' => 'USER', 'active' => 1, 'expires_at' => 0);
        $exp = $e['expires_at'] > 0 ? date('Y-m-d', (int) floor($e['expires_at'] / 1000)) : '';
        echo '<section class="card form"><h3>' . ($e['id'] ? 'Editar usuario' : 'Nuevo usuario') . '</h3><form method="post">' . csrf_field();
        echo '<input type="hidden" name="action" value="user_save"><input type="hidden" name="id" value="' . (int) $e['id'] . '">';
        echo '<div class="fgrid">';
        echo '<label>Nombre o marca<input name="name" required value="' . h($e['name']) . '"></label>';
        echo '<label>Usuario para entrar<input name="username" required pattern="[a-z0-9._-]{3,60}" value="' . h($e['username']) . '"></label>';
        echo '<label>' . ($e['id'] ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña (mín. 6)') . '<input type="password" name="password" ' . ($e['id'] ? '' : 'required minlength="6"') . '></label>';
        echo '<label>WhatsApp<input name="phone" value="' . h($e['phone']) . '"></label>';
        echo '<label>Acceso hasta (vacío = sin vencimiento)<input type="date" name="expires" value="' . h($exp) . '"></label>';
        echo '<label>Rol<select name="role"><option value="USER"' . ($e['role'] !== 'ADMIN' ? ' selected' : '') . '>Usuario / revendedor</option><option value="ADMIN"' . ($e['role'] === 'ADMIN' ? ' selected' : '') . '>Administrador</option></select></label>';
        echo '</div><label class="check"><input type="checkbox" name="active" value="1"' . ($e['active'] ? ' checked' : '') . '> Activo</label>';
        echo '<div class="actions"><a class="btn ghost" href="panel.php?p=users">Cancelar</a><button class="btn">Guardar</button></div></form></section>';
    }
    $now = now_ms();
    echo '<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Acceso</th><th class="r">Productos</th><th>Último ingreso</th><th class="r">Acciones</th></tr></thead><tbody>';
    foreach ($users as $u) {
        if (!$u['active']) $acc = '<span class="pill gray">Desactivado</span>';
        elseif ($u['role'] === 'ADMIN' || !$u['expires_at']) $acc = '<span class="pill green">Sin vencimiento</span>';
        elseif ($u['expires_at'] < $now) $acc = '<span class="pill red">Venció ' . h(date('d/m/Y', (int) floor($u['expires_at'] / 1000))) . '</span>';
        elseif ($u['expires_at'] < $now + 7 * 86400000) $acc = '<span class="pill amber">Hasta ' . h(date('d/m/Y', (int) floor($u['expires_at'] / 1000))) . '</span>';
        else $acc = '<span class="pill green">Hasta ' . h(date('d/m/Y', (int) floor($u['expires_at'] / 1000))) . '</span>';
        echo '<tr><td><b>' . h($u['name']) . '</b><small>@' . h($u['username']) . ($u['phone'] ? ' · ' . h($u['phone']) : '') . '</small></td>';
        echo '<td>' . ($u['role'] === 'ADMIN' ? '<span class="pill purple">Admin</span>' : 'Revendedor') . "</td><td>$acc</td>";
        echo '<td class="r">' . (int) $u['item_count'] . '</td><td>' . h(fmt_ms($u['last_login'])) . '</td><td class="r nowrap">';
        if ($u['role'] !== 'ADMIN') {
            echo '<form method="post" class="inline">' . csrf_field() . '<input type="hidden" name="action" value="user_extend"><input type="hidden" name="id" value="' . (int) $u['id'] . '"><input type="hidden" name="months" value="1"><button class="btn small ghost" title="Extender acceso 1 mes">+1 mes</button></form> ';
        }
        echo '<a class="btn small" href="panel.php?p=users&edit=' . (int) $u['id'] . '">Editar</a></td></tr>';
    }
    echo '</tbody></table></div>';
}

function page_release()
{
    $r = latest_release();
    echo '<section class="card"><h3>Versión publicada</h3>';
    if ($r) {
        echo '<div class="stats"><div><span>Versión</span><b>' . h($r['versionName']) . '</b></div><div><span>Código</span><b>' . (int) $r['versionCode'] . '</b></div></div>';
        echo '<p><a class="btn ghost" href="' . h($r['url']) . '">Descargar APK</a></p>';
        if ($r['notes'] !== '') echo '<p class="muted pre">' . h($r['notes']) . '</p>';
    } else {
        echo '<p class="muted">Todavía no hay una versión publicada.</p>';
    }
    echo '<p class="muted">Las apps instaladas revisan esta versión al abrirse. Si es mayor que la que tienen, muestran el aviso «Nueva versión disponible» y la instalan encima sin perder datos.</p></section>';
    echo '<section class="card form"><h3>Publicar una versión nueva</h3>';
    echo '<p class="muted">Lo más fácil: suba el ZIP nuevo del servidor a su hosting (trae el APK en la carpeta <code>updates</code> y se publica solo). También puede publicarla aquí:</p>';
    echo '<form method="post" enctype="multipart/form-data">' . csrf_field() . '<input type="hidden" name="action" value="release"><div class="fgrid">';
    echo '<label>Código de versión (número, mayor que el actual)<input name="versionCode" type="number" min="1" required value="' . ($r ? (int) $r['versionCode'] + 1 : 1) . '"></label>';
    echo '<label>Nombre de versión<input name="versionName" required placeholder="ej. 1.3.0"></label>';
    echo '<label>Archivo APK (máx. ' . h(ini_get('upload_max_filesize')) . ')<input type="file" name="apk" accept=".apk"></label>';
    echo '<label>…o enlace de descarga<input name="url" type="url" placeholder="https://"></label>';
    echo '</div><label>Novedades (se muestran en el aviso)<textarea name="notes" rows="4"></textarea></label>';
    echo '<div class="actions"><button class="btn">Publicar</button></div></form></section>';
}

function page_activity()
{
    global $isAdmin, $uid;
    if ($isAdmin) {
        $rows = db()->query('SELECT * FROM `activity` ORDER BY `id` DESC LIMIT 300')->fetchAll();
    } else {
        $st = db()->prepare('SELECT * FROM `activity` WHERE `user_id` = ? ORDER BY `id` DESC LIMIT 300');
        $st->execute(array($uid));
        $rows = $st->fetchAll();
    }
    if (!$rows) {
        echo '<div class="empty">Sin actividad todavía.</div>';
        return;
    }
    echo '<section class="card"><ul class="timeline">';
    foreach ($rows as $a) {
        echo '<li><b>' . h($a['action']) . '</b><small>' . h($a['user_name']) . ' · ' . h(fmt_ms($a['created_at'])) . '</small></li>';
    }
    echo '</ul></section>';
}

function page_account()
{
    global $user, $brand;
    echo '<div class="grid2"><section class="card"><h3>Mi cuenta</h3><div class="stats">';
    echo '<div><span>Nombre</span><b>' . h($user['name']) . '</b></div><div><span>Usuario</span><b>@' . h($user['username']) . '</b></div>';
    echo '<div><span>Marca</span><b>' . h($brand) . '</b></div>';
    echo '<div><span>Acceso</span><b>' . ($user['expires_at'] > 0 && $user['role'] !== 'ADMIN' ? 'Hasta ' . h(date('d/m/Y', (int) floor($user['expires_at'] / 1000))) : 'Sin vencimiento') . '</b></div>';
    echo '</div><p class="muted">La marca, moneda y plantillas se cambian desde la app (Ajustes) y se guardan para todos sus dispositivos.</p>';
    echo '<p class="muted">Dirección para la app: <code>' . h(base_url()) . '</code></p></section>';
    echo '<section class="card form"><h3>Cambiar contraseña</h3><form method="post">' . csrf_field() . '<input type="hidden" name="action" value="password">';
    echo '<label>Contraseña actual<input type="password" name="current" required></label>';
    echo '<label>Nueva contraseña<input type="password" name="new" required minlength="6"></label>';
    echo '<label>Repetir nueva contraseña<input type="password" name="repeat" required minlength="6"></label>';
    echo '<div class="actions"><button class="btn">Guardar</button></div></form></section></div>';
}

// ================================================================ plantillas HTML

function styles()
{
    return <<<CSS
:root{--p:#5b3fd9;--p2:#00a396;--bg:#f5f3fc;--card:#fff;--text:#1d1b26;--muted:#6b6880;--line:#ebe8f5;
--green:#1e9e5a;--blue:#2f6feb;--amber:#d98a00;--red:#d93848;--purple:#5b3fd9;--gray:#7a7a8c;--shadow:0 1px 2px rgba(30,20,80,.06),0 8px 24px rgba(30,20,80,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#121019;--card:#1c1926;--text:#ece9f7;--muted:#a29fb5;--line:#2b2738;--shadow:none}}
*{box-sizing:border-box}html,body{margin:0}body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.45}
a{color:var(--p);text-decoration:none}code{background:rgba(91,63,217,.1);padding:2px 6px;border-radius:6px;word-break:break-all}
.app{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
.side{background:linear-gradient(180deg,#2a1a7a,#3b23b0 55%,#0f7f77);color:#fff;padding:22px 14px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}
.brand{display:flex;gap:10px;align-items:center;padding:0 8px 22px}.logo{width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.18);display:grid;place-items:center;font-size:20px}
.brand b{display:block;font-size:16px}.brand small{opacity:.75;font-size:12px}
.side nav a{display:flex;gap:12px;align-items:center;color:rgba(255,255,255,.82);padding:11px 12px;border-radius:12px;margin:2px 0;font-weight:500}
.side nav a:hover{background:rgba(255,255,255,.1);color:#fff}.side nav a.on{background:#fff;color:#2a1a7a;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.side svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.side .foot{margin-top:auto;padding:12px;font-size:13px;opacity:.9}.side .foot a{color:#fff;opacity:.8}
main{padding:28px 32px 48px;min-width:0}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}
h1{font-size:26px;margin:0}.lead{margin:0 0 18px;color:var(--muted)}h2.section{font-size:18px;margin:28px 0 12px}
.card{background:var(--card);border-radius:18px;padding:20px;box-shadow:var(--shadow);border:1px solid var(--line);margin-bottom:16px}
.card h3{margin:0 0 14px;font-size:16px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.kpi{border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:2px;color:var(--text);background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);position:relative;overflow:hidden;transition:transform .15s}
a.kpi:hover{transform:translateY(-2px)}.kpi:before{content:"";position:absolute;inset:0 auto 0 0;width:5px;background:var(--tone)}
.kpi-v{font-size:30px;font-weight:800;color:var(--tone)}.kpi-l{color:var(--muted);font-weight:500}
.green{--tone:var(--green)}.blue{--tone:var(--blue)}.amber{--tone:var(--amber)}.red{--tone:var(--red)}.purple{--tone:var(--purple)}.gray{--tone:var(--gray)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:14px}.stats span{display:block;color:var(--muted);font-size:13px}.stats b{font-size:20px}
.t-green{color:var(--green)}.t-blue{color:var(--blue)}.t-red{color:var(--red)}.t-amber{color:var(--amber)}.muted{color:var(--muted)}.pre{white-space:pre-line}
.list{list-style:none;margin:0;padding:0}.list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.list li:last-child{border:0}
.list small,td small{display:block;color:var(--muted);font-size:12.5px}
.pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:color-mix(in srgb,var(--tone) 14%,transparent);color:var(--tone);white-space:nowrap}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}.toolbar p{margin:0;flex:1;min-width:220px}
.search{width:100%;padding:12px 16px;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--text);font-size:15px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.chip{padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--text);font-weight:500}
.chip span{opacity:.6;margin-left:2px}.chip.on{background:var(--p);border-color:var(--p);color:#fff}
.table-wrap{background:var(--card);border-radius:18px;border:1px solid var(--line);box-shadow:var(--shadow);overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:640px}th,td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;background:color-mix(in srgb,var(--p) 4%,transparent)}
tr:last-child td{border-bottom:0}.r{text-align:right}.nowrap{white-space:nowrap}
.btn{display:inline-block;background:linear-gradient(135deg,var(--p),#7c5cff);color:#fff;border:0;border-radius:12px;padding:10px 18px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}
.btn.ghost{background:transparent;color:var(--p);border:1px solid var(--line)}.btn.small{padding:6px 12px;font-size:13px;border-radius:10px}
form.inline{display:inline}.form label{display:block;font-size:13px;color:var(--muted);font-weight:500;margin-bottom:12px}
.form input,.form select,.form textarea{display:block;width:100%;margin-top:6px;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--text);font-size:15px;font-family:inherit}
.form label.check{display:flex;gap:8px;align-items:center;color:var(--text)}.form label.check input{width:auto;margin:0}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.actions{display:flex;gap:10px;justify-content:flex-end}
.flash{padding:12px 16px;border-radius:14px;margin-bottom:16px;font-weight:500}.flash.ok{background:color-mix(in srgb,var(--green) 14%,transparent);color:var(--green)}.flash.err{background:color-mix(in srgb,var(--red) 14%,transparent);color:var(--red)}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:18px;padding:40px;text-align:center;color:var(--muted)}
.wa{color:var(--green);font-weight:600}
.bars{display:flex;gap:12px;align-items:flex-end;height:220px}.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}
.bar-track{flex:1;width:100%;max-width:56px;background:color-mix(in srgb,var(--p) 8%,transparent);border-radius:12px;display:flex;align-items:flex-end;overflow:hidden}
.bar-fill{width:100%;background:linear-gradient(180deg,#7c5cff,var(--p2));border-radius:12px;min-height:4px}.bar-v{font-size:11.5px;color:var(--muted);white-space:nowrap}.bar-l{font-size:13px;font-weight:600}
.timeline{list-style:none;margin:0;padding:0}.timeline li{padding:10px 0 10px 18px;border-left:2px solid var(--line);position:relative}
.timeline li:before{content:"";position:absolute;left:-6px;top:15px;width:10px;height:10px;border-radius:50%;background:var(--p)}.timeline small{display:block;color:var(--muted)}
.menu-btn{display:none}
@media (max-width:900px){.app{grid-template-columns:1fr}.side{position:fixed;inset:0 auto 0 0;width:260px;z-index:10;transform:translateX(-100%);transition:transform .2s}
.side.open{transform:none;box-shadow:0 0 0 100vmax rgba(0,0,0,.35)}main{padding:18px 16px 40px}.menu-btn{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--text);font-size:20px}
.kpis{grid-template-columns:1fr 1fr}.grid2,.fgrid{grid-template-columns:1fr}h1{font-size:21px}.kpi-v{font-size:24px}}
.login{min-height:100vh;display:grid;place-items:center;padding:16px;background:radial-gradient(1200px 600px at 10% -10%,#7c5cff55,transparent),radial-gradient(900px 500px at 110% 110%,#00a39655,transparent),var(--bg)}
.login .card{width:100%;max-width:400px;padding:32px}.login .logo{margin:0 auto 12px;width:56px;height:56px;background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;font-size:26px;border-radius:16px}
.login h1{text-align:center}.login p{text-align:center;margin:4px 0 22px}.login .btn{width:100%;padding:13px;margin-top:6px}
CSS;
}

function render_login($error)
{
    $flash = isset($_SESSION['flash']) ? $_SESSION['flash'] : null;
    unset($_SESSION['flash']);
    ?><!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventario Pro · Ingresar</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style><?= styles() ?></style></head>
<body><div class="login"><section class="card form">
<div class="logo" style="display:grid;place-items:center">📦</div>
<h1>Inventario Pro</h1><p class="muted">Ingrese con su usuario</p>
<?php if ($error): ?><div class="flash err"><?= h($error) ?></div><?php endif; ?>
<?php if ($flash): ?><div class="flash <?= h($flash[1]) ?>"><?= h($flash[0]) ?></div><?php endif; ?>
<form method="post"><?= csrf_field() ?>
<label>Usuario<input name="username" autocomplete="username" required autofocus></label>
<label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
<button class="btn">Entrar</button></form>
</section></div></body></html>
<?php
}

function render_layout($title, $content)
{
    global $nav, $page, $user, $brand, $isAdmin;
    $flash = isset($_SESSION['flash']) ? $_SESSION['flash'] : null;
    unset($_SESSION['flash']);
    ?><!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?> · <?= h($brand) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style><?= styles() ?></style></head>
<body><div class="app">
<aside class="side" id="side">
  <div class="brand"><div class="logo">📦</div><div><b><?= h($brand) ?></b><small>Inventario Pro</small></div></div>
  <nav><?php foreach ($nav as $k => $n): ?>
    <a class="<?= $k === $page ? 'on' : '' ?>" href="panel.php?p=<?= $k ?>"><svg viewBox="0 0 24 24"><path d="<?= $n[1] ?>"/></svg><?= h($n[0]) ?></a>
  <?php endforeach; ?></nav>
  <div class="foot"><b><?= h($user['name']) ?></b><br><?= $isAdmin ? 'Administrador' : 'Revendedor' ?> · <a href="panel.php?p=logout">Salir</a></div>
</aside>
<main>
  <div class="top"><h1><?= h($title) ?></h1><button class="menu-btn" onclick="document.getElementById('side').classList.toggle('open')" aria-label="Menú">☰</button></div>
  <?php if ($flash): ?><div class="flash <?= h($flash[1]) ?>"><?= h($flash[0]) ?></div><?php endif; ?>
  <?= $content ?>
</main></div>
<script>document.addEventListener('click',function(e){var s=document.getElementById('side');if(s.classList.contains('open')&&!s.contains(e.target)&&!e.target.closest('.menu-btn'))s.classList.remove('open')});</script>
</body></html>
<?php
}

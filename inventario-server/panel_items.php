<?php
/**
 * Inventario Pro - gestión del inventario desde el panel web: crear y editar productos (también
 * cuentas con perfiles), vender (cuenta completa o un perfil), renovar, liberar, cobrar, eliminar,
 * clientes y envío por WhatsApp. Escribe con el mismo sistema de revisiones que la app, así los
 * cambios aparecen en todos los dispositivos del usuario.
 */
if (!defined('INV_APP')) {
    http_response_code(403);
    exit;
}

// ================================================================ escritura de datos

function new_id()
{
    return ((int) floor(microtime(true) * 1000)) * 1000 + random_int(0, 999);
}

/** Fila vacía de una tabla con sus valores por defecto. */
function blank_row($table, $values = array())
{
    $row = array();
    foreach (entity_fields()[$table] as $name => $type) {
        switch ($type) {
            case 'i': $row[$name] = 0; break;
            case 'i?': $row[$name] = null; break;
            case 'f': $row[$name] = 0.0; break;
            case 'b': $row[$name] = false; break;
            default: $row[$name] = '';
        }
    }
    $now = now_ms();
    if ($table === 'items') {
        $row = array_merge($row, array('category' => 'STREAMING', 'status' => 'AVAILABLE', 'kind' => 'SINGLE', 'paid' => true, 'createdAt' => $now, 'updatedAt' => $now));
    } else {
        $row['createdAt'] = $now;
    }
    return array_merge($row, $values);
}

/** Ejecuta cambios en una transacción con una revisión nueva (bloquea a otros escritores). */
function tx($fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $rev = next_rev();
        $result = $fn($rev);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function put_row($table, $row, $rev)
{
    global $uid;
    $row = cast_row($table, $row);
    if ($table === 'items') $row['updatedAt'] = now_ms();
    $row['rev'] = $rev;
    upsert_row($uid, $table, $row);
}

function del_row($table, $id, $rev)
{
    global $uid;
    db()->prepare("DELETE FROM `$table` WHERE `owner_id` = ? AND `id` = ?")->execute(array($uid, $id));
    db()->prepare('INSERT INTO `deletions` (`owner_id`, `entity`, `entityId`, `rev`) VALUES (?, ?, ?, ?)')->execute(array($uid, $table, $id, $rev));
}

function get_row($table, $id, $lock = false)
{
    global $uid;
    return fetch_row($uid, $table, (int) $id, $lock);
}

function profiles_of($accountId)
{
    global $uid;
    $st = db()->prepare('SELECT * FROM `items` WHERE `owner_id` = ? AND `parentId` = ? ORDER BY `createdAt`');
    $st->execute(array($uid, $accountId));
    return array_map(function ($r) { return cast_row('items', $r); }, $st->fetchAll());
}

/** Datos de la cuenta que comparten todos sus perfiles. */
function with_account_data($profile, $account)
{
    foreach (array('category', 'name', 'plan', 'accessUser', 'accessPassword', 'accessUrl', 'extraInfo', 'supplier', 'purchaseDate', 'expirationDate') as $f) {
        $profile[$f] = $account[$f];
    }
    return $profile;
}

function released($it)
{
    return array_merge($it, array('status' => 'AVAILABLE', 'clientId' => null, 'saleDate' => null, 'salePrice' => 0.0, 'clientExpirationDate' => null, 'paid' => true, 'lastReminderAt' => null));
}

// ================================================================ formularios

function parse_money($v)
{
    global $settings;
    $v = trim((string) $v);
    $dec = isset($settings['currencyDecimals']) ? (int) $settings['currencyDecimals'] : 0;
    if ($dec === 0) return (float) preg_replace('/\D/', '', $v);
    $v = preg_replace('/[^0-9,.]/', '', $v);
    if (strpos($v, ',') !== false) $v = str_replace(array('.', ','), array('', '.'), $v);
    return (float) $v;
}

function money_input($v)
{
    if (!$v) return '';
    return floor($v) == $v ? (string) (int) $v : (string) $v;
}

/** Fecha del formulario (AAAA-MM-DD) a días desde época, o null. */
function parse_day($v)
{
    $v = trim((string) $v);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return null;
    return (int) floor(strtotime($v . ' 00:00:00 UTC') / 86400);
}

function day_input($epochDay)
{
    return $epochDay === null ? '' : gmdate('Y-m-d', (int) $epochDay * 86400);
}

function add_months($epochDay, $months)
{
    return (int) floor(strtotime("+$months month", (int) $epochDay * 86400) / 86400);
}

// ================================================================ WhatsApp y plantillas

function template($key)
{
    global $settings;
    $defaults = array(
        'templateCredentials' => "Hola {cliente} 👋\nAquí están los datos de tu *{servicio}* {plan}:\n\n📧 Usuario: {usuario}\n🔑 Clave: {clave}\n👤 Perfil/PIN: {perfil}\n🔗 Acceso: {link}\n📅 Vence: {vence}\n\n⚠️ No cambies la clave ni el perfil.\nGracias por tu compra en *{negocio}* 🙌",
        'templateReminder' => "Hola {cliente} 👋\nTe recordamos que tu servicio de *{servicio}* vence el *{vence}* ({dias}).\n¿Deseas renovarlo? 💳 Valor: {precio}\n\n*{negocio}*",
        'templateExpired' => "Hola {cliente} 👋\nTu servicio de *{servicio}* venció el *{vence}*.\nSi deseas seguir disfrutándolo, escríbenos para renovarlo 🙌 Valor: {precio}\n\n*{negocio}*",
        'templatePayment' => "Hola {cliente} 👋\nTe recordamos el pago pendiente de *{servicio}* por {precio}.\n¡Muchas gracias! 🙏\n\n*{negocio}*",
    );
    return !empty($settings[$key]) ? $settings[$key] : $defaults[$key];
}

/** Igual que en la app: reemplaza variables y omite las líneas con datos vacíos. */
function fill_message($template, $it, $client)
{
    global $settings, $today, $dueSoon, $brand;
    $st = item_state($it, $today, $dueSoon);
    $price = ($it['status'] === 'SOLD' && $it['salePrice'] > 0) ? $it['salePrice'] : $it['suggestedPrice'];
    $values = array(
        'cliente' => $client ? trim($client['name']) : '',
        'servicio' => $it['name'],
        'plan' => $it['plan'],
        'usuario' => $it['accessUser'],
        'clave' => $it['accessPassword'],
        'perfil' => $it['profilePin'],
        'link' => $it['accessUrl'],
        'vence' => $st['exp'] === null ? '' : fmt_day($st['exp']),
        'dias' => $st['exp'] === null ? '' : mb_strtolower(days_text($st['days'])),
        'precio' => $price > 0 ? money($price, $settings) : '',
        'negocio' => $brand,
    );
    $optional = array('usuario', 'clave', 'perfil', 'link', 'vence', 'dias', 'precio');
    $out = array();
    foreach (preg_split('/\r?\n/', $template) as $line) {
        $skip = false;
        foreach ($optional as $k) {
            if (strpos($line, '{' . $k . '}') !== false && trim($values[$k]) === '') $skip = true;
        }
        if ($skip) continue;
        foreach ($values as $k => $v) $line = str_replace('{' . $k . '}', $v, $line);
        $out[] = rtrim(str_replace(array('  ', ' :'), array(' ', ':'), $line));
    }
    return trim(implode("\n", $out));
}

function wa_number($phone)
{
    global $settings;
    $phone = trim((string) $phone);
    $digits = preg_replace('/\D/', '', $phone);
    if ($digits === '') return '';
    if (strpos($phone, '+') === 0) return $digits;
    if (strpos($digits, '00') === 0) return substr($digits, 2);
    $cc = isset($settings['countryCode']) ? preg_replace('/\D/', '', $settings['countryCode']) : '57';
    if (strlen($digits) <= 10 && $cc !== '') return $cc . $digits;
    return $digits;
}

function wa_link($phone, $text)
{
    $n = wa_number($phone);
    return 'https://wa.me/' . $n . '?text=' . rawurlencode($text);
}

// ================================================================ acciones (POST)

/** Atiende las acciones del inventario. Devuelve false si la acción no es de esta sección. */
function handle_item_action($action)
{
    global $user;
    switch ($action) {
        case 'item_save': return action_item_save();
        case 'item_sell': return action_item_sell();
        case 'item_renew': return action_item_renew();
        case 'item_release':
            $it = require_item(post('id'));
            tx(function ($rev) use ($it) { put_row('items', released($it), $rev); });
            log_activity($user, 'Liberó ' . display_name($it) . ' (panel web)');
            flash('El producto volvió a estar disponible ✅');
            redirect('item', '&id=' . $it['id']);
        case 'item_paid':
            $it = require_item(post('id'));
            tx(function ($rev) use ($it) { put_row('items', array_merge($it, array('paid' => true)), $rev); });
            flash('Marcado como pagado ✅');
            redirect('item', '&id=' . $it['id']);
        case 'item_inactive':
            $it = require_item(post('id'));
            $inactive = $it['status'] !== 'INACTIVE';
            tx(function ($rev) use ($it, $inactive) {
                $new = $inactive
                    ? array_merge($it, array('status' => 'INACTIVE', 'clientId' => null, 'clientExpirationDate' => null))
                    : array_merge($it, array('status' => 'AVAILABLE'));
                put_row('items', $new, $rev);
            });
            flash($inactive ? 'Producto dado de baja' : 'Producto reactivado ✅');
            redirect('item', '&id=' . $it['id']);
        case 'item_delete': return action_item_delete();
        case 'item_message':
            // Marca el recordatorio (si aplica) y abre WhatsApp con el mensaje listo.
            $it = require_item(post('id'));
            $kind = post('kind');
            $client = $it['clientId'] !== null ? get_row('clients', $it['clientId']) : null;
            if ($kind === 'reminder') {
                $tpl = item_state($it, $GLOBALS['today'], $GLOBALS['dueSoon'])['time'] === 'expired' ? 'templateExpired' : 'templateReminder';
                tx(function ($rev) use ($it) { put_row('items', array_merge($it, array('lastReminderAt' => now_ms())), $rev); });
            } elseif ($kind === 'payment') {
                $tpl = 'templatePayment';
            } else {
                $tpl = 'templateCredentials';
            }
            header('Location: ' . wa_link($client ? $client['whatsapp'] : '', fill_message(template($tpl), $it, $client)));
            exit;
        case 'client_save': return action_client_save();
        case 'client_delete': return action_client_delete();
    }
    return false;
}

function require_item($id)
{
    $it = get_row('items', (int) $id);
    if (!$it) throw new ApiError('El producto ya no existe.');
    return $it;
}

function action_item_save()
{
    global $user;
    $id = (int) post('id');
    $name = trim(post('name'));
    if ($name === '') throw new ApiError('Escriba el nombre del servicio o producto.');
    $fields = array(
        'category' => post('category') ?: 'OTRO',
        'name' => $name,
        'plan' => trim(post('plan')),
        'accessUser' => trim(post('accessUser')),
        'accessPassword' => post('accessPassword'),
        'profilePin' => trim(post('profilePin')),
        'accessUrl' => trim(post('accessUrl')),
        'extraInfo' => trim(post('extraInfo')),
        'supplier' => trim(post('supplier')),
        'costPrice' => parse_money(post('costPrice')),
        'suggestedPrice' => parse_money(post('suggestedPrice')),
        'purchaseDate' => parse_day(post('purchaseDate')),
        'expirationDate' => parse_day(post('expirationDate')),
        'notes' => trim(post('notes')),
    );

    if ($id > 0) {
        $newId = tx(function ($rev) use ($id, $fields) {
            $it = get_row('items', $id, true);
            if (!$it) throw new ApiError('El producto ya no existe.');
            if ($it['kind'] === 'ACCOUNT') unset($fields['profilePin']);
            $updated = array_merge($it, $fields);
            put_row('items', $updated, $rev);
            if ($it['kind'] === 'ACCOUNT') {
                foreach (profiles_of($id) as $p) put_row('items', with_account_data($p, $updated), $rev);
            }
            return $id;
        });
        log_activity($user, "Editó $name (panel web)");
        flash('Cambios guardados ✅');
        redirect('item', '&id=' . $newId);
    }

    $mode = post('mode');
    if ($mode === 'account') {
        $labels = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', post('profileNames'))), 'strlen'));
        $count = max(1, min(20, (int) post('profileCount')));
        for ($i = count($labels); $i < $count; $i++) $labels[] = 'Perfil ' . ($i + 1);
        $labels = array_slice($labels, 0, $count);
        $each = parse_money(post('profilePrice'));
        $newId = tx(function ($rev) use ($fields, $labels, $each) {
            $parent = blank_row('items', array_merge($fields, array('id' => new_id(), 'kind' => 'ACCOUNT', 'profilePin' => '')));
            put_row('items', $parent, $rev);
            $unitCost = $parent['costPrice'] / count($labels);
            foreach ($labels as $i => $label) {
                $p = blank_row('items', array('id' => new_id(), 'kind' => 'PROFILE', 'parentId' => $parent['id'], 'profilePin' => $label, 'suggestedPrice' => $each, 'costPrice' => $unitCost, 'createdAt' => now_ms() + $i + 1));
                put_row('items', with_account_data($p, $parent), $rev);
            }
            return $parent['id'];
        });
        log_activity($user, "Agregó la cuenta $name con " . count($labels) . ' perfiles (panel web)');
        flash('Cuenta con ' . count($labels) . ' perfiles creada ✅');
        redirect('item', '&id=' . $newId);
    }

    $copies = max(1, min(50, (int) post('copies')));
    $newId = tx(function ($rev) use ($fields, $copies) {
        $first = 0;
        for ($i = 1; $i <= $copies; $i++) {
            $row = blank_row('items', array_merge($fields, array('id' => new_id(), 'createdAt' => now_ms() + $i)));
            if ($copies > 1 && $row['profilePin'] === '') $row['profilePin'] = "Perfil $i";
            put_row('items', $row, $rev);
            if ($i === 1) $first = $row['id'];
        }
        return $first;
    });
    log_activity($user, "Agregó $name" . ($copies > 1 ? " ($copies unidades)" : '') . ' (panel web)');
    flash($copies > 1 ? "$copies unidades creadas ✅" : 'Producto creado ✅');
    redirect('item', '&id=' . $newId);
}

function action_item_sell()
{
    global $user;
    $id = (int) post('id');
    $target = post('target');
    $saleDate = parse_day(post('saleDate'));
    if ($saleDate === null) $saleDate = $GLOBALS['today'];
    $clientExp = parse_day(post('clientExp'));
    $price = parse_money(post('price'));
    $paid = post('paid') === '1';
    $clientId = (int) post('clientId');
    $newName = trim(post('newName'));
    $newPhone = trim(post('newPhone'));
    if ($clientId === 0 && $newName === '') throw new ApiError('Elija un cliente o escriba el nombre del cliente nuevo.');

    $result = tx(function ($rev) use ($id, $target, $saleDate, $clientExp, $price, $paid, $clientId, $newName, $newPhone) {
        $it = get_row('items', $id, true);
        if (!$it) throw new ApiError('El producto ya no existe.');
        // Cuenta con perfiles: vender completa o un perfil.
        if ($it['kind'] === 'ACCOUNT' && $target !== '' && $target !== 'full') {
            $it = get_row('items', (int) $target, true);
            if (!$it || $it['parentId'] !== $id) throw new ApiError('Elija un perfil de la cuenta.');
        }
        $wasSold = $it['status'] === 'SOLD';
        if ($it['kind'] === 'ACCOUNT' && !$wasSold) {
            foreach (profiles_of($it['id']) as $p) {
                if ($p['status'] === 'SOLD') throw new ApiError('La cuenta completa no se puede vender: ya tiene perfiles vendidos.');
            }
        }
        if ($it['kind'] === 'PROFILE' && !$wasSold) {
            $parent = get_row('items', $it['parentId'], true);
            if ($parent && $parent['status'] === 'SOLD') throw new ApiError('La cuenta completa ya está vendida.');
            if ($it['status'] !== 'AVAILABLE') throw new ApiError('Ese perfil no está disponible.');
        }
        if (!$wasSold && $it['status'] === 'INACTIVE') throw new ApiError('El producto está dado de baja.');

        if ($clientId > 0) {
            $client = get_row('clients', $clientId);
            if (!$client) throw new ApiError('El cliente ya no existe.');
        } else {
            $client = blank_row('clients', array('id' => new_id(), 'name' => $newName, 'whatsapp' => $newPhone));
            put_row('clients', $client, $rev);
        }
        $updated = array_merge($it, array(
            'status' => 'SOLD', 'clientId' => $client['id'], 'saleDate' => $saleDate, 'salePrice' => $price,
            'clientExpirationDate' => $clientExp, 'paid' => $paid, 'lastReminderAt' => $wasSold ? $it['lastReminderAt'] : null,
        ));
        put_row('items', $updated, $rev);
        if (!$wasSold) {
            put_row('sales', blank_row('sales', array(
                'id' => new_id(), 'itemId' => $it['id'], 'clientId' => $client['id'], 'itemName' => display_name($it),
                'clientName' => $client['name'], 'category' => $it['category'], 'amount' => $price, 'cost' => $it['costPrice'],
                'date' => $saleDate, 'kind' => 'VENTA', 'createdBy' => $GLOBALS['user']['name'],
            )), $rev);
        }
        return array($updated, $client, $wasSold);
    });
    list($item, $client, $wasSold) = $result;
    log_activity($user, ($wasSold ? 'Editó la venta de ' : 'Vendió ') . display_name($item) . ' a ' . $client['name'] . ' (panel web)');
    flash($wasSold ? 'Venta actualizada ✅' : 'Venta registrada ✅ Ahora envíe los datos por WhatsApp.');
    redirect('item', '&id=' . $item['id'] . ($wasSold ? '' : '&sold=1'));
}

function action_item_renew()
{
    global $user;
    $id = (int) post('id');
    $clientExp = parse_day(post('clientExp'));
    $accountExp = parse_day(post('accountExp'));
    $amount = parse_money(post('amount'));
    $cost = parse_money(post('cost'));
    $it = tx(function ($rev) use ($id, $clientExp, $accountExp, $amount, $cost) {
        $it = get_row('items', $id, true);
        if (!$it) throw new ApiError('El producto ya no existe.');
        $updated = array_merge($it, array(
            'clientExpirationDate' => $it['status'] === 'SOLD' ? $clientExp : $it['clientExpirationDate'],
            'expirationDate' => $accountExp,
            'lastReminderAt' => null,
        ));
        put_row('items', $updated, $rev);
        if ($it['kind'] === 'ACCOUNT') {
            foreach (profiles_of($id) as $p) put_row('items', with_account_data($p, $updated), $rev);
        }
        if ($amount > 0 || $cost > 0) {
            $client = $it['clientId'] !== null ? get_row('clients', $it['clientId']) : null;
            put_row('sales', blank_row('sales', array(
                'id' => new_id(), 'itemId' => $it['id'], 'clientId' => $client ? $client['id'] : null, 'itemName' => display_name($it),
                'clientName' => $client ? $client['name'] : '', 'category' => $it['category'], 'amount' => $amount, 'cost' => $cost,
                'date' => $GLOBALS['today'], 'kind' => 'RENOVACION', 'createdBy' => $GLOBALS['user']['name'],
            )), $rev);
        }
        return $updated;
    });
    log_activity($user, 'Renovó ' . display_name($it) . ' (panel web)');
    flash('Renovación registrada ✅');
    redirect('item', '&id=' . $id);
}

function action_item_delete()
{
    global $user, $uid;
    $id = (int) post('id');
    $it = require_item($id);
    tx(function ($rev) use ($it, $uid) {
        $all = $it['kind'] === 'ACCOUNT' ? array_merge(profiles_of($it['id']), array($it)) : array($it);
        $ids = array_map(function ($x) { return $x['id']; }, $all);
        $st = db()->prepare('SELECT * FROM `sales` WHERE `owner_id` = ? AND `itemId` IN (' . implode(',', array_map('intval', $ids)) . ')');
        $st->execute(array($uid));
        foreach ($st->fetchAll() as $s) put_row('sales', array_merge(cast_row('sales', $s), array('itemId' => null)), $rev);
        foreach ($all as $x) del_row('items', $x['id'], $rev);
    });
    log_activity($user, 'Eliminó ' . display_name($it) . ' (panel web)');
    flash('Producto eliminado. El historial de ventas se conserva.');
    redirect('inventory');
}

function action_client_save()
{
    global $user;
    $id = (int) post('id');
    $name = trim(post('name'));
    if ($name === '') throw new ApiError('Escriba el nombre del cliente.');
    $cid = tx(function ($rev) use ($id, $name) {
        $base = $id > 0 ? get_row('clients', $id, true) : blank_row('clients', array('id' => new_id()));
        if (!$base) throw new ApiError('El cliente ya no existe.');
        $row = array_merge($base, array('name' => $name, 'whatsapp' => trim(post('whatsapp')), 'email' => trim(post('email')), 'notes' => trim(post('notes'))));
        put_row('clients', $row, $rev);
        return $row['id'];
    });
    log_activity($user, ($id ? 'Editó' : 'Agregó') . " el cliente $name (panel web)");
    flash('Cliente guardado ✅');
    redirect('client', '&id=' . $cid);
}

function action_client_delete()
{
    global $user, $uid;
    $id = (int) post('id');
    $client = get_row('clients', $id);
    if (!$client) throw new ApiError('El cliente ya no existe.');
    tx(function ($rev) use ($id, $uid) {
        $st = db()->prepare('SELECT * FROM `items` WHERE `owner_id` = ? AND `clientId` = ?');
        $st->execute(array($uid, $id));
        foreach ($st->fetchAll() as $r) put_row('items', released(cast_row('items', $r)), $rev);
        $st = db()->prepare('SELECT * FROM `sales` WHERE `owner_id` = ? AND `clientId` = ?');
        $st->execute(array($uid, $id));
        foreach ($st->fetchAll() as $r) put_row('sales', array_merge(cast_row('sales', $r), array('clientId' => null)), $rev);
        del_row('clients', $id, $rev);
    });
    log_activity($user, "Eliminó el cliente {$client['name']} (panel web)");
    flash('Cliente eliminado; sus servicios volvieron a estar disponibles.');
    redirect('clients');
}

// ================================================================ páginas

function categories()
{
    return array('STREAMING', 'IPTV', 'CURSO', 'SISTEMA_WEB', 'APLICACION', 'LICENCIA', 'JUEGOS', 'OTRO');
}

function status_pills($it)
{
    global $today, $dueSoon;
    $st = item_state($it, $today, $dueSoon);
    $out = $it['status'] === 'SOLD' ? '<span class="pill blue">Vendida</span>' : ($it['status'] === 'INACTIVE' ? '<span class="pill gray">Inactiva</span>' : '<span class="pill green">Disponible</span>');
    if ($it['status'] !== 'INACTIVE' && $st['time'] === 'soon') $out .= ' <span class="pill amber">Por vencer</span>';
    if ($it['status'] !== 'INACTIVE' && $st['time'] === 'expired') $out .= ' <span class="pill red">Vencida</span>';
    if ($it['status'] === 'SOLD' && !$it['paid']) $out .= ' <span class="pill red">Por cobrar</span>';
    return $out;
}

function action_button($action, $id, $label, $class = 'ghost', $confirm = '', $extra = array())
{
    $html = '<form method="post" class="inline"' . ($confirm ? ' onsubmit="return confirm(\'' . h($confirm) . '\')"' : '') . '>' . csrf_field()
        . '<input type="hidden" name="action" value="' . h($action) . '"><input type="hidden" name="id" value="' . (int) $id . '">';
    foreach ($extra as $k => $v) $html .= '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">';
    return $html . '<button class="btn small ' . $class . '">' . $label . '</button></form>';
}

function info_row($label, $value, $copy = false)
{
    if ($value === null || $value === '') return '';
    $v = h($value);
    $btn = $copy ? ' <button type="button" class="copy" data-copy="' . $v . '" title="Copiar">⧉</button>' : '';
    return "<div class=\"info\"><span>" . h($label) . "</span><b>$v$btn</b></div>";
}

function page_item()
{
    global $settings, $today, $dueSoon;
    $it = get_row('items', isset($_GET['id']) ? $_GET['id'] : 0);
    if (!$it) {
        echo '<div class="empty">El producto no existe. <a href="panel.php?p=inventory">Volver al inventario</a></div>';
        return;
    }
    $st = item_state($it, $today, $dueSoon);
    $client = $it['clientId'] !== null ? get_row('clients', $it['clientId']) : null;
    $parent = $it['parentId'] !== null ? get_row('items', $it['parentId']) : null;
    $profiles = $it['kind'] === 'ACCOUNT' ? profiles_of($it['id']) : array();
    $soldProfiles = array_filter($profiles, function ($p) { return $p['status'] === 'SOLD'; });
    $freeProfiles = $it['status'] === 'AVAILABLE' ? array_filter($profiles, function ($p) { return $p['status'] === 'AVAILABLE'; }) : array();
    $tone = $st['time'] === 'expired' ? 't-red' : ($st['time'] === 'soon' ? 't-amber' : 't-green');

    echo '<p><a href="panel.php?p=inventory">← Inventario</a></p>';
    if (isset($_GET['sold']) && $it['status'] === 'SOLD') {
        echo '<section class="card highlight"><h3>✅ Venta registrada</h3><p>Envíe los datos de acceso al cliente:</p>'
            . action_button('item_message', $it['id'], '📲 Enviar datos por WhatsApp', '', '', array('kind' => 'credentials')) . '</section>';
    }
    echo '<section class="card"><div class="item-head"><div><h2>' . h(display_name($it)) . '</h2><p class="muted">' . h(category_label($it['category'])) . '</p>' . status_pills($it) . '</div>';
    if ($it['status'] !== 'INACTIVE') {
        echo '<div class="due ' . $tone . '"><b>' . h(days_text($st['days'])) . '</b><small>' . h(fmt_day($st['exp'])) . '</small></div>';
    }
    echo '</div><div class="btns">';
    $parentSold = $parent && $parent['status'] === 'SOLD';
    if ($it['status'] === 'AVAILABLE' && !$parentSold && (!$profiles || $freeProfiles)) {
        echo '<a class="btn small" href="panel.php?p=sell&id=' . $it['id'] . '">💰 ' . ($profiles ? 'Vender (completa o perfil)' : 'Vender') . '</a>';
    }
    if ($it['status'] === 'SOLD') {
        echo action_button('item_message', $it['id'], '📲 Enviar datos', '', '', array('kind' => 'credentials'));
        echo action_button('item_message', $it['id'], '🔔 Recordatorio', 'ghost', '', array('kind' => 'reminder'));
        if (!$it['paid']) {
            echo action_button('item_paid', $it['id'], '✔ Marcar pagado');
            echo action_button('item_message', $it['id'], '💳 Cobrar', 'ghost', '', array('kind' => 'payment'));
        }
        echo '<a class="btn small ghost" href="panel.php?p=sell&id=' . $it['id'] . '">Editar venta</a>';
        echo action_button('item_release', $it['id'], 'Liberar', 'ghost', 'El producto vuelve a estar disponible y se quita el cliente. ¿Continuar?');
    }
    if ($it['status'] !== 'INACTIVE' && $it['kind'] !== 'PROFILE') echo '<a class="btn small ghost" href="panel.php?p=renew&id=' . $it['id'] . '">↻ Renovar</a>';
    echo '<a class="btn small ghost" href="panel.php?p=item_edit&id=' . $it['id'] . '">✎ Editar</a>';
    echo action_button('item_inactive', $it['id'], $it['status'] === 'INACTIVE' ? 'Reactivar' : 'Dar de baja');
    $delMsg = $profiles ? 'Se eliminará la cuenta y sus ' . count($profiles) . ' perfiles. ¿Continuar?' : 'Se eliminará el producto. ¿Continuar?';
    echo action_button('item_delete', $it['id'], 'Eliminar', 'danger', $delMsg);
    echo '</div></section>';

    echo '<div class="grid2"><section class="card"><h3>Datos de acceso</h3>';
    echo info_row('Usuario / correo', $it['accessUser'], true) . info_row('Contraseña', $it['accessPassword'], true)
        . info_row('Perfil / PIN', $it['profilePin'], true) . info_row('Link de acceso', $it['accessUrl'], true)
        . info_row('Información adicional', $it['extraInfo'], true);
    if ($it['accessUser'] . $it['accessPassword'] . $it['profilePin'] . $it['accessUrl'] . $it['extraInfo'] === '') echo '<p class="muted">Sin datos de acceso.</p>';
    echo '</section><section class="card"><h3>Compra y proveedor</h3>';
    echo info_row('Proveedor', $it['supplier']) . info_row('Costo', $it['costPrice'] > 0 ? money($it['costPrice'], $settings) : '')
        . info_row('Precio de venta', $it['suggestedPrice'] > 0 ? money($it['suggestedPrice'], $settings) : '')
        . info_row('Fecha de compra', $it['purchaseDate'] !== null ? fmt_day($it['purchaseDate']) : '')
        . info_row('Vence la cuenta (proveedor)', $it['expirationDate'] !== null ? fmt_day($it['expirationDate']) . ' · ' . days_text($it['expirationDate'] - $today) : 'Sin vencimiento');
    if ($it['notes'] !== '') echo info_row('Notas', $it['notes']);
    echo '</section></div>';

    if ($it['status'] === 'SOLD') {
        echo '<section class="card"><h3>Venta</h3><div class="stats">';
        echo '<div><span>Cliente</span><b>' . ($client ? '<a href="panel.php?p=client&id=' . $client['id'] . '">' . h($client['name']) . '</a>' : '—') . '</b></div>';
        echo '<div><span>WhatsApp</span><b>' . ($client && $client['whatsapp'] ? h($client['whatsapp']) : '—') . '</b></div>';
        echo '<div><span>Fecha de venta</span><b>' . h(fmt_day($it['saleDate'])) . '</b></div>';
        echo '<div><span>Precio</span><b>' . h(money($it['salePrice'], $settings)) . '</b></div>';
        echo '<div><span>Vence (cliente)</span><b class="' . $tone . '">' . h($it['clientExpirationDate'] !== null ? fmt_day($it['clientExpirationDate']) : 'Sin vencimiento') . '</b></div>';
        echo '<div><span>Pago</span><b class="' . ($it['paid'] ? 't-green' : 't-red') . '">' . ($it['paid'] ? 'Pagado' : 'Pendiente') . '</b></div>';
        if ($it['lastReminderAt']) echo '<div><span>Último recordatorio</span><b>' . h(fmt_ms($it['lastReminderAt'])) . '</b></div>';
        echo '</div></section>';
    }

    if ($parent) {
        echo '<section class="card"><h3>Cuenta completa</h3><p>Este perfil pertenece a <a href="panel.php?p=item&id=' . $parent['id'] . '">' . h(display_name($parent)) . '</a>.</p></section>';
    }

    if ($it['kind'] === 'ACCOUNT') {
        $clients = array();
        foreach (load_rows('clients', $GLOBALS['uid']) as $c) $clients[$c['id']] = $c['name'];
        echo '<section class="card"><h3>Perfiles (' . count($freeProfiles) . '/' . count($profiles) . ' libres)</h3>';
        if ($it['status'] === 'SOLD') echo '<p class="muted">Cuenta completa vendida: los perfiles van incluidos.</p>';
        if ($soldProfiles && $it['status'] === 'AVAILABLE') echo '<p class="muted">La cuenta completa no se puede vender porque ya tiene perfiles vendidos.</p>';
        echo '<ul class="list">';
        foreach ($profiles as $p) {
            $ps = item_state($p, $today, $dueSoon);
            if ($p['status'] === 'SOLD') {
                $who = $p['clientId'] !== null && isset($clients[$p['clientId']]) ? $clients[$p['clientId']] : 'cliente';
                $desc = '<span class="pill blue">Vendido</span> ' . h($who) . ' · ' . h(days_text($ps['days']));
                $btn = '<a class="btn small ghost" href="panel.php?p=item&id=' . $p['id'] . '">Ver</a>';
            } elseif ($it['status'] === 'SOLD') {
                $desc = '<span class="muted">Incluido en la venta de la cuenta</span>';
                $btn = '';
            } elseif ($p['status'] === 'AVAILABLE' && $it['status'] === 'AVAILABLE') {
                $desc = '<span class="pill green">Libre</span> ' . ($p['suggestedPrice'] > 0 ? h(money($p['suggestedPrice'], $settings)) : '');
                $btn = '<a class="btn small" href="panel.php?p=sell&id=' . $it['id'] . '&profile=' . $p['id'] . '">Vender</a>';
            } else {
                $desc = '<span class="pill gray">Inactivo</span>';
                $btn = '';
            }
            echo '<li><div><b>' . h($p['profilePin'] ?: 'Perfil') . '</b><small>' . $desc . '</small></div>' . $btn . '</li>';
        }
        echo '</ul></section>';
    }

    $st2 = db()->prepare('SELECT * FROM `sales` WHERE `owner_id` = ? AND `itemId` = ? ORDER BY `date` DESC');
    $st2->execute(array($GLOBALS['uid'], $it['id']));
    $history = $st2->fetchAll();
    if ($history) {
        echo '<section class="card"><h3>Historial</h3><ul class="list">';
        foreach ($history as $s) {
            echo '<li><div><b>' . ($s['kind'] === 'VENTA' ? 'Venta' : 'Renovación') . '</b><small>' . h(fmt_day((int) $s['date'])) . ' · ' . h($s['clientName']) . '</small></div><b>' . h(money($s['amount'], $settings)) . '</b></li>';
        }
        echo '</ul></section>';
    }
}

function page_item_edit()
{
    global $settings, $today;
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $it = $id ? get_row('items', $id) : null;
    if ($id && !$it) {
        echo '<div class="empty">El producto no existe.</div>';
        return;
    }
    $v = $it ?: blank_row('items', array('purchaseDate' => $today, 'category' => isset($_GET['category']) ? $_GET['category'] : 'STREAMING'));
    $sym = h(isset($settings['currencySymbol']) ? $settings['currencySymbol'] : '$');
    $suggest = array(
        'STREAMING' => 'Netflix,Disney+,Max,Prime Video,Spotify,YouTube Premium,Crunchyroll,Paramount+,Vix,Apple TV+',
        'IPTV' => 'IPTV,Magis TV,Flujo TV,DirecTV Go', 'CURSO' => 'Curso de Excel,Platzi,Domestika,Udemy',
        'SISTEMA_WEB' => 'Página web,Tienda online,Hosting,Dominio', 'APLICACION' => 'App Android,App iOS',
        'LICENCIA' => 'Office 365,Windows,Canva Pro,ChatGPT Plus,CapCut Pro,VPN', 'JUEGOS' => 'Xbox Game Pass,PlayStation Plus,Free Fire',
    );
    echo '<p><a href="' . ($it ? 'panel.php?p=item&id=' . $it['id'] : 'panel.php?p=inventory') . '">← Volver</a></p>';
    echo '<form method="post" class="card form">' . csrf_field() . '<input type="hidden" name="action" value="item_save"><input type="hidden" name="id" value="' . (int) $id . '">';
    echo '<h3>' . ($it ? 'Editar producto' : 'Nuevo producto') . '</h3>';
    if ($it && $it['kind'] === 'ACCOUNT') echo '<p class="note">Cuenta con perfiles: los cambios de correo, clave, link, proveedor y fechas se aplican también a todos sus perfiles.</p>';
    if ($it && $it['kind'] === 'PROFILE') echo '<p class="note">Este es un perfil de una cuenta completa. El correo, la clave y las fechas se actualizan al editar la cuenta.</p>';
    echo '<div class="fgrid"><label>Categoría<select name="category" id="cat">';
    foreach (categories() as $c) echo '<option value="' . $c . '"' . ($v['category'] === $c ? ' selected' : '') . '>' . h(category_label($c)) . '</option>';
    echo '</select></label>';
    echo '<label>Nombre del servicio / producto *<input name="name" required list="sug" value="' . h($v['name']) . '"></label></div>';
    echo '<datalist id="sug">';
    foreach ($suggest as $list) foreach (explode(',', $list) as $s) echo '<option value="' . h($s) . '">';
    echo '</datalist>';
    echo '<label>Plan / tipo (ej. Premium 4K, Mensual)<input name="plan" value="' . h($v['plan']) . '"></label>';

    if (!$it) {
        echo '<div class="seg"><label><input type="radio" name="mode" value="single" checked onchange="toggleMode()"> Producto individual</label>'
            . '<label><input type="radio" name="mode" value="account" onchange="toggleMode()"> Cuenta con perfiles</label></div>';
    }
    echo '<h4>Datos de acceso</h4><div class="fgrid">';
    echo '<label>Usuario / correo<input name="accessUser" value="' . h($v['accessUser']) . '"></label>';
    echo '<label>Contraseña<input name="accessPassword" value="' . h($v['accessPassword']) . '"></label>';
    if (!$it || $it['kind'] !== 'ACCOUNT') echo '<label class="single-only">Perfil / PIN<input name="profilePin" value="' . h($v['profilePin']) . '"></label>';
    echo '<label>Link de acceso<input name="accessUrl" value="' . h($v['accessUrl']) . '"></label></div>';
    echo '<label>Información adicional<textarea name="extraInfo" rows="2">' . h($v['extraInfo']) . '</textarea></label>';

    echo '<h4>Compra</h4><div class="fgrid">';
    echo '<label>Proveedor<input name="supplier" value="' . h($v['supplier']) . '"></label>';
    echo '<label>Costo (' . $sym . ')<input name="costPrice" inputmode="decimal" value="' . h(money_input($v['costPrice'])) . '"></label>';
    echo '<label><span class="lbl-price">Precio de venta</span> (' . $sym . ')<input name="suggestedPrice" inputmode="decimal" value="' . h(money_input($v['suggestedPrice'])) . '"></label>';
    echo '<label>Fecha de compra<input type="date" name="purchaseDate" id="pd" value="' . h(day_input($v['purchaseDate'])) . '"></label>';
    echo '<label>Fecha de vencimiento de la cuenta<input type="date" name="expirationDate" id="ed" value="' . h(day_input($v['expirationDate'])) . '"></label>';
    echo '<div class="quick"><span>Rápido:</span>';
    foreach (array(1 => '+1 mes', 3 => '+3 meses', 6 => '+6 meses', 12 => '+1 año') as $m => $l) echo '<button type="button" onclick="plusMonths(\'pd\',\'ed\',' . $m . ')">' . $l . '</button>';
    echo '<button type="button" onclick="document.getElementById(\'ed\').value=\'\'">Sin vencimiento</button></div></div>';
    echo '<label>Notas<textarea name="notes" rows="2">' . h($v['notes']) . '</textarea></label>';

    if (!$it) {
        echo '<div id="account-box" style="display:none"><h4>Perfiles</h4><p class="note">Se guarda la cuenta completa y sus perfiles. Al vender se elige la cuenta completa o un solo perfil. El costo se reparte entre los perfiles.</p><div class="fgrid">';
        echo '<label>Cantidad de perfiles<input type="number" name="profileCount" id="pc" min="1" max="20" value="5" oninput="syncNames()"></label>';
        echo '<label>Precio por perfil (' . $sym . ')<input name="profilePrice" inputmode="decimal"></label></div>';
        echo '<label>Nombre / PIN de cada perfil (uno por línea)<textarea name="profileNames" id="pn" rows="5">Perfil 1' . "\n" . 'Perfil 2' . "\n" . 'Perfil 3' . "\n" . 'Perfil 4' . "\n" . 'Perfil 5</textarea></label></div>';
        echo '<div id="copies-box"><label>Unidades a crear (códigos, licencias iguales)<input type="number" name="copies" min="1" max="50" value="1"></label></div>';
    }
    echo '<div class="actions"><button class="btn">' . ($it ? 'Guardar cambios' : 'Guardar producto') . '</button></div></form>';
}

function client_options($selected = 0)
{
    $clients = load_rows('clients', $GLOBALS['uid']);
    usort($clients, function ($a, $b) { return strcasecmp($a['name'], $b['name']); });
    $html = '';
    foreach ($clients as $c) {
        $html .= '<option value="' . $c['id'] . '"' . ($c['id'] === $selected ? ' selected' : '') . '>' . h($c['name'] . ($c['whatsapp'] ? ' · ' . $c['whatsapp'] : '')) . '</option>';
    }
    return array($html, count($clients));
}

function page_sell()
{
    global $settings, $today;
    $it = get_row('items', isset($_GET['id']) ? $_GET['id'] : 0);
    if (!$it) {
        echo '<div class="empty">El producto no existe.</div>';
        return;
    }
    $editing = $it['status'] === 'SOLD';
    $profiles = $it['kind'] === 'ACCOUNT' && !$editing ? profiles_of($it['id']) : array();
    $free = array_values(array_filter($profiles, function ($p) use ($it) { return $p['status'] === 'AVAILABLE' && $it['status'] === 'AVAILABLE'; }));
    $canFull = !array_filter($profiles, function ($p) { return $p['status'] === 'SOLD'; });
    $selProfile = isset($_GET['profile']) ? (int) $_GET['profile'] : 0;
    $months = isset($settings['defaultSaleMonths']) ? (int) $settings['defaultSaleMonths'] : 1;
    $saleDate = $editing && $it['saleDate'] !== null ? $it['saleDate'] : $today;
    $clientExp = $editing ? $it['clientExpirationDate'] : add_months($today, $months);
    $price = $editing ? $it['salePrice'] : $it['suggestedPrice'];
    if ($profiles && ($selProfile || !$canFull)) {
        foreach ($free as $p) if ($p['id'] === $selProfile || !$selProfile) { $price = $p['suggestedPrice']; $selProfile = $p['id']; break; }
    }
    list($opts, $nClients) = client_options($editing ? (int) $it['clientId'] : 0);
    $sym = h(isset($settings['currencySymbol']) ? $settings['currencySymbol'] : '$');

    echo '<p><a href="panel.php?p=item&id=' . $it['id'] . '">← Volver</a></p>';
    echo '<form method="post" class="card form">' . csrf_field() . '<input type="hidden" name="action" value="item_sell"><input type="hidden" name="id" value="' . $it['id'] . '">';
    echo '<h3>' . ($editing ? 'Editar venta' : 'Vender') . ': ' . h(display_name($it)) . '</h3>';
    if ($profiles) {
        echo '<h4>¿Qué va a vender?</h4><div class="seg">';
        echo '<label' . ($canFull ? '' : ' class="disabled"') . '><input type="radio" name="target" value="full"' . ($canFull && !$selProfile ? ' checked' : '') . ($canFull ? '' : ' disabled') . ' data-price="' . h(money_input($it['suggestedPrice'])) . '" onchange="setPrice(this)"> Cuenta completa (' . count($profiles) . ' perfiles)</label>';
        foreach ($free as $p) {
            echo '<label><input type="radio" name="target" value="' . $p['id'] . '"' . ($p['id'] === $selProfile ? ' checked' : '') . ' data-price="' . h(money_input($p['suggestedPrice'])) . '" onchange="setPrice(this)"> ' . h($p['profilePin'] ?: 'Perfil') . ($p['suggestedPrice'] > 0 ? ' · ' . h(money($p['suggestedPrice'], $settings)) : '') . '</label>';
        }
        echo '</div>';
        if (!$canFull) echo '<p class="note">La cuenta completa no se puede vender porque ya tiene perfiles vendidos.</p>';
    }
    echo '<h4>Cliente</h4>';
    if ($nClients) {
        echo '<label>Cliente existente<select name="clientId"><option value="0">— Cliente nuevo —</option>' . $opts . '</select></label>';
    } else {
        echo '<input type="hidden" name="clientId" value="0">';
    }
    if (!$editing) {
        echo '<div class="fgrid"><label>Nombre del cliente nuevo<input name="newName"></label><label>WhatsApp del cliente nuevo<input name="newPhone" inputmode="tel" placeholder="3001234567"></label></div>';
    }
    echo '<h4>Venta</h4><div class="fgrid">';
    echo '<label>Fecha de venta<input type="date" name="saleDate" id="sd" value="' . h(day_input($saleDate)) . '"></label>';
    echo '<label>Vence para el cliente<input type="date" name="clientExp" id="ce" value="' . h(day_input($clientExp)) . '"></label>';
    echo '<div class="quick"><span>Duración:</span>';
    foreach (array(1 => '1 mes', 2 => '2 meses', 3 => '3 meses', 6 => '6 meses', 12 => '1 año') as $m => $l) echo '<button type="button" onclick="plusMonths(\'sd\',\'ce\',' . $m . ')">' . $l . '</button>';
    echo '<button type="button" onclick="document.getElementById(\'ce\').value=\'\'">Sin vencimiento</button></div>';
    echo '<label>Precio de venta (' . $sym . ')<input name="price" id="price" inputmode="decimal" value="' . h(money_input($price)) . '"></label>';
    echo '<label>Pago<select name="paid"><option value="1"' . (!$editing || $it['paid'] ? ' selected' : '') . '>Pagado</option><option value="0"' . ($editing && !$it['paid'] ? ' selected' : '') . '>Por cobrar</option></select></label></div>';
    echo '<div class="actions"><button class="btn">' . ($editing ? 'Guardar venta' : 'Registrar venta') . '</button></div></form>';
}

function page_renew()
{
    global $settings, $today;
    $it = get_row('items', isset($_GET['id']) ? $_GET['id'] : 0);
    if (!$it) {
        echo '<div class="empty">El producto no existe.</div>';
        return;
    }
    $sold = $it['status'] === 'SOLD';
    $base = function ($d) use ($today) { return max($d === null ? $today : $d, $today); };
    $sym = h(isset($settings['currencySymbol']) ? $settings['currencySymbol'] : '$');
    echo '<p><a href="panel.php?p=item&id=' . $it['id'] . '">← Volver</a></p>';
    echo '<form method="post" class="card form">' . csrf_field() . '<input type="hidden" name="action" value="item_renew"><input type="hidden" name="id" value="' . $it['id'] . '">';
    echo '<h3>' . ($sold ? 'Renovar servicio' : 'Renovar cuenta') . ': ' . h(display_name($it)) . '</h3><div class="fgrid">';
    if ($sold) {
        echo '<input type="hidden" id="cb" value="' . h(day_input($base($it['clientExpirationDate']))) . '">';
        echo '<label>Nuevo vencimiento (cliente)<input type="date" name="clientExp" id="ce" value="' . h(day_input(add_months($base($it['clientExpirationDate']), 1))) . '"></label>';
        echo '<div class="quick"><span>Cliente:</span>';
        foreach (array(1 => '+1 mes', 2 => '+2', 3 => '+3', 6 => '+6', 12 => '+1 año') as $m => $l) echo '<button type="button" onclick="plusMonths(\'cb\',\'ce\',' . $m . ')">' . $l . '</button>';
        echo '</div>';
    }
    echo '<input type="hidden" id="ab" value="' . h(day_input($base($it['expirationDate']))) . '">';
    echo '<label>Vencimiento de la cuenta (proveedor)<input type="date" name="accountExp" id="ae" value="' . h(day_input($sold ? $it['expirationDate'] : add_months($base($it['expirationDate']), 1))) . '"></label>';
    echo '<div class="quick"><span>Cuenta:</span>';
    foreach (array(1 => '+1 mes', 3 => '+3', 6 => '+6', 12 => '+1 año') as $m => $l) echo '<button type="button" onclick="plusMonths(\'ab\',\'ae\',' . $m . ')">' . $l . '</button>';
    echo '</div>';
    if ($sold) echo '<label>Valor cobrado (' . $sym . ')<input name="amount" inputmode="decimal" value="' . h(money_input($it['salePrice'])) . '"></label>';
    echo '<label>Costo de la renovación (' . $sym . ')<input name="cost" inputmode="decimal" value="' . h($sold ? '' : money_input($it['costPrice'])) . '"></label>';
    echo '</div><p class="note">Se registra en el historial para sus reportes de ingresos y ganancias.</p>';
    echo '<div class="actions"><button class="btn">Renovar</button></div></form>';
}

function page_client()
{
    global $settings, $uid, $today, $dueSoon;
    $c = get_row('clients', isset($_GET['id']) ? $_GET['id'] : 0);
    if (!$c) {
        echo '<div class="empty">El cliente no existe.</div>';
        return;
    }
    $st = db()->prepare("SELECT * FROM `items` WHERE `owner_id` = ? AND `clientId` = ? AND `status` = 'SOLD'");
    $st->execute(array($uid, $c['id']));
    $items = array_map(function ($r) { return cast_row('items', $r); }, $st->fetchAll());
    $st = db()->prepare('SELECT * FROM `sales` WHERE `owner_id` = ? AND `clientId` = ? ORDER BY `date` DESC');
    $st->execute(array($uid, $c['id']));
    $sales = $st->fetchAll();
    $total = array_sum(array_map(function ($s) { return $s['amount']; }, $sales));
    $wa = wa_number($c['whatsapp']);
    echo '<p><a href="panel.php?p=clients">← Clientes</a></p>';
    echo '<section class="card"><div class="item-head"><div><h2>' . h($c['name']) . '</h2><p class="muted">' . h($c['whatsapp']) . ($c['email'] ? ' · ' . h($c['email']) : '') . '</p></div>';
    echo '<div class="due"><b>' . h(money($total, $settings)) . '</b><small>Total comprado</small></div></div><div class="btns">';
    if ($wa) echo '<a class="btn small" target="_blank" rel="noopener" href="https://wa.me/' . h($wa) . '">📲 WhatsApp</a>';
    echo '<a class="btn small ghost" href="panel.php?p=client_edit&id=' . $c['id'] . '">✎ Editar</a>';
    echo action_button('client_delete', $c['id'], 'Eliminar', 'danger', 'Se eliminará el cliente y sus servicios volverán a estar disponibles. ¿Continuar?');
    echo '</div>' . ($c['notes'] ? '<p class="muted pre">' . h($c['notes']) . '</p>' : '') . '</section>';
    echo '<section class="card"><h3>Servicios activos (' . count($items) . ')</h3><ul class="list">';
    if (!$items) echo '<li class="muted">Sin servicios activos</li>';
    foreach ($items as $i) {
        $s = item_state($i, $today, $dueSoon);
        $tone = $s['time'] === 'expired' ? 'red' : ($s['time'] === 'soon' ? 'amber' : 'green');
        echo '<li><div><a href="panel.php?p=item&id=' . $i['id'] . '"><b>' . h(display_name($i)) . '</b></a><small>' . h($i['accessUser']) . '</small></div><span class="pill ' . $tone . '">' . h(days_text($s['days'])) . '</span></li>';
    }
    echo '</ul></section>';
    if ($sales) {
        echo '<section class="card"><h3>Historial de compras</h3><ul class="list">';
        foreach ($sales as $s) echo '<li><div><b>' . h($s['itemName']) . '</b><small>' . h(fmt_day((int) $s['date'])) . ' · ' . ($s['kind'] === 'VENTA' ? 'Venta' : 'Renovación') . '</small></div><b>' . h(money($s['amount'], $settings)) . '</b></li>';
        echo '</ul></section>';
    }
}

function page_client_edit()
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $c = $id ? get_row('clients', $id) : blank_row('clients');
    if (!$c) {
        echo '<div class="empty">El cliente no existe.</div>';
        return;
    }
    echo '<p><a href="' . ($id ? 'panel.php?p=client&id=' . $id : 'panel.php?p=clients') . '">← Volver</a></p>';
    echo '<form method="post" class="card form">' . csrf_field() . '<input type="hidden" name="action" value="client_save"><input type="hidden" name="id" value="' . $id . '">';
    echo '<h3>' . ($id ? 'Editar cliente' : 'Nuevo cliente') . '</h3><div class="fgrid">';
    echo '<label>Nombre *<input name="name" required value="' . h($c['name']) . '"></label>';
    echo '<label>WhatsApp<input name="whatsapp" inputmode="tel" value="' . h($c['whatsapp']) . '" placeholder="3001234567"></label>';
    echo '<label>Correo<input name="email" type="email" value="' . h($c['email']) . '"></label></div>';
    echo '<label>Notas<textarea name="notes" rows="3">' . h($c['notes']) . '</textarea></label>';
    echo '<div class="actions"><button class="btn">Guardar</button></div></form>';
}

/** Estilos y scripts extra de las páginas de gestión. */
function items_assets()
{
    return <<<HTML
<style>
.item-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.item-head h2{margin:0 0 2px;font-size:22px}.item-head p{margin:0 0 8px}
.due{text-align:right}.due b{display:block;font-size:18px}.due small{color:var(--muted)}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.btn.danger{background:transparent;color:var(--red);border:1px solid color-mix(in srgb,var(--red) 40%,transparent)}
.info{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}.info:last-child{border:0}.info span{color:var(--muted)}.info b{text-align:right;word-break:break-word}
.copy{border:0;background:color-mix(in srgb,var(--p) 12%,transparent);color:var(--p);border-radius:8px;cursor:pointer;padding:2px 7px;margin-left:6px}
.card.highlight{border-color:var(--green);background:color-mix(in srgb,var(--green) 8%,var(--card))}
.form h4{margin:18px 0 10px;color:var(--p);font-size:14px}.note{font-size:13px;color:var(--muted);background:color-mix(in srgb,var(--p) 6%,transparent);padding:10px 12px;border-radius:10px}
.seg{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.seg label{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:12px;padding:10px 14px;color:var(--text);cursor:pointer;margin:0}
.seg label:has(input:checked){border-color:var(--p);background:color-mix(in srgb,var(--p) 10%,transparent)}.seg input{width:auto;margin:0}.seg label.disabled{opacity:.5}
.quick{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-4px 0 12px}.quick span{font-size:13px;color:var(--muted)}
.quick button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:99px;padding:6px 12px;cursor:pointer;font-family:inherit}
tr.click{cursor:pointer}tr.click:hover td{background:color-mix(in srgb,var(--p) 4%,transparent)}
</style>
<script>
function plusMonths(fromId,toId,m){var f=document.getElementById(fromId).value;var d=f?new Date(f+'T00:00:00Z'):new Date();var day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+m);var last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));document.getElementById(toId).value=d.toISOString().slice(0,10)}
function toggleMode(){var acc=document.querySelector('input[name=mode][value=account]').checked;document.getElementById('account-box').style.display=acc?'':'none';document.getElementById('copies-box').style.display=acc?'none':'';document.querySelectorAll('.single-only').forEach(function(e){e.style.display=acc?'none':''});var l=document.querySelector('.lbl-price');if(l)l.textContent=acc?'Precio cuenta completa':'Precio de venta'}
function syncNames(){var n=Math.max(1,Math.min(20,parseInt(document.getElementById('pc').value||'1',10)));var t=document.getElementById('pn');var lines=t.value.split('\\n').filter(function(x){return x.trim()!==''});while(lines.length<n)lines.push('Perfil '+(lines.length+1));t.value=lines.slice(0,n).join('\\n')}
function setPrice(r){var p=document.getElementById('price');if(p&&r.dataset.price!==undefined)p.value=r.dataset.price}
document.addEventListener('click',function(e){var b=e.target.closest('.copy');if(b){navigator.clipboard.writeText(b.dataset.copy);b.textContent='✓';setTimeout(function(){b.textContent='⧉'},1200)}var tr=e.target.closest('tr[data-href]');if(tr&&!e.target.closest('a,button'))location.href=tr.dataset.href});
</script>
HTML;
}

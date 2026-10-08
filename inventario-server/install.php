<?php
/**
 * Inventario Pro - instalador web.
 * Abra https://su-dominio.com/<carpeta>/install.php y complete el formulario.
 */
define('INV_APP', true);
require __DIR__ . '/lib.php';

$configFile = __DIR__ . '/config.php';
$installed = file_exists($configFile);
$errors = array();
$done = false;
$manualConfig = '';

$v = array(
    'db_host' => 'localhost', 'db_port' => '3306', 'db_name' => '', 'db_user' => '', 'db_pass' => '',
    'business' => '', 'admin_name' => '', 'admin_user' => 'admin', 'admin_pass' => '', 'admin_pass2' => '',
);

if (!$installed && $_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($v as $k => $default) {
        $v[$k] = isset($_POST[$k]) ? trim((string) $_POST[$k]) : $default;
    }
    $v['db_pass'] = isset($_POST['db_pass']) ? (string) $_POST['db_pass'] : '';
    if ($v['db_name'] === '' || $v['db_user'] === '') {
        $errors[] = 'Escriba el nombre de la base de datos y el usuario de MySQL.';
    }
    if ($v['admin_name'] === '' || !preg_match('/^[a-z0-9._-]{3,60}$/', strtolower($v['admin_user']))) {
        $errors[] = 'Escriba su nombre y un usuario de 3 a 60 caracteres (letras, números, punto o guion).';
    }
    if (strlen($v['admin_pass']) < 6) {
        $errors[] = 'La contraseña del administrador debe tener al menos 6 caracteres.';
    } elseif ($v['admin_pass'] !== $v['admin_pass2']) {
        $errors[] = 'Las contraseñas no coinciden.';
    }

    if (!$errors) {
        try {
            $pdo = connect_db($v['db_host'], (int) $v['db_port'], $v['db_name'], $v['db_user'], $v['db_pass']);
            create_schema($pdo);
            $hasAdmin = (int) $pdo->query("SELECT COUNT(*) FROM `users` WHERE `role` = 'ADMIN'")->fetchColumn();
            if ($hasAdmin === 0) {
                $adminId = create_user($pdo, $v['admin_name'], $v['admin_user'], $v['admin_pass'], 'ADMIN');
                if ($v['business'] !== '') {
                    $pdo->prepare('INSERT INTO `user_settings` (`user_id`, `data`) VALUES (?, ?)')
                        ->execute(array($adminId, json_encode(array('businessName' => $v['business']), JSON_UNESCAPED_UNICODE)));
                }
            }
            $config = "<?php\n// Generado por install.php. No comparta este archivo.\n"
                . "if (!defined('INV_APP')) {\n    http_response_code(403);\n    exit;\n}\n"
                . 'const DB_HOST = ' . var_export($v['db_host'], true) . ";\n"
                . 'const DB_PORT = ' . (int) $v['db_port'] . ";\n"
                . 'const DB_NAME = ' . var_export($v['db_name'], true) . ";\n"
                . 'const DB_USER = ' . var_export($v['db_user'], true) . ";\n"
                . 'const DB_PASS = ' . var_export($v['db_pass'], true) . ";\n";
            if (@file_put_contents($configFile, $config) === false) {
                $manualConfig = $config;
            }
            $done = true;
            $installed = $manualConfig === '';
        } catch (PDOException $e) {
            $errors[] = 'No se pudo conectar a la base de datos: ' . $e->getMessage();
        }
    }
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');

function h($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}
?><!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instalar Inventario Pro</title>
<style>
  :root { --p: #5b3fd9; --bg: #f7f5ff; --card: #fff; --text: #1d1b26; --muted: #6b6880; --err: #d93848; --ok: #1e9e5a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14121c; --card: #1f1c2a; --text: #ece9f7; --muted: #a29fb5; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--text); }
  main { max-width: 560px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.5rem; margin: 8px 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  .card { background: var(--card); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h2 { font-size: 1.05rem; margin: 0 0 12px; color: var(--p); }
  label { display: block; font-size: .85rem; color: var(--muted); margin: 10px 0 4px; }
  input { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid #c9c4dd; font-size: 1rem; background: transparent; color: var(--text); }
  .row { display: flex; gap: 12px; } .row > div { flex: 1; }
  button { width: 100%; padding: 14px; border: 0; border-radius: 12px; background: var(--p); color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .err { background: rgba(217,56,72,.12); color: var(--err); padding: 12px; border-radius: 10px; margin-bottom: 12px; }
  .ok { color: var(--ok); }
  code, .url { background: rgba(91,63,217,.1); padding: 2px 6px; border-radius: 6px; word-break: break-all; }
  .url { display: block; padding: 12px; font-size: 1.05rem; margin: 8px 0; }
  textarea { width: 100%; height: 160px; font-family: monospace; font-size: .8rem; }
  .hint { font-size: .8rem; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>📦 Inventario Pro</h1>
  <p class="sub">Instalación del servidor para la app Android</p>

<?php if ($done): ?>
  <div class="card">
    <h2 class="ok">✅ ¡Instalación completa!</h2>
    <?php if ($manualConfig !== ''): ?>
      <p>No se pudo crear <code>config.php</code> automáticamente (permisos de la carpeta). Cree un archivo llamado
        <code>config.php</code> en esta misma carpeta con este contenido:</p>
      <textarea readonly><?= h($manualConfig) ?></textarea>
    <?php endif; ?>
    <p>En la app, vaya a <b>Ajustes → Conectar a mi servidor</b> y escriba esta dirección:</p>
    <span class="url"><?= h($base) ?></span>
    <p>Usuario: <code><?= h(strtolower($v['admin_user'])) ?></code> y la contraseña que eligió.</p>
    <p><b>Importante:</b> por seguridad, <b>elimine el archivo <code>install.php</code></b> desde el administrador de archivos de su hosting.</p>
  </div>
<?php elseif ($installed): ?>
  <div class="card">
    <h2>El servidor ya está instalado</h2>
    <p>Dirección para la app:</p>
    <span class="url"><?= h($base) ?></span>
    <p class="hint">Para reinstalar, elimine <code>config.php</code> (los datos de la base de datos se conservan).
      Por seguridad, elimine este archivo <code>install.php</code>.</p>
  </div>
<?php else: ?>
  <?php if (version_compare(PHP_VERSION, '7.4', '<') || !extension_loaded('pdo_mysql')): ?>
    <div class="err">Este hosting necesita PHP 7.4 o superior con la extensión pdo_mysql (versión actual: <?= h(PHP_VERSION) ?>).
      Puede cambiarla en cPanel → «Seleccionar versión de PHP».</div>
  <?php endif; ?>
  <?php foreach ($errors as $e): ?><div class="err"><?= h($e) ?></div><?php endforeach; ?>
  <form method="post" autocomplete="off">
    <div class="card">
      <h2>1. Base de datos MySQL</h2>
      <p class="hint">Créela en cPanel → «Bases de datos MySQL»: una base de datos, un usuario con contraseña y asigne el usuario a la base con todos los privilegios.</p>
      <div class="row">
        <div><label>Servidor</label><input name="db_host" value="<?= h($v['db_host']) ?>" required></div>
        <div style="max-width:110px"><label>Puerto</label><input name="db_port" value="<?= h($v['db_port']) ?>" inputmode="numeric"></div>
      </div>
      <label>Nombre de la base de datos</label><input name="db_name" value="<?= h($v['db_name']) ?>" placeholder="ej. micuenta_inventario" required>
      <label>Usuario de MySQL</label><input name="db_user" value="<?= h($v['db_user']) ?>" placeholder="ej. micuenta_admin" required>
      <label>Contraseña de MySQL</label><input name="db_pass" type="password" value="">
    </div>
    <div class="card">
      <h2>2. Su usuario administrador</h2>
      <p class="hint">Con este usuario crea las cuentas de sus revendedores. Cada uno tendrá su propio inventario y marca.</p>
      <label>Nombre de su negocio (su marca)</label><input name="business" value="<?= h($v['business']) ?>" placeholder="ej. NameTech Streaming">
      <label>Su nombre</label><input name="admin_name" value="<?= h($v['admin_name']) ?>" required>
      <label>Usuario para iniciar sesión</label><input name="admin_user" value="<?= h($v['admin_user']) ?>" required>
      <div class="row">
        <div><label>Contraseña</label><input name="admin_pass" type="password" required minlength="6"></div>
        <div><label>Repetir contraseña</label><input name="admin_pass2" type="password" required minlength="6"></div>
      </div>
    </div>
    <button type="submit">Instalar</button>
    <p class="hint">Use <b>https://</b> (certificado SSL, gratis en la mayoría de hostings) para que las contraseñas viajen cifradas.</p>
  </form>
<?php endif; ?>
</main>
</body>
</html>

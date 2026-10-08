<?php
define('INV_APP', true);
require __DIR__ . '/lib.php';
$ready = file_exists(__DIR__ . '/config.php');
if ($ready) {
    header('Location: panel.php');
    exit;
}
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
?><!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventario Pro</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #f7f5ff; color: #1d1b26; display: grid; place-items: center; min-height: 100vh; }
  @media (prefers-color-scheme: dark) { body { background: #14121c; color: #ece9f7; } }
  .box { text-align: center; padding: 24px 16px; max-width: 480px; }
  code { background: rgba(91,63,217,.12); padding: 8px 10px; border-radius: 8px; display: inline-block; word-break: break-all; }
</style>
</head>
<body>
<div class="box">
  <h1>📦 Inventario Pro</h1>
  <?php if ($ready): ?>
    <p>✅ El servidor está funcionando (v<?= INV_VERSION ?>).</p>
    <p>Dirección para la app:</p>
    <code><?= htmlspecialchars($base, ENT_QUOTES, 'UTF-8') ?></code>
  <?php else: ?>
    <p>El servidor aún no está instalado.</p>
    <p><a href="install.php">Instalar ahora</a></p>
  <?php endif; ?>
</div>
</body>
</html>

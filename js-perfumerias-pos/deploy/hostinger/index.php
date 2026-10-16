<?php
declare(strict_types=1);

/**
 * JS Perfumerías POS — punto de entrada para Hostinger.
 * Este archivo va en la carpeta raíz del dominio o subdominio (public_html,
 * public_html/pos, etc.). El código privado vive en una carpeta "js-pos" que se
 * busca en esta carpeta y en las carpetas superiores (hasta 3 niveles).
 */

define('JSP_PUBLIC_PATH', __DIR__);

$bootstrap = null;
$dir = __DIR__;
for ($i = 0; $i <= 3; $i++) {
    $dir = $i === 0 ? __DIR__ : dirname($dir);
    if (is_file($dir . '/js-pos/app/bootstrap.php')) {
        $bootstrap = $dir . '/js-pos/app/bootstrap.php';
        break;
    }
}

if ($bootstrap === null) {
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>JS Perfumerías POS</title>'
        . '<div style="font-family:system-ui;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.6">'
        . '<h1 style="font-size:22px">Falta la carpeta <code>js-pos</code></h1>'
        . '<p>El archivo <code>index.php</code> está en:<br><code>' . htmlspecialchars(__DIR__) . '</code></p>'
        . '<p>Suba la carpeta <code>js-pos</code> del paquete a esta misma carpeta o a una carpeta superior '
        . '(lo recomendado es junto a <code>public_html</code>).</p></div>';
    exit;
}

require $bootstrap;

$app = new App\Core\App();
$app->handle(App\Core\Request::capture())->send();

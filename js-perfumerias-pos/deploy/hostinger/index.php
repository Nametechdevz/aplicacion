<?php
declare(strict_types=1);

/**
 * JS Perfumerías POS — punto de entrada para Hostinger (public_html).
 * El código privado vive en la carpeta hermana ../js-pos, fuera del acceso web.
 */

define('JSP_PUBLIC_PATH', __DIR__);

require __DIR__ . '/../js-pos/app/bootstrap.php';

$app = new App\Core\App();
$app->handle(App\Core\Request::capture())->send();

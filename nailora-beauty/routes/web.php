<?php

declare(strict_types=1);

use App\Controllers\CartController;
use App\Controllers\CheckoutController;
use App\Controllers\HomeController;
use App\Controllers\InstallController;
use App\Controllers\OrderController;
use App\Controllers\ProductController;

/** @var App\Core\Router $router */

$router->get('/', [HomeController::class, 'index']);
$router->get('/catalogo', [ProductController::class, 'index']);
$router->get('/categoria/{slug:[a-z0-9-]+}', [ProductController::class, 'category']);
$router->get('/marca/{slug:[a-z0-9-]+}', [ProductController::class, 'brand']);
$router->get('/producto/{slug:[a-z0-9-]+}', [ProductController::class, 'show']);
$router->get('/pagina/{slug:[a-z0-9-]+}', [HomeController::class, 'page']);

$router->get('/carrito', [CartController::class, 'index']);
$router->get('/carrito/resumen', [CartController::class, 'summary']);
$router->get('/carrito/whatsapp', [CartController::class, 'whatsapp']);
$router->post('/carrito/agregar', [CartController::class, 'add']);
$router->post('/carrito/actualizar', [CartController::class, 'update']);
$router->post('/carrito/eliminar', [CartController::class, 'remove']);
$router->post('/carrito/vaciar', [CartController::class, 'clear']);

$router->get('/checkout', [CheckoutController::class, 'show']);
$router->post('/checkout', [CheckoutController::class, 'store']);

$router->get('/pedido/{code:NB-\d{4}-\d{6}}', [OrderController::class, 'show']);
$router->post('/pedido/{code:NB-\d{4}-\d{6}}/whatsapp', [OrderController::class, 'whatsapp']);

$router->get('/sitemap.xml', [HomeController::class, 'sitemap']);
$router->get('/robots.txt', [HomeController::class, 'robots']);

$router->get('/instalar', [InstallController::class, 'show']);
$router->post('/instalar', [InstallController::class, 'store']);

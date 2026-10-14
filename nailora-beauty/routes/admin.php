<?php

declare(strict_types=1);

use App\Controllers\Admin\AuditController;
use App\Controllers\Admin\AuthController;
use App\Controllers\Admin\BrandController;
use App\Controllers\Admin\CategoryController;
use App\Controllers\Admin\CustomerController;
use App\Controllers\Admin\DashboardController;
use App\Controllers\Admin\InventoryController;
use App\Controllers\Admin\OrderController;
use App\Controllers\Admin\PageController;
use App\Controllers\Admin\ProductController;
use App\Controllers\Admin\PromotionController;
use App\Controllers\Admin\ReportController;
use App\Controllers\Admin\SettingsController;
use App\Controllers\Admin\UserController;

/** @var App\Core\Router $router */

$router->group('/admin', ['guest'], static function ($r): void {
    $r->get('/login', [AuthController::class, 'showLogin']);
    $r->post('/login', [AuthController::class, 'login']);
});

$router->group('/admin', ['auth'], static function ($r): void {
    $r->post('/logout', [AuthController::class, 'logout']);
    $r->get('', [DashboardController::class, 'index']);

    // Productos
    $r->get('/productos', [ProductController::class, 'index']);
    $r->get('/productos/nuevo', [ProductController::class, 'create']);
    $r->post('/productos', [ProductController::class, 'store']);
    $r->get('/productos/{id:\d+}/editar', [ProductController::class, 'edit']);
    $r->post('/productos/{id:\d+}', [ProductController::class, 'update']);
    $r->post('/productos/{id:\d+}/duplicar', [ProductController::class, 'duplicate']);
    $r->post('/productos/{id:\d+}/estado', [ProductController::class, 'toggle']);
    $r->post('/productos/{id:\d+}/eliminar', [ProductController::class, 'destroy']);
    $r->post('/productos/{id:\d+}/imagenes', [ProductController::class, 'uploadImages']);
    $r->post('/productos/{id:\d+}/imagenes/{imageId:\d+}/principal', [ProductController::class, 'primaryImage']);
    $r->post('/productos/{id:\d+}/imagenes/{imageId:\d+}/eliminar', [ProductController::class, 'deleteImage']);
    $r->post('/productos/{id:\d+}/variantes', [ProductController::class, 'storeVariant']);
    $r->post('/productos/{id:\d+}/variantes/{variantId:\d+}', [ProductController::class, 'updateVariant']);

    // Categorías y marcas
    $r->get('/categorias', [CategoryController::class, 'index']);
    $r->get('/categorias/nueva', [CategoryController::class, 'create']);
    $r->post('/categorias', [CategoryController::class, 'store']);
    $r->get('/categorias/{id:\d+}/editar', [CategoryController::class, 'edit']);
    $r->post('/categorias/{id:\d+}', [CategoryController::class, 'update']);
    $r->post('/categorias/{id:\d+}/estado', [CategoryController::class, 'toggle']);
    $r->post('/categorias/{id:\d+}/eliminar', [CategoryController::class, 'destroy']);

    $r->get('/marcas', [BrandController::class, 'index']);
    $r->post('/marcas', [BrandController::class, 'store']);
    $r->post('/marcas/{id:\d+}', [BrandController::class, 'update']);
    $r->post('/marcas/{id:\d+}/estado', [BrandController::class, 'toggle']);
    $r->post('/marcas/{id:\d+}/eliminar', [BrandController::class, 'destroy']);

    // Inventario
    $r->get('/inventario', [InventoryController::class, 'index']);
    $r->get('/inventario/movimientos', [InventoryController::class, 'movements']);
    $r->get('/inventario/ajustar', [InventoryController::class, 'adjustForm']);
    $r->post('/inventario/ajustar', [InventoryController::class, 'adjust']);

    // Pedidos
    $r->get('/pedidos', [OrderController::class, 'index']);
    $r->get('/pedidos/{id:\d+}', [OrderController::class, 'show']);
    $r->get('/pedidos/{id:\d+}/imprimir', [OrderController::class, 'printView']);
    $r->post('/pedidos/{id:\d+}/estado', [OrderController::class, 'status']);
    $r->post('/pedidos/{id:\d+}/notas', [OrderController::class, 'note']);
    $r->post('/pedidos/{id:\d+}/envio', [OrderController::class, 'shipping']);
    $r->post('/pedidos/{id:\d+}/pago', [OrderController::class, 'payment']);

    // Clientes
    $r->get('/clientes', [CustomerController::class, 'index']);
    $r->get('/clientes/{id:\d+}', [CustomerController::class, 'show']);

    // Promociones
    $r->get('/promociones', [PromotionController::class, 'index']);
    $r->get('/promociones/nueva', [PromotionController::class, 'create']);
    $r->post('/promociones', [PromotionController::class, 'store']);
    $r->get('/promociones/{id:\d+}/editar', [PromotionController::class, 'edit']);
    $r->post('/promociones/{id:\d+}', [PromotionController::class, 'update']);
    $r->post('/promociones/{id:\d+}/estado', [PromotionController::class, 'toggle']);
    $r->post('/promociones/{id:\d+}/eliminar', [PromotionController::class, 'destroy']);

    // Informes
    $r->get('/informes', [ReportController::class, 'index']);
    $r->get('/informes/exportar', [ReportController::class, 'export']);

    // Configuración y páginas
    $r->get('/configuracion', [SettingsController::class, 'index']);
    $r->post('/configuracion', [SettingsController::class, 'update']);
    $r->get('/paginas', [PageController::class, 'index']);
    $r->get('/paginas/{id:\d+}/editar', [PageController::class, 'edit']);
    $r->post('/paginas/{id:\d+}', [PageController::class, 'update']);

    // Usuarios, perfil y auditoría
    $r->get('/usuarios', [UserController::class, 'index']);
    $r->post('/usuarios', [UserController::class, 'store']);
    $r->post('/usuarios/{id:\d+}/estado', [UserController::class, 'toggle']);
    $r->get('/perfil', [UserController::class, 'profile']);
    $r->post('/perfil', [UserController::class, 'updateProfile']);
    $r->get('/auditoria', [AuditController::class, 'index']);
});

<?php
/** @var App\Core\Router $router */

use App\Controllers\AuthController;
use App\Controllers\BrandController;
use App\Controllers\CashController;
use App\Controllers\CategoryController;
use App\Controllers\CustomerController;
use App\Controllers\DashboardController;
use App\Controllers\EdocController;
use App\Controllers\InventoryController;
use App\Controllers\PosController;
use App\Controllers\ProductController;
use App\Controllers\PurchaseController;
use App\Controllers\ReportController;
use App\Controllers\SaleController;
use App\Controllers\SettingsController;
use App\Controllers\SupplierController;
use App\Controllers\UserController;

$admin = ['roles' => ['admin']];

// Autenticación
$router->get('/login', [AuthController::class, 'loginForm'], ['public' => true]);
$router->post('/login', [AuthController::class, 'login'], ['public' => true]);
$router->post('/logout', [AuthController::class, 'logout']);
$router->get('/profile', [AuthController::class, 'profile']);
$router->post('/profile', [AuthController::class, 'updateProfile']);

// Inicio
$router->get('/', [DashboardController::class, 'index']);

// Punto de venta
$router->get('/pos', [PosController::class, 'index']);
$router->post('/pos/checkout', [PosController::class, 'checkout']);
$router->get('/api/products/search', [PosController::class, 'searchProducts']);
$router->get('/api/customers/search', [CustomerController::class, 'search']);
$router->post('/api/customers', [CustomerController::class, 'quickStore']);

// Ventas y notas crédito
$router->get('/sales', [SaleController::class, 'index']);
$router->get('/sales/{id}', [SaleController::class, 'show']);
$router->get('/sales/{id}/ticket', [SaleController::class, 'ticket']);
$router->get('/sales/{id}/invoice', [SaleController::class, 'invoice']);
$router->get('/sales/{id}/return', [SaleController::class, 'returnForm']);
$router->post('/sales/{id}/return', [SaleController::class, 'returnStore']);
$router->get('/credit-notes', [SaleController::class, 'creditNotes']);
$router->get('/credit-notes/{id}', [SaleController::class, 'creditNote']);

// Facturación electrónica
$router->get('/edocs', [EdocController::class, 'index']);
$router->get('/edocs/{id}/xml', [EdocController::class, 'xml']);
$router->post('/edocs/{id}/retry', [EdocController::class, 'retry']);
$router->post('/edocs/retry-all', [EdocController::class, 'retryAll'], $admin);

// Caja
$router->get('/cash', [CashController::class, 'index']);
$router->post('/cash/open', [CashController::class, 'open']);
$router->post('/cash/movement', [CashController::class, 'movement']);
$router->post('/cash/close', [CashController::class, 'close']);
$router->get('/cash/{id}', [CashController::class, 'show']);
$router->get('/cash/{id}/print', [CashController::class, 'print']);

// Productos
$router->get('/products', [ProductController::class, 'index']);
$router->get('/products/create', [ProductController::class, 'create'], $admin);
$router->post('/products', [ProductController::class, 'store'], $admin);
$router->get('/products/{id}/edit', [ProductController::class, 'edit'], $admin);
$router->post('/products/{id}', [ProductController::class, 'update'], $admin);
$router->post('/products/{id}/toggle', [ProductController::class, 'toggle'], $admin);
$router->get('/products/import', [ProductController::class, 'importForm'], $admin);
$router->post('/products/import', [ProductController::class, 'import'], $admin);
$router->get('/products/export', [ProductController::class, 'export'], $admin);
$router->get('/products/labels', [ProductController::class, 'labels'], $admin);

$router->get('/brands', [BrandController::class, 'index'], $admin);
$router->post('/brands', [BrandController::class, 'store'], $admin);
$router->post('/brands/{id}', [BrandController::class, 'update'], $admin);
$router->post('/brands/{id}/delete', [BrandController::class, 'delete'], $admin);
$router->get('/categories', [CategoryController::class, 'index'], $admin);
$router->post('/categories', [CategoryController::class, 'store'], $admin);
$router->post('/categories/{id}', [CategoryController::class, 'update'], $admin);
$router->post('/categories/{id}/delete', [CategoryController::class, 'delete'], $admin);

// Inventario
$router->get('/inventory', [InventoryController::class, 'index']);
$router->get('/inventory/kardex', [InventoryController::class, 'kardex']);
$router->get('/inventory/adjust', [InventoryController::class, 'adjustForm'], $admin);
$router->post('/inventory/adjust', [InventoryController::class, 'adjust'], $admin);

// Compras y proveedores
$router->get('/purchases', [PurchaseController::class, 'index'], $admin);
$router->get('/purchases/create', [PurchaseController::class, 'create'], $admin);
$router->post('/purchases', [PurchaseController::class, 'store'], $admin);
$router->get('/purchases/{id}', [PurchaseController::class, 'show'], $admin);
$router->get('/suppliers', [SupplierController::class, 'index'], $admin);
$router->get('/suppliers/create', [SupplierController::class, 'create'], $admin);
$router->post('/suppliers', [SupplierController::class, 'store'], $admin);
$router->get('/suppliers/{id}/edit', [SupplierController::class, 'edit'], $admin);
$router->post('/suppliers/{id}', [SupplierController::class, 'update'], $admin);

// Clientes
$router->get('/customers', [CustomerController::class, 'index']);
$router->get('/customers/create', [CustomerController::class, 'create']);
$router->post('/customers', [CustomerController::class, 'store']);
$router->get('/customers/{id}', [CustomerController::class, 'show']);
$router->get('/customers/{id}/edit', [CustomerController::class, 'edit']);
$router->post('/customers/{id}', [CustomerController::class, 'update']);

// Reportes
$router->get('/reports', [ReportController::class, 'index'], $admin);
$router->get('/reports/export', [ReportController::class, 'export'], $admin);

// Administración
$router->get('/users', [UserController::class, 'index'], $admin);
$router->get('/users/create', [UserController::class, 'create'], $admin);
$router->post('/users', [UserController::class, 'store'], $admin);
$router->get('/users/{id}/edit', [UserController::class, 'edit'], $admin);
$router->post('/users/{id}', [UserController::class, 'update'], $admin);
$router->get('/settings', [SettingsController::class, 'index'], $admin);
$router->post('/settings', [SettingsController::class, 'update'], $admin);
$router->post('/settings/ranges', [SettingsController::class, 'storeRange'], $admin);
$router->post('/settings/ranges/{id}', [SettingsController::class, 'updateRange'], $admin);

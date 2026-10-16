<?php
declare(strict_types=1);

/**
 * Rutas de la aplicación. Toda ruta de escritura pasa por CSRF (Router) y
 * por el middleware de permisos; los servicios vuelven a validar el alcance
 * por sucursal de cada registro.
 *
 * @var App\Core\Router $router
 */

use App\Controllers\ApprovalController;
use App\Controllers\AuditController;
use App\Controllers\AuthController;
use App\Controllers\BranchController;
use App\Controllers\CashController;
use App\Controllers\CatalogController;
use App\Controllers\CustomerController;
use App\Controllers\DashboardController;
use App\Controllers\InstallController;
use App\Controllers\InventoryController;
use App\Controllers\PosController;
use App\Controllers\ProductController;
use App\Controllers\ProfileController;
use App\Controllers\PurchaseController;
use App\Controllers\ReportController;
use App\Controllers\ReturnController;
use App\Controllers\SaleController;
use App\Controllers\SearchController;
use App\Controllers\SettingsController;
use App\Controllers\SupplierController;
use App\Controllers\TransferController;
use App\Controllers\UserController;

// Instalador web de un solo uso (solo con INSTALL_TOKEN y sin superadministrador).
$router->get('/install', [InstallController::class, 'show']);
$router->post('/install', [InstallController::class, 'install']);

$router->get('/login', [AuthController::class, 'showLogin'], ['guest']);
$router->post('/login', [AuthController::class, 'login'], ['guest']);
$router->post('/logout', [AuthController::class, 'logout']);

$router->group(['auth'], function ($r) {
    $r->get('/', [DashboardController::class, 'index']);
    $r->get('/api/dashboard', [DashboardController::class, 'data'], ['perm:dashboard.view']);
    $r->get('/api/search', [SearchController::class, 'search']);
    $r->get('/api/notifications', [SearchController::class, 'notifications']);
    $r->post('/branch/switch', [DashboardController::class, 'switchBranch']);

    $r->get('/profile', [ProfileController::class, 'show']);
    $r->post('/profile/password', [ProfileController::class, 'password']);

    // Sucursales
    $r->get('/branches', [BranchController::class, 'index'], ['perm:branches.manage']);
    $r->post('/branches', [BranchController::class, 'store'], ['perm:branches.manage']);
    $r->post('/branches/{id}', [BranchController::class, 'update'], ['perm:branches.manage']);
    $r->post('/branches/{id}/toggle', [BranchController::class, 'toggle'], ['perm:branches.manage']);
    $r->post('/branches/{id}/registers', [BranchController::class, 'addRegister'], ['perm:branches.manage']);

    // Usuarios
    $r->get('/users', [UserController::class, 'index'], ['perm:users.manage|users.manage_branch']);
    $r->get('/users/create', [UserController::class, 'create'], ['perm:users.manage|users.manage_branch']);
    $r->post('/users', [UserController::class, 'store'], ['perm:users.manage|users.manage_branch']);
    $r->get('/users/{id}/edit', [UserController::class, 'edit'], ['perm:users.manage|users.manage_branch']);
    $r->post('/users/{id}', [UserController::class, 'update'], ['perm:users.manage|users.manage_branch']);
    $r->post('/users/{id}/toggle', [UserController::class, 'toggle'], ['perm:users.manage|users.manage_branch']);

    // Catálogo
    $r->get('/products', [ProductController::class, 'index'], ['perm:products.view']);
    $r->get('/products/create', [ProductController::class, 'create'], ['perm:products.manage']);
    $r->post('/products', [ProductController::class, 'store'], ['perm:products.manage']);
    $r->get('/products/{id}', [ProductController::class, 'show'], ['perm:products.view']);
    $r->get('/products/{id}/edit', [ProductController::class, 'edit'], ['perm:products.manage']);
    $r->post('/products/{id}', [ProductController::class, 'update'], ['perm:products.manage']);
    $r->post('/products/{id}/toggle', [ProductController::class, 'toggle'], ['perm:products.manage']);
    $r->post('/products/{id}/images', [ProductController::class, 'uploadImage'], ['perm:products.manage']);
    $r->post('/products/{id}/images/{image}/delete', [ProductController::class, 'deleteImage'], ['perm:products.manage']);
    $r->post('/products/{id}/images/{image}/primary', [ProductController::class, 'primaryImage'], ['perm:products.manage']);
    $r->get('/api/products/lookup', [ProductController::class, 'lookup'], ['perm:products.view|purchases.manage|transfers.request|inventory.view']);
    $r->get('/catalog', [CatalogController::class, 'index'], ['perm:products.manage']);
    $r->post('/catalog/categories', [CatalogController::class, 'saveCategory'], ['perm:products.manage']);
    $r->post('/catalog/brands', [CatalogController::class, 'saveBrand'], ['perm:products.manage']);

    // Inventario
    $r->get('/inventory', [InventoryController::class, 'index'], ['perm:inventory.view|inventory.distribute']);
    $r->get('/inventory/movements', [InventoryController::class, 'movements'], ['perm:inventory.view|inventory.distribute']);
    $r->get('/inventory/distribute', [InventoryController::class, 'distribute'], ['perm:inventory.distribute']);
    $r->post('/inventory/distribute', [InventoryController::class, 'storeDistribution'], ['perm:inventory.distribute']);
    $r->get('/inventory/entry', [InventoryController::class, 'entry'], ['perm:inventory.entry']);
    $r->post('/inventory/entry', [InventoryController::class, 'storeEntry'], ['perm:inventory.entry']);
    $r->post('/inventory/adjust', [InventoryController::class, 'adjust'], ['perm:inventory.adjust']);
    $r->get('/inventory/count', [InventoryController::class, 'count'], ['perm:inventory.adjust']);
    $r->post('/inventory/count', [InventoryController::class, 'storeCount'], ['perm:inventory.adjust']);
    $r->post('/inventory/min-stock', [InventoryController::class, 'minStock'], ['perm:inventory.adjust|inventory.distribute']);

    // Transferencias
    $r->get('/transfers', [TransferController::class, 'index'], ['perm:transfers.request|transfers.approve|transfers.receive']);
    $r->get('/transfers/create', [TransferController::class, 'create'], ['perm:transfers.request']);
    $r->post('/transfers', [TransferController::class, 'store'], ['perm:transfers.request']);
    $r->get('/transfers/{id}', [TransferController::class, 'show'], ['perm:transfers.request|transfers.approve|transfers.receive']);
    $r->post('/transfers/{id}/approve', [TransferController::class, 'approve'], ['perm:transfers.approve']);
    $r->post('/transfers/{id}/reject', [TransferController::class, 'reject'], ['perm:transfers.approve']);
    $r->post('/transfers/{id}/dispatch', [TransferController::class, 'dispatchTransfer'], ['perm:transfers.dispatch']);
    $r->post('/transfers/{id}/receive', [TransferController::class, 'receive'], ['perm:transfers.receive']);
    $r->post('/transfers/{id}/resolve', [TransferController::class, 'resolve'], ['perm:transfers.resolve']);
    $r->post('/transfers/{id}/cancel', [TransferController::class, 'cancel'], ['perm:transfers.request|transfers.approve']);

    // Punto de venta
    $r->get('/pos', [PosController::class, 'index'], ['perm:pos.sell']);
    $r->get('/api/pos/catalog', [PosController::class, 'catalog'], ['perm:pos.sell']);
    $r->post('/api/pos/quote', [PosController::class, 'quote'], ['perm:pos.sell']);
    $r->post('/api/pos/sale', [PosController::class, 'sale'], ['perm:pos.sell']);
    $r->post('/api/pos/approval', [PosController::class, 'requestApproval'], ['perm:pos.sell']);
    $r->get('/api/pos/approval/{id}', [PosController::class, 'approvalStatus'], ['perm:pos.sell']);
    $r->post('/api/pos/approval/{id}/authorize', [PosController::class, 'authorizeInPlace'], ['perm:pos.sell']);
    $r->get('/api/customers/search', [CustomerController::class, 'search'], ['perm:customers.view']);
    $r->post('/api/customers', [CustomerController::class, 'quickStore'], ['perm:customers.manage']);

    // Autorizaciones de descuento
    $r->get('/approvals', [ApprovalController::class, 'index'], ['perm:discounts.approve']);
    $r->post('/approvals/{id}/approve', [ApprovalController::class, 'approve'], ['perm:discounts.approve']);
    $r->post('/approvals/{id}/reject', [ApprovalController::class, 'reject'], ['perm:discounts.approve']);

    // Ventas
    $r->get('/sales', [SaleController::class, 'index'], ['perm:sales.view_own|sales.view_branch']);
    $r->get('/sales/{id}', [SaleController::class, 'show'], ['perm:sales.view_own|sales.view_branch']);
    $r->get('/api/sales/{id}', [SaleController::class, 'detail'], ['perm:sales.view_own|sales.view_branch']);
    $r->get('/sales/{id}/receipt', [SaleController::class, 'receipt'], ['perm:sales.view_own|sales.view_branch']);
    $r->post('/sales/{id}/reprint', [SaleController::class, 'reprint'], ['perm:sales.reprint']);
    $r->post('/sales/{id}/void', [SaleController::class, 'void'], ['perm:sales.void']);

    // Devoluciones
    $r->get('/returns', [ReturnController::class, 'index'], ['perm:returns.create|returns.approve']);
    $r->get('/returns/create', [ReturnController::class, 'create'], ['perm:returns.create']);
    $r->post('/returns', [ReturnController::class, 'store'], ['perm:returns.create']);
    $r->get('/returns/{id}', [ReturnController::class, 'show'], ['perm:returns.create|returns.approve']);
    $r->post('/returns/{id}/approve', [ReturnController::class, 'approve'], ['perm:returns.approve']);
    $r->post('/returns/{id}/reject', [ReturnController::class, 'reject'], ['perm:returns.approve']);

    // Caja
    $r->get('/cash', [CashController::class, 'index'], ['perm:cash.operate|cash.view_branch']);
    $r->post('/cash/open', [CashController::class, 'open'], ['perm:cash.operate']);
    $r->post('/cash/movement', [CashController::class, 'movement'], ['perm:cash.movements']);
    $r->post('/cash/close', [CashController::class, 'close'], ['perm:cash.operate']);
    $r->get('/cash/sessions', [CashController::class, 'sessions'], ['perm:cash.operate|cash.view_branch']);
    $r->get('/cash/sessions/{id}', [CashController::class, 'session'], ['perm:cash.operate|cash.view_branch']);
    $r->post('/cash/sessions/{id}/approve', [CashController::class, 'approve'], ['perm:cash.approve']);

    // Compras y proveedores
    $r->get('/suppliers', [SupplierController::class, 'index'], ['perm:suppliers.manage']);
    $r->post('/suppliers', [SupplierController::class, 'store'], ['perm:suppliers.manage']);
    $r->post('/suppliers/{id}', [SupplierController::class, 'update'], ['perm:suppliers.manage']);
    $r->post('/suppliers/{id}/toggle', [SupplierController::class, 'toggle'], ['perm:suppliers.manage']);
    $r->get('/purchases', [PurchaseController::class, 'index'], ['perm:purchases.manage']);
    $r->get('/purchases/create', [PurchaseController::class, 'create'], ['perm:purchases.manage']);
    $r->post('/purchases', [PurchaseController::class, 'store'], ['perm:purchases.manage']);
    $r->get('/purchases/{id}', [PurchaseController::class, 'show'], ['perm:purchases.manage']);
    $r->post('/purchases/{id}/order', [PurchaseController::class, 'order'], ['perm:purchases.manage']);
    $r->post('/purchases/{id}/cancel', [PurchaseController::class, 'cancel'], ['perm:purchases.manage']);
    $r->post('/purchases/{id}/receive', [PurchaseController::class, 'receive'], ['perm:purchases.manage']);
    $r->post('/purchases/{id}/return', [PurchaseController::class, 'supplierReturn'], ['perm:purchases.manage']);

    // Clientes
    $r->get('/customers', [CustomerController::class, 'index'], ['perm:customers.view']);
    $r->get('/customers/{id}', [CustomerController::class, 'show'], ['perm:customers.view']);
    $r->post('/customers', [CustomerController::class, 'store'], ['perm:customers.manage']);
    $r->post('/customers/{id}', [CustomerController::class, 'update'], ['perm:customers.manage']);

    // Reportes, auditoría y configuración
    $r->get('/reports', [ReportController::class, 'index'], ['perm:reports.view']);
    $r->get('/reports/export', [ReportController::class, 'export'], ['perm:reports.export']);
    $r->get('/audit', [AuditController::class, 'index'], ['perm:audit.view']);
    $r->get('/settings', [SettingsController::class, 'index'], ['perm:settings.manage|discounts.configure']);
    $r->post('/settings', [SettingsController::class, 'save'], ['perm:settings.manage']);
    $r->post('/settings/discount-limit', [SettingsController::class, 'discountLimit'], ['perm:discounts.configure']);
    $r->post('/settings/payment-methods', [SettingsController::class, 'paymentMethods'], ['perm:settings.manage']);
});

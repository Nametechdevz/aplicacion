<?php
$u = user();
$title = $title ?? 'Inicio';
$openSession = $u ? App\Services\Cash::openSession((int) $u['id']) : null;
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
    <title><?= e($title) ?> · <?= e(setting('company_trade_name', 'POS Perfumería')) ?></title>
    <link href="<?= asset('vendor/bootstrap/bootstrap.min.css') ?>" rel="stylesheet">
    <link href="<?= asset('vendor/bootstrap-icons/bootstrap-icons.min.css') ?>" rel="stylesheet">
    <link href="<?= asset('css/app.css') ?>" rel="stylesheet">
</head>
<body class="<?= e($bodyClass ?? '') ?>">
<div class="app">
    <aside class="sidebar" id="sidebar">
        <a class="brand" href="<?= url('/') ?>">
            <i class="bi bi-droplet-half"></i>
            <span><?= e(setting('company_trade_name', 'POS Perfumería')) ?></span>
        </a>
        <nav class="nav flex-column">
            <a class="nav-link <?= active_nav('/') ?>" href="<?= url('/') ?>"><i class="bi bi-speedometer2"></i> Inicio</a>
            <a class="nav-link nav-pos <?= active_nav('/pos') ?>" href="<?= url('/pos') ?>"><i class="bi bi-upc-scan"></i> Punto de venta</a>
            <a class="nav-link <?= active_nav('/sales') ?>" href="<?= url('/sales') ?>"><i class="bi bi-receipt"></i> Ventas</a>
            <a class="nav-link <?= active_nav('/credit-notes') ?>" href="<?= url('/credit-notes') ?>"><i class="bi bi-arrow-counterclockwise"></i> Devoluciones</a>
            <a class="nav-link <?= active_nav('/cash') ?>" href="<?= url('/cash') ?>"><i class="bi bi-cash-coin"></i> Caja</a>
            <a class="nav-link <?= active_nav('/edocs') ?>" href="<?= url('/edocs') ?>"><i class="bi bi-cloud-check"></i> Facturación DIAN</a>
            <div class="nav-section">Catálogo</div>
            <a class="nav-link <?= active_nav('/products') ?>" href="<?= url('/products') ?>"><i class="bi bi-box-seam"></i> Productos</a>
            <a class="nav-link <?= active_nav('/inventory') ?>" href="<?= url('/inventory') ?>"><i class="bi bi-clipboard-data"></i> Inventario</a>
            <a class="nav-link <?= active_nav('/customers') ?>" href="<?= url('/customers') ?>"><i class="bi bi-people"></i> Clientes</a>
            <?php if (is_admin()): ?>
                <a class="nav-link <?= active_nav('/purchases') ?>" href="<?= url('/purchases') ?>"><i class="bi bi-truck"></i> Compras</a>
                <a class="nav-link <?= active_nav('/suppliers') ?>" href="<?= url('/suppliers') ?>"><i class="bi bi-building"></i> Proveedores</a>
                <a class="nav-link <?= active_nav('/brands') ?>" href="<?= url('/brands') ?>"><i class="bi bi-tags"></i> Marcas</a>
                <a class="nav-link <?= active_nav('/categories') ?>" href="<?= url('/categories') ?>"><i class="bi bi-diagram-3"></i> Categorías</a>
                <div class="nav-section">Administración</div>
                <a class="nav-link <?= active_nav('/reports') ?>" href="<?= url('/reports') ?>"><i class="bi bi-graph-up"></i> Reportes</a>
                <a class="nav-link <?= active_nav('/users') ?>" href="<?= url('/users') ?>"><i class="bi bi-person-gear"></i> Usuarios</a>
                <a class="nav-link <?= active_nav('/settings') ?>" href="<?= url('/settings') ?>"><i class="bi bi-gear"></i> Configuración</a>
            <?php endif; ?>
        </nav>
    </aside>
    <div class="sidebar-backdrop" onclick="document.body.classList.remove('sidebar-open')"></div>

    <div class="main">
        <header class="topbar">
            <button class="btn btn-link text-reset d-lg-none p-0 me-2" onclick="document.body.classList.toggle('sidebar-open')" aria-label="Menú"><i class="bi bi-list fs-3"></i></button>
            <h1 class="h5 mb-0 flex-grow-1 text-truncate"><?= e($title) ?></h1>
            <?php if (setting('dian_environment', '2') !== '1' || setting('dian_driver') === 'simulacion'): ?>
                <span class="badge rounded-pill text-bg-warning me-2 d-none d-md-inline" title="Configuración → Facturación electrónica">
                    <i class="bi bi-exclamation-triangle"></i> DIAN: <?= setting('dian_driver') === 'simulacion' ? 'simulación' : 'pruebas' ?>
                </span>
            <?php endif; ?>
            <a href="<?= url('/cash') ?>" class="badge rounded-pill me-2 text-decoration-none <?= $openSession ? 'text-bg-success' : 'text-bg-secondary' ?>">
                <i class="bi bi-cash-stack"></i> Caja <?= $openSession ? 'abierta' : 'cerrada' ?>
            </a>
            <div class="dropdown">
                <button class="btn btn-sm btn-light dropdown-toggle" data-bs-toggle="dropdown">
                    <i class="bi bi-person-circle"></i> <span class="d-none d-sm-inline"><?= e($u['name']) ?></span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><span class="dropdown-item-text small text-muted"><?= e($u['email']) ?> · <?= e(ucfirst($u['role'])) ?></span></li>
                    <li><a class="dropdown-item" href="<?= url('/profile') ?>"><i class="bi bi-key"></i> Mi perfil y contraseña</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li>
                        <form method="post" action="<?= url('/logout') ?>"><?= csrf_field() ?>
                            <button class="dropdown-item text-danger"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</button>
                        </form>
                    </li>
                </ul>
            </div>
        </header>

        <main class="content">
            <?php foreach (flashes() as $f): ?>
                <div class="alert alert-<?= e($f['type']) ?> alert-dismissible fade show" role="alert">
                    <?= e($f['message']) ?>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            <?php endforeach; ?>
            <?= $content ?>
        </main>
    </div>
</div>
<script src="<?= asset('vendor/bootstrap/bootstrap.bundle.min.js') ?>"></script>
<script>window.APP = { base: <?= json_encode(base_path()) ?>, csrf: <?= json_encode(csrf_token()) ?>, isAdmin: <?= is_admin() ? 'true' : 'false' ?> };</script>
<script src="<?= asset('js/app.js') ?>"></script>
<?= App\Core\View::section('scripts') ?>
</body>
</html>

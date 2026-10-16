<?php
/**
 * Layout principal autenticado.
 * Variables: $title, $content, $active (clave de menú), $crumbs ([[texto, url]]), $wide, $bodyClass, $scripts
 */
use App\Core\Auth;
use App\Core\Database;
use App\Core\Session;

$user = Auth::user();
$db = Database::connection();
$branchIds = Auth::branchIds();
$activeBranchId = Auth::activeBranchId();
$branches = [];
if ($branchIds) {
    [$in, $params] = Database::in($branchIds);
    $branches = $db->all("SELECT id, name, type, is_active FROM branches WHERE id IN ($in) ORDER BY type = 'warehouse', name", $params);
}
$activeBranch = null;
foreach ($branches as $b) {
    if ((int) $b['id'] === $activeBranchId) {
        $activeBranch = $b;
    }
}
$roleNames = $db->column('SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = :id', ['id' => Auth::id()]);
$pendingApprovals = 0;
if (can('discounts.approve') && $branchIds) {
    [$in, $params] = Database::in($branchIds);
    $pendingApprovals = (int) $db->value("SELECT COUNT(*) FROM discount_approvals WHERE status = 'pending' AND expires_at > UTC_TIMESTAMP() AND branch_id IN ($in)", $params);
}

$nav = [
    'General' => [
        ['dashboard', 'Panel', '/', 'grid', can('dashboard.view')],
        ['pos', 'Punto de venta', '/pos', 'scan', can('pos.sell')],
        ['cash', 'Caja', '/cash', 'wallet', can('cash.operate') || can('cash.view_branch')],
    ],
    'Comercial' => [
        ['sales', 'Ventas', '/sales', 'receipt', can('sales.view_own') || can('sales.view_branch')],
        ['approvals', 'Autorizaciones', '/approvals', 'percent', can('discounts.approve'), $pendingApprovals],
        ['returns', 'Devoluciones', '/returns', 'undo', can('returns.create') || can('returns.approve')],
        ['customers', 'Clientes', '/customers', 'users', can('customers.view')],
    ],
    'Catálogo e inventario' => [
        ['products', 'Productos', '/products', 'bottle', can('products.view')],
        ['inventory', 'Inventario', '/inventory', 'boxes', can('inventory.view') || can('inventory.distribute')],
        ['transfers', 'Transferencias', '/transfers', 'transfer', can('transfers.request') || can('transfers.approve') || can('transfers.receive')],
        ['purchases', 'Compras', '/purchases', 'truck', can('purchases.manage')],
        ['suppliers', 'Proveedores', '/suppliers', 'building', can('suppliers.manage')],
    ],
    'Administración' => [
        ['reports', 'Reportes', '/reports', 'chart', can('reports.view')],
        ['branches', 'Sucursales', '/branches', 'store', can('branches.manage')],
        ['users', 'Usuarios y roles', '/users', 'user', can('users.manage') || can('users.manage_branch')],
        ['audit', 'Auditoría', '/audit', 'shield', can('audit.view')],
        ['settings', 'Configuración', '/settings', 'settings', can('settings.manage') || can('discounts.configure')],
    ],
];
$active = $active ?? '';
$crumbs = $crumbs ?? [];
$flashes = Session::flashes();
?><!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <meta name="base-url" content="<?= e(rtrim(url('/'), '/')) ?>">
  <meta name="theme-color" content="#151515">
  <title><?= e(($title ?? 'Panel') . ' · JS Perfumerías') ?></title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700;800&display=swap">
  <script src="<?= e(asset('js/theme-init.js')) ?>"></script>
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="<?= e($bodyClass ?? '') ?>">
<?= \App\Core\View::partial('partials/icons') ?>
<a class="sr-only" href="#main">Saltar al contenido</a>
<div class="app<?= !empty($collapseSidebar) ? ' is-collapsed' : '' ?>" id="app">
  <aside class="sidebar" aria-label="Navegación principal">
    <a class="brand" href="<?= e(url('/')) ?>" aria-label="JS Perfumerías — inicio">
      <span class="brand-mark">JS</span>
      <span class="brand-text">
        <span class="brand-name">JS Perfumerías</span>
        <span class="brand-sub">Point of Sale</span>
      </span>
    </a>
    <nav class="nav">
      <?php foreach ($nav as $group => $items):
          $visible = array_filter($items, static fn ($i) => $i[4]);
          if (!$visible) { continue; } ?>
        <div class="nav-group">
          <div class="nav-label"><?= e($group) ?></div>
          <?php foreach ($visible as $item): ?>
            <a href="<?= e(url($item[2])) ?>" class="<?= $active === $item[0] ? 'is-active' : '' ?>" title="<?= e($item[1]) ?>" <?= $active === $item[0] ? 'aria-current="page"' : '' ?>>
              <?= icon($item[3]) ?><span><?= e($item[1]) ?></span>
              <?php if (!empty($item[5])): ?><b class="count"><?= (int) $item[5] ?></b><?php endif; ?>
            </a>
          <?php endforeach; ?>
        </div>
      <?php endforeach; ?>
    </nav>
    <?php if ($branches): ?>
    <div class="sidebar-foot dropdown" data-dropdown>
      <button type="button" class="branch-switch" data-dropdown-toggle aria-haspopup="true" aria-expanded="false" title="Sucursal activa">
        <?= icon($activeBranch && $activeBranch['type'] === 'warehouse' ? 'boxes' : 'store') ?>
        <span class="meta"><small>Sucursal activa</small><strong><?= e($activeBranch['name'] ?? 'Sin sucursal') ?></strong></span>
        <?= icon('chevron-down', 'icon-sm') ?>
      </button>
      <div class="menu menu-left menu-up" role="menu" style="width: 228px">
        <form method="post" action="<?= e(url('/branch/switch')) ?>">
          <?= csrf_field() ?>
          <?php foreach ($branches as $b): ?>
            <button type="submit" name="branch_id" value="<?= (int) $b['id'] ?>" role="menuitem" <?= (int) $b['id'] === $activeBranchId ? 'aria-current="true"' : '' ?>>
              <?= icon($b['type'] === 'warehouse' ? 'boxes' : 'store', 'icon-sm') ?>
              <span class="truncate" style="flex:1"><?= e($b['name']) ?></span>
              <?php if ((int) $b['id'] === $activeBranchId): ?><?= icon('check', 'icon-sm text-gold') ?><?php endif; ?>
            </button>
          <?php endforeach; ?>
        </form>
      </div>
    </div>
    <?php endif; ?>
  </aside>
  <div class="scrim" data-sidebar-close></div>

  <div class="main">
    <header class="topbar">
      <button class="icon-btn" type="button" data-sidebar-toggle aria-label="Mostrar u ocultar menú"><?= icon('sidebar') ?></button>
      <nav class="crumbs" aria-label="Ruta de navegación">
        <a href="<?= e(url('/')) ?>" class="crumb-parent">Inicio</a>
        <?php foreach ($crumbs as $i => [$label, $href]): ?>
          <span class="sep">/</span>
          <?php if ($href && $i < count($crumbs) - 1): ?>
            <a href="<?= e(url($href)) ?>" class="crumb-parent"><?= e($label) ?></a>
          <?php else: ?>
            <span class="current"><?= e($label) ?></span>
          <?php endif; ?>
        <?php endforeach; ?>
      </nav>
      <div class="spacer"></div>
      <div class="global-search" data-global-search>
        <?= icon('search') ?>
        <input class="input" type="search" placeholder="Buscar productos, ventas, clientes…" aria-label="Búsqueda global" autocomplete="off">
        <span class="kbd">Ctrl K</span>
        <div class="search-results hidden" role="listbox"></div>
      </div>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Cambiar entre modo claro y oscuro">
        <span class="theme-icon-dark"><?= icon('moon') ?></span><span class="theme-icon-light hidden"><?= icon('sun') ?></span>
      </button>
      <div class="dropdown" data-dropdown data-notifications>
        <button class="icon-btn" type="button" data-dropdown-toggle aria-label="Notificaciones" aria-haspopup="true" aria-expanded="false">
          <?= icon('bell') ?><span class="dot hidden"></span>
        </button>
        <div class="menu notif-menu" role="menu">
          <div class="n-head"><strong>Notificaciones</strong><span class="muted" style="font-size:12px" data-notif-count></span></div>
          <div class="n-list" data-notif-list>
            <div style="padding:16px"><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:70%"></div></div>
          </div>
        </div>
      </div>
      <div class="dropdown" data-dropdown>
        <button class="user-chip" type="button" data-dropdown-toggle aria-haspopup="true" aria-expanded="false">
          <span class="avatar"><?= e(initials($user['name'])) ?></span>
          <span class="meta"><strong><?= e($user['name']) ?></strong><small><?= e(implode(', ', $roleNames)) ?></small></span>
        </button>
        <div class="menu" role="menu">
          <div class="menu-head"><strong><?= e($user['name']) ?></strong><small>@<?= e($user['username']) ?></small></div>
          <div class="sep"></div>
          <a href="<?= e(url('/profile')) ?>" role="menuitem"><?= icon('key', 'icon-sm') ?> Mi cuenta y contraseña</a>
          <?php if (can('pos.sell')): ?><a href="<?= e(url('/pos')) ?>" role="menuitem"><?= icon('scan', 'icon-sm') ?> Abrir punto de venta</a><?php endif; ?>
          <div class="sep"></div>
          <form method="post" action="<?= e(url('/logout')) ?>">
            <?= csrf_field() ?>
            <button type="submit" class="is-danger" role="menuitem"><?= icon('logout', 'icon-sm') ?> Cerrar sesión</button>
          </form>
        </div>
      </div>
    </header>

    <main id="main" class="<?= ($wide ?? false) ? 'content is-wide' : 'content' ?>" <?= ($flush ?? false) ? 'style="padding:0;max-width:none"' : '' ?>>
      <?= $content ?>
    </main>
  </div>
</div>
<div class="toasts" aria-live="polite" aria-atomic="false"></div>
<?= \App\Core\View::partial('partials/confirm') ?>
<script type="application/json" id="flash-data"><?= json_encode($flashes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>
<script src="<?= e(asset('js/app.js')) ?>"></script>
<script src="<?= e(asset('js/charts.js')) ?>"></script>
<?php foreach (($scripts ?? []) as $s): ?>
<script src="<?= e(asset('js/' . $s)) ?>"></script>
<?php endforeach; ?>
</body>
</html>

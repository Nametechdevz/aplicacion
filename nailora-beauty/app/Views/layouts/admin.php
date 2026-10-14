<?php
use App\Core\View;

$user = auth_user();
$nav = [
    ['Principal', [
        ['admin', 'Dashboard', 'dashboard', true],
        ['admin/pedidos', 'Pedidos', 'clipboard', false, $pendingOrders ?? 0],
        ['admin/clientes', 'Clientes', 'users', false],
    ]],
    ['Catálogo', [
        ['admin/productos', 'Productos', 'package', false],
        ['admin/categorias', 'Categorías', 'folder', false],
        ['admin/marcas', 'Marcas', 'award', false],
        ['admin/inventario', 'Inventario', 'archive', false],
        ['admin/promociones', 'Promociones', 'percent', false],
    ]],
    ['Análisis', [
        ['admin/informes', 'Informes', 'chart', false],
        ['admin/auditoria', 'Auditoría', 'history', false],
    ]],
    ['Tienda', [
        ['admin/configuracion', 'Configuración', 'settings', false],
        ['admin/paginas', 'Páginas', 'file', false],
        ['admin/usuarios', 'Usuarios', 'user', false],
    ]],
];
?>
<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>">
  <title><?= e($pageTitle ?? 'Administración') ?></title>
  <link rel="icon" href="<?= e(asset('assets/images/favicon.svg')) ?>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap">
  <link rel="stylesheet" href="<?= e(asset('assets/css/main.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('assets/css/admin.css')) ?>">
</head>
<body class="admin" data-admin>
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <aside class="admin-sidebar" id="admin-sidebar" data-sidebar aria-label="Menú de administración">
    <div class="admin-sidebar__head">
      <a href="<?= e(url('admin')) ?>" class="admin-logo"><?= View::partial('components/logo', ['size' => 32]) ?></a>
      <button type="button" class="icon-btn admin-sidebar__close" data-sidebar-close aria-label="Cerrar menú"><?= icon('x', '', 20) ?></button>
    </div>
    <nav class="admin-nav">
      <?php foreach ($nav as [$group, $items]): ?>
        <p class="admin-nav__group"><?= e($group) ?></p>
        <ul>
          <?php foreach ($items as $item): $active = is_active_path('/' . $item[0], $item[3]); ?>
            <li>
              <a href="<?= e(url($item[0])) ?>" class="admin-nav__link<?= $active ? ' is-active' : '' ?>"<?= $active ? ' aria-current="page"' : '' ?> title="<?= e($item[1]) ?>">
                <?= icon($item[2], '', 19) ?><span class="admin-nav__label"><?= e($item[1]) ?></span>
                <?php if (!empty($item[4])): ?><span class="admin-nav__badge" title="Pedidos pendientes"><?= (int) $item[4] ?></span><?php endif; ?>
              </a>
            </li>
          <?php endforeach; ?>
        </ul>
      <?php endforeach; ?>
    </nav>
    <a href="<?= e(url('/')) ?>" class="admin-nav__link admin-nav__store" target="_blank" rel="noopener"><?= icon('external', '', 18) ?><span class="admin-nav__label">Ver tienda</span></a>
  </aside>
  <div class="admin-backdrop" data-sidebar-close hidden></div>

  <div class="admin-main">
    <header class="admin-topbar">
      <button type="button" class="icon-btn" data-sidebar-toggle aria-controls="admin-sidebar" aria-expanded="false" aria-label="Mostrar u ocultar menú"><?= icon('sidebar', '', 20) ?></button>
      <?php if (!empty($breadcrumbs)): ?>
        <nav class="admin-breadcrumbs" aria-label="Ruta de navegación">
          <ol>
            <li><a href="<?= e(url('admin')) ?>">Inicio</a></li>
            <?php foreach ($breadcrumbs as $label => $href): ?>
              <li><?php if ($href): ?><a href="<?= e(url($href)) ?>"><?= e($label) ?></a><?php else: ?><span aria-current="page"><?= e($label) ?></span><?php endif; ?></li>
            <?php endforeach; ?>
          </ol>
        </nav>
      <?php endif; ?>
      <div class="admin-topbar__user">
        <a href="<?= e(url('admin/perfil')) ?>" class="admin-user" title="Mi perfil">
          <span class="admin-user__avatar" aria-hidden="true"><?= e(mb_strtoupper(mb_substr($user['name'] ?? 'A', 0, 1))) ?></span>
          <span class="admin-user__name"><?= e($user['name'] ?? '') ?></span>
        </a>
        <form method="post" action="<?= e(url('admin/logout')) ?>">
          <?= csrf_field() ?>
          <button type="submit" class="icon-btn" title="Cerrar sesión" aria-label="Cerrar sesión"><?= icon('logout', '', 19) ?></button>
        </form>
      </div>
    </header>

    <main id="contenido" class="admin-content" tabindex="-1">
      <?= View::partial('components/flash', ['flashMessages' => $flashMessages ?? []]) ?>
      <?= $content ?>
    </main>
  </div>
  <div class="toast-region" aria-live="polite" data-toast-region></div>
  <script src="<?= e(asset('assets/js/app.js')) ?>" defer></script>
  <script src="<?= e(asset('assets/js/admin.js')) ?>" defer></script>
</body>
</html>

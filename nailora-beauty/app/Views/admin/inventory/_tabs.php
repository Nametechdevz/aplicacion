<nav class="tabs" aria-label="Secciones de inventario">
  <a href="<?= e(url('admin/inventario')) ?>" class="tabs__link<?= is_active_path('/admin/inventario', true) ? ' is-active' : '' ?>">Existencias</a>
  <a href="<?= e(url('admin/inventario/movimientos')) ?>" class="tabs__link<?= is_active_path('/admin/inventario/movimientos') ? ' is-active' : '' ?>">Historial de movimientos</a>
  <a href="<?= e(url('admin/inventario/ajustar')) ?>" class="tabs__link<?= is_active_path('/admin/inventario/ajustar') ? ' is-active' : '' ?>">Registrar movimiento</a>
</nav>

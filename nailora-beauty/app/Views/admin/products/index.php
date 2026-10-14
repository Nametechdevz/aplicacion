<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Productos', 'subtitle' => number_es($pager->total) . ' producto(s) encontrados', 'actions' => '<a href="' . e(url('admin/productos/nuevo')) . '" class="btn btn--primary">' . icon('plus', '', 18) . ' Nuevo producto</a>']) ?>

<form method="get" action="<?= e(url('admin/productos')) ?>" class="filter-bar">
  <div class="filter-bar__search">
    <label for="q" class="visually-hidden">Buscar por nombre o SKU</label>
    <input id="q" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Buscar por nombre o SKU…">
  </div>
  <label class="visually-hidden" for="f-cat">Categoría</label>
  <select id="f-cat" name="categoria">
    <option value="">Todas las categorías</option>
    <?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>"<?= selected($c['id'], $filters['category_id']) ?>><?= e($c['name']) ?></option><?php endforeach; ?>
  </select>
  <label class="visually-hidden" for="f-estado">Estado</label>
  <select id="f-estado" name="estado">
    <option value="">Activos e inactivos</option>
    <option value="activos"<?= selected('activos', $filters['status']) ?>>Solo activos</option>
    <option value="inactivos"<?= selected('inactivos', $filters['status']) ?>>Solo inactivos</option>
  </select>
  <label class="visually-hidden" for="f-stock">Disponibilidad</label>
  <select id="f-stock" name="stock">
    <option value="">Cualquier disponibilidad</option>
    <option value="disponibles"<?= selected('disponibles', $filters['stock']) ?>>Con existencias</option>
    <option value="bajo"<?= selected('bajo', $filters['stock']) ?>>Stock bajo</option>
    <option value="agotados"<?= selected('agotados', $filters['stock']) ?>>Agotados</option>
  </select>
  <button type="submit" class="btn btn--ghost"><?= icon('filter', '', 16) ?> Filtrar</button>
  <?php if ($query): ?><a href="<?= e(url('admin/productos')) ?>" class="btn btn--ghost">Limpiar</a><?php endif; ?>
</form>

<?php if ($products): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead>
        <tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col" class="num">Precio</th><th scope="col" class="num">Stock</th><th scope="col">Estado</th><th scope="col"><span class="visually-hidden">Acciones</span></th></tr>
      </thead>
      <tbody>
        <?php foreach ($products as $p): $stock = (int) $p['available_stock']; ?>
          <tr>
            <td data-label="Producto">
              <div class="cell-product">
                <img src="<?= e(image_url($p['image_path'])) ?>" alt="" width="44" height="44" loading="lazy">
                <div>
                  <a href="<?= e(url('admin/productos/' . $p['id'] . '/editar')) ?>" class="strong"><?= e($p['name']) ?></a>
                  <span class="muted small">SKU <?= e($p['sku']) ?><?= (int) $p['has_variants'] ? ' · ' . (int) $p['variant_count'] . ' variante(s)' : '' ?></span>
                </div>
              </div>
            </td>
            <td data-label="Categoría"><?= e($p['category_name']) ?></td>
            <td data-label="Precio" class="num"><?= money($p['price']) ?><?php if ($p['compare_at_price']): ?><br><s class="muted small"><?= money($p['compare_at_price']) ?></s><?php endif; ?></td>
            <td data-label="Stock" class="num">
              <?php if ($stock === 0): ?><span class="badge badge--error">Agotado</span>
              <?php elseif ($stock <= (int) $p['low_stock_threshold']): ?><span class="badge badge--warning"><?= $stock ?> bajo</span>
              <?php else: ?><?= $stock ?><?php endif; ?>
            </td>
            <td data-label="Estado">
              <?= (int) $p['is_active'] ? '<span class="badge badge--success">Activo</span>' : '<span class="badge badge--muted">Inactivo</span>' ?>
              <?= (int) $p['is_featured'] ? '<span class="badge badge--featured">Destacado</span>' : '' ?>
            </td>
            <td class="actions">
              <a href="<?= e(url('admin/productos/' . $p['id'] . '/editar')) ?>" class="btn btn--ghost btn--xs"><?= icon('edit', '', 14) ?> Editar</a>
              <a href="<?= e(url('admin/inventario/ajustar?producto=' . $p['id'])) ?>" class="btn btn--ghost btn--xs"><?= icon('archive', '', 14) ?> Stock</a>
              <form method="post" action="<?= e(url('admin/productos/' . $p['id'] . '/estado')) ?>">
                <?= csrf_field() ?>
                <button type="submit" class="btn btn--ghost btn--xs"><?= icon('power', '', 14) ?> <?= (int) $p['is_active'] ? 'Desactivar' : 'Activar' ?></button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/productos', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('package', '', 32) ?><h2>No hay productos con estos filtros</h2><p><?= $query ? 'Pruebe con otros criterios.' : 'Cree su primer producto para empezar a vender.' ?></p><a href="<?= e(url('admin/productos/nuevo')) ?>" class="btn btn--primary"><?= icon('plus', '', 16) ?> Nuevo producto</a></div>
<?php endif; ?>

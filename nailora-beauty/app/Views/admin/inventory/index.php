<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Inventario', 'subtitle' => 'El stock se descuenta al registrar un pedido y se devuelve si se cancela. Los demás cambios se registran como movimientos.', 'actions' => '<a href="' . e(url('admin/inventario/ajustar')) . '" class="btn btn--primary">' . icon('plus', '', 18) . ' Registrar movimiento</a>']) ?>
<?= View::partial('admin/inventory/_tabs') ?>

<div class="mini-stats mini-stats--bar">
  <a href="<?= e(url('admin/inventario')) ?>"><strong><?= $counts['active_total'] ?></strong><span>Productos activos</span></a>
  <a href="<?= e(url('admin/inventario?estado=bajo')) ?>"><strong class="text-warning"><?= $counts['low_stock'] ?></strong><span>Con stock bajo</span></a>
  <a href="<?= e(url('admin/inventario?estado=agotados')) ?>"><strong class="text-error"><?= $counts['out_of_stock'] ?></strong><span>Agotados</span></a>
</div>

<form method="get" action="<?= e(url('admin/inventario')) ?>" class="filter-bar">
  <div class="filter-bar__search"><label for="q" class="visually-hidden">Buscar</label><input id="q" type="search" name="q" value="<?= e($q) ?>" placeholder="Buscar por nombre, variante o SKU…"></div>
  <label for="estado" class="visually-hidden">Estado</label>
  <select id="estado" name="estado">
    <option value="">Todas las existencias</option>
    <option value="bajo"<?= selected('bajo', $state) ?>>Stock bajo</option>
    <option value="agotados"<?= selected('agotados', $state) ?>>Agotados</option>
  </select>
  <button class="btn btn--ghost" type="submit">Filtrar</button>
</form>

<?php if ($rows): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Producto</th><th>SKU</th><th class="num">Existencias</th><th class="num">Alerta</th><th>Estado</th><th><span class="visually-hidden">Acciones</span></th></tr></thead>
      <tbody>
      <?php foreach ($rows as $row): $s = (int) $row['stock']; ?>
        <tr>
          <td data-label="Producto"><a class="strong" href="<?= e(url('admin/productos/' . $row['product_id'] . '/editar')) ?>"><?= e($row['name']) ?></a><?php if ($row['variant_name']): ?><br><span class="muted small">Variante: <?= e($row['variant_name']) ?></span><?php endif; ?></td>
          <td data-label="SKU"><code><?= e($row['sku']) ?></code></td>
          <td data-label="Existencias" class="num"><strong><?= $s ?></strong> <?php if ($s === 0): ?><span class="badge badge--error">Agotado</span><?php elseif ($s <= (int) $row['low_stock_threshold']): ?><span class="badge badge--warning">Bajo</span><?php endif; ?></td>
          <td data-label="Alerta" class="num">≤ <?= (int) $row['low_stock_threshold'] ?></td>
          <td data-label="Estado"><?= (int) $row['is_active'] ? '<span class="badge badge--success">Activo</span>' : '<span class="badge badge--muted">Inactivo</span>' ?></td>
          <td class="actions">
            <a class="btn btn--ghost btn--xs" href="<?= e(url('admin/inventario/ajustar?producto=' . $row['product_id'] . ($row['variant_id'] ? '&variante=' . $row['variant_id'] : ''))) ?>"><?= icon('edit', '', 14) ?> Ajustar</a>
            <a class="btn btn--ghost btn--xs" href="<?= e(url('admin/inventario/movimientos?producto=' . $row['product_id'])) ?>"><?= icon('history', '', 14) ?> Historial</a>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/inventario', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('archive', '', 32) ?><p>No hay existencias que coincidan con el filtro.</p></div>
<?php endif; ?>

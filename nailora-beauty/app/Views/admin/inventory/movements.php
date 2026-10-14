<?php
use App\Core\View;
use App\Models\InventoryMovement;
?>
<?= View::partial('admin/_header', ['title' => 'Historial de inventario', 'subtitle' => 'Registro de solo lectura: los movimientos no se pueden editar ni borrar. Para corregir un error, registre un nuevo ajuste.']) ?>
<?= View::partial('admin/inventory/_tabs') ?>

<form method="get" action="<?= e(url('admin/inventario/movimientos')) ?>" class="filter-bar">
  <label for="producto" class="visually-hidden">Producto</label>
  <select id="producto" name="producto">
    <option value="">Todos los productos</option>
    <?php foreach ($products as $p): ?><option value="<?= (int) $p['id'] ?>"<?= selected($p['id'], $filters['product_id']) ?>><?= e($p['name']) ?> (<?= e($p['sku']) ?>)</option><?php endforeach; ?>
  </select>
  <label for="tipo" class="visually-hidden">Tipo</label>
  <select id="tipo" name="tipo">
    <option value="">Todos los tipos</option>
    <?php foreach (InventoryMovement::TYPES as $k => $label): ?><option value="<?= e($k) ?>"<?= selected($k, $filters['type']) ?>><?= e($label) ?></option><?php endforeach; ?>
  </select>
  <label class="filter-bar__date">Desde <input type="date" name="desde" value="<?= e($filters['from']) ?>"></label>
  <label class="filter-bar__date">Hasta <input type="date" name="hasta" value="<?= e($filters['to']) ?>"></label>
  <button class="btn btn--ghost" type="submit">Filtrar</button>
  <?php if ($query): ?><a class="btn btn--ghost" href="<?= e(url('admin/inventario/movimientos')) ?>">Limpiar</a><?php endif; ?>
</form>

<?php if ($rows): ?>
<div class="panel panel--flush">
  <div class="table-wrap">
    <table class="table table--responsive">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Antes</th><th class="num">Cambio</th><th class="num">Después</th><th>Motivo / referencia</th><th>Responsable</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $m): $chg = (int) $m['quantity_change']; ?>
        <tr>
          <td data-label="Fecha"><?= e(date_es($m['created_at'], true)) ?></td>
          <td data-label="Producto"><?= e($m['product_name']) ?><?php if ($m['variant_name']): ?> <span class="muted">· <?= e($m['variant_name']) ?></span><?php endif; ?><br><code class="small"><?= e($m['variant_sku'] ?? $m['product_sku']) ?></code></td>
          <td data-label="Tipo"><?= e(movement_type_label($m['movement_type'])) ?></td>
          <td data-label="Antes" class="num"><?= (int) $m['quantity_before'] ?></td>
          <td data-label="Cambio" class="num"><strong class="<?= $chg >= 0 ? 'text-success' : 'text-error' ?>"><?= $chg > 0 ? '+' : '' ?><?= $chg ?></strong></td>
          <td data-label="Después" class="num"><?= (int) $m['quantity_after'] ?></td>
          <td data-label="Motivo"><?= e($m['reason']) ?><?php if ($m['order_code']): ?><br><a class="small" href="<?= e(url('admin/pedidos/' . $m['order_id'])) ?>"><?= e($m['order_code']) ?></a><?php elseif ($m['reference']): ?><br><span class="muted small">Ref. <?= e($m['reference']) ?></span><?php endif; ?></td>
          <td data-label="Responsable"><?= e($m['user_name'] ?? ($m['order_id'] ? 'Tienda (pedido)' : 'Sistema')) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</div>
<?= View::partial('components/pagination', ['pager' => $pager, 'path' => 'admin/inventario/movimientos', 'query' => $query]) ?>
<?php else: ?>
  <div class="admin-empty"><?= icon('history', '', 32) ?><p>No hay movimientos con estos filtros.</p></div>
<?php endif; ?>

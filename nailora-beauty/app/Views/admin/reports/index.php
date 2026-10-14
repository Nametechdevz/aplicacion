<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Informes', 'subtitle' => 'Periodo: ' . $period['label'] . '. Las ventas consideran solo pedidos confirmados, en preparación, enviados o entregados.', 'actions' => View::partial('admin/_period-filter', ['period' => $period, 'action' => 'admin/informes'])]) ?>

<section class="stat-grid">
  <article class="stat"><p class="stat__label">Ventas confirmadas</p><p class="stat__value"><?= money($summary['sales_total']) ?></p><p class="stat__meta"><?= (int) $summary['sales_count'] ?> pedido(s)</p></article>
  <article class="stat"><p class="stat__label">Descuentos otorgados</p><p class="stat__value"><?= money($summary['sales_discount']) ?></p><p class="stat__meta">En ventas confirmadas</p></article>
  <article class="stat"><p class="stat__label">Pedidos cancelados</p><p class="stat__value"><?= (int) $summary['cancelled'] ?></p><p class="stat__meta">de <?= (int) $summary['orders_all'] ?> registrados en el periodo</p></article>
  <article class="stat"><p class="stat__label">Valor del inventario</p><p class="stat__value"><?= money($inventory['cost_value']) ?></p><p class="stat__meta">A costo · <?= money($inventory['retail_value']) ?> a precio de venta · <?= number_es($inventory['units']) ?> und.</p></article>
</section>

<section class="panel">
  <div class="panel__head"><h2 class="panel__title">Evolución de ventas confirmadas</h2>
    <a class="btn btn--ghost btn--sm" href="<?= e(url('admin/informes/exportar?desde=' . $period['from'] . '&hasta=' . $period['to'])) ?>"><?= icon('download', '', 16) ?> Exportar pedidos (CSV)</a>
  </div>
  <?= View::partial('admin/_chart', ['series' => $series]) ?>
</section>

<div class="admin-grid admin-grid--2">
  <section class="panel panel--flush">
    <div class="panel__head panel__head--padded"><h2 class="panel__title">Productos más vendidos</h2></div>
    <?php if ($topProducts): ?>
    <div class="table-wrap"><table class="table table--responsive">
      <thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Pedidos</th><th class="num">Ingresos</th></tr></thead>
      <tbody><?php foreach ($topProducts as $tp): ?><tr><td data-label="Producto"><?= e($tp['product_name']) ?><br><code class="small"><?= e($tp['sku']) ?></code></td><td data-label="Unidades" class="num"><?= (int) $tp['units'] ?></td><td data-label="Pedidos" class="num"><?= (int) $tp['orders_count'] ?></td><td data-label="Ingresos" class="num"><?= money($tp['revenue']) ?></td></tr><?php endforeach; ?></tbody>
    </table></div>
    <?php else: ?><div class="admin-empty admin-empty--sm"><p>Sin ventas confirmadas en el periodo.</p></div><?php endif; ?>
  </section>
  <section class="panel panel--flush">
    <div class="panel__head panel__head--padded"><h2 class="panel__title">Ventas por categoría</h2></div>
    <?php if ($byCategory): ?>
    <div class="table-wrap"><table class="table table--responsive">
      <thead><tr><th>Categoría</th><th class="num">Unidades</th><th class="num">Ingresos</th></tr></thead>
      <tbody><?php foreach ($byCategory as $c): ?><tr><td data-label="Categoría"><?= e($c['category']) ?></td><td data-label="Unidades" class="num"><?= (int) $c['units'] ?></td><td data-label="Ingresos" class="num"><?= money($c['revenue']) ?></td></tr><?php endforeach; ?></tbody>
    </table></div>
    <?php else: ?><div class="admin-empty admin-empty--sm"><p>Sin ventas confirmadas en el periodo.</p></div><?php endif; ?>
  </section>
</div>

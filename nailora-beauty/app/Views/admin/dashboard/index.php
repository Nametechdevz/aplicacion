<?php use App\Core\View; ?>
<?= View::partial('admin/_header', ['title' => 'Dashboard', 'subtitle' => 'Resumen del periodo: ' . $period['label'], 'actions' => View::partial('admin/_period-filter', ['period' => $period, 'action' => 'admin'])]) ?>

<section class="stat-grid" aria-label="Indicadores del periodo">
  <article class="stat">
    <p class="stat__label">Ventas confirmadas</p>
    <p class="stat__value"><?= money($summary['sales_total']) ?></p>
    <p class="stat__meta"><?= (int) $summary['sales_count'] ?> pedido(s) confirmados, en preparación, enviados o entregados</p>
  </article>
  <article class="stat">
    <p class="stat__label">Pedidos registrados</p>
    <p class="stat__value"><?= (int) $summary['orders_registered'] ?></p>
    <p class="stat__meta"><?= money($summary['registered_total']) ?> en total (sin cancelados; incluye pendientes)</p>
  </article>
  <article class="stat">
    <p class="stat__label">Ticket promedio</p>
    <p class="stat__value"><?= money($summary['avg_ticket']) ?></p>
    <p class="stat__meta">Sobre ventas confirmadas</p>
  </article>
  <article class="stat stat--accent">
    <p class="stat__label">Pendientes de confirmar</p>
    <p class="stat__value"><?= (int) $statusCounts['pending'] ?></p>
    <p class="stat__meta"><?= (int) $summary['new_today'] ?> pedido(s) nuevos hoy · <a href="<?= e(url('admin/pedidos?estado=pending')) ?>">Revisar</a></p>
  </article>
</section>

<div class="admin-grid admin-grid--dashboard">
  <section class="panel panel--span">
    <div class="panel__head">
      <h2 class="panel__title">Ventas confirmadas por <?= $series['monthly'] ? 'mes' : 'día' ?></h2>
      <p class="panel__note">No incluye pedidos pendientes ni cancelados.</p>
    </div>
    <?= View::partial('admin/_chart', ['series' => $series]) ?>
  </section>

  <section class="panel">
    <div class="panel__head"><h2 class="panel__title">Pedidos del periodo por estado</h2></div>
    <ul class="status-list">
      <?php foreach (App\Models\Order::STATUSES as $key => $label): ?>
        <li>
          <a href="<?= e(url('admin/pedidos?estado=' . $key . '&desde=' . $period['from'] . '&hasta=' . $period['to'])) ?>">
            <span class="status-pill status-pill--<?= e($key) ?>"><?= e($label) ?></span>
            <strong><?= (int) $summary[$key] ?></strong>
          </a>
        </li>
      <?php endforeach; ?>
    </ul>
  </section>

  <section class="panel">
    <div class="panel__head"><h2 class="panel__title">Inventario</h2><a href="<?= e(url('admin/inventario')) ?>" class="link-arrow">Ver <?= icon('arrow-right', '', 14) ?></a></div>
    <div class="mini-stats">
      <a href="<?= e(url('admin/productos?estado=activos')) ?>"><strong><?= $stock['active_total'] ?></strong><span>Productos activos</span></a>
      <a href="<?= e(url('admin/productos?stock=bajo')) ?>"><strong class="text-warning"><?= $stock['low_stock'] ?></strong><span>Stock bajo</span></a>
      <a href="<?= e(url('admin/productos?stock=agotados')) ?>"><strong class="text-error"><?= $stock['out_of_stock'] ?></strong><span>Agotados</span></a>
    </div>
    <?php if ($stockAlerts): ?>
      <ul class="alert-list">
        <?php foreach ($stockAlerts as $a): ?>
          <li>
            <a href="<?= e(url('admin/inventario/ajustar?producto=' . $a['product_id'] . ($a['variant_id'] ? '&variante=' . $a['variant_id'] : ''))) ?>"><?= e($a['name']) ?><?= $a['variant_name'] ? ' · ' . e($a['variant_name']) : '' ?></a>
            <span class="badge <?= (int) $a['stock'] === 0 ? 'badge--error' : 'badge--warning' ?>"><?= (int) $a['stock'] === 0 ? 'Agotado' : (int) $a['stock'] . ' und.' ?></span>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>

  <section class="panel panel--span">
    <div class="panel__head"><h2 class="panel__title">Últimos pedidos</h2><a href="<?= e(url('admin/pedidos')) ?>" class="link-arrow">Todos <?= icon('arrow-right', '', 14) ?></a></div>
    <?php if ($latestOrders): ?>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col" class="num">Total</th></tr></thead>
          <tbody>
            <?php foreach ($latestOrders as $o): ?>
              <tr>
                <td data-label="Pedido"><a href="<?= e(url('admin/pedidos/' . $o['id'])) ?>" class="strong"><?= e($o['code']) ?></a></td>
                <td data-label="Cliente"><?= e($o['customer_name']) ?><br><span class="muted small"><?= e($o['city']) ?></span></td>
                <td data-label="Fecha"><?= e(date_es($o['created_at'], true)) ?></td>
                <td data-label="Estado"><span class="status-pill status-pill--<?= e($o['status']) ?>"><?= e(order_status_label($o['status'])) ?></span></td>
                <td data-label="Total" class="num"><?= money($o['total']) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    <?php else: ?>
      <div class="admin-empty"><?= icon('clipboard', '', 28) ?><p>Todavía no hay pedidos. Cuando un cliente finalice una compra aparecerá aquí.</p></div>
    <?php endif; ?>
  </section>

  <section class="panel">
    <div class="panel__head"><h2 class="panel__title">Más vendidos del periodo</h2></div>
    <?php if ($topProducts): ?>
      <ol class="rank-list">
        <?php foreach ($topProducts as $tp): ?>
          <li><span><?= e($tp['product_name']) ?></span><strong><?= (int) $tp['units'] ?> und.</strong></li>
        <?php endforeach; ?>
      </ol>
    <?php else: ?>
      <div class="admin-empty admin-empty--sm"><p>Sin ventas confirmadas suficientes para calcularlo.</p></div>
    <?php endif; ?>
  </section>
</div>

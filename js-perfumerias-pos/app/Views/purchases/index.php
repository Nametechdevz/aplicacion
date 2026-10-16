<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Compras</div><h1>Órdenes de compra</h1><p>Una orden no modifica existencias: solo la recepción efectiva, total o parcial.</p></div>
  <div class="page-actions"><a class="btn" href="<?= e(url('/suppliers')) ?>"><?= icon('building') ?> Proveedores</a><a class="btn btn-primary" href="<?= e(url('/purchases/create')) ?>"><?= icon('plus') ?> Nueva orden</a></div>
</div>
<section class="panel">
  <nav class="tabs"><?php foreach (['' => 'Todas', 'pending' => 'Por recibir', 'draft' => 'Borradores', 'received' => 'Recibidas', 'cancelled' => 'Canceladas'] as $k => $l): ?><a href="<?= e(url('/purchases', ['status' => $k])) ?>" class="<?= $status === $k ? 'is-active' : '' ?>"><?= e($l) ?></a><?php endforeach; ?></nav>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin órdenes', 'text' => 'Cree una orden de compra para abastecer el almacén.', 'action' => ['Nueva orden', '/purchases/create', 'truck']]) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Orden</th><th>Proveedor</th><th>Destino</th><th>Recepción</th><th class="num">Total</th><th>Estado</th></tr></thead>
    <tbody><?php foreach ($rows as $po): $pct = (float) $po['qty_total'] > 0 ? min(100, (float) $po['qty_received'] / (float) $po['qty_total'] * 100) : 0; ?>
      <tr class="is-clickable" data-href="<?= e(url('/purchases/' . $po['id'])) ?>">
        <td class="cell-main"><strong><?= e($po['number']) ?></strong><div class="muted" style="font-size:12px"><?= e(date('d/m/Y', strtotime($po['order_date']))) ?><?= $po['expected_date'] ? ' · llega ' . e(date('d/m', strtotime($po['expected_date']))) : '' ?></div></td>
        <td data-label="Proveedor"><?= e($po['supplier']) ?></td>
        <td data-label="Destino"><?= e($po['branch']) ?></td>
        <td data-label="Recepción" class="nowrap"><span class="stock-meter"><span style="width:<?= (int) $pct ?>%"></span></span> <span class="muted" style="font-size:12px"><?= (int) $pct ?> %</span></td>
        <td class="num" data-label="Total"><strong><?= e(money($po['total'])) ?></strong></td>
        <td data-label="Estado"><?= status_badge($po['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

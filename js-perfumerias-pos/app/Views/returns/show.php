<?php $cond = ['resaleable' => 'Revendible', 'damaged' => 'Dañado', 'defective' => 'Defectuoso']; ?>
<div class="page-head">
  <div><div class="eyebrow">Devolución</div><h1><?= e($r['number']) ?></h1><p>Venta <a class="link" href="<?= e(url('/sales/' . $r['sale_id'])) ?>"><?= e($r['sale_number']) ?></a> · <?= e($r['branch']) ?> · <?= status_badge($r['status']) ?></p></div>
  <div class="page-actions">
    <?php if ($r['status'] === 'pending' && can('returns.approve')): ?>
      <form method="post" action="<?= e(url('/returns/' . $r['id'] . '/reject')) ?>" data-confirm="¿Rechazar la devolución?" data-confirm-reason="Motivo del rechazo" data-danger><?= csrf_field() ?><button class="btn" type="submit">Rechazar</button></form>
      <form method="post" action="<?= e(url('/returns/' . $r['id'] . '/approve')) ?>" data-confirm="¿Aprobar y aplicar la devolución?" data-confirm-text="Se registrará el reembolso y el reingreso de inventario."><?= csrf_field() ?><button class="btn btn-primary" type="submit"><?= icon('check') ?> Aprobar</button></form>
    <?php endif; ?>
  </div>
</div>
<div class="grid grid-12" style="align-items:start">
  <section class="panel span-4"><div class="panel-body">
    <dl class="dl">
      <dt>Registró</dt><dd><?= e($r['user_name']) ?></dd>
      <dt>Fecha</dt><dd><?= e(fmt_dt($r['created_at'])) ?></dd>
      <dt>Reembolso</dt><dd><?= e($r['method'] ?? '—') ?></dd>
      <dt>Aprobó</dt><dd><?= e($r['approver'] ?? '—') ?></dd>
      <dt class="total">Valor</dt><dd class="total"><?= e(money($r['total'])) ?></dd>
    </dl>
    <div class="label mt-3">Motivo</div><p class="mt-1"><?= e($r['reason']) ?></p>
    <?php if ($r['rejection_reason']): ?><div class="callout callout-danger mt-2"><?= e($r['rejection_reason']) ?></div><?php endif; ?>
  </div></section>
  <section class="panel span-8"><div class="panel-body" style="padding:12px 0 0">
    <table class="table table-stack"><thead><tr><th>Artículo</th><th class="num">Vendido</th><th class="num">Devuelto</th><th>Estado</th><th>Inventario</th><th class="num">Valor</th></tr></thead>
    <tbody><?php foreach ($items as $it): ?>
      <tr><td class="cell-main"><strong><?= e($it['product_name']) ?></strong><?= $it['variant_name'] ? ' · ' . e($it['variant_name']) : '' ?></td>
        <td class="num" data-label="Vendido"><?= e(qty($it['sold'], $it['unit_code'])) ?></td><td class="num" data-label="Devuelto"><?= e(qty($it['quantity'], $it['unit_code'])) ?></td>
        <td data-label="Estado"><?= e($cond[$it['item_condition']] ?? '') ?></td>
        <td data-label="Inventario"><?= (int) $it['restock'] ? '<span class="badge badge-success">Reingresa</span>' : '<span class="badge badge-neutral">No reingresa</span>' ?></td>
        <td class="num" data-label="Valor"><strong><?= e(money($it['amount'])) ?></strong></td></tr>
    <?php endforeach; ?></tbody></table>
  </div></section>
</div>

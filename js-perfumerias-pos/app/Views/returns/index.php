<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Comercial</div><h1>Devoluciones y cambios</h1><p>Siempre vinculadas a la venta original, con movimientos compensatorios de inventario y caja.</p></div>
  <div class="page-actions"><?php if (can('returns.create')): ?><a class="btn btn-primary" href="<?= e(url('/returns/create')) ?>"><?= icon('undo') ?> Registrar devolución</a><?php endif; ?></div>
</div>
<section class="panel">
  <nav class="tabs"><?php foreach (['' => 'Todas', 'pending' => 'Pendientes', 'completed' => 'Aplicadas', 'rejected' => 'Rechazadas'] as $k => $l): ?><a href="<?= e(url('/returns', ['status' => $k])) ?>" class="<?= $status === $k ? 'is-active' : '' ?>"><?= e($l) ?></a><?php endforeach; ?></nav>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin devoluciones', 'text' => 'No hay devoluciones registradas en este estado.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Devolución</th><th>Venta</th><th>Motivo</th><th>Reembolso</th><th class="num">Valor</th><th>Estado</th></tr></thead>
    <tbody><?php foreach ($rows as $r): ?>
      <tr class="is-clickable" data-href="<?= e(url('/returns/' . $r['id'])) ?>">
        <td class="cell-main"><strong><?= e($r['number']) ?></strong><div class="muted" style="font-size:12px"><?= e(fmt_dt($r['created_at'])) ?> · <?= e($r['user_name']) ?></div></td>
        <td data-label="Venta"><?= e($r['sale_number']) ?><div class="muted" style="font-size:12px"><?= e($r['branch']) ?></div></td>
        <td data-label="Motivo"><span class="truncate" style="display:inline-block;max-width:240px"><?= e($r['reason']) ?></span></td>
        <td data-label="Reembolso"><?= e($r['method'] ?? '—') ?></td>
        <td class="num" data-label="Valor"><strong><?= e(money($r['total'])) ?></strong></td>
        <td data-label="Estado"><?= status_badge($r['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

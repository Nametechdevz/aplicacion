<?php use App\Core\View; $pending = array_filter($rows, fn ($r) => $r['status'] === 'pending'); ?>
<div class="page-head">
  <div><div class="eyebrow">Comercial</div><h1>Autorizaciones de descuento</h1><p>Solicitudes de cajeros que superan su límite. La aprobación queda registrada en la venta con su nombre.</p></div>
  <div class="page-actions"><a class="btn" href="<?= e(url('/approvals')) ?>"><?= icon('refresh') ?> Actualizar</a></div>
</div>
<?php if (!$rows): ?>
  <section class="panel"><?= View::partial('partials/empty', ['title' => 'Sin solicitudes', 'text' => 'Cuando un cajero solicite un descuento superior a su límite aparecerá aquí.']) ?></section>
<?php else: ?>
<section class="panel">
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Solicitud</th><th>Producto</th><th class="num">Descuento</th><th class="num">Valor</th><?php if ($showCost): ?><th class="num">Margen resultante</th><?php endif; ?><th>Estado</th><th></th></tr></thead>
    <tbody><?php foreach ($rows as $r):
      $final = (float) $r['base_amount'] - (float) $r['requested_amount'];
      $margin = null;
      if ($showCost && $r['product_id'] && (float) $r['price'] > 0 && $final > 0) {
          $qtyBase = (float) $r['base_amount'] / (float) $r['price'];
          $margin = ($final - $qtyBase * (float) $r['cost']) / $final * 100;
      } ?>
      <tr>
        <td class="cell-main"><div class="row" style="gap:12px"><span class="avatar"><?= e(initials($r['requester'])) ?></span><div><strong><?= e($r['requester']) ?></strong><div class="muted" style="font-size:12px"><?= e($r['branch']) ?> · <?= e(time_ago($r['created_at'])) ?></div></div></div></td>
        <td data-label="Producto"><?= e($r['product'] ?? 'Total de la venta') ?><?= $r['reason'] ? '<div class="muted" style="font-size:12px">“' . e($r['reason']) . '”</div>' : '' ?></td>
        <td class="num" data-label="Descuento"><strong class="text-gold"><?= e(pct($r['requested_percent'], 2)) ?></strong></td>
        <td class="num" data-label="Valor">− <?= e(money($r['requested_amount'])) ?><div class="muted" style="font-size:12px">sobre <?= e(money($r['base_amount'])) ?></div></td>
        <?php if ($showCost): ?><td class="num <?= $margin !== null && $margin < (float) setting('min_margin_pct') ? 'text-danger' : '' ?>" data-label="Margen"><?= $margin !== null ? e(pct($margin)) : '—' ?></td><?php endif; ?>
        <td data-label="Estado"><?= status_badge($r['status']) ?><?= $r['decider'] ? '<div class="muted" style="font-size:12px">' . e($r['decider']) . '</div>' : '' ?></td>
        <td class="actions">
          <?php if ($r['status'] === 'pending' && (int) $r['requested_by'] !== \App\Core\Auth::id()): ?>
            <form method="post" action="<?= e(url('/approvals/' . $r['id'] . '/reject')) ?>" style="display:inline" data-confirm="¿Rechazar el descuento?" data-confirm-reason="Motivo (se mostrará al cajero)" data-confirm-min="0" data-danger><?= csrf_field() ?><button class="btn btn-sm" type="submit">Rechazar</button></form>
            <form method="post" action="<?= e(url('/approvals/' . $r['id'] . '/approve')) ?>" style="display:inline"><?= csrf_field() ?><button class="btn btn-sm btn-primary" type="submit"><?= icon('check', 'icon-sm') ?> Autorizar</button></form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
</section>
<?php endif; ?>

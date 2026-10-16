<?php use App\Core\View;
$open = (int) ($counts['requested'] ?? 0) + (int) ($counts['approved'] ?? 0) + (int) ($counts['in_transit'] ?? 0) + (int) ($counts['received_with_differences'] ?? 0); ?>
<div class="page-head">
  <div><div class="eyebrow">Inventario</div><h1>Transferencias</h1><p>Solicitud → aprobación (reserva) → despacho (en tránsito) → recepción → resolución de diferencias.</p></div>
  <div class="page-actions">
    <?php if (can('inventory.distribute')): ?><a class="btn" href="<?= e(url('/inventory/distribute')) ?>"><?= icon('boxes') ?> Distribuir desde almacén</a><?php endif; ?>
    <?php if (can('transfers.request')): ?><a class="btn btn-primary" href="<?= e(url('/transfers/create')) ?>"><?= icon('plus') ?> Solicitar transferencia</a><?php endif; ?>
  </div>
</div>
<section class="panel">
  <nav class="tabs" aria-label="Estado">
    <?php foreach (['' => ['Todas', array_sum($counts)], 'open' => ['Pendientes', $open], 'requested' => ['Solicitadas', $counts['requested'] ?? 0], 'in_transit' => ['En tránsito', $counts['in_transit'] ?? 0], 'received_with_differences' => ['Con diferencias', $counts['received_with_differences'] ?? 0], 'received' => ['Recibidas', $counts['received'] ?? 0]] as $k => [$l, $n]): ?>
      <a href="<?= e(url('/transfers', ['status' => $k])) ?>" class="<?= $status === $k ? 'is-active' : '' ?>"><?= e($l) ?> <span class="count"><?= (int) $n ?></span></a>
    <?php endforeach; ?>
  </nav>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin transferencias', 'text' => 'No hay transferencias en este estado.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Número</th><th>Ruta</th><th class="num">Productos</th><th>Solicitó</th><th>Actualizada</th><th>Estado</th></tr></thead>
    <tbody><?php foreach ($rows as $t): ?>
      <tr class="is-clickable" data-href="<?= e(url('/transfers/' . $t['id'])) ?>">
        <td class="cell-main"><strong><?= e($t['number']) ?></strong><div class="muted" style="font-size:12px"><?= e(fmt_dt($t['requested_at'])) ?></div></td>
        <td data-label="Ruta"><span class="row" style="gap:8px;flex-wrap:wrap"><?= e($t['from_name']) ?> <?= icon('arrow-right', 'icon-sm text-gold') ?> <strong><?= e($t['to_name']) ?></strong></span></td>
        <td class="num" data-label="Productos"><?= (int) $t['items'] ?></td>
        <td data-label="Solicitó"><?= e($t['requested_name']) ?></td>
        <td data-label="Actualizada"><?= e(time_ago($t['updated_at'])) ?></td>
        <td data-label="Estado"><?= status_badge($t['status']) ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

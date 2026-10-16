<?php
$order = ['requested' => 0, 'approved' => 1, 'in_transit' => 2, 'received' => 3, 'received_with_differences' => 3, 'resolved' => 4];
$cur = $order[$t['status']] ?? -1;
$steps = [
  ['Solicitada', $t['requested_name'], $t['requested_at']],
  ['Aprobada', $t['approved_name'], $t['approved_at']],
  ['Despachada', $t['dispatched_name'], $t['dispatched_at']],
  ['Recibida', $t['received_name'], $t['received_at']],
];
if ($t['status'] === 'received_with_differences' || $t['status'] === 'resolved') { $steps[] = ['Diferencias resueltas', $t['resolved_name'], $t['resolved_at']]; }
$hasDiff = false;
foreach ($t['items'] as $it) { if ($it['qty_sent'] !== null && $it['qty_received'] !== null && (float) $it['qty_sent'] !== (float) $it['qty_received']) { $hasDiff = true; } }
?>
<div class="page-head">
  <div><div class="eyebrow">Transferencia</div><h1><?= e($t['number']) ?></h1>
    <p class="row" style="gap:8px;flex-wrap:wrap"><?= e($t['from_name']) ?> <?= icon('arrow-right', 'icon-sm text-gold') ?> <strong style="color:var(--text)"><?= e($t['to_name']) ?></strong> · <?= status_badge($t['status']) ?></p></div>
  <div class="page-actions">
    <?php if (in_array($t['status'], ['requested', 'approved'], true) && ((int) $t['requested_by'] === \App\Core\Auth::id() || can('transfers.approve'))): ?>
      <form method="post" action="<?= e(url('/transfers/' . $t['id'] . '/cancel')) ?>" data-confirm="¿Cancelar la transferencia?" data-confirm-text="Se liberarán las reservas del origen." data-confirm-reason="Motivo de la cancelación" data-danger><?= csrf_field() ?><button class="btn btn-danger-ghost" type="submit">Cancelar</button></form>
    <?php endif; ?>
    <?php if ($t['status'] === 'requested' && can('transfers.approve') && $canOrigin): ?>
      <form method="post" action="<?= e(url('/transfers/' . $t['id'] . '/reject')) ?>" data-confirm="¿Rechazar la solicitud?" data-confirm-reason="Motivo del rechazo" data-danger><?= csrf_field() ?><button class="btn" type="submit"><?= icon('x') ?> Rechazar</button></form>
      <button class="btn btn-primary" type="submit" form="approve-form"><?= icon('check') ?> Aprobar y reservar</button>
    <?php endif; ?>
    <?php if ($t['status'] === 'approved' && can('transfers.dispatch') && $canOrigin): ?>
      <form method="post" action="<?= e(url('/transfers/' . $t['id'] . '/dispatch')) ?>" data-confirm="¿Despachar la mercancía?" data-confirm-text="Se descontará del origen y quedará en tránsito hasta su recepción."><?= csrf_field() ?><button class="btn btn-primary" type="submit"><?= icon('truck') ?> Despachar</button></form>
    <?php endif; ?>
    <?php if ($t['status'] === 'in_transit' && can('transfers.receive') && $canDest): ?>
      <button class="btn btn-primary" type="submit" form="receive-form"><?= icon('check') ?> Confirmar recepción</button>
    <?php endif; ?>
  </div>
</div>

<?php if (!in_array($t['status'], ['rejected', 'cancelled'], true)): ?>
<section class="panel mb-3"><div class="panel-body">
  <ol class="steps">
    <?php foreach ($steps as $i => [$label, $who, $when]): ?>
      <li class="<?= $i < $cur || ($i === $cur && in_array($t['status'], ['received', 'resolved'], true)) || $i <= $cur ? 'is-done' : '' ?> <?= $i === $cur + 1 ? 'is-current' : '' ?>">
        <strong><?= e($label) ?></strong><small><?= $when ? e(($who ?? '') . ' · ' . fmt_dt($when)) : 'Pendiente' ?></small>
      </li>
    <?php endforeach; ?>
  </ol>
</div></section>
<?php else: ?>
  <div class="callout callout-danger mb-3"><?= icon('x-circle', 'icon-sm') ?><span><strong><?= $t['status'] === 'rejected' ? 'Rechazada' : 'Cancelada' ?>.</strong> <?= e($t['rejection_reason'] ?? '') ?></span></div>
<?php endif; ?>

<?php if ($t['status'] === 'received_with_differences'): ?>
  <div class="callout callout-warning mb-3"><?= icon('alert', 'icon-sm') ?><span>Se recibió menos de lo despachado. La diferencia debe documentarse: <strong>pérdida</strong> (se da de baja) o <strong>retorno al origen</strong> (reingresa al inventario de origen).</span></div>
<?php endif; ?>

<section class="panel">
  <div class="panel-head"><div><h2>Productos</h2><?php if ($t['notes']): ?><div class="sub"><?= nl2br(e($t['notes'])) ?></div><?php endif; ?></div></div>
  <div class="panel-body" style="padding:12px 0 0">
    <form id="approve-form" method="post" action="<?= e(url('/transfers/' . $t['id'] . '/approve')) ?>"><?= csrf_field() ?></form>
    <form id="receive-form" method="post" action="<?= e(url('/transfers/' . $t['id'] . '/receive')) ?>" data-confirm="¿Confirmar la recepción?" data-confirm-text="Verifique las cantidades físicas: las diferencias quedarán registradas."><?= csrf_field() ?></form>
    <form id="resolve-form" method="post" action="<?= e(url('/transfers/' . $t['id'] . '/resolve')) ?>"><?= csrf_field() ?></form>
    <div class="table-wrap"><table class="table table-stack">
      <thead><tr><th>Producto</th><th class="num">Solicitado</th><th class="num">Aprobado</th><th class="num">Despachado</th><th class="num">Recibido</th><th class="num">Diferencia</th><?php if ($t['status'] === 'received_with_differences'): ?><th>Resolución</th><?php endif; ?></tr></thead>
      <tbody><?php foreach ($t['items'] as $it):
        $diff = ($it['qty_sent'] !== null && $it['qty_received'] !== null) ? (float) $it['qty_sent'] - (float) $it['qty_received'] : null; ?>
        <tr>
          <td class="cell-main"><strong><?= e($it['name']) ?></strong><div class="muted" style="font-size:12px"><?= e($it['code']) ?><?= $t['status'] === 'requested' ? ' · disponible en origen ' . e(qty($it['origin_available'] ?? '0', $it['unit'])) : '' ?></div></td>
          <td class="num" data-label="Solicitado"><?= e(qty($it['qty_requested'], $it['unit'])) ?></td>
          <td class="num" data-label="Aprobado">
            <?php if ($t['status'] === 'requested' && can('transfers.approve') && $canOrigin): ?>
              <input class="input input-sm" form="approve-form" name="approved[<?= (int) $it['id'] ?>]" value="<?= e(rtrim(rtrim($it['qty_requested'], '0'), '.')) ?>" inputmode="decimal" style="width:110px;text-align:right;margin-left:auto" aria-label="Cantidad aprobada">
            <?php else: ?><?= $it['qty_approved'] !== null ? e(qty($it['qty_approved'])) : '—' ?><?php endif; ?></td>
          <td class="num" data-label="Despachado"><?= $it['qty_sent'] !== null ? e(qty($it['qty_sent'])) : '—' ?></td>
          <td class="num" data-label="Recibido">
            <?php if ($t['status'] === 'in_transit' && can('transfers.receive') && $canDest && (float) $it['qty_sent'] > 0): ?>
              <input class="input input-sm" form="receive-form" name="received[<?= (int) $it['id'] ?>]" value="<?= e(rtrim(rtrim($it['qty_sent'], '0'), '.')) ?>" inputmode="decimal" style="width:110px;text-align:right;margin-left:auto" aria-label="Cantidad recibida">
            <?php else: ?><?= $it['qty_received'] !== null ? e(qty($it['qty_received'])) : '—' ?><?php endif; ?></td>
          <td class="num <?= $diff ? 'text-danger' : '' ?>" data-label="Diferencia"><?= $diff === null ? '—' : ($diff ? '−' . e(qty((string) $diff)) : '<span class="text-success">OK</span>') ?>
            <?= $it['resolution'] ? '<div class="muted" style="font-size:11.5px">' . ($it['resolution'] === 'write_off' ? 'Dada de baja' : 'Retornada al origen') . '</div>' : '' ?></td>
          <?php if ($t['status'] === 'received_with_differences'): ?>
            <td data-label="Resolución"><?php if ($diff): ?>
              <select class="select select-sm" form="resolve-form" name="resolution[<?= (int) $it['id'] ?>]" required style="width:190px"><option value="">Seleccione…</option><option value="write_off">Pérdida / baja</option><option value="return_origin">Retornar al origen</option></select>
            <?php endif; ?></td>
          <?php endif; ?>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  </div>
  <?php if ($t['status'] === 'in_transit' && can('transfers.receive') && $canDest): ?>
    <div class="panel-foot"><input class="input" form="receive-form" name="notes" maxlength="300" placeholder="Observaciones de la recepción (opcional)" style="flex:1"></div>
  <?php endif; ?>
  <?php if ($t['status'] === 'received_with_differences' && can('transfers.resolve') && $canOrigin): ?>
    <div class="panel-foot"><input class="input" form="resolve-form" name="resolution_notes" required minlength="4" maxlength="500" placeholder="Documente la resolución (obligatorio)" style="flex:1"><button class="btn btn-primary" type="submit" form="resolve-form">Resolver diferencias</button></div>
  <?php endif; ?>
  <?php if ($t['resolution_notes']): ?><div class="panel-foot"><span><strong>Resolución:</strong> <?= e($t['resolution_notes']) ?></span></div><?php endif; ?>
</section>

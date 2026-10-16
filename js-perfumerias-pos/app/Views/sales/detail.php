<?php
/** Detalle de una venta (usado en el panel lateral y en la página de detalle). */
$drawer = $drawer ?? false;
$hasDiscount = (float) $sale['discount_total'] > 0;
?>
<div class="stack" style="gap:18px">
  <div class="row wrap" style="gap:8px">
    <?= status_badge($sale['status']) ?>
    <span class="badge badge-neutral no-dot"><?= icon('store', 'icon-sm') ?> <?= e($sale['branch_name']) ?></span>
    <span class="badge badge-neutral no-dot"><?= icon('calendar', 'icon-sm') ?> <?= e(fmt_dt($sale['created_at'])) ?></span>
    <?php if ((int) $sale['reprint_count']): ?><span class="badge badge-neutral no-dot">Reimpreso <?= (int) $sale['reprint_count'] ?>×</span><?php endif; ?>
  </div>
  <?php if ($sale['status'] === 'voided'): ?>
    <div class="callout callout-danger"><?= icon('x-circle', 'icon-sm') ?><span><strong>Anulada</strong> por <?= e($sale['voided_by_name'] ?? '—') ?> el <?= e(fmt_dt($sale['voided_at'])) ?>: <?= e($sale['void_reason']) ?>. El inventario y la caja se compensaron; el registro original se conserva.</span></div>
  <?php endif; ?>

  <dl class="dl">
    <dt>Vendedor</dt><dd><?= e($sale['seller_name']) ?></dd>
    <dt>Caja</dt><dd><?= e($sale['register_name']) ?> · turno #<?= (int) $sale['cash_session_id'] ?></dd>
    <dt>Cliente</dt><dd><?= $sale['customer_name'] ? e($sale['customer_name']) . ($sale['customer_document'] ? ' · ' . e($sale['customer_document']) : '') : 'General' ?></dd>
  </dl>

  <div>
    <div class="label mb-2">Artículos</div>
    <div class="panel" style="box-shadow:none">
      <?php foreach ($sale['items'] as $it): $disc = (float) $it['discount_amount'] > 0; ?>
        <div style="display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)">
          <?php if ($it['thumb']): ?><img src="<?= e(upload_url($it['thumb'])) ?>" alt="" style="width:44px;height:44px;border-radius:9px;object-fit:cover"><?php else: ?><span style="width:44px;height:44px;border-radius:9px;background:var(--surface-3);display:grid;place-items:center;color:var(--faint)"><?= icon('bottle', 'icon-sm') ?></span><?php endif; ?>
          <div style="min-width:0">
            <div style="font-weight:600;font-size:13.5px"><?= e($it['product_name']) ?><?= $it['variant_name'] ? ' · ' . e($it['variant_name']) : '' ?></div>
            <div class="muted" style="font-size:12px"><?= e($it['product_code']) ?> · <?= e(qty($it['quantity'], $it['unit_code'])) ?> × <?= e(money($it['list_unit_price'])) ?></div>
            <?php if ($it['unit_code'] !== 'und' || $it['variant_name']): ?>
              <div class="muted" style="font-size:11.5px">Existencia: <?= e(qty($it['stock_before'])) ?> → <?= e(qty($it['stock_after'])) ?> (−<?= e(qty($it['qty_base'])) ?>)</div>
            <?php endif; ?>
            <?php if ($disc): ?>
              <div style="font-size:12px;margin-top:4px" class="text-gold">
                Descuento <?= e(['percent' => 'porcentual', 'amount' => 'por valor', 'final_price' => 'precio final'][$it['discount_type']] ?? '') ?>: − <?= e(money($it['discount_amount'])) ?>
                <?= $it['discount_reason'] ? ' · ' . e($it['discount_reason']) : '' ?>
                <?= $it['approved_by_name'] ? ' · autorizó ' . e($it['approved_by_name']) : '' ?>
              </div>
            <?php endif; ?>
            <?php if ((float) $it['returned_qty'] > 0): ?><div class="text-warning" style="font-size:12px">Devuelto: <?= e(qty($it['returned_qty'], $it['unit_code'])) ?></div><?php endif; ?>
          </div>
          <div class="right">
            <div style="font-weight:700" class="num"><?= e(money($it['total'])) ?></div>
            <?php if ($disc): ?><div class="muted num" style="font-size:12px;text-decoration:line-through"><?= e(money($it['gross_amount'])) ?></div><?php endif; ?>
          </div>
        </div>
      <?php endforeach; ?>
      <div style="padding:14px">
        <div class="totals">
          <div class="line"><span class="muted">Subtotal (precio de lista)</span><span><?= e(money($sale['subtotal'])) ?></span></div>
          <div class="line"><span class="muted">Descuentos</span><span><?= $hasDiscount ? '− ' : '' ?><?= e(money($sale['discount_total'])) ?></span></div>
          <div class="line grand"><span>Total</span><span style="font-size:22px"><?= e(money($sale['total'])) ?></span></div>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="label mb-2">Pagos</div>
    <div class="table-wrap" style="border:1px solid var(--line);border-radius:12px"><table class="table table-sm">
      <thead><tr><th>Medio</th><th>Referencia</th><th class="num">Recibido</th><th class="num">Aplicado</th></tr></thead>
      <tbody>
        <?php foreach ($sale['payments'] as $p): ?>
          <tr><td><?= e($p['method_name']) ?><?= $p['verification'] === 'pending_manual' ? '<div class="muted" style="font-size:11px">Verificación manual pendiente</div>' : '' ?></td>
            <td><?= e($p['reference'] ?: '—') ?></td><td class="num"><?= e(money($p['received'])) ?></td><td class="num"><strong><?= e(money($p['amount'])) ?></strong></td></tr>
        <?php endforeach; ?>
      </tbody>
    </table></div>
    <?php if ((float) $sale['change_total'] > 0): ?><p class="muted mt-1" style="font-size:12.5px">Cambio entregado: <?= e(money($sale['change_total'])) ?></p><?php endif; ?>
  </div>

  <?php if ($sale['returns']): ?>
  <div>
    <div class="label mb-2">Devoluciones</div>
    <?php foreach ($sale['returns'] as $r): ?>
      <a class="row-between panel" style="padding:10px 14px;margin-bottom:6px;box-shadow:none" href="<?= e(url('/returns/' . $r['id'])) ?>"><span><strong><?= e($r['number']) ?></strong> · <?= e($r['reason']) ?></span><span class="row"><?= status_badge($r['status']) ?> <strong><?= e(money($r['total'])) ?></strong></span></a>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>

  <div class="row wrap" style="gap:8px">
    <?php if ($drawer): ?><a class="btn btn-sm" href="<?= e(url('/sales/' . $sale['id'])) ?>"><?= icon('eye', 'icon-sm') ?> Ver página</a><?php endif; ?>
    <?php if (can('sales.reprint')): ?>
      <form method="post" action="<?= e(url('/sales/' . $sale['id'] . '/reprint')) ?>" target="_blank"><?= csrf_field() ?><button class="btn btn-sm" type="submit"><?= icon('printer', 'icon-sm') ?> Reimprimir</button></form>
    <?php endif; ?>
    <?php if ($sale['status'] === 'completed' && can('returns.create')): ?>
      <a class="btn btn-sm" href="<?= e(url('/returns/create', ['sale' => $sale['id']])) ?>"><?= icon('undo', 'icon-sm') ?> Devolución</a>
    <?php endif; ?>
    <?php if ($sale['status'] === 'completed' && can('sales.void')): ?>
      <form method="post" action="<?= e(url('/sales/' . $sale['id'] . '/void')) ?>" data-confirm="¿Anular la venta <?= e($sale['number']) ?>?" data-confirm-text="Se reintegra el inventario y se registra un movimiento compensatorio en caja. La venta queda en el historial como anulada." data-confirm-reason="Motivo de la anulación" data-confirm-min="5" data-danger data-confirm-ok="Anular venta">
        <?= csrf_field() ?><button class="btn btn-sm btn-danger-ghost" type="submit"><?= icon('x-circle', 'icon-sm') ?> Anular</button></form>
    <?php endif; ?>
  </div>
</div>

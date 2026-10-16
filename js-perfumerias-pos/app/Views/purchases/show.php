<?php $canReceive = in_array($po['status'], ['ordered', 'partial'], true); $canReturn = in_array($po['status'], ['partial', 'received'], true); ?>
<div class="page-head">
  <div><div class="eyebrow">Orden de compra</div><h1><?= e($po['number']) ?></h1><p><?= e($po['supplier']) ?> → <?= e($po['branch']) ?> · <?= status_badge($po['status']) ?></p></div>
  <div class="page-actions">
    <?php if ($po['status'] === 'draft'): ?><form method="post" action="<?= e(url('/purchases/' . $po['id'] . '/order')) ?>"><?= csrf_field() ?><button class="btn btn-primary" type="submit"><?= icon('truck') ?> Enviar al proveedor</button></form><?php endif; ?>
    <?php if (in_array($po['status'], ['draft', 'ordered'], true)): ?><form method="post" action="<?= e(url('/purchases/' . $po['id'] . '/cancel')) ?>" data-confirm="¿Cancelar la orden?" data-confirm-reason="Motivo" data-danger><?= csrf_field() ?><button class="btn btn-danger-ghost" type="submit">Cancelar orden</button></form><?php endif; ?>
    <?php if ($canReceive): ?><button class="btn btn-primary" type="button" data-open="receive-modal"><?= icon('download') ?> Registrar recepción</button><?php endif; ?>
    <?php if ($canReturn): ?><button class="btn" type="button" data-open="return-modal"><?= icon('undo') ?> Devolver al proveedor</button><?php endif; ?>
  </div>
</div>
<div class="grid grid-12" style="align-items:start">
  <section class="panel span-8">
    <div class="panel-head"><h2>Productos</h2></div>
    <div class="panel-body" style="padding:12px 0 0"><table class="table table-stack">
      <thead><tr><th>Producto</th><th class="num">Pedido</th><th class="num">Recibido</th><th class="num">Pendiente</th><th class="num">Costo unit.</th><th class="num">Total</th></tr></thead>
      <tbody><?php foreach ($items as $it): $pend = (float) $it['quantity'] - (float) $it['qty_received']; ?>
        <tr><td class="cell-main"><strong><?= e($it['name']) ?></strong><div class="muted" style="font-size:12px"><?= e($it['code']) ?></div></td>
          <td class="num" data-label="Pedido"><?= e(qty($it['quantity'], $it['unit'])) ?></td>
          <td class="num" data-label="Recibido"><?= e(qty($it['qty_received'])) ?></td>
          <td class="num <?= $pend > 0 ? 'text-warning' : 'text-success' ?>" data-label="Pendiente"><?= $pend > 0 ? e(qty((string) $pend)) : 'Completo' ?></td>
          <td class="num" data-label="Costo"><?= e(money($it['unit_cost'], (float) $it['unit_cost'] < 1000)) ?></td>
          <td class="num" data-label="Total"><strong><?= e(money($it['line_total'])) ?></strong></td></tr>
      <?php endforeach; ?></tbody>
      <tfoot><tr><td colspan="5">Subtotal − descuentos + adicionales</td><td class="num"><?= e(money($po['total'])) ?></td></tr></tfoot>
    </table></div>
  </section>
  <div class="span-4 stack">
    <section class="panel"><div class="panel-body"><dl class="dl">
      <dt>Fecha</dt><dd><?= e(date('d/m/Y', strtotime($po['order_date']))) ?></dd>
      <dt>Llegada estimada</dt><dd><?= $po['expected_date'] ? e(date('d/m/Y', strtotime($po['expected_date']))) : '—' ?></dd>
      <dt>Creada por</dt><dd><?= e($po['created_name']) ?></dd>
      <dt>Proveedor</dt><dd><?= e($po['supplier']) ?></dd>
      <dt>Contacto</dt><dd><?= e(trim(($po['supplier_phone'] ?? '') . ' ' . ($po['supplier_email'] ?? '')) ?: '—') ?></dd>
    </dl><?php if ($po['notes']): ?><p class="muted mt-2" style="font-size:13px"><?= nl2br(e($po['notes'])) ?></p><?php endif; ?></div></section>
    <section class="panel"><div class="panel-head"><h2>Recepciones</h2></div><div class="panel-body">
      <?php if (!$receipts): ?><p class="muted">Aún no se ha recibido mercancía.</p><?php endif; ?>
      <ul class="timeline"><?php foreach ($receipts as $r): ?><li><div class="t-main"><strong><?= e($r['number']) ?></strong> · <?= e(money($r['total'])) ?><?= $r['supplier_invoice'] ? ' · factura ' . e($r['supplier_invoice']) : '' ?></div><div class="t-meta"><?= e($r['user_name']) ?> · <?= e(fmt_dt($r['created_at'])) ?></div></li><?php endforeach; ?></ul>
      <?php foreach ($returns as $r): ?><div class="callout callout-warning mt-2"><?= icon('undo', 'icon-sm') ?><span><?= e($r['number']) ?> · <?= e(money($r['total'])) ?> · <?= e($r['reason']) ?></span></div><?php endforeach; ?>
    </div></section>
  </div>
</div>
<?php if ($canReceive): ?>
<dialog class="modal modal-lg" id="receive-modal">
  <form class="modal-card" method="post" action="<?= e(url('/purchases/' . $po['id'] . '/receive')) ?>" data-confirm="¿Registrar la recepción?" data-confirm-text="Se sumarán las cantidades al inventario de <?= e($po['branch']) ?> y se actualizará el costo.">
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2>Recepción de mercancía</h2><p>Registre solo lo que llegó físicamente. Puede recibir en varias entregas.</p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body">
      <table class="table table-sm"><thead><tr><th>Producto</th><th class="num">Pendiente</th><th>Recibido ahora</th></tr></thead><tbody>
      <?php foreach ($items as $it): $pend = (float) $it['quantity'] - (float) $it['qty_received']; if ($pend <= 0) { continue; } ?>
        <tr><td><?= e($it['name']) ?></td><td class="num"><?= e(qty((string) $pend, $it['unit'])) ?></td>
          <td><div class="input-group has-addon"><input class="input input-sm" name="received[<?= (int) $it['id'] ?>]" inputmode="decimal" value="<?= e(rtrim(rtrim(number_format($pend, 3, '.', ''), '0'), '.')) ?>" style="width:130px"><span class="addon"><?= e($it['unit']) ?></span></div></td></tr>
      <?php endforeach; ?></tbody></table>
      <div class="form-grid mt-3">
        <div class="field col-4"><label>Factura del proveedor</label><input class="input" name="supplier_invoice" maxlength="60"></div>
        <div class="field col-4"><label>Fecha de factura</label><input class="input" type="date" name="invoice_date"></div>
        <div class="field col-4"><label>Costos adicionales de esta entrega</label><input class="input" name="additional_costs" inputmode="decimal" placeholder="0"></div>
        <div class="field col-12"><label>Observaciones</label><input class="input" name="notes" maxlength="500"></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Registrar recepción</button></div>
  </form>
</dialog>
<?php endif; ?>
<?php if ($canReturn): ?>
<dialog class="modal modal-lg" id="return-modal">
  <form class="modal-card" method="post" action="<?= e(url('/purchases/' . $po['id'] . '/return')) ?>" data-confirm="¿Registrar la devolución al proveedor?" data-confirm-text="Las cantidades se descontarán del inventario." data-danger>
    <?= csrf_field() ?>
    <div class="modal-head"><div><h2>Devolución al proveedor</h2><p>Solo sobre cantidades recibidas.</p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="modal-body">
      <table class="table table-sm"><thead><tr><th>Producto</th><th class="num">Recibido</th><th>Devolver</th></tr></thead><tbody>
      <?php foreach ($items as $it): if ((float) $it['qty_received'] <= 0) { continue; } ?>
        <tr><td><?= e($it['name']) ?></td><td class="num"><?= e(qty($it['qty_received'], $it['unit'])) ?></td><td><input class="input input-sm" name="return[<?= (int) $it['id'] ?>]" inputmode="decimal" placeholder="0" style="width:120px"></td></tr>
      <?php endforeach; ?></tbody></table>
      <div class="field mt-3"><label>Motivo<span class="req">*</span></label><input class="input" name="reason" required minlength="4" maxlength="255"></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-danger" type="submit">Registrar devolución</button></div>
  </form>
</dialog>
<?php endif; ?>

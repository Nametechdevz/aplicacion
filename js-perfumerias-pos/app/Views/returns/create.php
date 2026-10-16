<div class="page-head">
  <div><div class="eyebrow">Devoluciones</div><h1>Registrar devolución</h1><p>Localice la venta original y seleccione los artículos. No se puede devolver más de lo vendido menos lo ya devuelto.</p></div>
</div>
<section class="panel mb-3">
  <form method="get" class="toolbar" style="border-bottom:0">
    <div class="input-group grow"><?= icon('receipt') ?><input class="input" name="number" value="<?= e($sale['number'] ?? $number) ?>" placeholder="Número de comprobante, p. ej. S01-000123" aria-label="Número de venta" required></div>
    <button class="btn btn-primary" type="submit"><?= icon('search') ?> Buscar venta</button>
  </form>
</section>
<?php if ($sale): ?>
  <?php if ($sale['status'] !== 'completed'): ?>
    <div class="callout callout-danger"><?= icon('x-circle', 'icon-sm') ?><span>La venta <?= e($sale['number']) ?> está anulada; no admite devoluciones.</span></div>
  <?php else: ?>
  <form method="post" action="<?= e(url('/returns')) ?>" class="panel" data-confirm="¿Registrar la devolución?" data-confirm-text="<?= $needsApproval ? 'Quedará pendiente de aprobación de un supervisor.' : 'Se aplicará el reembolso y el reingreso al inventario de los artículos revendibles.' ?>">
    <?= csrf_field() ?><input type="hidden" name="sale_id" value="<?= (int) $sale['id'] ?>">
    <div class="panel-head"><div><h2>Venta <?= e($sale['number']) ?></h2><div class="sub"><?= e(fmt_dt($sale['created_at'])) ?> · <?= e($sale['branch_name']) ?> · <?= e($sale['customer_name'] ?? 'Cliente general') ?> · Total <?= e(money($sale['total'])) ?></div></div></div>
    <div class="panel-body" style="padding:12px 0 0">
      <div class="table-wrap"><table class="table table-stack">
        <thead><tr><th>Artículo</th><th class="num">Vendido</th><th class="num">Pagado</th><th class="num">Disponible</th><th>Devolver</th><th>Estado del artículo</th><th>Reingresa</th></tr></thead>
        <tbody><?php foreach ($sale['items'] as $it): $avail = (float) $it['quantity'] - (float) $it['returned_qty']; ?>
          <tr>
            <td class="cell-main"><strong><?= e($it['product_name']) ?></strong><?= $it['variant_name'] ? ' · ' . e($it['variant_name']) : '' ?><div class="muted" style="font-size:12px"><?= e($it['product_code']) ?></div></td>
            <td class="num" data-label="Vendido"><?= e(qty($it['quantity'], $it['unit_code'])) ?></td>
            <td class="num" data-label="Pagado"><?= e(money($it['total'])) ?></td>
            <td class="num" data-label="Disponible"><?= e(qty((string) $avail)) ?></td>
            <td data-label="Devolver"><?php if ($avail > 0): ?><div class="input-group has-addon"><input class="input input-sm" name="items[<?= (int) $it['id'] ?>][quantity]" inputmode="decimal" placeholder="0" style="width:110px" aria-label="Cantidad a devolver"><span class="addon"><?= e($it['unit_code']) ?></span></div><?php else: ?><span class="muted">Ya devuelto</span><?php endif; ?></td>
            <td data-label="Estado"><?php if ($avail > 0): ?><select class="select select-sm" name="items[<?= (int) $it['id'] ?>][condition]" style="width:150px"><option value="resaleable">Revendible</option><option value="damaged">Dañado</option><option value="defective">Defectuoso</option></select><?php endif; ?></td>
            <td data-label="Reingresa"><?php if ($avail > 0): ?><label class="check"><input type="checkbox" name="items[<?= (int) $it['id'] ?>][restock]" value="1" checked> Al inventario</label><?php endif; ?></td>
          </tr>
        <?php endforeach; ?></tbody>
      </table></div>
    </div>
    <div class="form-section"><div class="form-grid">
      <div class="field col-8"><label for="r-reason">Motivo<span class="req">*</span></label><input class="input" id="r-reason" name="reason" required minlength="4" maxlength="255" placeholder="Ej.: cambio de referencia, producto con defecto"></div>
      <div class="field col-4"><label for="r-method">Medio de reembolso</label><select class="select" id="r-method" name="refund_method_id" required><?php foreach ($methods as $m): ?><option value="<?= (int) $m['id'] ?>"><?= e($m['name']) ?></option><?php endforeach; ?></select><span class="hint">El efectivo requiere caja abierta.</span></div>
    </div>
    <div class="callout callout-info mt-2"><?= icon('info', 'icon-sm') ?><span>Los artículos dañados o defectuosos no reingresan al inventario. El valor se calcula proporcional al precio final pagado.</span></div></div>
    <div class="form-actions"><a class="btn btn-ghost" href="<?= e(url('/returns')) ?>">Cancelar</a><button class="btn btn-primary" type="submit"><?= icon('undo') ?> Registrar devolución</button></div>
  </form>
  <?php endif; ?>
<?php endif; ?>

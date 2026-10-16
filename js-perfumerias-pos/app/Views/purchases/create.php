<div class="page-head">
  <div><div class="eyebrow">Compras</div><h1>Nueva orden de compra</h1><p>Costos en unidad base del producto (por unidad, ml o g).</p></div>
</div>
<?php if (!$suppliers): ?>
  <div class="callout callout-warning"><?= icon('alert', 'icon-sm') ?><span>Primero registre un proveedor en <a class="link" href="<?= e(url('/suppliers')) ?>">Proveedores</a>.</span></div>
<?php else: ?>
<form method="post" action="<?= e(url('/purchases')) ?>" class="panel" data-purchase-form>
  <?= csrf_field() ?>
  <div class="form-section"><div class="form-grid">
    <div class="field col-4"><label for="po-sup">Proveedor<span class="req">*</span></label><select class="select" id="po-sup" name="supplier_id" required><?php foreach ($suppliers as $s): ?><option value="<?= (int) $s['id'] ?>"><?= e($s['name']) ?></option><?php endforeach; ?></select></div>
    <div class="field col-4"><label for="po-branch">Recibe en<span class="req">*</span></label><select class="select" id="po-branch" name="branch_id" required><?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>"><?= e($b['name']) ?></option><?php endforeach; ?></select></div>
    <div class="field col-2"><label for="po-date">Fecha</label><input class="input" type="date" id="po-date" name="order_date" required value="<?= e(local_today()) ?>"></div>
    <div class="field col-2"><label for="po-exp">Llegada estimada</label><input class="input" type="date" id="po-exp" name="expected_date"></div>
    <div class="field col-8"><label for="po-notes">Observaciones</label><input class="input" id="po-notes" name="notes" maxlength="500"></div>
    <div class="field col-4"><label for="po-add">Costos adicionales (fletes, seguros)</label><input class="input" id="po-add" name="additional_costs" inputmode="decimal" placeholder="0" data-additional></div>
  </div></div>
  <div class="form-section" data-line-editor data-branch-source="#po-branch">
    <h3>Productos</h3>
    <div class="global-search" style="width:100%;max-width:520px;margin:10px 0 14px"><?= icon('search') ?><input class="input" data-lookup placeholder="Agregar producto…" aria-label="Buscar producto" autocomplete="off"><div class="search-results hidden" data-lookup-results></div></div>
    <div class="table-wrap"><table class="table table-stack"><thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Descuento</th><th class="num">Subtotal</th><th></th></tr></thead><tbody data-lines></tbody>
      <tfoot><tr><td colspan="4">Total estimado</td><td class="num" data-po-total>$ 0</td><td></td></tr></tfoot></table></div>
    <p class="muted" data-lines-empty style="padding:10px 0">Agregue los productos de la orden.</p>
    <template data-line-template><tr data-pid="__id__" data-po-line>
      <td class="cell-main"><strong>__name__</strong><div class="muted" style="font-size:12px">__code__ · por __unit__</div><input type="hidden" name="items[__i__][product_id]" value="__id__"></td>
      <td data-label="Cantidad"><div class="input-group has-addon"><input class="input input-sm" name="items[__i__][quantity]" inputmode="decimal" required data-focus data-q style="width:120px"><span class="addon">__unit__</span></div></td>
      <td data-label="Costo"><input class="input input-sm" name="items[__i__][unit_cost]" inputmode="decimal" required value="__cost__" data-c style="width:130px"></td>
      <td data-label="Descuento"><input class="input input-sm" name="items[__i__][discount_amount]" inputmode="decimal" placeholder="0" data-d style="width:110px"></td>
      <td class="num" data-label="Subtotal" data-sub>$ 0</td>
      <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-remove-line aria-label="Quitar"><svg class="icon icon-sm"><use href="#i-trash"></use></svg></button></td>
    </tr></template>
  </div>
  <div class="form-actions"><a class="btn btn-ghost" href="<?= e(url('/purchases')) ?>">Cancelar</a><button class="btn" type="submit" name="submit" value="draft">Guardar borrador</button><button class="btn btn-primary" type="submit" name="submit" value="order"><?= icon('truck') ?> Crear y enviar al proveedor</button></div>
</form>
<?php endif; ?>

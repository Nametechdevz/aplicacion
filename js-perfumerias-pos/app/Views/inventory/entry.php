<div class="page-head">
  <div><div class="eyebrow">Inventario</div><h1>Entrada de mercancía</h1><p>Para inventario inicial o ingresos sin orden de compra. Las compras a proveedores se registran en <a class="link" href="<?= e(url('/purchases')) ?>">Compras</a> para conservar costos y facturas.</p></div>
</div>
<form method="post" action="<?= e(url('/inventory/entry')) ?>" class="panel" data-confirm="¿Registrar la entrada?" data-confirm-text="Las cantidades se sumarán al inventario de la sucursal seleccionada.">
  <?= csrf_field() ?>
  <div class="form-section">
    <div class="form-grid">
      <div class="field col-4"><label for="e-branch">Sucursal / almacén</label><select class="select" id="e-branch" name="branch_id" required>
        <?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>"><?= e($b['name']) ?></option><?php endforeach; ?></select></div>
      <div class="field col-4"><span class="label">Tipo</span><div class="segmented"><label><input type="radio" name="type" value="entry" checked><span>Entrada</span></label><label><input type="radio" name="type" value="initial"><span>Inventario inicial</span></label></div></div>
      <div class="field col-4"><label for="e-notes">Soporte / origen<span class="req">*</span></label><input class="input" id="e-notes" name="notes" required minlength="4" maxlength="255" placeholder="Ej.: carga inicial, remisión 123"></div>
    </div>
  </div>
  <div class="form-section" data-line-editor data-branch-source="#e-branch">
    <h3>Productos</h3><p class="muted">Busque por nombre, código o escanee el código de barras. El costo es opcional y actualiza el costo promedio.</p>
    <div class="global-search" style="width:100%;max-width:520px;margin-bottom:14px"><?= icon('search') ?><input class="input" data-lookup placeholder="Agregar producto…" aria-label="Buscar producto para agregar" autocomplete="off"><div class="search-results hidden" data-lookup-results></div></div>
    <div class="table-wrap"><table class="table table-stack">
      <thead><tr><th>Producto</th><th>Existencia actual</th><th>Cantidad</th><th>Costo unitario (opcional)</th><th></th></tr></thead>
      <tbody data-lines></tbody>
    </table></div>
    <p class="muted" data-lines-empty style="padding:10px 0">Aún no hay productos en la entrada.</p>
    <template data-line-template><tr data-pid="__id__">
      <td class="cell-main"><strong>__name__</strong><div class="muted" style="font-size:12px">__code__</div><input type="hidden" name="items[__i__][product_id]" value="__id__"></td>
      <td data-label="Existencia">__available__</td>
      <td data-label="Cantidad"><div class="input-group has-addon"><input class="input input-sm" name="items[__i__][quantity]" inputmode="decimal" required data-focus style="width:130px"><span class="addon">__unit__</span></div></td>
      <td data-label="Costo"><input class="input input-sm" name="items[__i__][unit_cost]" inputmode="decimal" style="width:140px" placeholder="$"></td>
      <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-remove-line aria-label="Quitar"><svg class="icon icon-sm"><use href="#i-trash"></use></svg></button></td>
    </tr></template>
  </div>
  <div class="form-actions"><a class="btn btn-ghost" href="<?= e(url('/inventory')) ?>">Cancelar</a><button class="btn btn-primary" type="submit"><?= icon('check') ?> Registrar entrada</button></div>
</form>

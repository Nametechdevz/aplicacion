<div class="page-head">
  <div><div class="eyebrow">Transferencias</div><h1>Solicitar transferencia</h1><p>Seleccione el origen y el destino; el responsable del origen revisará, aprobará y despachará.</p></div>
</div>
<form method="post" action="<?= e(url('/transfers')) ?>" class="panel">
  <?= csrf_field() ?>
  <div class="form-section"><div class="form-grid">
    <div class="field col-6"><label for="t-from">Origen (desde)</label><select class="select" id="t-from" name="from_id" required>
      <?php foreach ($all as $b): ?><option value="<?= (int) $b['id'] ?>" <?= $b['type'] === 'warehouse' ? 'selected' : '' ?>><?= e($b['name']) ?><?= $b['type'] === 'warehouse' ? ' (almacén)' : '' ?></option><?php endforeach; ?></select>
      <span class="hint">Las existencias mostradas corresponden al origen.</span></div>
    <div class="field col-6"><label for="t-to">Destino (hacia)</label><select class="select" id="t-to" name="to_id" required>
      <?php foreach ($mine as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $to === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select></div>
    <div class="field col-12"><label for="t-notes">Motivo / observaciones</label><input class="input" id="t-notes" name="notes" maxlength="500" placeholder="Ej.: reposición por alta demanda"></div>
  </div></div>
  <div class="form-section" data-line-editor data-branch-source="#t-from">
    <h3>Productos</h3>
    <div class="global-search" style="width:100%;max-width:520px;margin:10px 0 14px"><?= icon('search') ?><input class="input" data-lookup placeholder="Agregar producto…" aria-label="Buscar producto" autocomplete="off"><div class="search-results hidden" data-lookup-results></div></div>
    <div class="table-wrap"><table class="table table-stack"><thead><tr><th>Producto</th><th>Disponible en origen</th><th>Cantidad solicitada</th><th></th></tr></thead><tbody data-lines></tbody></table></div>
    <p class="muted" data-lines-empty style="padding:10px 0">Agregue los productos que necesita.</p>
    <template data-line-template><tr data-pid="__id__">
      <td class="cell-main"><strong>__name__</strong><div class="muted" style="font-size:12px">__code__</div><input type="hidden" name="items[__i__][product_id]" value="__id__"></td>
      <td data-label="Disponible">__available__</td>
      <td data-label="Cantidad"><div class="input-group has-addon"><input class="input input-sm" name="items[__i__][quantity]" inputmode="decimal" required data-focus style="width:130px"><span class="addon">__unit__</span></div></td>
      <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-remove-line aria-label="Quitar"><svg class="icon icon-sm"><use href="#i-trash"></use></svg></button></td>
    </tr></template>
  </div>
  <div class="form-actions"><a class="btn btn-ghost" href="<?= e(url('/transfers')) ?>">Cancelar</a><button class="btn btn-primary" type="submit"><?= icon('transfer') ?> Enviar solicitud</button></div>
</form>

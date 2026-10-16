<?php $parents = array_filter($categories, fn ($c) => $c['parent_id'] === null); ?>
<div class="page-head">
  <div><div class="eyebrow">Catálogo</div><h1>Categorías, marcas y unidades</h1><p>Organización del catálogo. Las marcas las registra la empresa según los productos que comercializa.</p></div>
</div>
<div class="grid grid-12" style="align-items:start">
  <section class="panel span-6">
    <div class="panel-head"><div><h2>Categorías</h2><div class="sub">Un nivel de subcategoría</div></div><button class="btn btn-sm btn-primary" type="button" data-open="cat-new"><?= icon('plus', 'icon-sm') ?> Nueva</button></div>
    <div class="panel-body" style="padding:12px 0 0"><table class="table table-sm">
      <thead><tr><th>Nombre</th><th class="num">Productos</th><th>Estado</th><th></th></tr></thead>
      <tbody><?php foreach ($categories as $c): ?>
        <tr><td><?= $c['parent_id'] ? '<span class="faint" style="margin-right:6px">└</span>' : '' ?><strong style="font-weight:<?= $c['parent_id'] ? 500 : 700 ?>"><?= e($c['name']) ?></strong></td>
          <td class="num"><?= (int) $c['products'] ?></td><td><?= status_badge((int) $c['is_active'] ? 'active' : 'inactive') ?></td>
          <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-open="cat-<?= (int) $c['id'] ?>" aria-label="Editar"><?= icon('edit', 'icon-sm') ?></button></td></tr>
      <?php endforeach; ?><?php if (!$categories): ?><tr><td colspan="4" class="muted">Sin categorías.</td></tr><?php endif; ?></tbody>
    </table></div>
  </section>
  <div class="span-6 stack">
    <section class="panel">
      <div class="panel-head"><div><h2>Marcas</h2></div><button class="btn btn-sm btn-primary" type="button" data-open="brand-new"><?= icon('plus', 'icon-sm') ?> Nueva</button></div>
      <div class="panel-body" style="padding:12px 0 0"><table class="table table-sm">
        <thead><tr><th>Marca</th><th class="num">Productos</th><th>Estado</th><th></th></tr></thead>
        <tbody><?php foreach ($brands as $b): ?>
          <tr><td><strong><?= e($b['name']) ?></strong></td><td class="num"><?= (int) $b['products'] ?></td><td><?= status_badge((int) $b['is_active'] ? 'active' : 'inactive') ?></td>
            <td class="actions"><button class="btn btn-ghost btn-sm btn-icon" type="button" data-open="brand-<?= (int) $b['id'] ?>" aria-label="Editar"><?= icon('edit', 'icon-sm') ?></button></td></tr>
        <?php endforeach; ?><?php if (!$brands): ?><tr><td colspan="4" class="muted">Sin marcas.</td></tr><?php endif; ?></tbody>
      </table></div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2>Unidades de medida</h2><div class="sub">Conversiones explícitas; el inventario se descuenta siempre en la unidad base del producto.</div></div></div>
      <div class="panel-body">
        <div class="row wrap" style="gap:8px"><?php foreach ($units as $u): ?><span class="badge <?= (int) $u['allows_decimal'] ? 'badge-gold' : 'badge-neutral' ?> no-dot"><?= e($u['name']) ?> (<?= e($u['code']) ?>)<?= (int) $u['allows_decimal'] ? ' · hasta ' . (int) $u['max_precision'] . ' dec.' : ' · entera' ?></span><?php endforeach; ?></div>
        <dl class="dl mt-3"><?php foreach ($conversions as $c): ?><dt>1 <?= e($c['f']) ?></dt><dd><?= e(qty($c['factor'])) ?> <?= e($c['t']) ?></dd><?php endforeach; ?></dl>
      </div>
    </section>
  </div>
</div>
<?php foreach (array_merge([null], $categories) as $c): $id = $c ? 'cat-' . $c['id'] : 'cat-new'; ?>
<dialog class="modal modal-sm" id="<?= e($id) ?>"><form class="modal-card" method="post" action="<?= e(url('/catalog/categories')) ?>" data-ajax><?= csrf_field() ?>
  <input type="hidden" name="id" value="<?= (int) ($c['id'] ?? 0) ?: '' ?>">
  <div class="modal-head"><div><h2><?= $c ? 'Editar categoría' : 'Nueva categoría' ?></h2></div></div>
  <div class="modal-body stack" style="gap:14px">
    <div class="field"><label>Nombre</label><input class="input" name="name" required maxlength="80" value="<?= e($c['name'] ?? '') ?>"></div>
    <div class="field"><label>Pertenece a</label><select class="select" name="parent_id"><option value="">— Categoría principal —</option><?php foreach ($parents as $p): if ($c && (int) $p['id'] === (int) $c['id']) { continue; } ?><option value="<?= (int) $p['id'] ?>" <?= (int) ($c['parent_id'] ?? 0) === (int) $p['id'] ? 'selected' : '' ?>><?= e($p['name']) ?></option><?php endforeach; ?></select></div>
    <label class="switch"><input type="hidden" name="is_active" value="0"><input type="checkbox" name="is_active" value="1" <?= !$c || (int) $c['is_active'] ? 'checked' : '' ?>><span class="track"></span><span>Activa</span></label>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
</form></dialog>
<?php endforeach; ?>
<?php foreach (array_merge([null], $brands) as $b): $id = $b ? 'brand-' . $b['id'] : 'brand-new'; ?>
<dialog class="modal modal-sm" id="<?= e($id) ?>"><form class="modal-card" method="post" action="<?= e(url('/catalog/brands')) ?>" data-ajax><?= csrf_field() ?>
  <input type="hidden" name="id" value="<?= (int) ($b['id'] ?? 0) ?: '' ?>">
  <div class="modal-head"><div><h2><?= $b ? 'Editar marca' : 'Nueva marca' ?></h2></div></div>
  <div class="modal-body stack" style="gap:14px">
    <div class="field"><label>Nombre de la marca</label><input class="input" name="name" required maxlength="80" value="<?= e($b['name'] ?? '') ?>"></div>
    <label class="switch"><input type="hidden" name="is_active" value="0"><input type="checkbox" name="is_active" value="1" <?= !$b || (int) $b['is_active'] ? 'checked' : '' ?>><span class="track"></span><span>Activa</span></label>
  </div>
  <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
</form></dialog>
<?php endforeach; ?>

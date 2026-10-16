<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Inventario central</div><h1>Distribuir existencias</h1>
    <p>Indique cuánto enviar a cada sucursal. Al confirmar, se crea una transferencia por destino, se descuenta del almacén y la mercancía queda <strong>en tránsito</strong> hasta que la sucursal confirme la recepción.</p></div>
</div>
<?php if (!$warehouses): ?>
  <section class="panel"><?= View::partial('partials/empty', ['title' => 'Sin almacén disponible', 'text' => 'Necesita acceso a un almacén activo para distribuir.']) ?></section>
<?php elseif (!$stores): ?>
  <section class="panel"><?= View::partial('partials/empty', ['title' => 'Sin sucursales de destino', 'text' => 'Cree al menos un punto de venta activo.', 'action' => can('branches.manage') ? ['Ir a sucursales', '/branches', 'store'] : null]) ?></section>
<?php else: ?>
<form method="post" action="<?= e(url('/inventory/distribute')) ?>" class="panel" data-distribute data-confirm="¿Despachar la distribución?" data-confirm-text="Se descontarán las cantidades del almacén y quedarán en tránsito hacia cada sucursal." data-confirm-ok="Despachar">
  <?= csrf_field() ?>
  <div class="toolbar">
    <?php if (count($warehouses) > 1): ?>
      <select class="select" name="from_id" aria-label="Origen" data-from><?php foreach ($warehouses as $w): ?><option value="<?= (int) $w['id'] ?>" <?= (int) $w['id'] === $fromId ? 'selected' : '' ?>><?= e($w['name']) ?></option><?php endforeach; ?></select>
    <?php else: ?><input type="hidden" name="from_id" value="<?= (int) $fromId ?>"><span class="badge badge-gold no-dot"><?= icon('boxes', 'icon-sm') ?> Origen: <?= e($warehouses[0]['name']) ?></span><?php endif; ?>
    <div class="input-group grow"><?= icon('search') ?><input class="input" type="search" placeholder="Filtrar productos" data-filter aria-label="Filtrar productos"></div>
    <button class="btn" type="button" data-suggest title="Completa hasta 2 veces el mínimo de cada sucursal, sin superar lo disponible"><?= icon('sparkle', 'icon-sm') ?> Sugerir reposición</button>
    <button class="btn btn-ghost" type="button" data-reset>Limpiar</button>
  </div>
  <?php if (!$products): ?>
    <?= View::partial('partials/empty', ['title' => 'Almacén sin existencias', 'text' => 'Registre una compra o una entrada de mercancía antes de distribuir.', 'action' => can('purchases.manage') ? ['Nueva compra', '/purchases/create', 'truck'] : null]) ?>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table matrix">
      <thead><tr><th>Producto</th><th class="num">Disponible en almacén</th>
        <?php foreach ($stores as $s): ?><th><?= e($s['name']) ?></th><?php endforeach; ?>
        <th class="num">Restante</th></tr></thead>
      <tbody>
        <?php foreach ($products as $p): ?>
          <tr data-row data-available="<?= e($p['available']) ?>" data-name="<?= e(mb_strtolower($p['name'] . ' ' . $p['code'])) ?>" data-precision="<?= (int) $p['qty_precision'] ?>">
            <td><div class="cell-product" style="min-width:200px">
              <?php if ($p['thumb']): ?><img class="thumb" src="<?= e(upload_url($p['thumb'])) ?>" alt="" loading="lazy"><?php else: ?><span class="thumb" style="display:grid;place-items:center;color:var(--faint)"><?= icon('bottle', 'icon-sm') ?></span><?php endif; ?>
              <div><div class="name"><?= e($p['name']) ?></div><div class="sub"><?= e($p['code']) ?> · <?= e($p['unit']) ?></div></div></div></td>
            <td class="num"><strong><?= e(qty($p['available'], $p['unit'])) ?></strong></td>
            <?php foreach ($stores as $s): $st = $stock[(int) $p['id']][(int) $s['id']] ?? null; ?>
              <td>
                <input class="input" name="qty[<?= (int) $s['id'] ?>][<?= (int) $p['id'] ?>]" inputmode="decimal" placeholder="0" aria-label="Enviar a <?= e($s['name']) ?>"
                       data-current="<?= e($st['available'] ?? '0') ?>" data-min="<?= e($st['min_stock'] ?? '0') ?>">
                <div class="avail mt-1">tiene <?= e(qty($st['available'] ?? '0')) ?><?= $st && (float) $st['min_stock'] > 0 ? ' · mín ' . e(qty($st['min_stock'])) : '' ?></div>
              </td>
            <?php endforeach; ?>
            <td class="num remaining" data-remaining><?= e(qty($p['available'])) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <div class="panel-foot">
    <div class="field" style="flex:1;min-width:240px"><input class="input" name="notes" maxlength="400" placeholder="Nota para las sucursales (opcional)" aria-label="Nota"></div>
    <span class="muted" data-summary>Sin cantidades</span>
    <button class="btn btn-primary btn-lg" type="submit" data-submit disabled><?= icon('transfer') ?> Despachar distribución</button>
  </div>
  <?php endif; ?>
</form>
<?php endif; ?>

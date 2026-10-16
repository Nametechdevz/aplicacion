<?php
use App\Core\View;
$isWarehouse = $branch['type'] === 'warehouse';
?>
<div class="page-head">
  <div><div class="eyebrow"><?= $isWarehouse ? 'Inventario central' : 'Inventario de sucursal' ?></div><h1><?= e($branch['name']) ?></h1>
    <p>Existencias en unidad base. Disponible = existencia − reservado (transferencias aprobadas). En tránsito = despachado hacia esta sucursal sin recibir.</p></div>
  <div class="page-actions">
    <a class="btn" href="<?= e(url('/inventory/movements', ['branch' => $branch['id']])) ?>"><?= icon('history') ?> Movimientos</a>
    <?php if (can('inventory.adjust')): ?><a class="btn" href="<?= e(url('/inventory/count', ['branch' => $branch['id']])) ?>"><?= icon('list') ?> Conteo físico</a><?php endif; ?>
    <?php if (can('inventory.entry')): ?><a class="btn" href="<?= e(url('/inventory/entry')) ?>"><?= icon('download') ?> Entrada</a><?php endif; ?>
    <?php if (can('inventory.distribute') && $isWarehouse): ?><a class="btn btn-primary" href="<?= e(url('/inventory/distribute', ['from' => $branch['id']])) ?>"><?= icon('transfer') ?> Distribuir a sucursales</a>
    <?php elseif (can('transfers.request') && !$isWarehouse): ?><a class="btn btn-primary" href="<?= e(url('/transfers/create', ['to' => $branch['id']])) ?>"><?= icon('transfer') ?> Solicitar transferencia</a><?php endif; ?>
  </div>
</div>

<?php if (count($branches) > 1): ?>
<nav class="tabs panel mb-3" style="border-radius:var(--radius-lg)" aria-label="Sucursales">
  <?php foreach ($branches as $b): ?>
    <a href="<?= e(url('/inventory', ['branch' => $b['id']])) ?>" class="<?= (int) $b['id'] === (int) $branch['id'] ? 'is-active' : '' ?>"><?= icon($b['type'] === 'warehouse' ? 'boxes' : 'store', 'icon-sm') ?> <?= e($b['name']) ?></a>
  <?php endforeach; ?>
</nav>
<?php endif; ?>

<section class="panel mb-3">
  <div class="kpi-strip">
    <div class="kpi is-hero"><div class="kpi-label"><?= icon('boxes') ?>Valor del inventario</div><div class="kpi-value"><?= $showCost ? e(money($summary['value'])) : '—' ?></div><div class="kpi-foot"><?= $showCost ? 'Al costo · ' . e(money($summary['retail'])) . ' a precio de venta' : 'Requiere permiso de costos' ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('package') ?>Referencias con existencia</div><div class="kpi-value"><?= (int) $summary['items'] - (int) $summary['out_of_stock'] ?></div><div class="kpi-foot">de <?= (int) $summary['items'] ?> registradas</div></div>
    <a class="kpi" href="<?= e(url('/inventory', ['branch' => $branch['id'], 'status' => 'low'])) ?>"><div class="kpi-label"><?= icon('alert') ?>Bajo mínimo</div><div class="kpi-value text-warning"><?= (int) $summary['low'] ?></div><div class="kpi-foot">Ver productos →</div></a>
    <a class="kpi" href="<?= e(url('/inventory', ['branch' => $branch['id'], 'status' => 'out'])) ?>"><div class="kpi-label"><?= icon('x-circle') ?>Agotados</div><div class="kpi-value text-danger"><?= (int) $summary['out_of_stock'] ?></div><div class="kpi-foot"><?= (int) $summary['transit'] ?> con mercancía en tránsito</div></a>
  </div>
</section>

<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <input type="hidden" name="branch" value="<?= (int) $branch['id'] ?>">
    <div class="input-group grow"><?= icon('search') ?><input class="input" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Buscar producto o código" aria-label="Buscar en inventario"></div>
    <select class="select" name="category" aria-label="Categoría"><option value="">Todas las categorías</option><?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>" <?= (int) $filters['category'] === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select>
    <div class="segmented">
      <?php foreach (['' => 'Todos', 'low' => 'Bajo mínimo', 'out' => 'Agotados', 'transit' => 'En tránsito'] as $k => $l): ?>
        <a href="<?= e(query_with(['status' => $k, 'page' => null])) ?>" class="<?= $filters['status'] === $k ? 'is-active' : '' ?>"><?= e($l) ?></a>
      <?php endforeach; ?>
    </div>
  </form>
  <?php if (!$rows): ?>
    <?= View::partial('partials/empty', ['title' => 'Sin productos', 'text' => 'No hay productos que coincidan con estos filtros.']) ?>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table table-stack">
      <thead><tr><th>Producto</th><th class="num">Existencia</th><th class="num">Reservado</th><th class="num">Disponible</th><th class="num">En tránsito</th><th>Nivel</th><?php if ($showCost): ?><th class="num">Valor</th><?php endif; ?><th></th></tr></thead>
      <tbody>
        <?php foreach ($rows as $r):
          $avail = (float) $r['quantity'] - (float) $r['reserved'];
          $min = (float) $r['min_stock'];
          $cls = $avail <= 0 ? 'is-out' : ($min > 0 && $avail <= $min ? 'is-low' : '');
          $pctBar = $min > 0 ? min(100, max(4, ($avail / ($min * 3)) * 100)) : ($avail > 0 ? 100 : 0); ?>
          <tr>
            <td class="cell-main"><div class="cell-product">
              <?php if ($r['thumb']): ?><img class="thumb" src="<?= e(upload_url($r['thumb'])) ?>" alt="" loading="lazy"><?php else: ?><span class="thumb" style="display:grid;place-items:center;color:var(--faint)"><?= icon('bottle', 'icon-sm') ?></span><?php endif; ?>
              <div><a class="name" href="<?= e(url('/products/' . $r['id'])) ?>"><?= e($r['name']) ?></a><div class="sub"><?= e($r['code']) ?><?= $r['brand'] ? ' · ' . e($r['brand']) : '' ?></div></div></div></td>
            <td class="num" data-label="Existencia"><strong><?= e(qty($r['quantity'], $r['unit'])) ?></strong></td>
            <td class="num" data-label="Reservado"><?= (float) $r['reserved'] > 0 ? e(qty($r['reserved'])) : '<span class="faint">—</span>' ?></td>
            <td class="num" data-label="Disponible"><span class="p-stock <?= $cls ?>"><?= e(qty((string) $avail, $r['unit'])) ?></span></td>
            <td class="num" data-label="En tránsito"><?= (float) $r['in_transit'] > 0 ? '<span class="badge badge-info no-dot">' . e(qty($r['in_transit'])) . '</span>' : '<span class="faint">—</span>' ?></td>
            <td data-label="Nivel" class="nowrap"><span class="stock-meter <?= $cls ?>" title="Mínimo: <?= e(qty($r['min_stock'])) ?>"><span style="width:<?= (int) $pctBar ?>%"></span></span> <span class="muted" style="font-size:11.5px"><?= $min > 0 ? 'mín. ' . e(qty($r['min_stock'])) : 'sin mínimo' ?></span></td>
            <?php if ($showCost): ?><td class="num" data-label="Valor"><?= e(money((string) (max(0, (float) $r['quantity']) * (float) $r['cost']))) ?></td><?php endif; ?>
            <td class="actions">
              <?php if (can('inventory.adjust')): ?>
                <button class="btn btn-ghost btn-sm" type="button" data-open="adjust-modal" data-adjust='<?= e(json_encode(['id' => (int) $r['id'], 'name' => $r['name'], 'unit' => $r['unit'], 'qty' => $r['quantity'], 'min' => $r['min_stock'], 'precision' => (int) $r['qty_precision']])) ?>'><?= icon('edit', 'icon-sm') ?> Ajustar</button>
              <?php elseif (can('inventory.distribute')): ?>
                <button class="btn btn-ghost btn-sm" type="button" data-open="min-modal" data-adjust='<?= e(json_encode(['id' => (int) $r['id'], 'name' => $r['name'], 'unit' => $r['unit'], 'min' => $r['min_stock']])) ?>'>Mínimo</button>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

<?php if (can('inventory.adjust')): ?>
<dialog class="modal" id="adjust-modal" aria-labelledby="adj-title">
  <div class="modal-card">
    <div class="modal-head"><div><h2 id="adj-title">Ajustar inventario</h2><p data-adj-name></p></div><button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <form class="modal-body form-grid" method="post" action="<?= e(url('/inventory/adjust')) ?>" id="adjust-form">
      <?= csrf_field() ?><input type="hidden" name="branch_id" value="<?= (int) $branch['id'] ?>"><input type="hidden" name="product_id" data-adj-id>
      <div class="field col-12"><span class="label">Existencia actual: <strong data-adj-current></strong></span></div>
      <div class="field col-12"><span class="label">Tipo de movimiento</span>
        <div class="segmented"><label><input type="radio" name="type" value="adjustment" checked><span>Ajuste</span></label><label><input type="radio" name="type" value="waste"><span>Merma / pérdida</span></label><label><input type="radio" name="type" value="count"><span>Conteo</span></label></div></div>
      <div class="field col-6"><label for="adj-mode">Operación</label><select class="select" id="adj-mode" name="mode"><option value="set">Fijar existencia en</option><option value="in">Sumar</option><option value="out">Restar</option></select></div>
      <div class="field col-6"><label for="adj-qty">Cantidad <span class="muted" data-adj-unit></span></label><input class="input" id="adj-qty" name="quantity" inputmode="decimal" required></div>
      <div class="field col-12"><label for="adj-reason">Motivo<span class="req">*</span></label><input class="input" id="adj-reason" name="reason" required minlength="4" maxlength="255" placeholder="Ej.: frasco roto en exhibición, diferencia de conteo"></div>
      <div class="col-12 callout callout-info"><?= icon('shield', 'icon-sm') ?><span>Queda registrado con saldo anterior, saldo posterior, usuario y motivo.</span></div>
    </form>
    <form class="modal-body form-grid" method="post" action="<?= e(url('/inventory/min-stock')) ?>" style="border-top:1px solid var(--line)">
      <?= csrf_field() ?><input type="hidden" name="branch_id" value="<?= (int) $branch['id'] ?>"><input type="hidden" name="product_id" data-adj-id>
      <div class="field col-8"><label for="adj-min">Stock mínimo de alerta</label><input class="input" id="adj-min" name="min_stock" inputmode="decimal" data-adj-min></div>
      <div class="field col-4" style="justify-content:flex-end"><button class="btn" type="submit">Guardar mínimo</button></div>
    </form>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit" form="adjust-form">Registrar ajuste</button></div>
  </div>
</dialog>
<?php elseif (can('inventory.distribute')): ?>
<dialog class="modal modal-sm" id="min-modal">
  <form class="modal-card" method="post" action="<?= e(url('/inventory/min-stock')) ?>">
    <?= csrf_field() ?><input type="hidden" name="branch_id" value="<?= (int) $branch['id'] ?>"><input type="hidden" name="product_id" data-adj-id>
    <div class="modal-head"><div><h2>Stock mínimo</h2><p data-adj-name></p></div></div>
    <div class="modal-body"><div class="field"><label>Mínimo de alerta</label><input class="input" name="min_stock" inputmode="decimal" data-adj-min></div></div>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form>
</dialog>
<?php endif; ?>
<script src="<?= e(asset('js/inventory.js')) ?>" defer></script>

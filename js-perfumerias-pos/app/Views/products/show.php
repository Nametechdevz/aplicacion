<?php
use App\Core\View;
$unit = $p['unit_code'];
$total = array_sum(array_map(fn ($s) => (float) $s['quantity'], $stock));
$primary = $images[0] ?? null;
?>
<div class="page-head">
  <div>
    <div class="eyebrow"><?= e($p['brand_name'] ?? 'Sin marca') ?> · <?= e($p['code']) ?></div>
    <h1><?= e($p['name']) ?></h1>
    <p><?= e($p['category_name'] ?? 'Sin categoría') ?><?= $p['subcategory_name'] ? ' / ' . e($p['subcategory_name']) : '' ?> · Actualizado <?= e(fmt_dt($p['updated_at'])) ?></p>
  </div>
  <div class="page-actions">
    <?php if (can('products.manage')): ?>
      <form method="post" action="<?= e(url('/products/' . $p['id'] . '/toggle')) ?>" data-confirm="<?= (int) $p['is_active'] ? '¿Desactivar producto?' : '¿Activar producto?' ?>" data-confirm-text="<?= (int) $p['is_active'] ? 'Dejará de mostrarse en el punto de venta. Su historial se conserva.' : 'Volverá a estar disponible para la venta.' ?>">
        <?= csrf_field() ?><button class="btn" type="submit"><?= icon('power') ?> <?= (int) $p['is_active'] ? 'Desactivar' : 'Activar' ?></button>
      </form>
      <a class="btn btn-primary" href="<?= e(url('/products/' . $p['id'] . '/edit')) ?>"><?= icon('edit') ?> Editar</a>
    <?php endif; ?>
  </div>
</div>

<div class="grid grid-12" style="align-items:start">
  <div class="span-4 stack">
    <section class="panel" style="overflow:hidden">
      <div class="p-media" style="aspect-ratio:1">
        <?php if ($primary): ?><img src="<?= e(upload_url($primary['file_name'])) ?>" alt="<?= e($p['name']) ?>"><?php else: ?><?= View::partial('partials/placeholder') ?><?php endif; ?>
      </div>
      <?php if (count($images) > 1): ?>
        <div class="gallery" style="padding:12px;grid-template-columns:repeat(4,1fr);gap:8px">
          <?php foreach (array_slice($images, 1) as $img): ?><div class="g-item"><img src="<?= e(upload_url($img['thumb_name'])) ?>" alt="" loading="lazy"></div><?php endforeach; ?>
        </div>
      <?php endif; ?>
      <div class="panel-body">
        <dl class="dl">
          <dt>Estado</dt><dd><?= status_badge((int) $p['is_active'] ? 'active' : 'inactive') ?></dd>
          <dt>Precio</dt><dd><?= e(money($p['price'])) ?><?= $p['sale_mode'] === 'fractional' ? ' / ' . e($unit) : '' ?></dd>
          <?php if ($showCost): ?>
            <dt>Costo vigente</dt><dd><?= e(money($p['cost'], (float) $p['cost'] < 100)) ?></dd>
            <dt>Margen</dt><dd><?= (float) $p['price'] > 0 ? e(pct((((float) $p['price'] - (float) $p['cost']) / (float) $p['price']) * 100)) : '—' ?></dd>
          <?php endif; ?>
          <dt>Precio mínimo</dt><dd><?= $p['min_price'] !== null ? e(money($p['min_price'])) : '—' ?></dd>
          <dt>Desc. máximo</dt><dd><?= $p['max_discount_pct'] !== null ? e(pct($p['max_discount_pct'])) : 'Según rol' ?></dd>
          <dt>Unidad base</dt><dd><?= e($p['unit_name']) ?> (<?= e($unit) ?>)</dd>
          <dt>Forma de venta</dt><dd><?= $p['sale_mode'] === 'fractional' ? 'Fraccionable · ' . (int) $p['qty_precision'] . ' decimales' : 'Por unidad' ?></dd>
          <?php if ($p['container_content']): ?><dt>Envase</dt><dd><?= e(($p['container_label'] ?: 'Envase') . ' · ' . qty($p['container_content'], $unit)) ?></dd><?php endif; ?>
          <dt>SKU</dt><dd><?= e($p['sku'] ?: '—') ?></dd>
          <dt>Código de barras</dt><dd><?= e($p['barcode'] ?: '—') ?></dd>
        </dl>
        <?php if ($p['description']): ?><p class="muted mt-3" style="font-size:13px"><?= nl2br(e($p['description'])) ?></p><?php endif; ?>
      </div>
    </section>
  </div>

  <div class="span-8 stack">
    <section class="panel">
      <div class="panel-head"><div><h2>Existencias por sucursal</h2><div class="sub">Total físico: <?= e(qty((string) $total, $unit)) ?></div></div>
        <?php if (can('inventory.distribute')): ?><a class="btn btn-sm" href="<?= e(url('/inventory/distribute', ['product' => $p['id']])) ?>"><?= icon('transfer', 'icon-sm') ?> Distribuir</a><?php endif; ?></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-stack">
          <thead><tr><th>Sucursal</th><th class="num">Existencia</th><th class="num">Reservado</th><th class="num">Disponible</th><th class="num">En tránsito</th><th class="num">Mínimo</th></tr></thead>
          <tbody>
            <?php foreach ($stock as $s): $avail = (float) $s['quantity'] - (float) $s['reserved'];
              $cls = $avail <= 0 ? 'is-out' : ((float) $s['min_stock'] > 0 && $avail <= (float) $s['min_stock'] ? 'is-low' : ''); ?>
              <tr>
                <td class="cell-main"><div class="row"><?= icon($s['type'] === 'warehouse' ? 'boxes' : 'store', 'icon-sm muted') ?><strong><?= e($s['name']) ?></strong></div></td>
                <td class="num" data-label="Existencia"><?= e(qty($s['quantity'], $unit)) ?></td>
                <td class="num" data-label="Reservado"><?= e(qty($s['reserved'])) ?></td>
                <td class="num" data-label="Disponible"><span class="p-stock <?= $cls ?>"><?= e(qty((string) $avail, $unit)) ?></span></td>
                <td class="num" data-label="En tránsito"><?= e(qty($s['in_transit'])) ?></td>
                <td class="num" data-label="Mínimo"><?= e(qty($s['min_stock'])) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    </section>

    <?php if ($variants): ?>
    <section class="panel">
      <div class="panel-head"><div><h2>Presentaciones</h2><div class="sub">Cada una descuenta la cantidad indicada del inventario base.</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-stack">
          <thead><tr><th>Presentación</th><th class="num">Consume</th><th class="num">Precio</th><th class="num">Equivale a</th><th>SKU / código</th><th>Estado</th></tr></thead>
          <tbody><?php foreach ($variants as $vr): ?>
            <tr>
              <td class="cell-main"><strong><?= e($vr['name']) ?></strong></td>
              <td class="num" data-label="Consume"><?= e(qty($vr['base_qty'], $unit)) ?></td>
              <td class="num" data-label="Precio"><?= e(money($vr['price'])) ?></td>
              <td class="num" data-label="Equivale a"><?= e(money((string) round((float) $vr['price'] / max(0.001, (float) $vr['base_qty'])))) ?> / <?= e($unit) ?></td>
              <td data-label="SKU / código"><?= e($vr['sku'] ?: '—') ?><div class="muted" style="font-size:12px"><?= e($vr['barcode'] ?: '') ?></div></td>
              <td data-label="Estado"><?= status_badge((int) $vr['is_active'] ? 'active' : 'inactive') ?></td>
            </tr>
          <?php endforeach; ?></tbody>
        </table>
      </div>
    </section>
    <?php endif; ?>

    <section class="panel">
      <div class="panel-head"><div><h2>Últimos movimientos</h2><div class="sub">Saldo anterior y posterior en <?= e($p['unit_name']) ?>s</div></div>
        <a class="btn btn-ghost btn-sm" href="<?= e(url('/inventory/movements', ['product' => $p['id']])) ?>">Ver todos</a></div>
      <div class="panel-body" style="padding:12px 0 0">
        <?php if (!$movements): ?><p class="muted" style="padding:0 20px 20px">Sin movimientos registrados.</p><?php else: ?>
        <table class="table table-stack table-sm">
          <thead><tr><th>Fecha</th><th>Sucursal</th><th>Movimiento</th><th class="num">Cantidad</th><th class="num">Saldo</th><th>Usuario</th></tr></thead>
          <tbody><?php foreach ($movements as $m): $pos = (float) $m['quantity'] >= 0; ?>
            <tr>
              <td data-label="Fecha" class="nowrap"><?= e(fmt_dt($m['created_at'])) ?></td>
              <td data-label="Sucursal"><?= e($m['branch_name']) ?></td>
              <td data-label="Movimiento"><?= e(movement_label($m['type'])) ?><div class="muted" style="font-size:12px"><?= e($m['notes'] ?? '') ?></div></td>
              <td class="num <?= $pos ? 'text-success' : 'text-danger' ?>" data-label="Cantidad"><?= $pos ? '+' : '' ?><?= e(qty($m['quantity'])) ?></td>
              <td class="num" data-label="Saldo"><span class="muted"><?= e(qty($m['balance_before'])) ?> →</span> <strong><?= e(qty($m['balance_after'])) ?></strong></td>
              <td data-label="Usuario"><?= e($m['user_name'] ?? '—') ?></td>
            </tr>
          <?php endforeach; ?></tbody>
        </table>
        <?php endif; ?>
      </div>
    </section>

    <?php if ($history): ?>
    <section class="panel">
      <div class="panel-head"><div><h2>Historial de precios y costos</h2><div class="sub">Las ventas registradas conservan el precio vigente al momento de la venta.</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <table class="table table-stack table-sm">
          <thead><tr><th>Fecha</th><th>Campo</th><th class="num">Anterior</th><th class="num">Nuevo</th><th>Origen</th><th>Usuario</th></tr></thead>
          <tbody><?php foreach ($history as $h): ?>
            <tr>
              <td data-label="Fecha" class="nowrap"><?= e(fmt_dt($h['created_at'])) ?></td>
              <td data-label="Campo"><?= e(['price' => 'Precio', 'cost' => 'Costo', 'min_price' => 'Precio mínimo'][$h['field']] ?? $h['field']) ?><?= $h['variant_name'] ? ' · ' . e($h['variant_name']) : '' ?></td>
              <td class="num" data-label="Anterior"><?= $h['old_value'] !== null ? e(money($h['old_value'])) : '—' ?></td>
              <td class="num" data-label="Nuevo"><strong><?= $h['new_value'] !== null ? e(money($h['new_value'])) : '—' ?></strong></td>
              <td data-label="Origen"><?= e(['manual' => 'Edición manual', 'purchase' => 'Recepción de compra', 'create' => 'Creación', 'entry' => 'Entrada de mercancía'][$h['source']] ?? $h['source']) ?></td>
              <td data-label="Usuario"><?= e($h['user_name'] ?? '—') ?></td>
            </tr>
          <?php endforeach; ?></tbody>
        </table>
      </div>
    </section>
    <?php endif; ?>
  </div>
</div>

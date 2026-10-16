<?php use App\Core\View;
$types = ['initial', 'entry', 'purchase_receipt', 'supplier_return', 'sale', 'sale_void', 'customer_return', 'transfer_out', 'transfer_in', 'transfer_return', 'adjustment', 'count', 'waste']; ?>
<div class="page-head">
  <div><div class="eyebrow">Inventario</div><h1>Movimientos de inventario</h1><p><?= $productName ? 'Producto: ' . e($productName) . ' · ' : '' ?>Trazabilidad completa en unidad base: cada movimiento conserva saldo anterior y posterior.</p></div>
</div>
<section class="panel">
  <form class="toolbar" method="get" data-autosubmit>
    <?php if ($filters['product']): ?><input type="hidden" name="product" value="<?= (int) $filters['product'] ?>"><?php endif; ?>
    <select class="select" name="branch" aria-label="Sucursal"><option value="">Todas las sucursales</option><?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $filters['branch'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select>
    <select class="select" name="type" aria-label="Tipo"><option value="">Todos los tipos</option><?php foreach ($types as $t): ?><option value="<?= $t ?>" <?= $filters['type'] === $t ? 'selected' : '' ?>><?= e(movement_label($t)) ?></option><?php endforeach; ?></select>
    <input class="input" type="date" name="from" value="<?= e($filters['from']) ?>" aria-label="Desde" style="width:160px">
    <input class="input" type="date" name="to" value="<?= e($filters['to']) ?>" aria-label="Hasta" style="width:160px">
    <button class="btn" type="submit">Aplicar</button>
    <?php if ($filters['product']): ?><a class="btn btn-ghost" href="<?= e(url('/inventory/movements')) ?>">Quitar producto</a><?php endif; ?>
  </form>
  <?php if (!$rows): ?><?= View::partial('partials/empty', ['title' => 'Sin movimientos', 'text' => 'No hay movimientos con esos filtros.']) ?><?php else: ?>
  <div class="table-wrap"><table class="table table-stack">
    <thead><tr><th>Fecha</th><th>Producto</th><th>Sucursal</th><th>Movimiento</th><th class="num">Cantidad</th><th class="num">Saldo anterior</th><th class="num">Saldo posterior</th><th>Usuario</th></tr></thead>
    <tbody><?php foreach ($rows as $m): $pos = (float) $m['quantity'] >= 0; ?>
      <tr>
        <td data-label="Fecha" class="nowrap"><?= e(fmt_dt($m['created_at'])) ?></td>
        <td class="cell-main"><a href="<?= e(url('/products/' . $m['product_id'])) ?>"><strong><?= e($m['product']) ?></strong></a><div class="muted" style="font-size:12px"><?= e($m['code']) ?></div></td>
        <td data-label="Sucursal"><?= e($m['branch']) ?></td>
        <td data-label="Movimiento"><?= e(movement_label($m['type'])) ?><div class="muted" style="font-size:12px"><?= e($m['notes'] ?? '') ?></div></td>
        <td class="num <?= $pos ? 'text-success' : 'text-danger' ?>" data-label="Cantidad"><strong><?= $pos ? '+' : '' ?><?= e(qty($m['quantity'], $m['unit'])) ?></strong></td>
        <td class="num" data-label="Saldo anterior"><?= e(qty($m['balance_before'])) ?></td>
        <td class="num" data-label="Saldo posterior"><?= e(qty($m['balance_after'])) ?></td>
        <td data-label="Usuario"><?= e($m['user_name'] ?? 'Sistema') ?></td>
      </tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

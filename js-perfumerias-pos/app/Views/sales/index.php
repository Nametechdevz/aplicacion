<?php use App\Core\View; ?>
<div class="page-head">
  <div><div class="eyebrow">Comercial</div><h1>Historial de ventas</h1>
    <p><?= e(date('d/m/Y', strtotime($filters['from']))) ?> — <?= e(date('d/m/Y', strtotime($filters['to']))) ?><?= can('sales.view_branch') ? '' : ' · solo sus ventas' ?></p></div>
  <div class="page-actions">
    <?php if (can('reports.export')): ?><a class="btn" href="<?= e(url('/reports', ['type' => 'sales_period', 'from' => $filters['from'], 'to' => $filters['to']])) ?>"><?= icon('chart') ?> Reportes</a><?php endif; ?>
    <?php if (can('pos.sell')): ?><a class="btn btn-primary" href="<?= e(url('/pos')) ?>"><?= icon('scan') ?> Nueva venta</a><?php endif; ?>
  </div>
</div>

<section class="panel mb-3">
  <form method="get" class="panel-body filter-bar" style="padding:16px 20px">
    <div class="field grow"><label for="f-q">Buscar</label><div class="input-group"><?= icon('search') ?><input class="input" id="f-q" type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Comprobante, cliente o documento"></div></div>
    <div class="field"><label for="f-from">Desde</label><input class="input" id="f-from" type="date" name="from" value="<?= e($filters['from']) ?>"></div>
    <div class="field"><label for="f-to">Hasta</label><input class="input" id="f-to" type="date" name="to" value="<?= e($filters['to']) ?>"></div>
    <?php if (count($branches) > 1): ?>
    <div class="field"><label for="f-branch">Sucursal</label><select class="select" id="f-branch" name="branch"><option value="">Todas</option>
      <?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $filters['branch'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select></div>
    <?php endif; ?>
    <?php if ($sellers): ?>
    <div class="field"><label for="f-user">Vendedor</label><select class="select" id="f-user" name="user"><option value="">Todos</option>
      <?php foreach ($sellers as $s): ?><option value="<?= (int) $s['id'] ?>" <?= (int) $filters['user'] === (int) $s['id'] ? 'selected' : '' ?>><?= e($s['name']) ?></option><?php endforeach; ?></select></div>
    <?php endif; ?>
    <div class="field"><label for="f-method">Medio de pago</label><select class="select" id="f-method" name="method"><option value="">Todos</option>
      <?php foreach ($methods as $m): ?><option value="<?= (int) $m['id'] ?>" <?= (int) $filters['method'] === (int) $m['id'] ? 'selected' : '' ?>><?= e($m['name']) ?></option><?php endforeach; ?></select></div>
    <div class="field"><label for="f-status">Estado</label><select class="select" id="f-status" name="status"><option value="">Todos</option>
      <option value="completed" <?= $filters['status'] === 'completed' ? 'selected' : '' ?>>Completadas</option><option value="voided" <?= $filters['status'] === 'voided' ? 'selected' : '' ?>>Anuladas</option></select></div>
    <label class="check" style="height:42px"><input type="checkbox" name="discount" value="1" <?= $filters['discount'] === '1' ? 'checked' : '' ?>> Con descuento</label>
    <div class="row"><button class="btn btn-primary" type="submit"><?= icon('filter') ?> Filtrar</button><a class="btn btn-ghost" href="<?= e(url('/sales')) ?>">Limpiar</a></div>
  </form>
  <div class="mini-stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="mini-stat"><div class="label">Ventas completadas</div><div class="value"><?= number_format((int) $summary['completed'], 0, ',', '.') ?></div></div>
    <div class="mini-stat"><div class="label">Facturado</div><div class="value"><?= e(money($summary['total'])) ?></div></div>
    <div class="mini-stat"><div class="label">Descuentos concedidos</div><div class="value"><?= e(money($summary['discounts'])) ?></div></div>
    <div class="mini-stat"><div class="label">Anuladas</div><div class="value"><?= (int) $summary['voided'] ?></div></div>
  </div>
</section>

<section class="panel">
  <?php if (!$rows): ?>
    <?= View::partial('partials/empty', ['title' => 'Sin ventas en el periodo', 'text' => 'Ajuste las fechas o los filtros para ver otras transacciones.']) ?>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table table-stack">
      <thead><tr><th>Comprobante</th><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th>Pago</th><th class="num">Descuento</th><th class="num">Total</th><th>Estado</th></tr></thead>
      <tbody>
        <?php foreach ($rows as $s): ?>
          <tr class="is-clickable" data-sale="<?= (int) $s['id'] ?>" data-href="<?= e(url('/sales/' . $s['id'])) ?>" tabindex="0">
            <td class="cell-main nowrap"><strong><?= e($s['number']) ?></strong><div class="muted" style="font-size:12px"><?= (int) $s['items_count'] ?> artículo<?= (int) $s['items_count'] === 1 ? '' : 's' ?></div></td>
            <td data-label="Fecha" class="nowrap"><?= e(fmt_dt($s['created_at'])) ?></td>
            <td data-label="Vendedor"><?= e($s['seller']) ?><div class="muted" style="font-size:12px"><?= e($s['branch_name']) ?></div></td>
            <td data-label="Cliente"><?= e($s['customer'] ?? 'General') ?></td>
            <td data-label="Pago"><span class="truncate" style="display:inline-block;max-width:160px"><?= e($s['methods'] ?? '—') ?></span></td>
            <td class="num" data-label="Descuento"><?= (float) $s['discount_total'] > 0 ? '<span class="text-gold">− ' . e(money($s['discount_total'])) . '</span>' : '<span class="faint">—</span>' ?></td>
            <td class="num" data-label="Total"><strong><?= e(money($s['total'])) ?></strong></td>
            <td data-label="Estado"><?= status_badge($s['status']) ?><?= (int) $s['returns_count'] ? ' <span class="badge badge-info no-dot">Devolución</span>' : '' ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
  <?php if ($total > $per): ?><div class="panel-foot"><?= View::partial('partials/pagination', ['total' => $total, 'page' => $page, 'per' => $per]) ?></div><?php endif; ?>
</section>

<dialog class="drawer" id="sale-drawer" aria-labelledby="sale-drawer-title">
  <div class="drawer-inner">
    <div class="drawer-head"><div><div class="eyebrow" style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-strong)">Detalle de venta</div><h2 id="sale-drawer-title" style="font-size:20px" data-drawer-title>—</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar"><?= icon('x') ?></button></div>
    <div class="drawer-body" data-drawer-body></div>
  </div>
</dialog>

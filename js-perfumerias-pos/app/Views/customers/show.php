<?php use App\Core\View; ?>
<div class="page-head">
  <div class="row" style="gap:16px">
    <span class="avatar avatar-lg"><?= e(initials($c['full_name'])) ?></span>
    <div><div class="eyebrow">Cliente</div><h1><?= e($c['full_name']) ?></h1><p>Registrado el <?= e(fmt_date($c['created_at'])) ?><?= $c['branch_name'] ? ' en ' . e($c['branch_name']) : '' ?></p></div>
  </div>
  <div class="page-actions"><?php if (can('customers.manage')): ?><button class="btn" type="button" data-open="customer-edit"><?= icon('edit') ?> Editar</button><?php endif; ?></div>
</div>
<section class="panel mb-3">
  <div class="kpi-strip">
    <div class="kpi is-hero"><div class="kpi-label"><?= icon('receipt') ?>Total comprado</div><div class="kpi-value"><?= e(money($stats['total'])) ?></div><div class="kpi-foot">Ventas completadas en sus sucursales</div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('cart') ?>Compras</div><div class="kpi-value"><?= (int) $stats['n'] ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('tag') ?>Ticket promedio</div><div class="kpi-value"><?= e(money($stats['avg'])) ?></div></div>
    <div class="kpi"><div class="kpi-label"><?= icon('clock') ?>Última compra</div><div class="kpi-value" style="font-size:20px"><?= e($stats['last'] ? fmt_date($stats['last']) : '—') ?></div></div>
  </div>
</section>
<div class="grid grid-12" style="align-items:start">
  <div class="span-4 stack">
    <section class="panel"><div class="panel-head"><h2>Datos de contacto</h2></div><div class="panel-body">
      <dl class="dl">
        <dt>Documento</dt><dd><?= e(trim(($c['document_type'] ?? '') . ' ' . ($c['document_number'] ?? '')) ?: '—') ?></dd>
        <dt>Teléfono</dt><dd><?= e($c['phone'] ?: '—') ?></dd>
        <dt>Correo</dt><dd><?= e($c['email'] ?: '—') ?></dd>
      </dl>
      <?php if ($c['preferences']): ?><div class="label mt-3">Preferencias</div><p class="mt-1"><?= e($c['preferences']) ?></p><?php endif; ?>
      <?php if ($c['notes']): ?><div class="label mt-3">Observaciones</div><p class="mt-1 muted"><?= e($c['notes']) ?></p><?php endif; ?>
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Productos preferidos</h2></div><div class="panel-body">
      <?php if (!$favorites): ?><p class="muted">Sin compras registradas.</p><?php else: ?>
      <ul class="rank"><?php foreach ($favorites as $f): ?><li><div class="info"><strong><?= e($f['product_name']) ?></strong><small><?= (int) $f['times'] ?> veces · <?= e(qty($f['qty'], $f['unit'])) ?></small></div></li><?php endforeach; ?></ul>
      <?php endif; ?>
    </div></section>
    <section class="panel"><div class="panel-body"><div class="callout callout-gold"><?= icon('sparkle', 'icon-sm') ?><span>Programa de fidelización preparado: se activará cuando la empresa defina sus reglas de puntos. No se generan saldos sin reglas.</span></div></div></section>
  </div>
  <section class="panel span-8">
    <div class="panel-head"><div><h2>Historial de compras</h2><div class="sub">Últimas 50 ventas</div></div></div>
    <div class="panel-body" style="padding:12px 0 0">
      <?php if (!$sales): ?><?= View::partial('partials/empty', ['title' => 'Sin compras', 'text' => 'Este cliente aún no tiene ventas asociadas.']) ?><?php else: ?>
      <table class="table table-stack">
        <thead><tr><th>Comprobante</th><th>Fecha</th><th>Sucursal</th><th>Vendedor</th><th class="num">Total</th><th>Estado</th></tr></thead>
        <tbody><?php foreach ($sales as $s): ?>
          <tr class="is-clickable" data-href="<?= e(url('/sales/' . $s['id'])) ?>">
            <td class="cell-main"><strong><?= e($s['number']) ?></strong> <span class="muted">· <?= (int) $s['items_count'] ?> art.</span></td>
            <td data-label="Fecha"><?= e(fmt_dt($s['created_at'])) ?></td>
            <td data-label="Sucursal"><?= e($s['branch_name']) ?></td>
            <td data-label="Vendedor"><?= e($s['seller']) ?></td>
            <td class="num" data-label="Total"><strong><?= e(money($s['total'])) ?></strong></td>
            <td data-label="Estado"><?= status_badge($s['status']) ?></td>
          </tr>
        <?php endforeach; ?></tbody>
      </table>
      <?php endif; ?>
    </div>
  </section>
</div>
<?php if (can('customers.manage')): ?><?= View::partial('customers/form-modal', ['id' => 'customer-edit', 'c' => $c]) ?><?php endif; ?>

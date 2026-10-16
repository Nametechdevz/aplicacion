<?php
/** Panel ejecutivo. Los datos se pintan con dashboard.js a partir del JSON inicial. */
$ranges = ['today' => 'Hoy', '7d' => '7 días', '30d' => '30 días', 'month' => 'Este mes', 'year' => 'Este año'];
$hour = (int) (local_dt(gmdate('Y-m-d H:i:s'))?->format('G') ?? 12);
$greeting = $hour < 12 ? 'Buenos días' : ($hour < 19 ? 'Buenas tardes' : 'Buenas noches');
$firstName = explode(' ', \App\Core\Auth::user()['name'])[0];
?>
<div class="page-head">
  <div>
    <div class="eyebrow"><?= e($greeting) ?>, <?= e($firstName) ?></div>
    <h1>Resumen del negocio</h1>
    <p data-range-label><?= e(date('d/m/Y', strtotime($filters['from']))) ?> — <?= e(date('d/m/Y', strtotime($filters['to']))) ?></p>
  </div>
  <div class="page-actions">
    <?php if (can('pos.sell')): ?>
      <a class="btn" href="<?= e(url('/pos')) ?>"><?= icon('scan') ?> Punto de venta</a>
    <?php endif; ?>
    <?php if (can('reports.view')): ?>
      <a class="btn btn-primary" href="<?= e(url('/reports')) ?>"><?= icon('chart') ?> Reportes</a>
    <?php endif; ?>
  </div>
</div>

<form class="panel mb-3" data-dashboard-filters method="get" action="<?= e(url('/')) ?>">
  <div class="toolbar" style="border-bottom:0">
    <div class="segmented" role="radiogroup" aria-label="Periodo">
      <?php foreach ($ranges as $k => $label): ?>
        <label><input type="radio" name="range" value="<?= e($k) ?>" <?= $filters['range'] === $k ? 'checked' : '' ?>><span><?= e($label) ?></span></label>
      <?php endforeach; ?>
      <label><input type="radio" name="range" value="custom" <?= $filters['range'] === 'custom' ? 'checked' : '' ?>><span><?= icon('calendar', 'icon-sm') ?>&nbsp;Personalizado</span></label>
    </div>
    <div class="row <?= $filters['range'] === 'custom' ? '' : 'hidden' ?>" data-custom-range>
      <input class="input input-sm" type="date" name="from" value="<?= e($filters['from']) ?>" aria-label="Desde" style="width:150px">
      <span class="muted">—</span>
      <input class="input input-sm" type="date" name="to" value="<?= e($filters['to']) ?>" aria-label="Hasta" style="width:150px">
    </div>
    <div class="grow"></div>
    <?php if (count($branches) > 1): ?>
      <select class="select" name="branch" aria-label="Sucursal">
        <option value="">Todas las sucursales</option>
        <?php foreach ($branches as $b): ?>
          <option value="<?= (int) $b['id'] ?>" <?= (int) $filters['branch'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option>
        <?php endforeach; ?>
      </select>
    <?php endif; ?>
    <?php if (can('sales.view_branch') && $sellers): ?>
      <select class="select" name="user" aria-label="Vendedor">
        <option value="">Todos los vendedores</option>
        <?php foreach ($sellers as $s): ?>
          <option value="<?= (int) $s['id'] ?>" <?= (int) $filters['user'] === (int) $s['id'] ? 'selected' : '' ?>><?= e($s['name']) ?></option>
        <?php endforeach; ?>
      </select>
    <?php endif; ?>
  </div>
</form>

<div data-dashboard>
  <section class="panel" aria-label="Indicadores principales">
    <div class="kpi-strip" data-kpis>
      <?php for ($i = 0; $i < 4; $i++): ?>
        <div class="kpi"><div class="skeleton sk-line" style="width:40%"></div><div class="skeleton" style="height:30px;margin-top:14px;width:70%"></div><div class="skeleton sk-line" style="width:55%;margin-top:12px"></div></div>
      <?php endfor; ?>
    </div>
    <div class="mini-stats" data-mini></div>
  </section>

  <div class="grid grid-12 mt-3">
    <section class="panel span-8">
      <div class="panel-head">
        <div><h2>Evolución de las ventas</h2><div class="sub" data-evo-sub>Facturación diaria del periodo</div></div>
        <div class="segmented" data-evo-mode>
          <button type="button" class="is-active" data-mode="sales">Ventas</button>
          <?php if ($data['can_financial']): ?><button type="button" data-mode="profit">Ventas · costo · utilidad</button><?php endif; ?>
        </div>
      </div>
      <div class="panel-body">
        <div class="chart" data-chart-evolution style="min-height:260px"></div>
        <div class="legend mt-2" data-evo-legend></div>
      </div>
    </section>
    <section class="panel span-4">
      <div class="panel-head"><div><h2>Sucursales</h2><div class="sub">Facturación comparada</div></div></div>
      <div class="panel-body"><div class="hbars" data-branches></div></div>
    </section>

    <section class="panel span-4">
      <div class="panel-head"><div><h2>Productos más vendidos</h2><div class="sub">Por facturación</div></div>
        <?php if (can('reports.view')): ?><a class="btn btn-ghost btn-sm" href="<?= e(url('/reports', ['type' => 'sales_product'])) ?>">Ver todo</a><?php endif; ?></div>
      <div class="panel-body" style="padding-top:8px"><ul class="rank" data-top></ul></div>
    </section>
    <section class="panel span-4">
      <div class="panel-head"><div><h2>Ventas por categoría</h2><div class="sub">Participación en el periodo</div></div></div>
      <div class="panel-body"><div class="donut-wrap"><div class="chart" data-chart-categories></div><ul class="donut-legend" data-categories-legend></ul></div></div>
    </section>
    <section class="panel span-4">
      <div class="panel-head"><div><h2>Medios de pago</h2><div class="sub">Valor cobrado por método</div></div></div>
      <div class="panel-body"><div class="donut-wrap"><div class="chart" data-chart-methods></div><ul class="donut-legend" data-methods-legend></ul></div></div>
    </section>

    <section class="panel span-7">
      <div class="panel-head"><div><h2>Rendimiento por vendedor</h2><div class="sub">Ventas completadas del periodo</div></div></div>
      <div class="panel-body" style="padding:12px 0 0">
        <div class="table-wrap"><table class="table table-stack" data-sellers>
          <thead><tr><th>Vendedor</th><th class="num">Ventas</th><th class="num">Ticket prom.</th><th class="num">Descuentos</th><th class="num">Facturado</th></tr></thead>
          <tbody></tbody>
        </table></div>
      </div>
    </section>
    <div class="span-5 stack">
      <section class="panel">
        <div class="panel-head"><div><h2>Requiere atención</h2><div class="sub">Inventario y operaciones pendientes</div></div></div>
        <ul class="alert-list mt-2" data-alerts></ul>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Actividad reciente</h2></div>
          <?php if (can('audit.view')): ?><a class="btn btn-ghost btn-sm" href="<?= e(url('/audit')) ?>">Auditoría</a><?php endif; ?></div>
        <div class="panel-body"><ul class="timeline" data-activity></ul></div>
      </section>
    </div>
  </div>
</div>
<script type="application/json" id="dashboard-data"><?= json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>
<script type="application/json" id="dashboard-links"><?= json_encode([
    'inventory_low' => url('/inventory', ['status' => 'low']),
    'inventory_out' => url('/inventory', ['status' => 'out']),
    'transfers' => url('/transfers', ['status' => 'open']),
    'purchases' => url('/purchases', ['status' => 'pending']),
    'approvals' => url('/approvals'),
    'can_inventory' => can('inventory.view') || can('inventory.distribute'),
    'can_purchases' => can('purchases.manage'),
    'can_approvals' => can('discounts.approve'),
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>

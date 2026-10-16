<?php
use App\Core\View;
use App\Services\ReportService;
$q = array_filter(['type' => $type, 'from' => $f['from'], 'to' => $f['to'], 'branch' => $f['branch'], 'category' => $f['category_id'], 'user' => $f['user_id'] && can('sales.view_branch') ? $f['user_id'] : null, 'method' => $f['method_id'], 'group' => $f['group'], 'product' => $f['product_id']]);
?>
<div class="page-head">
  <div><div class="eyebrow">Reportes y analítica</div><h1><?= e($typeTitle) ?></h1>
    <p><?= e(date('d/m/Y', strtotime($f['from']))) ?> — <?= e(date('d/m/Y', strtotime($f['to']))) ?> · Facturado = ventas completadas; la utilidad bruta es estimada (precio − costo) y no incluye gastos operativos.</p></div>
  <div class="page-actions">
    <button class="btn" type="button" data-print><?= icon('printer') ?> Imprimir</button>
    <?php if (can('reports.export')): ?><a class="btn btn-primary" href="<?= e(url('/reports/export', $q)) ?>"><?= icon('download') ?> Exportar CSV</a><?php endif; ?>
  </div>
</div>
<div class="grid grid-12" style="align-items:start">
  <aside class="panel span-3 no-print" style="position:sticky;top:84px">
    <nav class="panel-body" style="padding:14px" aria-label="Tipos de reporte">
      <?php foreach ($available as $group => $items): ?>
        <div class="nav-label" style="color:var(--faint);padding:10px 8px 6px"><?= e($group) ?></div>
        <?php foreach ($items as $k => $label): ?>
          <a href="<?= e(url('/reports', array_merge($q, ['type' => $k]))) ?>" class="row" style="padding:8px 10px;border-radius:8px;font-size:13.5px;<?= $k === $type ? 'background:var(--gold-soft);font-weight:700' : 'color:var(--text-2)' ?>"><?= e($label) ?></a>
        <?php endforeach; ?>
      <?php endforeach; ?>
    </nav>
  </aside>
  <div class="span-9 stack">
    <form method="get" class="panel no-print">
      <input type="hidden" name="type" value="<?= e($type) ?>">
      <div class="panel-body filter-bar">
        <div class="field"><label>Desde</label><input class="input" type="date" name="from" value="<?= e($f['from']) ?>"></div>
        <div class="field"><label>Hasta</label><input class="input" type="date" name="to" value="<?= e($f['to']) ?>"></div>
        <?php if (count($branches) > 1): ?><div class="field"><label>Sucursal</label><select class="select" name="branch"><option value="">Todas</option><?php foreach ($branches as $b): ?><option value="<?= (int) $b['id'] ?>" <?= (int) $f['branch'] === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select></div><?php endif; ?>
        <div class="field"><label>Categoría</label><select class="select" name="category"><option value="">Todas</option><?php foreach ($categories as $c): ?><option value="<?= (int) $c['id'] ?>" <?= (int) $f['category_id'] === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
        <?php if ($sellers): ?><div class="field"><label>Vendedor</label><select class="select" name="user"><option value="">Todos</option><?php foreach ($sellers as $s): ?><option value="<?= (int) $s['id'] ?>" <?= (int) $f['user_id'] === (int) $s['id'] ? 'selected' : '' ?>><?= e($s['name']) ?></option><?php endforeach; ?></select></div><?php endif; ?>
        <div class="field"><label>Medio de pago</label><select class="select" name="method"><option value="">Todos</option><?php foreach ($methods as $m): ?><option value="<?= (int) $m['id'] ?>" <?= (int) $f['method_id'] === (int) $m['id'] ? 'selected' : '' ?>><?= e($m['name']) ?></option><?php endforeach; ?></select></div>
        <?php if ($type === 'sales_period'): ?><div class="field"><label>Agrupar por</label><select class="select" name="group"><?php foreach (['day' => 'Día', 'week' => 'Semana', 'month' => 'Mes'] as $k => $l): ?><option value="<?= $k ?>" <?= $f['group'] === $k ? 'selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select></div><?php endif; ?>
        <button class="btn btn-primary" type="submit"><?= icon('filter') ?> Aplicar</button>
      </div>
    </form>
    <section class="panel">
      <?php if (!$result['rows']): ?>
        <?= View::partial('partials/empty', ['title' => 'Sin datos', 'text' => 'No hay registros para los filtros seleccionados.']) ?>
      <?php else: ?>
      <div class="table-wrap" style="max-height:70vh">
        <table class="table table-stack table-sm">
          <thead><tr><?php foreach ($result['columns'] as [$k, $label, $t]): ?><th class="<?= in_array($t, ['money', 'qty', 'pct', 'int'], true) ? 'num' : '' ?>"><?= e($label) ?></th><?php endforeach; ?></tr></thead>
          <tbody><?php foreach ($result['rows'] as $r): ?><tr>
            <?php foreach ($result['columns'] as $i => [$k, $label, $t]): ?>
              <td class="<?= in_array($t, ['money', 'qty', 'pct', 'int'], true) ? 'num' : '' ?> <?= $i === 0 ? 'cell-main' : '' ?>" data-label="<?= e($label) ?>"><?= ReportService::displayValue($r[$k] ?? null, $t) ?></td>
            <?php endforeach; ?>
          </tr><?php endforeach; ?></tbody>
          <?php if ($result['totals']): ?><tfoot><tr>
            <?php foreach ($result['columns'] as $i => [$k, $label, $t]): ?><td class="<?= in_array($t, ['money', 'qty', 'pct', 'int'], true) ? 'num' : '' ?>"><?= $i === 0 ? 'Total' : (isset($result['totals'][$k]) ? ReportService::displayValue($result['totals'][$k], $t) : '') ?></td><?php endforeach; ?>
          </tr></tfoot><?php endif; ?>
        </table>
      </div>
      <div class="panel-foot"><span class="muted" style="font-size:12.5px"><?= count($result['rows']) ?> fila(s) · generado <?= e(fmt_dt(gmdate('Y-m-d H:i:s'))) ?> por <?= e(\App\Core\Auth::user()['name']) ?></span></div>
      <?php endif; ?>
    </section>
  </div>
</div>

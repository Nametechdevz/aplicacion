<?php
$netSales = (float) $sales['total'] - (float) $returns['total'];
$profit = $netBase - $netCost;
$card = fn($label, $value, $sub = '') => '<div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body py-2"><div class="small text-muted">' . $label . '</div><div class="fs-5 fw-bold">' . $value . '</div>' . ($sub ? '<div class="small text-muted">' . $sub . '</div>' : '') . '</div></div></div>';
$table = function (string $title, array $rows, array $cols) {
    echo '<div class="card h-100"><div class="card-header">' . e($title) . '</div><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr>';
    foreach ($cols as $c) { echo '<th class="' . ($c[2] ?? '') . '">' . e($c[0]) . '</th>'; }
    echo '</tr></thead><tbody>';
    foreach ($rows as $r) {
        echo '<tr>';
        foreach ($cols as $c) { echo '<td class="' . ($c[2] ?? '') . '">' . $c[1]($r) . '</td>'; }
        echo '</tr>';
    }
    if (!$rows) { echo '<tr><td colspan="' . count($cols) . '" class="text-muted text-center">Sin datos</td></tr>'; }
    echo '</tbody></table></div></div>';
};
?>
<form class="card mb-3" method="get"><div class="card-body row g-2 align-items-end">
    <div class="col-6 col-md-2"><label class="form-label small">Desde</label><input type="date" name="from" class="form-control" value="<?= e($from) ?>"></div>
    <div class="col-6 col-md-2"><label class="form-label small">Hasta</label><input type="date" name="to" class="form-control" value="<?= e($to) ?>"></div>
    <div class="col-md-2 d-grid"><button class="btn btn-primary">Consultar</button></div>
    <div class="col-md-6 d-flex gap-2 flex-wrap justify-content-md-end">
        <?php foreach (['Hoy' => [date('Y-m-d'), date('Y-m-d')], 'Este mes' => [date('Y-m-01'), date('Y-m-d')], 'Mes anterior' => [date('Y-m-01', strtotime('first day of last month')), date('Y-m-t', strtotime('last day of last month'))], 'Este año' => [date('Y-01-01'), date('Y-m-d')]] as $l => $r): ?>
            <a class="btn btn-sm btn-outline-secondary" href="<?= url('/reports', ['from' => $r[0], 'to' => $r[1]]) ?>"><?= $l ?></a>
        <?php endforeach; ?>
        <a class="btn btn-sm btn-outline-success" href="<?= url('/reports/export', ['from' => $from, 'to' => $to]) ?>"><i class="bi bi-filetype-csv"></i> Ventas</a>
        <a class="btn btn-sm btn-outline-success" href="<?= url('/reports/export', ['from' => $from, 'to' => $to, 'type' => 'items']) ?>"><i class="bi bi-filetype-csv"></i> Detalle</a>
    </div>
</div></form>

<div class="row g-3 mb-3">
    <?= $card('Ventas brutas', money($sales['total']), num($sales['n']) . ' documentos') ?>
    <?= $card('Devoluciones', money($returns['total']), num($returns['n']) . ' notas crédito') ?>
    <?= $card('Ventas netas', money($netSales), 'Ticket promedio ' . money($sales['n'] ? $sales['total'] / $sales['n'] : 0)) ?>
    <?= $card('Utilidad bruta', money($profit), 'Margen ' . num($netBase > 0 ? $profit / $netBase * 100 : 0, 1) . '% · Costo ' . money($netCost)) ?>
</div>

<div class="row g-3 mb-3">
    <div class="col-lg-8"><div class="card h-100"><div class="card-header">Ventas por día</div><div class="card-body"><canvas id="cDaily" height="120"></canvas></div></div></div>
    <div class="col-lg-4"><div class="card h-100"><div class="card-header">Ventas por hora</div><div class="card-body"><canvas id="cHour" height="200"></canvas></div></div></div>
</div>

<div class="row g-3 mb-3">
    <div class="col-lg-4"><?php $table('Medios de pago', $byMethod, [
        ['Medio', fn($r) => e(payment_label($r['method']))],
        ['Ventas', fn($r) => (int) $r['n'], 'text-end'],
        ['Valor', fn($r) => money($r['method'] === 'efectivo' ? $r['total'] - $changeTotal : $r['total']), 'text-end'],
    ]); ?></div>
    <div class="col-lg-4"><?php $table('Por cajero', $byUser, [
        ['Cajero', fn($r) => e($r['name'])], ['Ventas', fn($r) => (int) $r['n'], 'text-end'], ['Total', fn($r) => money($r['total']), 'text-end'],
    ]); ?></div>
    <div class="col-lg-4"><?php $table('Por tipo de documento', $byDocType, [
        ['Tipo', fn($r) => $r['doc_type'] === 'FEV' ? 'Factura electrónica' : 'Documento POS'], ['Cant.', fn($r) => (int) $r['n'], 'text-end'], ['Total', fn($r) => money($r['total']), 'text-end'],
    ]); ?></div>
</div>

<div class="row g-3 mb-3">
    <div class="col-lg-6"><?php $table('Productos más vendidos', $topProducts, [
        ['Producto', fn($r) => e($r['description'])], ['Unid.', fn($r) => (int) $r['qty'], 'text-end'],
        ['Ventas', fn($r) => money($r['total']), 'text-end'], ['Utilidad', fn($r) => money($r['profit']), 'text-end'],
    ]); ?></div>
    <div class="col-lg-3"><?php $table('Por marca', $byBrand, [
        ['Marca', fn($r) => e($r['name'])], ['Unid.', fn($r) => (int) $r['qty'], 'text-end'], ['Total', fn($r) => money($r['total']), 'text-end'],
    ]); ?></div>
    <div class="col-lg-3"><?php $table('Por categoría', $byCategory, [
        ['Categoría', fn($r) => e($r['name'])], ['Unid.', fn($r) => (int) $r['qty'], 'text-end'], ['Total', fn($r) => money($r['total']), 'text-end'],
    ]); ?></div>
</div>

<div class="card">
    <div class="card-header">Informe de IVA (apoyo para la declaración)</div>
    <div class="table-responsive">
        <table class="table table-sm mb-0">
            <thead><tr><th>Concepto</th><th>Tarifa</th><th class="text-end">Base</th><th class="text-end">IVA</th></tr></thead>
            <tbody>
            <?php $ivaGen = 0; foreach ($ivaSales as $r): $ret = $ivaReturns[$r['tax_rate']] ?? ['base' => 0, 'tax' => 0]; $ivaGen += $r['tax'] - $ret['tax']; ?>
                <tr><td>Ventas gravadas</td><td><?= num($r['tax_rate']) ?>%</td><td class="text-end"><?= money($r['base']) ?></td><td class="text-end"><?= money($r['tax']) ?></td></tr>
                <tr class="text-danger"><td>(−) Devoluciones</td><td><?= num($r['tax_rate']) ?>%</td><td class="text-end"><?= money($ret['base']) ?></td><td class="text-end"><?= money($ret['tax']) ?></td></tr>
            <?php endforeach; ?>
            <tr class="fw-bold"><td colspan="3">IVA generado neto</td><td class="text-end"><?= money($ivaGen) ?></td></tr>
            <tr><td>IVA descontable (compras registradas)</td><td></td><td class="text-end"><?= money($ivaPurchases['base']) ?></td><td class="text-end"><?= money($ivaPurchases['tax']) ?></td></tr>
            <tr class="fw-bold table-light"><td colspan="3">Saldo estimado a pagar</td><td class="text-end"><?= money($ivaGen - $ivaPurchases['tax']) ?></td></tr>
            </tbody>
        </table>
    </div>
    <div class="card-footer small text-muted">Valores informativos. Valida siempre con tu contador antes de presentar la declaración.</div>
</div>

<?php App\Core\View::start(); ?>
<script src="<?= asset('vendor/chart.umd.min.js') ?>"></script>
<script>
const opts = { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { y: { ticks: { callback: v => fmt(v) } }, x: { grid: { display: false } } } };
new Chart(document.getElementById('cDaily'), { type: 'line', data: { labels: <?= json_encode(array_map(fn($d) => date('d/m', strtotime($d['d'])), $daily)) ?>, datasets: [{ data: <?= json_encode(array_map(fn($d) => round((float) $d['total']), $daily)) ?>, borderColor: '#6b2c5f', backgroundColor: 'rgba(107,44,95,.1)', fill: true, tension: .3 }] }, options: opts });
new Chart(document.getElementById('cHour'), { type: 'bar', data: { labels: <?= json_encode(array_map(fn($h) => $h['h'] . 'h', $byHour)) ?>, datasets: [{ data: <?= json_encode(array_map(fn($h) => round((float) $h['total']), $byHour)) ?>, backgroundColor: '#c9a227', borderRadius: 4 }] }, options: opts });
</script>
<?php App\Core\View::end(); ?>

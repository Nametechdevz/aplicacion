<div class="row g-3 mb-3">
    <div class="col-6 col-xl-3"><div class="card"><div class="card-body stat">
        <div class="icon"><i class="bi bi-cash-stack"></i></div>
        <div><div class="value"><?= money($todayStats['total']) ?></div><div class="label">Ventas de hoy · <?= (int) $todayStats['n'] ?> tickets</div></div>
    </div></div></div>
    <div class="col-6 col-xl-3"><div class="card"><div class="card-body stat">
        <div class="icon"><i class="bi bi-calendar3"></i></div>
        <div><div class="value"><?= money($monthStats['total'] - $returnsMonth) ?></div><div class="label">Ventas netas del mes</div></div>
    </div></div></div>
    <?php if (is_admin()): ?>
    <div class="col-6 col-xl-3"><div class="card"><div class="card-body stat">
        <div class="icon" style="background:#e7f6ec;color:#198754"><i class="bi bi-graph-up-arrow"></i></div>
        <div><div class="value"><?= money($monthProfit) ?></div><div class="label">Utilidad bruta del mes</div></div>
    </div></div></div>
    <?php endif; ?>
    <div class="col-6 col-xl-3"><div class="card"><div class="card-body stat">
        <div class="icon" style="background:#fff4e0;color:#c77700"><i class="bi bi-exclamation-triangle"></i></div>
        <div><div class="value"><?= $lowStockCount ?></div><div class="label">Productos con stock bajo</div></div>
    </div></div></div>
</div>

<?php if ($edocIssues > 0): ?>
<div class="alert alert-warning d-flex align-items-center gap-2">
    <i class="bi bi-cloud-slash fs-4"></i>
    <div class="flex-grow-1">Hay <strong><?= $edocIssues ?></strong> documento(s) electrónico(s) pendientes o con error ante la DIAN.</div>
    <a href="<?= url('/edocs', ['status' => 'problemas']) ?>" class="btn btn-sm btn-warning">Revisar</a>
</div>
<?php endif; ?>

<div class="row g-3">
    <div class="col-xl-8">
        <div class="card h-100">
            <div class="card-header">Ventas últimos 30 días</div>
            <div class="card-body"><canvas id="salesChart" height="110"></canvas></div>
        </div>
    </div>
    <div class="col-xl-4">
        <div class="card h-100">
            <div class="card-header">Más vendidos del mes</div>
            <ul class="list-group list-group-flush">
                <?php foreach ($top as $i => $t): ?>
                    <li class="list-group-item d-flex justify-content-between">
                        <span><span class="badge text-bg-light me-1"><?= $i + 1 ?></span><?= e($t['description']) ?></span>
                        <strong><?= (int) $t['qty'] ?> u</strong>
                    </li>
                <?php endforeach; ?>
                <?php if (!$top): ?><li class="list-group-item text-muted">Aún no hay ventas este mes.</li><?php endif; ?>
            </ul>
        </div>
    </div>
    <div class="col-xl-8">
        <div class="card">
            <div class="card-header d-flex justify-content-between">Últimas ventas <a href="<?= url('/sales') ?>" class="small">Ver todas</a></div>
            <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                    <thead><tr><th>Documento</th><th>Fecha</th><th>Cliente</th><th class="text-end">Total</th><th>DIAN</th></tr></thead>
                    <tbody>
                    <?php foreach ($recent as $s): ?>
                        <tr onclick="location='<?= url('/sales/' . $s['id']) ?>'" style="cursor:pointer">
                            <td><strong><?= e($s['full_number']) ?></strong> <span class="badge text-bg-light"><?= e($s['doc_type']) ?></span></td>
                            <td><?= fdate($s['issued_at'], 'd/m H:i') ?></td>
                            <td><?= e($s['customer']) ?></td>
                            <td class="text-end"><?= money($s['total']) ?></td>
                            <td><?= edoc_badge($s['edoc_status']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (!$recent): ?><tr><td colspan="5" class="text-muted text-center py-4">Sin ventas todavía. <a href="<?= url('/pos') ?>">Ir al punto de venta</a></td></tr><?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    <div class="col-xl-4">
        <div class="card">
            <div class="card-header d-flex justify-content-between">Stock bajo <a href="<?= url('/inventory', ['filter' => 'low']) ?>" class="small">Ver todo</a></div>
            <ul class="list-group list-group-flush">
                <?php foreach ($lowStock as $p): ?>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <span><?= e($p['name']) ?> <small class="text-muted"><?= e($p['brand']) ?> <?= $p['size_ml'] ? (int) $p['size_ml'] . 'ml' : '' ?></small></span>
                        <span class="badge <?= $p['stock'] <= 0 ? 'text-bg-danger' : 'text-bg-warning' ?>"><?= (int) $p['stock'] ?></span>
                    </li>
                <?php endforeach; ?>
                <?php if (!$lowStock): ?><li class="list-group-item text-muted">Todo el inventario está en niveles adecuados.</li><?php endif; ?>
            </ul>
        </div>
    </div>
</div>

<?php App\Core\View::start(); ?>
<script src="<?= asset('vendor/chart.umd.min.js') ?>"></script>
<script>
new Chart(document.getElementById('salesChart'), {
    type: 'bar',
    data: { labels: <?= json_encode($chart['labels']) ?>, datasets: [{ label: 'Ventas', data: <?= json_encode($chart['values']) ?>, backgroundColor: '#6b2c5f', borderRadius: 4, maxBarThickness: 28 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { y: { ticks: { callback: v => fmt(v) }, grid: { color: '#f0eaf1' } }, x: { grid: { display: false } } } }
});
</script>
<?php App\Core\View::end(); ?>

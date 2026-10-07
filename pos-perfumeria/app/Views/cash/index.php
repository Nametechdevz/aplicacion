<?php if (!$session): ?>
<div class="card mb-3"><div class="card-body">
    <h5><i class="bi bi-unlock"></i> Abrir caja</h5>
    <form method="post" action="<?= url('/cash/open') ?>" class="row g-2 align-items-end">
        <?= csrf_field() ?>
        <div class="col-md-4"><label class="form-label">Base inicial en efectivo</label>
            <div class="input-group"><span class="input-group-text">$</span><input type="number" name="opening_amount" min="0" step="50" class="form-control" value="0" required></div></div>
        <div class="col-md-3"><button class="btn btn-primary w-100">Abrir caja</button></div>
    </form>
</div></div>
<?php else: ?>
<div class="card mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="bi bi-cash-coin"></i> Caja abierta desde <?= fdate($session['opened_at'], 'd/m/Y h:i a') ?></span>
        <a href="<?= url('/cash/' . $session['id'] . '/print') ?>" target="_blank" class="btn btn-sm btn-light"><i class="bi bi-printer"></i> Arqueo parcial</a>
    </div>
    <div class="card-body">
        <?php include __DIR__ . '/_summary.php'; ?>
    </div>
</div>
<div class="row g-3 mb-3">
    <div class="col-lg-6"><div class="card h-100"><div class="card-body">
        <h6><i class="bi bi-arrow-left-right"></i> Registrar ingreso / egreso</h6>
        <form method="post" action="<?= url('/cash/movement') ?>" class="row g-2">
            <?= csrf_field() ?>
            <div class="col-4"><select name="type" class="form-select"><option value="egreso">Egreso</option><option value="ingreso">Ingreso</option></select></div>
            <div class="col-8"><div class="input-group"><span class="input-group-text">$</span><input type="number" name="amount" min="1" step="any" class="form-control" required></div></div>
            <div class="col-12"><input name="concept" class="form-control" maxlength="200" placeholder="Concepto (ej: pago domicilio, compra de bolsas, consignación)" required></div>
            <div class="col-12"><button class="btn btn-outline-primary">Registrar</button></div>
        </form>
    </div></div></div>
    <div class="col-lg-6"><div class="card h-100 border-danger-subtle"><div class="card-body">
        <h6><i class="bi bi-lock"></i> Cerrar caja (arqueo)</h6>
        <form method="post" action="<?= url('/cash/close') ?>" class="row g-2" data-confirm="¿Cerrar la caja? Después no podrás vender hasta abrir una nueva.">
            <?= csrf_field() ?>
            <div class="col-12"><label class="form-label small">Efectivo contado físicamente</label>
                <div class="input-group"><span class="input-group-text">$</span><input type="number" name="counted_cash" min="0" step="any" class="form-control" required></div>
                <div class="form-text">Esperado: <?= money($s['expected']) ?></div></div>
            <div class="col-12"><input name="notes" class="form-control" maxlength="255" placeholder="Observaciones (opcional)"></div>
            <div class="col-12"><button class="btn btn-danger">Cerrar caja</button></div>
        </form>
    </div></div></div>
</div>
<?php endif; ?>

<div class="card">
    <div class="card-header">Historial de cajas</div>
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>#</th><th>Usuario</th><th>Apertura</th><th>Cierre</th><th class="text-end">Ventas</th><th class="text-end">Esperado</th><th class="text-end">Contado</th><th class="text-end">Diferencia</th></tr></thead>
            <tbody>
            <?php foreach ($history as $h): ?>
                <tr onclick="location='<?= url('/cash/' . $h['id']) ?>'" style="cursor:pointer">
                    <td><?= $h['id'] ?></td><td><?= e($h['user_name']) ?></td>
                    <td><?= fdate($h['opened_at'], 'd/m/Y H:i') ?></td>
                    <td><?= $h['closed_at'] ? fdate($h['closed_at'], 'd/m/Y H:i') : '<span class="badge text-bg-success">Abierta</span>' ?></td>
                    <td class="text-end"><?= money($h['sales_total']) ?></td>
                    <td class="text-end"><?= $h['expected_cash'] !== null ? money($h['expected_cash']) : '—' ?></td>
                    <td class="text-end"><?= $h['counted_cash'] !== null ? money($h['counted_cash']) : '—' ?></td>
                    <td class="text-end fw-semibold <?= $h['difference'] === null ? '' : (abs((float) $h['difference']) < 1 ? 'text-success' : 'text-danger') ?>"><?= $h['difference'] !== null ? money($h['difference']) : '—' ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

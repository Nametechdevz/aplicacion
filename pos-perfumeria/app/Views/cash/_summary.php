<?php $sess = $s['session']; ?>
<div class="row g-3">
    <div class="col-md-6">
        <table class="table table-sm mb-0">
            <tr><td>Base inicial</td><td class="text-end"><?= money($sess['opening_amount']) ?></td></tr>
            <tr><td>Ventas en efectivo (neto de cambio)</td><td class="text-end"><?= money($s['cash_sales']) ?></td></tr>
            <tr><td>Ingresos de caja</td><td class="text-end text-success">+ <?= money($s['ingresos']) ?></td></tr>
            <tr><td>Egresos / reembolsos</td><td class="text-end text-danger">− <?= money($s['egresos']) ?></td></tr>
            <tr class="fw-bold"><td>Efectivo esperado en caja</td><td class="text-end"><?= money($s['expected']) ?></td></tr>
            <?php if ($sess['status'] === 'cerrada'): ?>
                <tr><td>Efectivo contado</td><td class="text-end"><?= money($sess['counted_cash']) ?></td></tr>
                <tr class="fw-bold <?= abs((float) $sess['difference']) < 1 ? 'text-success' : 'text-danger' ?>"><td>Diferencia (<?= $sess['difference'] > 0 ? 'sobrante' : ($sess['difference'] < 0 ? 'faltante' : 'cuadrada') ?>)</td><td class="text-end"><?= money($sess['difference']) ?></td></tr>
            <?php endif; ?>
        </table>
    </div>
    <div class="col-md-6">
        <table class="table table-sm mb-0">
            <thead><tr><th>Medio de pago</th><th class="text-end">Transacciones</th><th class="text-end">Valor</th></tr></thead>
            <?php foreach ($s['by_method'] as $m): ?>
                <tr><td><?= e(payment_label($m['method'])) ?></td><td class="text-end"><?= (int) $m['count'] ?></td><td class="text-end"><?= money($m['total']) ?></td></tr>
            <?php endforeach; ?>
            <?php if ((float) $s['sales']['change_total'] > 0): ?><tr class="text-muted"><td>(Cambio entregado)</td><td></td><td class="text-end">− <?= money($s['sales']['change_total']) ?></td></tr><?php endif; ?>
            <tr class="fw-bold"><td>Total ventas (<?= (int) $s['sales']['count'] ?>)</td><td></td><td class="text-end"><?= money($s['sales']['total']) ?></td></tr>
            <tr class="text-muted"><td>IVA incluido</td><td></td><td class="text-end"><?= money($s['sales']['tax_total']) ?></td></tr>
        </table>
    </div>
</div>
<?php if ($s['movements']): ?>
<h6 class="mt-3">Movimientos de caja</h6>
<table class="table table-sm">
    <?php foreach ($s['movements'] as $m): ?>
        <tr><td class="small"><?= fdate($m['created_at'], 'H:i') ?></td><td><?= e($m['concept']) ?> <small class="text-muted"><?= e($m['user_name']) ?></small></td>
            <td class="text-end <?= $m['type'] === 'ingreso' ? 'text-success' : 'text-danger' ?>"><?= $m['type'] === 'ingreso' ? '+' : '−' ?> <?= money($m['amount']) ?></td></tr>
    <?php endforeach; ?>
</table>
<?php endif; ?>

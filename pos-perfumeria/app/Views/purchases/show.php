<div class="card">
    <div class="card-body">
        <div class="row small mb-3">
            <div class="col-md-3"><b>Proveedor:</b> <?= e($p['supplier'] ?? '—') ?> <?= $p['nit'] ? '(' . e($p['nit']) . ')' : '' ?></div>
            <div class="col-md-3"><b>Factura:</b> <?= e($p['invoice_number'] ?? '—') ?></div>
            <div class="col-md-3"><b>Fecha:</b> <?= fdate($p['purchase_date']) ?></div>
            <div class="col-md-3"><b>Registró:</b> <?= e($p['user_name']) ?></div>
        </div>
        <table class="table">
            <thead><tr><th>Producto</th><th class="text-center">Cant.</th><th class="text-end">Costo unit.</th><th class="text-end">IVA</th><th class="text-end">Total</th></tr></thead>
            <?php foreach ($items as $i): ?>
                <tr><td><?= e($i['name']) ?> <?= $i['size_ml'] ? (int) $i['size_ml'] . 'ml' : '' ?> <small class="text-muted"><?= e($i['code']) ?></small></td><td class="text-center"><?= (int) $i['qty'] ?></td>
                    <td class="text-end"><?= money($i['unit_cost']) ?></td><td class="text-end"><?= num($i['tax_rate']) ?>%</td><td class="text-end"><?= money($i['total']) ?></td></tr>
            <?php endforeach; ?>
            <tfoot>
                <tr><td colspan="4" class="text-end">Subtotal</td><td class="text-end"><?= money($p['subtotal']) ?></td></tr>
                <tr><td colspan="4" class="text-end">IVA</td><td class="text-end"><?= money($p['tax_total']) ?></td></tr>
                <tr class="fw-bold"><td colspan="4" class="text-end">Total</td><td class="text-end"><?= money($p['total']) ?></td></tr>
            </tfoot>
        </table>
        <?php if ($p['notes']): ?><p class="mb-0"><b>Notas:</b> <?= e($p['notes']) ?></p><?php endif; ?>
    </div>
</div>

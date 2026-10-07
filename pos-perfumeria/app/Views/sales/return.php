<form method="post" action="<?= url('/sales/' . $sale['id'] . '/return') ?>" class="card" id="returnForm" data-confirm="¿Registrar la nota crédito? Esta acción no se puede deshacer y se reporta a la DIAN.">
    <?= csrf_field() ?>
    <div class="card-body">
        <div class="row g-3 mb-3">
            <div class="col-md-4">
                <label class="form-label">Concepto (DIAN)</label>
                <select name="reason_code" id="reasonCode" class="form-select">
                    <?php foreach ($reasons as $k => $r): ?><option value="<?= $k ?>"><?= $k ?> · <?= e($r) ?></option><?php endforeach; ?>
                </select>
            </div>
            <div class="col-md-5">
                <label class="form-label">Descripción / motivo</label>
                <input name="reason_text" class="form-control" maxlength="255" placeholder="Ej: Cliente devuelve producto sellado">
            </div>
            <div class="col-md-3">
                <label class="form-label">Reembolso</label>
                <select name="refund_method" class="form-select">
                    <?php foreach (payment_methods() as $k => $l): ?><option value="<?= $k ?>"><?= e($l) ?></option><?php endforeach; ?>
                </select>
                <div class="form-text">En efectivo se descuenta de tu caja abierta.</div>
            </div>
        </div>
        <table class="table align-middle">
            <thead><tr><th>Producto</th><th class="text-center">Vendido</th><th class="text-center">Ya devuelto</th><th class="text-end">Valor unit. cobrado</th><th style="width:140px">Devolver</th></tr></thead>
            <tbody>
            <?php foreach ($items as $it): $avail = (int) $it['qty'] - (int) $it['returned_qty']; ?>
                <tr>
                    <td><?= e($it['description']) ?></td>
                    <td class="text-center"><?= (int) $it['qty'] ?></td>
                    <td class="text-center"><?= (int) $it['returned_qty'] ?></td>
                    <td class="text-end"><?= money($it['total'] / $it['qty']) ?></td>
                    <td><input type="number" class="form-control ret-qty" name="qty[<?= $it['id'] ?>]" min="0" max="<?= $avail ?>" value="0" <?= $avail <= 0 ? 'disabled' : '' ?> data-max="<?= $avail ?>"></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <div class="d-flex gap-2">
            <button class="btn btn-danger"><i class="bi bi-check2"></i> Generar nota crédito</button>
            <a href="<?= url('/sales/' . $sale['id']) ?>" class="btn btn-light">Cancelar</a>
        </div>
    </div>
</form>
<?php App\Core\View::start(); ?>
<script>
document.getElementById('reasonCode').addEventListener('change', e => {
    const all = e.target.value === '2';
    document.querySelectorAll('.ret-qty').forEach(i => { if (all) i.value = i.dataset.max; i.readOnly = all; });
});
</script>
<?php App\Core\View::end(); ?>

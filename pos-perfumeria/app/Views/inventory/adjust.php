<div class="row"><div class="col-lg-6">
<div class="card"><div class="card-body">
<form method="post" action="<?= url('/inventory/adjust') ?>">
    <?= csrf_field() ?>
    <div class="mb-3"><label class="form-label">Producto</label>
        <select name="product_id" id="prod" class="form-select" required><option value="">Selecciona…</option>
            <?php foreach ($products as $p): ?><option value="<?= $p['id'] ?>" data-stock="<?= (int) $p['stock'] ?>" <?= $selected == $p['id'] ? 'selected' : '' ?>><?= e($p['name']) ?> <?= e($p['brand']) ?> <?= $p['size_ml'] ? (int) $p['size_ml'] . 'ml' : '' ?> — stock <?= (int) $p['stock'] ?></option><?php endforeach; ?>
        </select></div>
    <div class="mb-3"><label class="form-label">Tipo de ajuste</label>
        <div class="btn-group w-100" role="group">
            <input type="radio" class="btn-check" name="mode" id="m1" value="set" checked><label class="btn btn-outline-primary" for="m1">Conteo físico</label>
            <input type="radio" class="btn-check" name="mode" id="m2" value="add"><label class="btn btn-outline-success" for="m2">Entrada</label>
            <input type="radio" class="btn-check" name="mode" id="m3" value="subtract"><label class="btn btn-outline-danger" for="m3">Salida</label>
        </div>
        <div class="form-text" id="modeHelp">Escribe la cantidad real contada; el sistema calcula la diferencia.</div></div>
    <div class="mb-3"><label class="form-label">Cantidad</label><input type="number" name="qty" class="form-control" min="0" required></div>
    <div class="mb-3"><label class="form-label">Motivo *</label><input name="note" class="form-control" maxlength="255" required placeholder="Ej: Conteo mensual, producto dañado, tester, obsequio…"></div>
    <button class="btn btn-primary">Aplicar ajuste</button>
</form>
</div></div>
</div></div>
<?php App\Core\View::start(); ?>
<script>
const help = { set: 'Escribe la cantidad real contada; el sistema calcula la diferencia.', add: 'Unidades que entran al inventario (sin compra asociada).', subtract: 'Unidades que salen: averías, testers, obsequios, pérdidas.' };
document.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => document.getElementById('modeHelp').textContent = help[r.value]));
</script>
<?php App\Core\View::end(); ?>

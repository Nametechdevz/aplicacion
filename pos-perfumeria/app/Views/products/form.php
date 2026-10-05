<?php $v = fn($k, $d = '') => e(old($k, $p[$k] ?? $d)); $isNew = empty($p['id']); ?>
<form method="post" enctype="multipart/form-data" action="<?= url($isNew ? '/products' : '/products/' . $p['id']) ?>">
<?= csrf_field() ?>
<div class="row g-3">
    <div class="col-lg-8">
        <div class="card"><div class="card-body row g-3">
            <div class="col-md-5"><label class="form-label">Código de barras / SKU *</label>
                <div class="input-group"><input name="code" id="code" class="form-control" value="<?= $v('code') ?>" required>
                <button type="button" class="btn btn-outline-secondary" onclick="document.getElementById('code').value='77' + Date.now().toString().slice(-11)" title="Generar código interno"><i class="bi bi-magic"></i></button></div></div>
            <div class="col-md-7"><label class="form-label">Nombre *</label><input name="name" class="form-control" value="<?= $v('name') ?>" required placeholder="Ej: Good Girl"></div>
            <div class="col-md-6"><label class="form-label">Marca</label>
                <select name="brand_id" class="form-select"><option value="">—</option><?php foreach ($brands as $b): ?><option value="<?= $b['id'] ?>" <?= (int) old('brand_id', $p['brand_id'] ?? 0) === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select>
                <div class="form-text"><a href="<?= url('/brands') ?>" target="_blank">Administrar marcas</a></div></div>
            <div class="col-md-6"><label class="form-label">Categoría</label>
                <select name="category_id" class="form-select"><option value="">—</option><?php foreach ($categories as $c): ?><option value="<?= $c['id'] ?>" <?= (int) old('category_id', $p['category_id'] ?? 0) === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
            <div class="col-md-3"><label class="form-label">Género</label>
                <select name="gender" class="form-select"><?php foreach (['Femenino', 'Masculino', 'Unisex'] as $g): ?><option <?= old('gender', $p['gender'] ?? '') === $g ? 'selected' : '' ?>><?= $g ?></option><?php endforeach; ?></select></div>
            <div class="col-md-3"><label class="form-label">Concentración</label>
                <input name="concentration" list="concList" class="form-control" value="<?= $v('concentration') ?>">
                <datalist id="concList"><?php foreach ($concentrations as $c): ?><option value="<?= e($c) ?>"><?php endforeach; ?></datalist></div>
            <div class="col-md-2"><label class="form-label">Tamaño (ml)</label><input type="number" name="size_ml" min="0" class="form-control" value="<?= $v('size_ml') ?>"></div>
            <div class="col-md-4"><label class="form-label">Familia olfativa</label><input name="olfactive_family" class="form-control" value="<?= $v('olfactive_family') ?>" placeholder="Floral, amaderado, cítrico…"></div>
            <div class="col-md-6"><label class="form-label">Imagen</label><input type="file" name="image" accept="image/jpeg,image/png,image/webp" class="form-control">
                <?php if (!empty($p['image'])): ?><img src="<?= url('uploads/' . $p['image']) ?>" class="mt-2 rounded" style="height:70px"><?php endif; ?></div>
            <div class="col-md-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="active" value="1" id="active" <?= old('active', $p['active'] ?? 1) ? 'checked' : '' ?>><label class="form-check-label" for="active">Producto activo (visible en el POS)</label></div></div>
        </div></div>
    </div>
    <div class="col-lg-4">
        <div class="card"><div class="card-body row g-3">
            <div class="col-12"><label class="form-label">Costo unitario (sin IVA)</label><div class="input-group"><span class="input-group-text">$</span><input type="number" step="any" min="0" name="cost" id="cost" class="form-control" value="<?= $v('cost', 0) ?>"></div></div>
            <div class="col-12"><label class="form-label">Precio de venta (IVA incluido) *</label><div class="input-group"><span class="input-group-text">$</span><input type="number" step="any" min="1" name="price" id="price" class="form-control form-control-lg" value="<?= $v('price') ?>" required></div></div>
            <div class="col-6"><label class="form-label">IVA</label><select name="tax_rate" id="tax" class="form-select"><?php foreach ([19, 5, 0] as $t): ?><option value="<?= $t ?>" <?= (float) old('tax_rate', $p['tax_rate'] ?? 19) == $t ? 'selected' : '' ?>><?= $t ?>%</option><?php endforeach; ?></select></div>
            <div class="col-6"><label class="form-label">Stock mínimo</label><input type="number" min="0" name="min_stock" class="form-control" value="<?= $v('min_stock', 0) ?>"></div>
            <?php if ($isNew): ?>
                <div class="col-12"><label class="form-label">Stock inicial</label><input type="number" min="0" name="initial_stock" class="form-control" value="<?= e(old('initial_stock', 0)) ?>"></div>
            <?php else: ?>
                <div class="col-12"><div class="alert alert-light mb-0 small">Stock actual: <b><?= (int) $p['stock'] ?></b>. Para modificarlo usa <a href="<?= url('/inventory/adjust', ['product_id' => $p['id']]) ?>">Ajuste de inventario</a> o <a href="<?= url('/purchases/create') ?>">Compras</a>.</div></div>
            <?php endif; ?>
            <div class="col-12 small text-muted" id="marginInfo"></div>
        </div></div>
        <div class="d-grid gap-2 mt-3">
            <button class="btn btn-primary btn-lg"><i class="bi bi-save"></i> Guardar</button>
            <?php if ($isNew): ?><button class="btn btn-outline-primary" name="save_new" value="1">Guardar y crear otro</button><?php endif; ?>
            <a href="<?= url('/products') ?>" class="btn btn-light">Cancelar</a>
        </div>
    </div>
</div>
</form>
<?php clear_old(); ?>
<?php App\Core\View::start(); ?>
<script>
const upd = () => {
    const price = +document.getElementById('price').value || 0, cost = +document.getElementById('cost').value || 0, tax = +document.getElementById('tax').value;
    const base = price / (1 + tax / 100);
    document.getElementById('marginInfo').innerHTML = price ? `Base sin IVA: <b>${fmt(base)}</b> · IVA: ${fmt(price - base)}<br>Utilidad: <b>${fmt(base - cost)}</b> (${base ? ((base - cost) / base * 100).toFixed(1) : 0}% margen)` : '';
};
['price', 'cost', 'tax'].forEach(id => document.getElementById(id).addEventListener('input', upd));
upd();
</script>
<?php App\Core\View::end(); ?>

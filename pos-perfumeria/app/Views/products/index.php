<form class="card mb-3" method="get"><div class="card-body row g-2 align-items-end">
    <div class="col-md-3"><input name="q" class="form-control" placeholder="Nombre, código o marca" value="<?= e(input('q', '')) ?>"></div>
    <div class="col-6 col-md-2"><select name="brand_id" class="form-select"><option value="">Marca</option><?php foreach ($brands as $b): ?><option value="<?= $b['id'] ?>" <?= (int) input('brand_id') === (int) $b['id'] ? 'selected' : '' ?>><?= e($b['name']) ?></option><?php endforeach; ?></select></div>
    <div class="col-6 col-md-2"><select name="category_id" class="form-select"><option value="">Categoría</option><?php foreach ($categories as $c): ?><option value="<?= $c['id'] ?>" <?= (int) input('category_id') === (int) $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select></div>
    <div class="col-6 col-md-2"><select name="gender" class="form-select"><option value="">Género</option><?php foreach (['Femenino', 'Masculino', 'Unisex'] as $g): ?><option <?= input('gender') === $g ? 'selected' : '' ?>><?= $g ?></option><?php endforeach; ?></select></div>
    <div class="col-6 col-md-2"><select name="state" class="form-select"><?php foreach (['active' => 'Activos', 'inactive' => 'Inactivos', 'all' => 'Todos'] as $k => $l): ?><option value="<?= $k ?>" <?= input('state', 'active') === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select></div>
    <div class="col-md-1 d-grid"><button class="btn btn-primary"><i class="bi bi-search"></i></button></div>
</div></form>

<?php if (is_admin()): ?>
<div class="d-flex flex-wrap gap-2 mb-3">
    <a href="<?= url('/products/create') ?>" class="btn btn-primary"><i class="bi bi-plus-lg"></i> Nuevo producto</a>
    <a href="<?= url('/products/import') ?>" class="btn btn-outline-primary"><i class="bi bi-upload"></i> Importar CSV</a>
    <a href="<?= url('/products/export') ?>" class="btn btn-outline-primary"><i class="bi bi-download"></i> Exportar</a>
    <button class="btn btn-outline-secondary" id="btnLabels"><i class="bi bi-upc"></i> Imprimir etiquetas</button>
</div>
<?php endif; ?>

<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><?php if (is_admin()): ?><th style="width:30px"><input type="checkbox" class="form-check-input" id="checkAll"></th><?php endif; ?><th></th><th>Producto</th><th>Código</th><th>Categoría</th><th class="text-end">Costo</th><th class="text-end">Precio</th><th class="text-end">Margen</th><th class="text-center">Stock</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($products as $p):
                $base = $p['price'] / (1 + $p['tax_rate'] / 100);
                $margin = $base > 0 ? ($base - $p['cost']) / $base * 100 : 0; ?>
                <tr class="<?= $p['active'] ? '' : 'text-muted' ?>">
                    <?php if (is_admin()): ?><td><input type="checkbox" class="form-check-input pcheck" value="<?= $p['id'] ?>"></td><?php endif; ?>
                    <td><?php if ($p['image']): ?><img src="<?= url('uploads/' . $p['image']) ?>" class="product-thumb" alt=""><?php else: ?><span class="product-thumb"><i class="bi bi-droplet"></i></span><?php endif; ?></td>
                    <td><div class="fw-semibold"><?= e($p['name']) ?> <?= $p['active'] ? '' : '<span class="badge text-bg-secondary">Inactivo</span>' ?></div>
                        <small class="text-muted"><?= e($p['brand']) ?> · <?= e($p['concentration']) ?> <?= $p['size_ml'] ? (int) $p['size_ml'] . 'ml' : '' ?> · <?= e($p['gender']) ?></small></td>
                    <td class="small"><?= e($p['code']) ?></td>
                    <td class="small"><?= e($p['category']) ?></td>
                    <td class="text-end small"><?= is_admin() ? money($p['cost']) : '—' ?></td>
                    <td class="text-end fw-semibold"><?= money($p['price']) ?><br><small class="text-muted fw-normal">IVA <?= num($p['tax_rate']) ?>%</small></td>
                    <td class="text-end small"><?= is_admin() ? num($margin, 1) . '%' : '—' ?></td>
                    <td class="text-center"><span class="badge <?= $p['stock'] <= 0 ? 'text-bg-danger' : ($p['stock'] <= $p['min_stock'] ? 'text-bg-warning' : 'text-bg-success') ?>"><?= (int) $p['stock'] ?></span></td>
                    <td class="text-end text-nowrap">
                        <a href="<?= url('/inventory/kardex', ['product_id' => $p['id']]) ?>" class="btn btn-sm btn-light" title="Kárdex"><i class="bi bi-clock-history"></i></a>
                        <?php if (is_admin()): ?>
                            <a href="<?= url('/products/' . $p['id'] . '/edit') ?>" class="btn btn-sm btn-light" title="Editar"><i class="bi bi-pencil"></i></a>
                            <form method="post" action="<?= url('/products/' . $p['id'] . '/toggle') ?>" class="d-inline"><?= csrf_field() ?><button class="btn btn-sm btn-light" title="<?= $p['active'] ? 'Desactivar' : 'Activar' ?>"><i class="bi bi-<?= $p['active'] ? 'eye-slash' : 'eye' ?>"></i></button></form>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$products): ?><tr><td colspan="10" class="text-center text-muted py-4">No hay productos.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>
<?php App\Core\View::start(); ?>
<script>
const all = document.getElementById('checkAll');
if (all) all.addEventListener('change', () => document.querySelectorAll('.pcheck').forEach(c => c.checked = all.checked));
const bl = document.getElementById('btnLabels');
if (bl) bl.addEventListener('click', () => {
    const ids = [...document.querySelectorAll('.pcheck:checked')].map(c => c.value);
    if (!ids.length) { alert('Selecciona los productos para las etiquetas.'); return; }
    const copies = prompt('¿Cuántas etiquetas por producto?', '1');
    if (!copies) return;
    window.open(APP.base + '/products/labels?ids=' + ids.join(',') + '&copies=' + encodeURIComponent(copies), '_blank');
});
</script>
<?php App\Core\View::end(); ?>

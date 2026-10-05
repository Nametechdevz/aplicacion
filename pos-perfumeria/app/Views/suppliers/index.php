<a href="<?= url('/suppliers/create') ?>" class="btn btn-primary mb-3"><i class="bi bi-plus-lg"></i> Nuevo proveedor</a>
<div class="card"><div class="table-responsive">
<table class="table table-hover align-middle mb-0">
    <thead><tr><th>Proveedor</th><th>NIT</th><th>Contacto</th><th class="text-center">Compras</th><th class="text-end">Total comprado</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
        <tr><td class="fw-semibold"><?= e($r['name']) ?></td><td><?= e($r['nit']) ?></td>
            <td class="small"><?= e($r['contact']) ?><br><?= e($r['phone']) ?> <?= e($r['email']) ?></td>
            <td class="text-center"><?= (int) $r['purchases'] ?></td><td class="text-end"><?= money($r['total']) ?></td>
            <td class="text-end"><a href="<?= url('/suppliers/' . $r['id'] . '/edit') ?>" class="btn btn-sm btn-light"><i class="bi bi-pencil"></i></a></td></tr>
    <?php endforeach; ?>
    <?php if (!$rows): ?><tr><td colspan="6" class="text-center text-muted py-4">Aún no hay proveedores.</td></tr><?php endif; ?>
    </tbody>
</table></div></div>

<a href="<?= url('/purchases/create') ?>" class="btn btn-primary mb-3"><i class="bi bi-plus-lg"></i> Registrar compra</a>
<div class="card"><div class="table-responsive">
<table class="table table-hover align-middle mb-0">
    <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th class="text-center">Unidades</th><th class="text-end">Total</th><th>Registró</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
        <tr onclick="location='<?= url('/purchases/' . $r['id']) ?>'" style="cursor:pointer">
            <td><?= $r['id'] ?></td><td><?= fdate($r['purchase_date']) ?></td><td><?= e($r['supplier'] ?? '—') ?></td><td><?= e($r['invoice_number']) ?></td>
            <td class="text-center"><?= (int) $r['units'] ?></td><td class="text-end"><?= money($r['total']) ?></td><td class="small"><?= e($r['user_name']) ?></td></tr>
    <?php endforeach; ?>
    <?php if (!$rows): ?><tr><td colspan="7" class="text-center text-muted py-4">Sin compras registradas.</td></tr><?php endif; ?>
    </tbody>
</table></div></div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

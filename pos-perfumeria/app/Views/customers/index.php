<div class="d-flex flex-wrap gap-2 mb-3">
    <form class="d-flex gap-2 flex-grow-1" method="get">
        <input name="q" class="form-control" style="max-width:360px" placeholder="Buscar por nombre, documento, correo o teléfono" value="<?= e($q) ?>">
        <button class="btn btn-outline-primary"><i class="bi bi-search"></i></button>
    </form>
    <a href="<?= url('/customers/create') ?>" class="btn btn-primary"><i class="bi bi-plus-lg"></i> Nuevo cliente</a>
</div>
<div class="card">
    <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
            <thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th class="text-end">Compras</th><th class="text-end">Total comprado</th><th></th></tr></thead>
            <tbody>
            <?php foreach ($customers as $c): ?>
                <tr>
                    <td><a href="<?= url('/customers/' . $c['id']) ?>" class="fw-semibold text-decoration-none"><?= e($c['name']) ?></a></td>
                    <td><?= e(doc_type_short($c['doc_type'])) ?> <?= e($c['doc_number']) ?><?= $c['dv'] !== null && $c['dv'] !== '' ? '-' . e($c['dv']) : '' ?></td>
                    <td class="small"><?= e($c['email']) ?><br><?= e($c['phone']) ?></td>
                    <td class="text-end"><?= (int) $c['purchases'] ?></td>
                    <td class="text-end"><?= money($c['spent']) ?></td>
                    <td class="text-end"><?php if ($c['id'] != 1): ?><a href="<?= url('/customers/' . $c['id'] . '/edit') ?>" class="btn btn-sm btn-light"><i class="bi bi-pencil"></i></a><?php endif; ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php include BASE_PATH . '/app/Views/partials/pagination.php'; ?>

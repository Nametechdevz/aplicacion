<div class="row"><div class="col-lg-7">
<form method="post" action="<?= url($path) ?>" class="d-flex gap-2 mb-3">
    <?= csrf_field() ?>
    <input name="name" class="form-control" placeholder="Nuevo nombre" required maxlength="100">
    <button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg"></i> Agregar</button>
</form>
<div class="card">
    <table class="table align-middle mb-0">
        <thead><tr><th>Nombre</th><th class="text-center">Productos</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
            <tr>
                <td>
                    <form method="post" action="<?= url($path . '/' . $r['id']) ?>" class="d-flex gap-2">
                        <?= csrf_field() ?>
                        <input name="name" class="form-control form-control-sm" value="<?= e($r['name']) ?>" required maxlength="100">
                        <button class="btn btn-sm btn-light" title="Guardar"><i class="bi bi-check2"></i></button>
                    </form>
                </td>
                <td class="text-center"><?= (int) $r['products'] ?></td>
                <td class="text-end">
                    <form method="post" action="<?= url($path . '/' . $r['id'] . '/delete') ?>" data-confirm="¿Eliminar &quot;<?= e($r['name']) ?>&quot;?"><?= csrf_field() ?><button class="btn btn-sm btn-light text-danger"><i class="bi bi-trash"></i></button></form>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</div>
</div></div>

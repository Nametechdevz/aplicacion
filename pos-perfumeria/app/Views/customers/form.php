<div class="card"><div class="card-body">
<form method="post" action="<?= url(empty($c['id']) ? '/customers' : '/customers/' . $c['id']) ?>">
    <?= csrf_field() ?>
    <?php include __DIR__ . '/_fields.php'; ?>
    <div class="mt-4 d-flex gap-2">
        <button class="btn btn-primary"><i class="bi bi-save"></i> Guardar</button>
        <a href="<?= url('/customers') ?>" class="btn btn-light">Cancelar</a>
    </div>
</form>
</div></div>
<?php clear_old(); ?>

<div class="row"><div class="col-lg-7"><div class="card"><div class="card-body">
<form method="post" action="<?= url(empty($s['id']) ? '/suppliers' : '/suppliers/' . $s['id']) ?>" class="row g-3">
    <?= csrf_field() ?>
    <div class="col-md-4"><label class="form-label">NIT *</label><input name="nit" class="form-control" value="<?= e($s['nit'] ?? '') ?>" required></div>
    <div class="col-md-8"><label class="form-label">Razón social *</label><input name="name" class="form-control" value="<?= e($s['name'] ?? '') ?>" required></div>
    <div class="col-md-6"><label class="form-label">Contacto</label><input name="contact" class="form-control" value="<?= e($s['contact'] ?? '') ?>"></div>
    <div class="col-md-6"><label class="form-label">Teléfono</label><input name="phone" class="form-control" value="<?= e($s['phone'] ?? '') ?>"></div>
    <div class="col-md-6"><label class="form-label">Correo</label><input type="email" name="email" class="form-control" value="<?= e($s['email'] ?? '') ?>"></div>
    <div class="col-md-6"><label class="form-label">Dirección</label><input name="address" class="form-control" value="<?= e($s['address'] ?? '') ?>"></div>
    <div class="col-12"><button class="btn btn-primary">Guardar</button> <a href="<?= url('/suppliers') ?>" class="btn btn-light">Cancelar</a></div>
</form>
</div></div></div></div>

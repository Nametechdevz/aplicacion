<div class="row justify-content-center"><div class="col-lg-6">
<div class="card"><div class="card-body">
<form method="post" action="<?= url('/profile') ?>">
    <?= csrf_field() ?>
    <div class="mb-3"><label class="form-label">Nombre</label><input name="name" class="form-control" value="<?= e($u['name']) ?>" required></div>
    <div class="mb-3"><label class="form-label">Correo</label><input class="form-control" value="<?= e($u['email']) ?>" disabled></div>
    <hr>
    <h6>Cambiar contraseña <small class="text-muted">(opcional)</small></h6>
    <div class="mb-2"><input type="password" name="current_password" class="form-control" placeholder="Contraseña actual" autocomplete="current-password"></div>
    <div class="mb-2"><input type="password" name="new_password" class="form-control" placeholder="Nueva contraseña (mínimo 8)" autocomplete="new-password"></div>
    <div class="mb-3"><input type="password" name="new_password_confirmation" class="form-control" placeholder="Confirmar nueva contraseña" autocomplete="new-password"></div>
    <button class="btn btn-primary">Guardar</button>
</form>
</div></div>
</div></div>
